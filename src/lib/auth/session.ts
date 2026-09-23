import 'server-only';

import { cookies } from 'next/headers';
import { createToken, safeEquals, verifyToken } from './tokens';
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  DEVICE_COOKIE,
  DEVICE_COOKIE_TTL_SECONDS,
  QUIZ_COOKIE,
  QUIZ_SESSION_TTL_SECONDS,
} from './sessionConfig';

export {
  ADMIN_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  DEVICE_COOKIE,
  DEVICE_COOKIE_TTL_SECONDS,
  QUIZ_COOKIE,
  QUIZ_SESSION_TTL_SECONDS,
};

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
 * Remembers which device this browser is, signed so it cannot be edited into
 * someone else's device id.
 *
 * This is the half of device recognition that never produces a false positive.
 * Clearing it does not defeat the limit — the fingerprint still resolves to the
 * same record — it just costs the server one extra lookup.
 */
export async function setDeviceCookie(deviceId: string): Promise<void> {
  const store = await cookies();
  store.set(DEVICE_COOKIE, createToken({ kind: 'device', deviceId }, DEVICE_COOKIE_TTL_SECONDS), {
    ...baseCookieOptions,
    maxAge: DEVICE_COOKIE_TTL_SECONDS,
  });
}

export async function readDeviceCookie(): Promise<string | null> {
  const store = await cookies();
  const payload = verifyToken(store.get(DEVICE_COOKIE)?.value);
  if (!payload || payload.kind !== 'device') return null;
  return typeof payload.deviceId === 'string' ? payload.deviceId : null;
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
