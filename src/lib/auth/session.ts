import 'server-only';

import { cookies } from 'next/headers';
import { createToken, safeEquals, verifyToken } from './tokens';

export const QUIZ_COOKIE = 'mcu_attempt';
export const ADMIN_COOKIE = 'mcu_admin';

/** An exam session stays resumable for three hours; there is no countdown. */
export const QUIZ_SESSION_TTL_SECONDS = 60 * 60 * 3;
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

export interface QuizSession {
  readonly attemptId: string;
  readonly userId: string;
}

export function createQuizSessionToken(session: QuizSession): string {
  return createToken({ ...session, kind: 'quiz' }, QUIZ_SESSION_TTL_SECONDS);
}

export async function setQuizSessionCookie(session: QuizSession): Promise<void> {
  const store = await cookies();
  store.set(QUIZ_COOKIE, createQuizSessionToken(session), {
    ...baseCookieOptions,
    maxAge: QUIZ_SESSION_TTL_SECONDS,
  });
}

export async function readQuizSession(): Promise<QuizSession | null> {
  const store = await cookies();
  const payload = verifyToken(store.get(QUIZ_COOKIE)?.value);
  if (!payload || payload.kind !== 'quiz') return null;
  if (typeof payload.attemptId !== 'string' || typeof payload.userId !== 'string') return null;
  return { attemptId: payload.attemptId, userId: payload.userId };
}

export async function clearQuizSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(QUIZ_COOKIE, '', { ...baseCookieOptions, maxAge: 0 });
}

/**
 * Checks submitted admin credentials against the environment.
 *
 * The credentials only ever exist as server-side environment variables; they
 * are never embedded in a bundle, returned by an API, or written to Firestore.
 */
export function verifyAdminCredentials(username: string, password: string): boolean {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedUsername || !expectedPassword) return false;

  // Both comparisons always run so that a wrong username and a wrong password
  // take the same amount of time.
  const usernameOk = safeEquals(username, expectedUsername);
  const passwordOk = safeEquals(password, expectedPassword);
  return usernameOk && passwordOk;
}

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
}

export async function setAdminSessionCookie(username: string): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, createToken({ kind: 'admin', username }, ADMIN_SESSION_TTL_SECONDS), {
    ...baseCookieOptions,
    sameSite: 'strict',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, '', { ...baseCookieOptions, sameSite: 'strict', maxAge: 0 });
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const payload = verifyToken(store.get(ADMIN_COOKIE)?.value);
  return payload?.kind === 'admin';
}
