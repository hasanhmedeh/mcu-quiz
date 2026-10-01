import 'server-only';

import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { readAccountSession, type AccountSession } from '@/lib/auth/session';
import { accountsCollection, attemptsCollection } from '@/lib/firebase/collections';
import { logServerError } from '@/lib/http';
import type { AttemptDocument } from '@/types';

export interface Account extends AccountSession {
  /** `entryKey` → when it was marked watched. */
  readonly watched: Record<string, string>;
}

/**
 * Creates the account on first sign-in (that is all "sign up" is) and stamps
 * every later one. Watched titles are never touched here. Returns whether the
 * account is new.
 */
export async function recordSignIn(uid: string, email: string): Promise<boolean> {
  const ref = accountsCollection().doc(uid);
  const now = new Date().toISOString();
  const snapshot = await ref.get();
  if (snapshot.exists) {
    await ref.update({ email, lastSignInAt: now });
    return false;
  }
  await ref.set({ uid, email, createdAt: now, lastSignInAt: now, watched: {} });
  return true;
}

/** One exam taken while signed in, as shown on /account and the admin profile. */
export interface AccountExam {
  readonly id: string;
  readonly displayName: string;
  readonly attemptNumber: number;
  readonly status: AttemptDocument['status'];
  readonly score: number | null;
  readonly passed: boolean | null;
  readonly totalQuestions: number;
  readonly ticketId: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
  /** Unfinished and past its time limit, so it can no longer be submitted. */
  readonly expired: boolean;
}

/** Every exam linked to an account, newest first. */
export async function listAccountExams(uid: string): Promise<AccountExam[]> {
  const snapshot = await attemptsCollection().where('accountId', '==', uid).get();
  const now = Date.now();
  return snapshot.docs
    .map((doc) => {
      const attempt = doc.data();
      return {
        id: doc.id,
        displayName: attempt.displayName,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        score: attempt.score,
        passed: attempt.passed,
        totalQuestions: attempt.totalQuestions,
        ticketId: attempt.ticketId,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        expired: attempt.status === 'in_progress' && new Date(attempt.expiresAt).getTime() < now,
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * The signed-in viewer and what they have watched, or `null` when nobody is
 * signed in. Never throws: if Firestore is unreachable, a signed-in viewer is
 * shown with an empty list rather than an error page.
 */
export async function getCurrentAccount(): Promise<Account | null> {
  const session = await readAccountSession();
  if (!session) return null;
  try {
    const snapshot = await accountsCollection().doc(session.uid).get();
    return { ...session, watched: snapshot.data()?.watched ?? {} };
  } catch (error) {
    logServerError('account: could not read watched titles', error);
    return { ...session, watched: {} };
  }
}

/** Ticks a title as watched, or unticks it. */
export async function setWatched(uid: string, key: string, watched: boolean): Promise<void> {
  // A FieldPath, so the key is one map entry however it is spelled.
  await accountsCollection()
    .doc(uid)
    .update(new FieldPath('watched', key), watched ? new Date().toISOString() : FieldValue.delete());
}
