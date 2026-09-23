import 'server-only';

import { createHash } from 'node:crypto';
import { getDb } from '@/lib/firebase/admin';

/**
 * Fixed-window rate limiting backed by Firestore.
 *
 * Serverless functions do not share memory between invocations, so an
 * in-process counter would be meaningless here. A Firestore transaction gives
 * a counter that actually holds across instances — which matters most for the
 * admin login, where the only secret is a password.
 */

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

interface RateLimitDocument {
  count: number;
  windowStartedAt: number;
}

/** Identities are hashed so no raw IP address is ever written to the database. */
export function rateLimitKey(scope: string, identity: string): string {
  const digest = createHash('sha256').update(`${scope}:${identity}`, 'utf8').digest('hex');
  return `${scope}_${digest.slice(0, 24)}`;
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const db = getDb();
  const ref = db.collection('rateLimits').doc(key);
  const windowMs = windowSeconds * 1000;

  return db.runTransaction<RateLimitResult>(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const now = Date.now();
    const existing = snapshot.data() as RateLimitDocument | undefined;

    const withinWindow = existing && now - existing.windowStartedAt < windowMs;
    const windowStartedAt = withinWindow ? existing.windowStartedAt : now;
    const count = (withinWindow ? existing.count : 0) + 1;

    transaction.set(ref, { count, windowStartedAt });

    const allowed = count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: allowed ? 0 : Math.ceil((windowStartedAt + windowMs - now) / 1000),
    };
  });
}
