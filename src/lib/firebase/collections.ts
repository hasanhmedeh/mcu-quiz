import 'server-only';

import { createHash } from 'node:crypto';
import type {
  CollectionReference,
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  WithFieldValue,
} from 'firebase-admin/firestore';
import type { AttemptDocument, UserDocument } from '@/types';
import { getDb } from './admin';

export const COLLECTIONS = {
  users: 'users',
  attempts: 'attempts',
  tickets: 'tickets',
  devices: 'devices',
} as const;

/**
 * One record per recognised device.
 *
 * Only a digest of the browser signals is kept — never the raw values — plus
 * which participants have played on it, so a second name on the same machine
 * can be turned away.
 */
export interface DeviceDocument {
  deviceId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Users who have *opened* an exam here. */
  startedUserIds: string[];
  /** Users who have *finished* one here. This is what triggers the block. */
  completedUserIds: string[];
  completedAttempts: number;
  /** Shown on the blocked screen so people understand why. */
  lastCompletedDisplayName: string | null;
  /** Set when the organiser clears the lock; clears `completedUserIds`. */
  releasedAt: string | null;
  releaseCount: number;
  userAgent: string | null;
}

/** A ticket is its own document so verification is a single point read. */
export interface TicketDocument {
  ticketId: string;
  attemptId: string;
  userId: string;
  displayName: string;
  score: number;
  totalQuestions: number;
  issuedAt: string;
}

function converter<T extends object>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (model: WithFieldValue<T>): DocumentData => model as DocumentData,
    fromFirestore: (snapshot: QueryDocumentSnapshot): T => snapshot.data() as T,
  };
}

export function usersCollection(): CollectionReference<UserDocument> {
  return getDb().collection(COLLECTIONS.users).withConverter(converter<UserDocument>());
}

export function attemptsCollection(): CollectionReference<AttemptDocument> {
  return getDb().collection(COLLECTIONS.attempts).withConverter(converter<AttemptDocument>());
}

export function ticketsCollection(): CollectionReference<TicketDocument> {
  return getDb().collection(COLLECTIONS.tickets).withConverter(converter<TicketDocument>());
}

export function devicesCollection(): CollectionReference<DeviceDocument> {
  return getDb().collection(COLLECTIONS.devices).withConverter(converter<DeviceDocument>());
}

/**
 * Derives a stable, Firestore-safe document id from a normalized name.
 *
 * Hashing rather than using the name directly keeps `/` and other illegal
 * characters out of the path, gives every id the same shape, and means the
 * raw name is not embedded in a URL-ish key.
 */
export function userIdForNormalizedName(normalizedName: string): string {
  return createHash('sha256').update(normalizedName, 'utf8').digest('hex').slice(0, 32);
}
