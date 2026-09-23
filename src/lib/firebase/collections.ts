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
} as const;

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
