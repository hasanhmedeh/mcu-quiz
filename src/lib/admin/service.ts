import 'server-only';

import { getDb } from '@/lib/firebase/admin';
import {
  attemptsCollection,
  devicesCollection,
  ticketsCollection,
  usersCollection,
} from '@/lib/firebase/collections';
import {
  PASSING_SCORE,
  type AdminAttemptRow,
  type AdminDeviceRow,
  type AdminStats,
  type AdminUserRow,
  type AttemptDocument,
} from '@/types';

/** Plenty for a group of friends, and it keeps the dashboard to a few queries. */
const MAX_ATTEMPTS_FETCHED = 1000;
const MAX_USERS_FETCHED = 500;
const MAX_DEVICES_FETCHED = 500;
const RECENT_ATTEMPTS_SHOWN = 25;

export interface AdminDashboardData {
  readonly stats: AdminStats;
  readonly users: AdminUserRow[];
  readonly recentAttempts: AdminAttemptRow[];
  readonly devices: AdminDeviceRow[];
}

/** Drops the per-question records; the dashboard never displays them. */
function toRow(id: string, data: AttemptDocument): AdminAttemptRow {
  return {
    id,
    userId: data.userId,
    displayName: data.displayName,
    attemptNumber: data.attemptNumber,
    status: data.status,
    score: data.score,
    passed: data.passed,
    totalQuestions: data.totalQuestions,
    ticketId: data.ticketId,
    startedAt: data.startedAt,
    completedAt: data.completedAt,
    userAgent: data.userAgent,
  };
}

/**
 * Builds the whole dashboard from two collection reads and groups in memory.
 * At this scale that is cheaper and simpler than a per-user fan-out.
 */
export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [userSnapshot, attemptSnapshot, deviceSnapshot] = await Promise.all([
    usersCollection().orderBy('updatedAt', 'desc').limit(MAX_USERS_FETCHED).get(),
    attemptsCollection().orderBy('startedAt', 'desc').limit(MAX_ATTEMPTS_FETCHED).get(),
    devicesCollection().orderBy('lastSeenAt', 'desc').limit(MAX_DEVICES_FETCHED).get(),
  ]);

  const attemptsByUser = new Map<string, AdminAttemptRow[]>();
  const allAttempts: AdminAttemptRow[] = [];

  for (const doc of attemptSnapshot.docs) {
    const row = toRow(doc.id, doc.data());
    allAttempts.push(row);
    const bucket = attemptsByUser.get(row.userId);
    if (bucket) bucket.push(row);
    else attemptsByUser.set(row.userId, [row]);
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
      totalAttempts: user.totalAttempts,
      retakeAllowed: user.retakeAllowed,
      retakeGrants: user.retakeGrants,
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

  const devices: AdminDeviceRow[] = deviceSnapshot.docs.map((doc) => {
    const device = doc.data();
    return {
      id: doc.id,
      firstSeenAt: device.firstSeenAt,
      lastSeenAt: device.lastSeenAt,
      completedAttempts: device.completedAttempts,
      participantCount: new Set([...device.startedUserIds, ...device.completedUserIds]).size,
      lastCompletedDisplayName: device.lastCompletedDisplayName,
      // A device only turns anyone away once something has been completed on it.
      locked: device.completedUserIds.length > 0,
      releaseCount: device.releaseCount,
      userAgent: device.userAgent,
    };
  });

  return {
    stats,
    users,
    recentAttempts: allAttempts.slice(0, RECENT_ATTEMPTS_SHOWN),
    devices,
  };
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

export type ReleaseDeviceResult =
  | { readonly ok: true; readonly deviceId: string }
  | { readonly ok: false; readonly error: 'device_not_found' };

/**
 * Lifts a device lock.
 *
 * Clearing `completedUserIds` is what reopens the machine: the per-name rule
 * still stops anyone who has already played from going again, so releasing a
 * shared laptop lets the *next* person in without handing the first a second
 * attempt. Attempt history is untouched.
 */
export async function releaseDevice(deviceId: string): Promise<ReleaseDeviceResult> {
  const db = getDb();
  const deviceRef = devicesCollection().doc(deviceId);

  return db.runTransaction<ReleaseDeviceResult>(async (transaction) => {
    const snapshot = await transaction.get(deviceRef);
    const device = snapshot.data();
    if (!device) return { ok: false, error: 'device_not_found' };

    transaction.update(deviceRef, {
      completedUserIds: [],
      releasedAt: new Date().toISOString(),
      releaseCount: device.releaseCount + 1,
    });

    return { ok: true, deviceId };
  });
}

export type DeleteAttemptResult =
  | { readonly ok: true; readonly displayName: string; readonly attemptNumber: number }
  | { readonly ok: false; readonly error: 'attempt_not_found' };

/**
 * Removes a submission as if it had never been taken.
 *
 * The attempt and its ticket go; the participant's summary (scores, counts,
 * latest attempt) is rebuilt from whatever attempts remain; and if this was
 * their only finished attempt on that device, the device stops counting them.
 * Deleting someone's only submission therefore lets them take the exam again.
 * A participant left with no attempts at all is removed entirely.
 */
export async function deleteAttempt(attemptId: string): Promise<DeleteAttemptResult> {
  const db = getDb();
  const attempts = attemptsCollection();
  const attemptRef = attempts.doc(attemptId);

  // Queries cannot run inside this transaction under the test fake, so the
  // sibling ids are found first and each one is re-read transactionally.
  const target = (await attemptRef.get()).data();
  if (!target) return { ok: false, error: 'attempt_not_found' };
  const siblingIds = (await attempts.where('userId', '==', target.userId).get()).docs
    .map((doc) => doc.id)
    .filter((id) => id !== attemptId);

  return db.runTransaction<DeleteAttemptResult>(async (transaction) => {
    const attempt = (await transaction.get(attemptRef)).data();
    if (!attempt) return { ok: false, error: 'attempt_not_found' };

    const userRef = usersCollection().doc(attempt.userId);
    const user = (await transaction.get(userRef)).data();

    const remaining: Array<AttemptDocument & { id: string }> = [];
    for (const id of siblingIds) {
      const sibling = (await transaction.get(attempts.doc(id))).data();
      if (sibling) remaining.push({ ...sibling, id });
    }

    const deviceRef = attempt.deviceId ? devicesCollection().doc(attempt.deviceId) : null;
    const device = deviceRef ? (await transaction.get(deviceRef)).data() : undefined;

    // --- Writes -------------------------------------------------------------
    transaction.delete(attemptRef);
    if (attempt.ticketId) transaction.delete(ticketsCollection().doc(attempt.ticketId));

    const completed = remaining
      .filter((entry) => entry.status === 'completed')
      .sort((a, b) => a.attemptNumber - b.attemptNumber);
    const latest = completed.at(-1) ?? null;

    if (user) {
      if (remaining.length === 0) {
        transaction.delete(userRef);
      } else {
        const wasActive = user.activeAttemptId === attemptId;
        transaction.update(userRef, {
          updatedAt: new Date().toISOString(),
          completedAttempts: completed.length,
          totalAttempts: remaining.length,
          latestAttemptId: latest?.id ?? null,
          lastScore: latest?.score ?? null,
          lastPassed: latest?.passed ?? null,
          bestScore: completed.reduce<number | null>(
            (best, entry) => (entry.score === null ? best : Math.max(best ?? 0, entry.score)),
            null,
          ),
          ...(wasActive ? { activeAttemptId: null, activeAttemptExpiresAt: null } : {}),
        });
      }
    }

    if (deviceRef && device) {
      const stillCompletedHere = completed.some((entry) => entry.deviceId === attempt.deviceId);
      const stillStartedHere = remaining.some((entry) => entry.deviceId === attempt.deviceId);
      transaction.update(deviceRef, {
        completedAttempts:
          attempt.status === 'completed'
            ? Math.max(0, device.completedAttempts - 1)
            : device.completedAttempts,
        completedUserIds: stillCompletedHere
          ? device.completedUserIds
          : device.completedUserIds.filter((id) => id !== attempt.userId),
        startedUserIds: stillStartedHere
          ? device.startedUserIds
          : device.startedUserIds.filter((id) => id !== attempt.userId),
      });
    }

    return { ok: true, displayName: attempt.displayName, attemptNumber: attempt.attemptNumber };
  });
}

export { PASSING_SCORE };
