import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/lib/firebase/admin';
import { attemptsCollection, snapshotsCollection } from '@/lib/firebase/collections';
import { QuizError } from '@/lib/quiz/service';
import type {
  AdminSnapshot,
  SnapshotDocument,
  SnapshotKind,
  SnapshotReason,
} from '@/types';

/** Well above a normal exam (about 60 stills), low enough to stop a runaway client. */
export const MAX_SNAPSHOTS_PER_ATTEMPT = 300;

/** Firestore documents cap at 1 MiB; stills are kept far below that. */
export const MAX_SNAPSHOT_DATA_URL_LENGTH = 400_000;

const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

export interface SaveSnapshotInput {
  readonly attemptId: string;
  readonly userId: string;
  readonly kind: SnapshotKind;
  readonly reason: SnapshotReason;
  readonly image: string;
}

export type SaveSnapshotOutcome = 'saved' | 'limit_reached';

/**
 * Stores one proctoring still against an open exam. Only JPEG data URLs of a
 * sensible size are accepted, and only for the candidate's own exam.
 */
export async function saveSnapshot(input: SaveSnapshotInput): Promise<SaveSnapshotOutcome> {
  if (input.image.length > MAX_SNAPSHOT_DATA_URL_LENGTH || !JPEG_DATA_URL.test(input.image)) {
    throw new QuizError('invalid_session', 'That image was not accepted.');
  }

  const db = getDb();
  const attemptRef = attemptsCollection().doc(input.attemptId);
  const snapshotRef = snapshotsCollection().doc();

  return db.runTransaction<SaveSnapshotOutcome>(async (transaction) => {
    const attempt = (await transaction.get(attemptRef)).data();
    if (!attempt) throw new QuizError('attempt_not_found', 'Attempt does not exist.');
    if (attempt.userId !== input.userId) {
      throw new QuizError('invalid_session', 'Session does not match this attempt.');
    }
    if (attempt.status === 'completed') {
      throw new QuizError('invalid_session', 'This exam has already been submitted.');
    }
    if ((attempt.snapshotCount ?? 0) >= MAX_SNAPSHOTS_PER_ATTEMPT) return 'limit_reached';

    const snapshot: SnapshotDocument = {
      attemptId: input.attemptId,
      userId: input.userId,
      displayName: attempt.displayName,
      kind: input.kind,
      reason: input.reason,
      takenAt: new Date().toISOString(),
      image: input.image,
    };

    transaction.set(snapshotRef, snapshot);
    transaction.update(attemptRef, { snapshotCount: FieldValue.increment(1) });
    return 'saved';
  });
}

/** A gallery for a date range can list thousands of stills; this bounds one response. */
export const MAX_SNAPSHOTS_LISTED = 5000;

/** Every field but the image, so listings stay small however many stills there are. */
const METADATA_FIELDS = ['attemptId', 'userId', 'displayName', 'kind', 'reason', 'takenAt'] as const;

function toAdminSnapshot(id: string, data: Partial<SnapshotDocument>): AdminSnapshot {
  return {
    id,
    attemptId: data.attemptId ?? '',
    userId: data.userId ?? '',
    displayName: data.displayName ?? 'Unknown',
    kind: data.kind ?? 'camera',
    reason: data.reason ?? 'interval',
    takenAt: data.takenAt ?? '',
  };
}

export type SnapshotFilter =
  | { readonly attemptId: string; readonly from?: undefined }
  | { readonly from: string; readonly to: string; readonly attemptId?: string };

/**
 * Stills for one attempt, or for a time range, oldest first — without their
 * images. Each query filters on a single field and sorting happens here, so
 * no composite Firestore index is needed.
 *
 * Every document a query returns is a billed read, projection or not. A range
 * with an attemptId is how a live view asks for just what is new since it last
 * looked: the range keeps the read count to the new stills, and the attempt is
 * picked out of those here.
 */
export async function findSnapshots(filter: SnapshotFilter): Promise<AdminSnapshot[]> {
  const base = snapshotsCollection();
  const query =
    filter.from === undefined
      ? base.where('attemptId', '==', filter.attemptId)
      : base.where('takenAt', '>=', filter.from).where('takenAt', '<', filter.to);

  const snapshot = await query
    .select(...METADATA_FIELDS)
    .limit(MAX_SNAPSHOTS_LISTED)
    .get();

  return snapshot.docs
    .map((doc) => toAdminSnapshot(doc.id, doc.data() as Partial<SnapshotDocument>))
    .filter((still) => filter.attemptId === undefined || still.attemptId === filter.attemptId)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

/** Every still for one attempt, oldest first, without images. */
export function listSnapshots(attemptId: string): Promise<AdminSnapshot[]> {
  return findSnapshots({ attemptId });
}

/** The JPEG bytes of one still, or null if it no longer exists. */
export async function getSnapshotImage(id: string): Promise<Buffer | null> {
  const data = (await snapshotsCollection().doc(id).get()).data();
  if (!data || !JPEG_DATA_URL.test(data.image)) return null;
  return Buffer.from(data.image.slice(data.image.indexOf(',') + 1), 'base64');
}

/** Removes one still, and keeps its attempt's count honest if the attempt still exists. */
export async function deleteSnapshot(id: string): Promise<boolean> {
  const ref = snapshotsCollection().doc(id);
  const data = (await ref.get()).data();
  if (!data) return false;
  await ref.delete();

  const attemptRef = attemptsCollection().doc(data.attemptId);
  if ((await attemptRef.get()).exists) {
    await getDb().runTransaction(async (transaction) => {
      const attempt = (await transaction.get(attemptRef)).data();
      if (attempt) {
        transaction.update(attemptRef, {
          snapshotCount: Math.max(0, (attempt.snapshotCount ?? 1) - 1),
        });
      }
    });
  }
  return true;
}

/** Removes an attempt's stills — used when the attempt itself is deleted or discarded. */
export async function deleteSnapshotsFor(attemptId: string): Promise<number> {
  const snapshot = await snapshotsCollection().where('attemptId', '==', attemptId).get();
  await Promise.all(snapshot.docs.map((doc) => snapshotsCollection().doc(doc.id).delete()));
  return snapshot.docs.length;
}
