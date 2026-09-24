import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb, resetFakeDb } from './helpers/fakeFirestore';

vi.mock('@/lib/firebase/admin', async () => {
  const { fakeDb: db } = await import('./helpers/fakeFirestore');
  return {
    getDb: () => db(),
    isFirebaseConfigured: () => true,
    FirebaseConfigError: class FirebaseConfigError extends Error {},
  };
});

vi.mock('firebase-admin/firestore', async () => {
  const { FakeFieldValue } = await import('./helpers/fakeFirestore');
  return { FieldValue: FakeFieldValue };
});

const { startExam, submitExam, discardExam } = await import('@/lib/quiz/service');
const { deleteAttempt } = await import('@/lib/admin/service');
const {
  saveSnapshot,
  listSnapshots,
  findSnapshots,
  getSnapshotImage,
  deleteSnapshot,
  deleteSnapshotsFor,
  MAX_SNAPSHOTS_PER_ATTEMPT,
} = await import(
  '@/lib/proctoring/service'
);
const { userIdForNormalizedName } = await import('@/lib/firebase/collections');

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U';

async function openExam(name = 'Hasan') {
  const normalized = name.toLowerCase();
  const outcome = await startExam({
    displayName: name,
    normalizedName: normalized,
    userAgent: 'vitest',
    device: null,
    ownedUserIds: [userIdForNormalizedName(normalized)],
  });
  if (outcome.kind !== 'started') throw new Error('expected an exam');
  return outcome;
}

beforeEach(() => {
  resetFakeDb();
});

describe('proctoring stills', () => {
  it('stores stills against the open exam and lists them oldest first', async () => {
    const exam = await openExam();
    const base = { attemptId: exam.attemptId, userId: exam.userId, image: JPEG };

    expect(await saveSnapshot({ ...base, kind: 'camera', reason: 'start' })).toBe('saved');
    expect(await saveSnapshot({ ...base, kind: 'screen', reason: 'exit' })).toBe('saved');

    const stills = await listSnapshots(exam.attemptId);
    expect(stills.map((still) => [still.kind, still.reason])).toEqual([
      ['camera', 'start'],
      ['screen', 'exit'],
    ]);
    expect(fakeDb().read(`attempts/${exam.attemptId}`)).toMatchObject({ snapshotCount: 2 });
  });

  it('rejects anything that is not a JPEG data URL, and other people’s exams', async () => {
    const exam = await openExam();
    const base = { attemptId: exam.attemptId, kind: 'camera' as const, reason: 'interval' as const };

    await expect(saveSnapshot({ ...base, userId: exam.userId, image: 'data:image/png;base64,AAAA' })).rejects.toThrow();
    await expect(
      saveSnapshot({ ...base, userId: exam.userId, image: 'javascript:alert(1)' }),
    ).rejects.toThrow();
    await expect(saveSnapshot({ ...base, userId: 'someone-else', image: JPEG })).rejects.toMatchObject({
      code: 'invalid_session',
    });
    expect(fakeDb().pathsIn('snapshots')).toHaveLength(0);
  });

  it('stops accepting stills once the exam is submitted, or past the cap', async () => {
    const exam = await openExam();
    const base = { attemptId: exam.attemptId, userId: exam.userId, kind: 'camera' as const, reason: 'interval' as const, image: JPEG };

    fakeDb().seed(`attempts/${exam.attemptId}`, {
      ...fakeDb().read(`attempts/${exam.attemptId}`),
      snapshotCount: MAX_SNAPSHOTS_PER_ATTEMPT,
    });
    expect(await saveSnapshot(base)).toBe('limit_reached');

    await submitExam({ attemptId: exam.attemptId, userId: exam.userId, answers: new Map() });
    await expect(saveSnapshot(base)).rejects.toMatchObject({ code: 'invalid_session' });
  });

  it('keeps the stills when an attempt is deleted, unless the organiser asks', async () => {
    const kept = await openExam();
    await saveSnapshot({ attemptId: kept.attemptId, userId: kept.userId, kind: 'camera', reason: 'start', image: JPEG });
    const removed = await openExam('Other');
    await saveSnapshot({ attemptId: removed.attemptId, userId: removed.userId, kind: 'camera', reason: 'start', image: JPEG });

    await deleteAttempt(kept.attemptId);
    await deleteAttempt(removed.attemptId, { deleteSnapshots: true });

    expect(await listSnapshots(kept.attemptId)).toHaveLength(1);
    expect(await listSnapshots(removed.attemptId)).toEqual([]);
  });

  it('keeps the stills of a discarded exam', async () => {
    const exam = await openExam();
    await saveSnapshot({ attemptId: exam.attemptId, userId: exam.userId, kind: 'camera', reason: 'start', image: JPEG });

    await discardExam({ attemptId: exam.attemptId, userId: exam.userId });
    expect(await listSnapshots(exam.attemptId)).toHaveLength(1);
    expect(await deleteSnapshotsFor(exam.attemptId)).toBe(1);
  });

  it('lists a time range without images, serves one image, and deletes one', async () => {
    const exam = await openExam();
    const base = { attemptId: exam.attemptId, userId: exam.userId, kind: 'camera' as const, reason: 'interval' as const, image: JPEG };
    await saveSnapshot(base);
    await saveSnapshot(base);

    const now = Date.now();
    const listed = await findSnapshots({
      from: new Date(now - 60_000).toISOString(),
      to: new Date(now + 60_000).toISOString(),
    });
    expect(listed).toHaveLength(2);
    expect(listed[0]).toMatchObject({ displayName: 'Hasan', attemptId: exam.attemptId, kind: 'camera' });
    expect(listed[0]).not.toHaveProperty('image');
    expect(
      await findSnapshots({ from: new Date(now + 60_000).toISOString(), to: new Date(now + 120_000).toISOString() }),
    ).toEqual([]);

    const bytes = await getSnapshotImage(listed[0]!.id);
    expect(bytes?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // JPEG magic

    expect(await deleteSnapshot(listed[0]!.id)).toBe(true);
    expect(await getSnapshotImage(listed[0]!.id)).toBeNull();
    expect(fakeDb().read(`attempts/${exam.attemptId}`)).toMatchObject({ snapshotCount: 1 });
    expect(await deleteSnapshot('missing')).toBe(false);
  });
});
