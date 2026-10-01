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

/** A viewer's history, newest first. */
export async function listActivity(uid: string, limit = 300): Promise<ActivityEntry[]> {
  const snapshot = await accountActivityCollection(uid).orderBy('at', 'desc').limit(limit).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
