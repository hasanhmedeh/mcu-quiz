'use client';

import { getApps, initializeApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, initializeAuth, type Auth } from 'firebase/auth';

/**
 * Firebase in the browser, for one job only: email-link sign-in. Firestore is
 * never loaded here (see src/lib/firebase/admin.ts).
 *
 * These values are public by design: a Firebase web config identifies the
 * project, it does not grant access. Each must be referenced in full so Next
 * can inline it into the bundle.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

export function isFirebaseClientConfigured(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId);
}

const APP_NAME = 'mcu-endgame-accounts';

/**
 * In-memory persistence: once the server has swapped the ID token for its own
 * session cookie, nothing about the Firebase sign-in is left in the browser.
 */
export function getClientAuth(): Auth {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return getAuth(existing);
  const app = initializeApp(config, APP_NAME);
  return initializeAuth(app, { persistence: inMemoryPersistence });
}

/** Where the address is kept between asking for a link and opening it, on the same device. */
export const PENDING_EMAIL_KEY = 'mcu_sign_in_email';
