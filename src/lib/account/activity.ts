import 'server-only';

import { getDb } from '@/lib/firebase/admin';
import {
  accountActivityCollection,
  accountsCollection,
  type ActivityDocument,
} from '@/lib/firebase/collections';
import { logServerError } from '@/lib/http';
import type { ActivityType } from './activityTypes';

export interface ActivityEntry extends ActivityDocument {
  readonly id: string;
}

/**
 * Records something a signed-in viewer did, and stamps their account as
 * active. Never throws: losing one log line must not break what they were
 * doing.
 */
export async function logActivity(
  uid: string,
  type: ActivityType,
  extras: { path?: string | null; detail?: ActivityDocument['detail'] } = {},
): Promise<void> {
  try {
    const at = new Date().toISOString();
    const batch = getDb().batch();
    batch.set(accountActivityCollection(uid).doc(), {
      type,
      at,
      path: extras.path ?? null,
      detail: extras.detail ?? {},
    });
    batch.update(accountsCollection().doc(uid), { lastActiveAt: at });
    await batch.commit();
  } catch (error) {
    logServerError(`account activity: could not record ${type}`, error);
  }
}

/** How many of the newest events the analytics look at. */
export const ANALYTICS_EVENT_LIMIT = 5000;

export interface Tally {
  readonly label: string;
  readonly count: number;
}

export interface ActivityAnalytics {
  /** Events looked at: every one, unless there are more than the limit. */
  readonly analysed: number;
  readonly byType: Array<Tally & { readonly type: string }>;
  readonly topPages: Tally[];
  readonly topTrailers: Tally[];
  readonly counts: {
    readonly signIns: number;
    readonly pageViews: number;
    readonly trailers: number;
    readonly marked: number;
    readonly examExits: number;
  };
  /** Epoch seconds of every event analysed, newest first, for time-of-day charts. */
  readonly times: number[];
}

/** Friendly names for the pages a viewer can visit; ids in a path are folded together. */
export function pageName(path: string | null): string {
  if (!path) return 'Unknown';
  if (path === '/') return 'Home';
  if (path === '/timeline') return 'Timeline';
  if (path === '/account') return 'Account';
  if (path === '/account/finish') return 'Sign-in link';
  if (path === '/quiz') return 'Exam';
  if (path.startsWith('/result/')) return 'A result page';
  if (path.startsWith('/verify')) return 'Ticket check';
  return path;
}

export function tally(values: readonly string[], limit: number): Tally[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/**
 * Totals over a viewer's history for the admin profile. Reads only the fields
 * it needs from the newest `ANALYTICS_EVENT_LIMIT` events.
 */
export async function getActivityAnalytics(uid: string): Promise<ActivityAnalytics> {
  const snapshot = await accountActivityCollection(uid)
    .orderBy('at', 'desc')
    .select('type', 'at', 'path', 'detail')
    .limit(ANALYTICS_EVENT_LIMIT)
    .get();
  // `select` drops the typed converter; these are the same documents, trimmed.
  const events = snapshot.docs.map((doc) => doc.data() as ActivityDocument);
  const ofType = (type: ActivityType) => events.filter((event) => event.type === type);
  const title = (event: ActivityDocument) =>
    typeof event.detail?.title === 'string' ? event.detail.title : 'Unknown title';

  return {
    analysed: events.length,
    byType: tally(
      events.map((event) => event.type),
      Number.POSITIVE_INFINITY,
    ).map(({ label, count }) => ({ type: label, label, count })),
    topPages: tally(ofType('page_view').map((event) => pageName(event.path)), 8),
    topTrailers: tally(ofType('trailer_opened').map(title), 8),
    counts: {
      signIns: ofType('signed_in').length + ofType('signed_up').length,
      pageViews: ofType('page_view').length,
      trailers: ofType('trailer_opened').length,
      marked: ofType('marked_watched').length,
      examExits: ofType('exam_left').length,
    },
    times: events
      .map((event) => Math.floor(new Date(event.at).getTime() / 1000))
      .filter((seconds) => Number.isFinite(seconds)),
  };
}

export const ACTIVITY_PAGE_SIZE = 25;

export interface ActivityPage {
  /** Newest first. */
  readonly entries: ActivityEntry[];
  /** 1-based, clamped to the pages that exist. */
  readonly page: number;
  readonly pageCount: number;
  /** Every event on record for this viewer. */
  readonly total: number;
}

/**
 * One page of a viewer's history, newest first. The total comes from a
 * `count()` aggregation, so it costs a fraction of reading every event; only
 * the page itself (plus any it skips) is read.
 */
export async function listActivityPage(
  uid: string,
  requestedPage: number,
  pageSize = ACTIVITY_PAGE_SIZE,
): Promise<ActivityPage> {
  const collection = accountActivityCollection(uid);
  const total = (await collection.count().get()).data().count;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pageCount);

  const snapshot = await collection
    .orderBy('at', 'desc')
    .offset((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  return {
    entries: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    page,
    pageCount,
    total,
  };
}
