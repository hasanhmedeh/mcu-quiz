import 'server-only';

import { getDb } from '@/lib/firebase/admin';
import { attemptsCollection, usersCollection } from '@/lib/firebase/collections';
import { PASSING_SCORE, type AdminStats, type AdminUserRow, type AttemptSummary } from '@/types';

/** Plenty for a group of friends, and it keeps the dashboard to two queries. */
const MAX_ATTEMPTS_FETCHED = 1000;
const MAX_USERS_FETCHED = 500;

export interface AdminDashboardData {
  readonly stats: AdminStats;
  readonly users: AdminUserRow[];
  readonly recentAttempts: AttemptSummary[];
}

function toSummary(id: string, data: AttemptSummary | undefined): AttemptSummary | null {
  return data ? { ...data, id } : null;
}

/**
 * Builds the whole dashboard from two collection reads and groups in memory.
 * At this scale that is cheaper and simpler than a per-user fan-out.
 */
export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [userSnapshot, attemptSnapshot] = await Promise.all([
    usersCollection().orderBy('updatedAt', 'desc').limit(MAX_USERS_FETCHED).get(),
    attemptsCollection().orderBy('startedAt', 'desc').limit(MAX_ATTEMPTS_FETCHED).get(),
  ]);

  const attemptsByUser = new Map<string, AttemptSummary[]>();
  const allAttempts: AttemptSummary[] = [];

  for (const doc of attemptSnapshot.docs) {
    const summary = toSummary(doc.id, doc.data() as AttemptSummary);
    if (!summary) continue;
    allAttempts.push(summary);
    const bucket = attemptsByUser.get(summary.userId);
    if (bucket) bucket.push(summary);
    else attemptsByUser.set(summary.userId, [summary]);
  }

  const users: AdminUserRow[] = userSnapshot.docs.map((doc) => {
    const user = doc.data();
    const attempts = (attemptsByUser.get(doc.id) ?? [])
      .slice()
      .sort((a, b) => a.attemptNumber - b.attemptNumber);

    return {
      id: doc.id,
      displayName: user.displayName,
      normalizedName: user.normalizedName,
      completedAttempts: user.completedAttempts,
      retakeAllowed: user.retakeAllowed,
      lastScore: user.lastScore,
      lastPassed: user.lastPassed,
      bestScore: user.bestScore,
      updatedAt: user.updatedAt,
      attempts,
    };
  });

  const completed = allAttempts.filter((attempt) => attempt.status === 'completed');
  const passed = completed.filter((attempt) => attempt.passed === true).length;
  const failed = completed.length - passed;
  const scoreTotal = completed.reduce((total, attempt) => total + (attempt.score ?? 0), 0);

  const stats: AdminStats = {
    totalParticipants: users.length,
    totalAttempts: allAttempts.length,
    completedAttempts: completed.length,
    passed,
    failed,
    passRate: completed.length === 0 ? 0 : Math.round((passed / completed.length) * 100),
    averageScore:
      completed.length === 0 ? null : Math.round((scoreTotal / completed.length) * 10) / 10,
  };

  return { stats, users, recentAttempts: allAttempts.slice(0, 25) };
}

export type RetakeGrantResult =
  | { readonly ok: true; readonly displayName: string; readonly retakeAllowed: boolean }
  | { readonly ok: false; readonly error: 'user_not_found' };

/**
 * Grants (or revokes) another attempt.
 *
 * History is never touched: previous attempt documents stay exactly as they
 * were, and the next exam simply skips the questions already recorded against
 * this user.
 */
export async function setRetakeAllowed(
  userId: string,
  allowed: boolean,
): Promise<RetakeGrantResult> {
  const db = getDb();
  const userRef = usersCollection().doc(userId);

  return db.runTransaction<RetakeGrantResult>(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const user = snapshot.data();
    if (!user) return { ok: false, error: 'user_not_found' };

    const now = new Date().toISOString();

    transaction.update(userRef, {
      retakeAllowed: allowed,
      updatedAt: now,
      ...(allowed
        ? { retakeGrants: user.retakeGrants + 1, retakeGrantedAt: now }
        : { retakeGrantedAt: user.retakeGrantedAt }),
    });

    return { ok: true, displayName: user.displayName, retakeAllowed: allowed };
  });
}

export { PASSING_SCORE };
