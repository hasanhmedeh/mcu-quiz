import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb, resetFakeDb } from './helpers/fakeFirestore';
import type { DeviceIdentity } from '@/lib/quiz/service';

/**
 * One attempt per device.
 *
 * The rule has to stop a second *name* on the same machine without ever
 * standing in the way of the person who legitimately owns that attempt —
 * resuming, seeing their result, and an organiser-granted retake all have to
 * keep working.
 */

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

const { QUESTION_BANK_BY_ID } = await import('@/data/questions');
const { deleteAttempt, releaseDevice, setRetakeAllowed } = await import('@/lib/admin/service');
const { startExam, submitExam } = await import('@/lib/quiz/service');
const { userIdForNormalizedName } = await import('@/lib/firebase/collections');
const { deviceIdFromSignals, isDeviceLockEnabled, normalizeUserAgent } = await import(
  '@/lib/device/identity'
);

const LAPTOP: DeviceIdentity = { primaryId: 'device-laptop', alternateIds: [] };
const PHONE: DeviceIdentity = { primaryId: 'device-phone', alternateIds: [] };

interface StartedLike {
  kind: 'started';
  attemptId: string;
  userId: string;
  attemptNumber: number;
  questions: ReadonlyArray<{ id: string }>;
}

function start(name: string, normalized: string, device: DeviceIdentity | null) {
  return startExam({ displayName: name, normalizedName: normalized, userAgent: 'vitest', device });
}

function answerSheet(attemptId: string, correctCount: number): Map<string, number> {
  const attempt = fakeDb().read(`attempts/${attemptId}`);
  if (!attempt) throw new Error('attempt not found');

  const records = attempt.questions as Array<{ questionId: string; optionOrder: number[] }>;
  const answers = new Map<string, number>();

  records.forEach((record, index) => {
    const question = QUESTION_BANK_BY_ID.get(record.questionId);
    if (!question) throw new Error('unknown question');
    const correct = record.optionOrder.indexOf(question.correctIndex);
    answers.set(record.questionId, index < correctCount ? correct : (correct + 1) % 4);
  });

  return answers;
}

async function playThrough(
  name: string,
  normalized: string,
  device: DeviceIdentity | null,
  score = 20,
) {
  const outcome = await start(name, normalized, device);
  if (outcome.kind !== 'started') throw new Error(`expected a fresh exam, got ${outcome.kind}`);

  return submitExam({
    attemptId: outcome.attemptId,
    userId: outcome.userId,
    answers: answerSheet(outcome.attemptId, score),
  });
}

beforeEach(() => {
  resetFakeDb();
});

describe('one attempt per device', () => {
  it('turns away a second name on the same device', async () => {
    await playThrough('Hasan', 'hasan', LAPTOP);

    const blocked = await start('Totally Someone Else', 'totally someone else', LAPTOP);

    expect(blocked.kind).toBe('blocked');
    if (blocked.kind !== 'blocked') throw new Error('unreachable');
    expect(blocked.reason).toBe('device_limit');
    expect(blocked.deviceOwnerName).toBe('Hasan');
  });

  it('is not defeated by clearing cookies', async () => {
    // Clearing cookies loses the cookie id, but the fingerprint still resolves
    // to the same device record — which is the whole point.
    await playThrough('Hasan', 'hasan', { primaryId: 'fingerprint-abc', alternateIds: ['cookie-1'] });

    const afterClearing = await start('Second Name', 'second name', {
      primaryId: 'fingerprint-abc',
      alternateIds: [],
    });

    expect(afterClearing.kind).toBe('blocked');
    if (afterClearing.kind !== 'blocked') throw new Error('unreachable');
    expect(afterClearing.reason).toBe('device_limit');
  });

  it('still recognises the device when the fingerprint drifts but the cookie survives', async () => {
    await playThrough('Hasan', 'hasan', { primaryId: 'fingerprint-old', alternateIds: [] });

    // A driver update changes the canvas hash; the cookie carries the history.
    const blocked = await start('Second Name', 'second name', {
      primaryId: 'fingerprint-new',
      alternateIds: ['fingerprint-old'],
    });

    expect(blocked.kind).toBe('blocked');
    if (blocked.kind !== 'blocked') throw new Error('unreachable');
    expect(blocked.reason).toBe('device_limit');
  });

  it('lets a different device play freely', async () => {
    await playThrough('Hasan', 'hasan', LAPTOP);

    const onPhone = await start('Someone Else', 'someone else', PHONE);
    expect(onPhone.kind).toBe('started');
  });

  it('does not block the person who owns the attempt', async () => {
    const result = await playThrough('Hasan', 'hasan', LAPTOP);
    expect(result.score).toBe(20);

    // Same person, same device: blocked by the *name* rule, not the device one.
    const again = await start('hasan', 'hasan', LAPTOP);
    expect(again.kind).toBe('blocked');
    if (again.kind !== 'blocked') throw new Error('unreachable');
    expect(again.reason).toBe('already_completed');
    expect(again.score).toBe(20);
  });

  it('lets an organiser-granted retake proceed on the same device', async () => {
    await playThrough('Hasan', 'hasan', LAPTOP);
    await setRetakeAllowed(userIdForNormalizedName('hasan'), true);

    const retake = (await start('Hasan', 'hasan', LAPTOP)) as StartedLike;
    expect(retake.kind).toBe('started');
    expect(retake.attemptNumber).toBe(2);
  });

  it('still allows a new name while nothing has been completed', async () => {
    // Deliberate: the lock counts *finished* exams, not abandoned ones, so
    // someone who mistypes their name can start over. The cheat this feature
    // exists to stop — fail, then retry under a new name — requires finishing,
    // which is exactly what arms the lock.
    await start('Hasan', 'hasan', LAPTOP);
    const corrected = await start('Hasan Hmedeh', 'hasan hmedeh', LAPTOP);

    expect(corrected.kind).toBe('started');
  });

  it('records which participants have used a device', async () => {
    await playThrough('Hasan', 'hasan', LAPTOP);

    const device = fakeDb().read('devices/device-laptop');
    expect(device).toMatchObject({
      completedAttempts: 1,
      lastCompletedDisplayName: 'Hasan',
    });
    expect(device?.completedUserIds).toEqual([userIdForNormalizedName('hasan')]);
  });

  it('stores the device on the attempt for auditing', async () => {
    const outcome = (await start('Hasan', 'hasan', LAPTOP)) as StartedLike;
    expect(fakeDb().read(`attempts/${outcome.attemptId}`)).toMatchObject({
      deviceId: 'device-laptop',
    });
  });
});

describe('releasing a device', () => {
  it('reopens a shared machine for the next person', async () => {
    await playThrough('Hasan', 'hasan', LAPTOP);
    expect((await start('Housemate', 'housemate', LAPTOP)).kind).toBe('blocked');

    const released = await releaseDevice('device-laptop');
    expect(released).toEqual({ ok: true, deviceId: 'device-laptop' });

    const housemate = await start('Housemate', 'housemate', LAPTOP);
    expect(housemate.kind).toBe('started');
  });

  it('does not hand the first person a second attempt', async () => {
    await playThrough('Hasan', 'hasan', LAPTOP);
    await releaseDevice('device-laptop');

    // The per-name rule is untouched by a device release.
    const again = await start('Hasan', 'hasan', LAPTOP);
    expect(again.kind).toBe('blocked');
    if (again.kind !== 'blocked') throw new Error('unreachable');
    expect(again.reason).toBe('already_completed');
  });

  it('re-locks once the next person finishes', async () => {
    await playThrough('Hasan', 'hasan', LAPTOP);
    await releaseDevice('device-laptop');
    await playThrough('Housemate', 'housemate', LAPTOP);

    const third = await start('Third Person', 'third person', LAPTOP);
    expect(third.kind).toBe('blocked');
  });

  it('keeps attempt history through a release', async () => {
    await playThrough('Hasan', 'hasan', LAPTOP, 31);
    await releaseDevice('device-laptop');
    await playThrough('Housemate', 'housemate', LAPTOP, 36);

    const attempts = fakeDb().docsIn('attempts');
    expect(attempts).toHaveLength(2);
    expect(attempts.map((attempt) => attempt.score).sort()).toEqual([31, 36]);
  });

  it('counts releases and reports an unknown device', async () => {
    await playThrough('Hasan', 'hasan', LAPTOP);

    await releaseDevice('device-laptop');
    expect(fakeDb().read('devices/device-laptop')).toMatchObject({ releaseCount: 1 });

    expect(await releaseDevice('no-such-device')).toEqual({
      ok: false,
      error: 'device_not_found',
    });
  });
});

describe('device locking switched off', () => {
  it('allows any number of names when no device is supplied', async () => {
    await playThrough('Hasan', 'hasan', null);

    const second = await start('Someone Else', 'someone else', null);
    expect(second.kind).toBe('started');
    expect(fakeDb().pathsIn('devices')).toHaveLength(0);
  });
});

describe('device identity', () => {
  const signals = {
    canvas: 'a1b2c3d4',
    webgl: 'deadbeef',
    platform: 'Windows',
    cores: 8,
    memory: 8,
    touchPoints: 0,
    colorDepth: 24,
    timeZone: 'Asia/Beirut',
    language: 'en-GB',
  };

  it('is stable for the same machine', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36';
    expect(deviceIdFromSignals(signals, chrome)).toBe(deviceIdFromSignals(signals, chrome));
  });

  it('survives a browser version bump', () => {
    const before = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36';
    const after = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36';
    expect(deviceIdFromSignals(signals, before)).toBe(deviceIdFromSignals(signals, after));
  });

  it('ignores a regional language change', () => {
    const agent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/124.0.0.0 Safari/537.36';
    expect(deviceIdFromSignals({ ...signals, language: 'en-US' }, agent)).toBe(
      deviceIdFromSignals({ ...signals, language: 'en-GB' }, agent),
    );
  });

  it('differs for a different machine', () => {
    const agent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/124.0.0.0 Safari/537.36';
    expect(deviceIdFromSignals({ ...signals, canvas: 'ffffffff' }, agent)).not.toBe(
      deviceIdFromSignals(signals, agent),
    );
    expect(deviceIdFromSignals({ ...signals, cores: 4 }, agent)).not.toBe(
      deviceIdFromSignals(signals, agent),
    );
  });

  it('differs across browsers on one machine, which is intended', () => {
    // Switching browser is a deliberate, inconvenient act; treating it as a
    // new device avoids false positives between two people on one family PC.
    const chrome = 'Mozilla/5.0 (Windows NT 10.0) Chrome/124.0.0.0 Safari/537.36';
    const firefox = 'Mozilla/5.0 (Windows NT 10.0; rv:126.0) Gecko/20100101 Firefox/126.0';
    expect(deviceIdFromSignals(signals, chrome)).not.toBe(deviceIdFromSignals(signals, firefox));
  });

  it('never leaks raw signals into the id', () => {
    const id = deviceIdFromSignals(signals, 'Mozilla/5.0 Chrome/124');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain('Beirut');
  });
});

describe('normalizeUserAgent', () => {
  it('collapses to browser and platform families', () => {
    expect(normalizeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/124 Safari/537')).toBe(
      'chrome|windows',
    );
    expect(normalizeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1')).toBe(
      'safari|ios',
    );
    expect(normalizeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/124 Edg/124')).toBe(
      'edge|windows',
    );
    expect(normalizeUserAgent(null)).toBe('unknown|unknown');
  });
});

describe('isDeviceLockEnabled', () => {
  it('is on unless explicitly disabled', () => {
    delete process.env.DEVICE_LOCK_ENABLED;
    expect(isDeviceLockEnabled()).toBe(true);

    process.env.DEVICE_LOCK_ENABLED = 'true';
    expect(isDeviceLockEnabled()).toBe(true);

    process.env.DEVICE_LOCK_ENABLED = 'FALSE';
    expect(isDeviceLockEnabled()).toBe(false);

    process.env.DEVICE_LOCK_ENABLED = 'false';
    expect(isDeviceLockEnabled()).toBe(false);

    delete process.env.DEVICE_LOCK_ENABLED;
  });
});

describe('deleting a submission', () => {
  it('frees the device when it was the only one finished there', async () => {
    const result = await playThrough('Hasan', 'hasan', LAPTOP);
    expect((await start('Someone Else', 'someone else', LAPTOP)).kind).toBe('blocked');

    await deleteAttempt(result.attemptId);

    expect(fakeDb().read('devices/device-laptop')).toMatchObject({
      completedUserIds: [],
      startedUserIds: [],
      completedAttempts: 0,
    });
    expect((await start('Someone Else', 'someone else', LAPTOP)).kind).toBe('started');
  });
});
