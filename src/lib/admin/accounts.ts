import 'server-only';

import { DEFAULT_FLOWS, entryKey, type TimelineEntry } from '@/data/timeline';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  getActivityAnalytics,
  listActivityPage,
  pageName,
  tally,
  type ActivityAnalytics,
  type ActivityPage,
  type Tally,
} from '@/lib/account/activity';
import type { ActivityType } from '@/lib/account/activityTypes';
import { getDb } from '@/lib/firebase/admin';
import {
  accountsCollection,
  attemptsCollection,
  type AccountDocument,
  type ActivityDocument,
} from '@/lib/firebase/collections';
import type { AdminAttemptRow, AttemptDocument } from '@/types';
import { toRow } from './service';

/** Plenty for a group of friends; bounds the page like the dashboard does. */
const MAX_ACCOUNTS_FETCHED = 500;
const MAX_LINKED_ATTEMPTS_FETCHED = 2000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Timeline titles by `entryKey`, to name what people marked as watched. */
const TITLES = new Map(DEFAULT_FLOWS.flatMap((flow) => flow.entries.map((entry) => [entryKey(entry), entry] as const)));

/** One signed-up viewer, as listed on /admin/users. */
export interface AdminAccountRow {
  readonly uid: string;
  readonly email: string;
  readonly createdAt: string;
  readonly lastSignInAt: string;
  readonly lastActiveAt: string | null;
  /** Signed in or did something in the last seven days. */
  readonly activeThisWeek: boolean;
  readonly watchedCount: number;
  readonly examCount: number;
  readonly completedExams: number;
  readonly bestScore: number | null;
  /** Whether any of their exams passed. */
  readonly passed: boolean;
}

/** Across everyone's activity, for the Users page. */
export interface UsersAnalytics {
  /** Events read: all of them, unless there are more than the limit. */
  readonly analysed: number;
  readonly capped: boolean;
  readonly counts: {
    readonly pageViews: number;
    readonly trailers: number;
    readonly marked: number;
    readonly examExits: number;
  };
  /** Signed up → … → passed, as numbers of accounts. */
  readonly funnel: Tally[];
  readonly topPages: Tally[];
  readonly topTrailers: Tally[];
  readonly topWatched: Tally[];
  readonly mostActive: Array<Tally & { readonly href: string }>;
  /**
   * The last ~31 days in whole UTC hours: events and which accounts (by index
   * into the overview's `accounts`) were active. Small enough to send to the
   * browser, which regroups it by the admin's local days and hours.
   */
  readonly hourly: Array<{ readonly hour: number; readonly events: number; readonly accounts: number[] }>;
}

export interface UsersOverview {
  readonly accounts: AdminAccountRow[];
  readonly analytics: UsersAnalytics;
}

/** Bounds the one read of every account's activity. */
const MAX_EVENTS_ANALYSED = 20000;
const HOUR_MS = 60 * 60 * 1000;
/** A day more than the charts show, so a time zone shift never empties the first day. */
const HOURLY_WINDOW_MS = 31 * 24 * HOUR_MS;

/**
 * Every account, most recently signed in first, with their exams summed up,
 * plus analytics across all of them.
 *
 * Activity is read with one collection-group query over every account's
 * `activity` subcollection. It has no filter or ordering, so it needs no
 * extra index; past the limit the sample is arbitrary, which the page says.
 */
export async function getUsersOverview(): Promise<UsersOverview> {
  const [accountsSnapshot, attempts, activity] = await Promise.all([
    accountsCollection().orderBy('lastSignInAt', 'desc').limit(MAX_ACCOUNTS_FETCHED).get(),
    attemptsCollection()
      .where('accountId', '!=', null)
      .select('accountId', 'status', 'score', 'passed')
      .limit(MAX_LINKED_ATTEMPTS_FETCHED)
      .get(),
    getDb()
      .collectionGroup('activity')
      .select('type', 'at', 'path', 'detail')
      .limit(MAX_EVENTS_ANALYSED)
      .get(),
  ]);

  const accounts = buildAccountRows(accountsSnapshot.docs, attempts.docs);
  const indexOf = new Map(accounts.map((account, index) => [account.uid, index]));

  const events = activity.docs.map((doc) => ({
    uid: doc.ref.parent.parent?.id ?? '',
    ...(doc.data() as ActivityDocument),
  }));
  const ofType = (type: ActivityType) => events.filter((event) => event.type === type);

  // Per-account event counts, for "most active".
  const perAccount = new Map<string, number>();
  for (const event of events) perAccount.set(event.uid, (perAccount.get(event.uid) ?? 0) + 1);

  // Hourly buckets over the window.
  const since = Date.now() - HOURLY_WINDOW_MS;
  const buckets = new Map<number, { events: number; accounts: Set<number> }>();
  for (const event of events) {
    const time = new Date(event.at).getTime();
    if (!(time >= since)) continue;
    const hour = Math.floor(time / HOUR_MS);
    const bucket = buckets.get(hour) ?? { events: 0, accounts: new Set<number>() };
    bucket.events += 1;
    const index = indexOf.get(event.uid);
    if (index !== undefined) bucket.accounts.add(index);
    buckets.set(hour, bucket);
  }

  const trailerPlayers = new Set(ofType('trailer_opened').map((event) => event.uid));
  const titleOf = (event: ActivityDocument) =>
    typeof event.detail?.title === 'string' ? event.detail.title : 'Unknown title';

  return {
    accounts,
    analytics: {
      analysed: events.length,
      capped: events.length >= MAX_EVENTS_ANALYSED,
      counts: {
        pageViews: ofType('page_view').length,
        trailers: ofType('trailer_opened').length,
        marked: ofType('marked_watched').length,
        examExits: ofType('exam_left').length,
      },
      funnel: [
        { label: 'Signed up', count: accounts.length },
        { label: 'Marked a title watched', count: accounts.filter((account) => account.watchedCount > 0).length },
        { label: 'Played a trailer', count: accounts.filter((account) => trailerPlayers.has(account.uid)).length },
        { label: 'Took the exam', count: accounts.filter((account) => account.examCount > 0).length },
        { label: 'Passed the exam', count: accounts.filter((account) => account.passed).length },
      ],
      topPages: tally(ofType('page_view').map((event) => pageName(event.path)), 8),
      topTrailers: tally(ofType('trailer_opened').map(titleOf), 8),
      topWatched: tally(
        accountsSnapshot.docs.flatMap((doc) =>
          Object.keys(doc.data().watched ?? {}).map((key) => TITLES.get(key)?.title ?? key),
        ),
        8,
      ),
      mostActive: accounts
        .map((account) => ({ label: account.email, count: perAccount.get(account.uid) ?? 0, href: `/admin/users/${account.uid}` }))
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      hourly: [...buckets.entries()]
        .sort(([a], [b]) => a - b)
        .map(([hour, bucket]) => ({ hour, events: bucket.events, accounts: [...bucket.accounts] })),
    },
  };
}

function buildAccountRows(
  accountDocs: ReadonlyArray<QueryDocumentSnapshot<AccountDocument>>,
  attemptDocs: ReadonlyArray<QueryDocumentSnapshot<DocumentData>>,
): AdminAccountRow[] {
  const exams = new Map<string, { count: number; completed: number; best: number | null; passed: boolean }>();
  for (const doc of attemptDocs) {
    const attempt = doc.data() as Pick<AttemptDocument, 'accountId' | 'status' | 'score' | 'passed'>;
    if (!attempt.accountId) continue;
    const summary = exams.get(attempt.accountId) ?? { count: 0, completed: 0, best: null, passed: false };
    summary.count += 1;
    if (attempt.status === 'completed') {
      summary.completed += 1;
      if (attempt.score !== null) summary.best = Math.max(summary.best ?? 0, attempt.score);
      if (attempt.passed) summary.passed = true;
    }
    exams.set(attempt.accountId, summary);
  }

  const now = Date.now();
  return accountDocs.map((doc) => {
    const account = doc.data();
    const summary = exams.get(doc.id);
    const lastSeen = new Date(account.lastActiveAt ?? account.lastSignInAt).getTime();
    return {
      uid: doc.id,
      email: account.email,
      createdAt: account.createdAt,
      lastSignInAt: account.lastSignInAt,
      lastActiveAt: account.lastActiveAt ?? null,
      activeThisWeek: now - lastSeen < WEEK_MS,
      watchedCount: Object.keys(account.watched ?? {}).length,
      examCount: summary?.count ?? 0,
      completedExams: summary?.completed ?? 0,
      bestScore: summary?.best ?? null,
      passed: summary?.passed ?? false,
    };
  });
}

export interface AdminAccountProfile {
  readonly uid: string;
  readonly email: string;
  readonly createdAt: string;
  readonly lastSignInAt: string;
  readonly lastActiveAt: string | null;
  /** Newest first. */
  readonly exams: AdminAttemptRow[];
  /** Newest first. */
  readonly watched: Array<{ entry: TimelineEntry; at: string }>;
  /** One page of their history, newest first. */
  readonly activity: ActivityPage;
  /** Totals over their whole history (up to the analytics limit). */
  readonly analytics: ActivityAnalytics;
}

/**
 * Everything about one account, for /admin/users/[uid], with the given page
 * of their activity. `null` if there is no such account.
 */
export async function getAccountProfileForAdmin(
  uid: string,
  activityPage = 1,
): Promise<AdminAccountProfile | null> {
  const [snapshot, attempts, activity, analytics] = await Promise.all([
    accountsCollection().doc(uid).get(),
    attemptsCollection().where('accountId', '==', uid).get(),
    listActivityPage(uid, activityPage),
    getActivityAnalytics(uid),
  ]);
  const account = snapshot.data();
  if (!account) return null;

  return {
    uid,
    email: account.email,
    createdAt: account.createdAt,
    lastSignInAt: account.lastSignInAt,
    lastActiveAt: account.lastActiveAt ?? null,
    exams: attempts.docs
      .map((doc) => toRow(doc.id, doc.data()))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    watched: Object.entries(account.watched ?? {})
      .map(([key, at]) => ({ entry: TITLES.get(key), at }))
      .filter((item): item is { entry: TimelineEntry; at: string } => item.entry !== undefined)
      .sort((a, b) => b.at.localeCompare(a.at)),
    activity,
    analytics,
  };
}
