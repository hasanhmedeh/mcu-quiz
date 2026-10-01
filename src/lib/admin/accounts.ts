import 'server-only';

import { DEFAULT_FLOWS, entryKey, type TimelineEntry } from '@/data/timeline';
import { listActivity, type ActivityEntry } from '@/lib/account/activity';
import { accountsCollection, attemptsCollection } from '@/lib/firebase/collections';
import type { AdminAttemptRow } from '@/types';
import { toRow } from './service';

/** Plenty for a group of friends; bounds the page like the dashboard does. */
const MAX_ACCOUNTS_FETCHED = 500;
const MAX_LINKED_ATTEMPTS_FETCHED = 2000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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

/** Every account, most recently signed in first, with their exams summed up. */
export async function listAccountsForAdmin(): Promise<AdminAccountRow[]> {
  const [accounts, attempts] = await Promise.all([
    accountsCollection().orderBy('lastSignInAt', 'desc').limit(MAX_ACCOUNTS_FETCHED).get(),
    attemptsCollection()
      .where('accountId', '!=', null)
      .select('accountId', 'status', 'score', 'passed')
      .limit(MAX_LINKED_ATTEMPTS_FETCHED)
      .get(),
  ]);

  const exams = new Map<string, { count: number; completed: number; best: number | null; passed: boolean }>();
  for (const doc of attempts.docs) {
    const attempt = doc.data();
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
  return accounts.docs.map((doc) => {
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
  /** Newest first, capped. */
  readonly activity: ActivityEntry[];
}

const TITLES = new Map(DEFAULT_FLOWS.flatMap((flow) => flow.entries.map((entry) => [entryKey(entry), entry] as const)));

/** Everything about one account, for /admin/users/[uid]. `null` if there is no such account. */
export async function getAccountProfileForAdmin(uid: string): Promise<AdminAccountProfile | null> {
  const [snapshot, attempts, activity] = await Promise.all([
    accountsCollection().doc(uid).get(),
    attemptsCollection().where('accountId', '==', uid).get(),
    listActivity(uid),
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
  };
}
