import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb, resetFakeDb } from './helpers/fakeFirestore';

vi.mock('@/lib/firebase/admin', async () => {
  const { fakeDb } = await import('./helpers/fakeFirestore');
  return {
    getDb: () => fakeDb(),
    isFirebaseConfigured: () => true,
    FirebaseConfigError: class FirebaseConfigError extends Error {},
  };
});

vi.mock('firebase-admin/firestore', async () => {
  const { FakeFieldValue } = await import('./helpers/fakeFirestore');
  return { FieldValue: FakeFieldValue };
});

const { getAdminDashboardData } = await import('@/lib/admin/service');
const { userIdForNormalizedName } = await import('@/lib/firebase/collections');

interface SeedAttempt {
  attemptNumber: number;
  score: number | null;
  passed: boolean | null;
  status: 'in_progress' | 'completed';
  ticketId?: string | null;
  startedAt: string;
}

function seedParticipant(
  name: string,
  attempts: SeedAttempt[],
  overrides: Record<string, unknown> = {},
): string {
  const normalized = name.toLowerCase();
  const userId = userIdForNormalizedName(normalized);
  const db = fakeDb();

  const completed = attempts.filter((attempt) => attempt.status === 'completed');
  const last = completed.at(-1) ?? null;

  db.seed(`users/${userId}`, {
    normalizedName: normalized,
    displayName: name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: attempts.at(-1)?.startedAt ?? '2026-01-01T00:00:00.000Z',
    completedAttempts: completed.length,
    totalAttempts: attempts.length,
    retakeAllowed: false,
    retakeGrants: 0,
    retakeGrantedAt: null,
    activeAttemptId: null,
    activeAttemptExpiresAt: null,
    latestAttemptId: null,
    lastScore: last?.score ?? null,
    lastPassed: last?.passed ?? null,
    bestScore: completed.reduce<number | null>(
      (best, attempt) => (attempt.score === null ? best : Math.max(best ?? 0, attempt.score)),
      null,
    ),
    usedQuestionIds: [],
    ...overrides,
  });

  attempts.forEach((attempt, index) => {
    db.seed(`attempts/${userId}-${index}`, {
      userId,
      displayName: name,
      normalizedName: normalized,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      // The dashboard must not ship these to the browser.
      questions: Array.from({ length: 40 }, (_, position) => ({
        questionId: `e-${position}`,
        difficulty: 'easy',
        optionOrder: [0, 1, 2, 3],
        selectedDisplayIndex: 0,
        correct: true,
      })),
      questionIds: [],
      totalQuestions: 40,
      score: attempt.score,
      passed: attempt.passed,
      ticketId: attempt.ticketId ?? null,
      startedAt: attempt.startedAt,
      expiresAt: attempt.startedAt,
      completedAt: attempt.status === 'completed' ? attempt.startedAt : null,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/124',
    });
  });

  return userId;
}

beforeEach(() => {
  resetFakeDb();
});

describe('getAdminDashboardData', () => {
  it('reports empty state cleanly when nobody has played', async () => {
    const data = await getAdminDashboardData();

    expect(data.users).toEqual([]);
    expect(data.recentAttempts).toEqual([]);
    expect(data.stats).toEqual({
      totalParticipants: 0,
      totalAttempts: 0,
      completedAttempts: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      averageScore: null,
    });
  });

  it('summarises participants, attempts and the pass rate', async () => {
    seedParticipant('Hasan', [
      {
        attemptNumber: 1,
        score: 38,
        passed: true,
        status: 'completed',
        ticketId: 'EG-2026-8F3K92',
        startedAt: '2026-02-01T10:00:00.000Z',
      },
    ]);
    seedParticipant('John Doe', [
      { attemptNumber: 1, score: 31, passed: false, status: 'completed', startedAt: '2026-02-02T10:00:00.000Z' },
      { attemptNumber: 2, score: 37, passed: true, status: 'completed', startedAt: '2026-02-03T10:00:00.000Z' },
    ]);
    seedParticipant('Mid Exam', [
      { attemptNumber: 1, score: null, passed: null, status: 'in_progress', startedAt: '2026-02-04T10:00:00.000Z' },
    ]);

    const data = await getAdminDashboardData();

    expect(data.stats).toEqual({
      totalParticipants: 3,
      totalAttempts: 4,
      completedAttempts: 3,
      passed: 2,
      failed: 1,
      passRate: 67,
      averageScore: 35.3,
    });
  });

  it('keeps each participant full attempt history in order', async () => {
    seedParticipant('John Doe', [
      { attemptNumber: 1, score: 31, passed: false, status: 'completed', startedAt: '2026-02-02T10:00:00.000Z' },
      {
        attemptNumber: 2,
        score: 38,
        passed: true,
        status: 'completed',
        ticketId: 'EG-2026-AAA111',
        startedAt: '2026-02-03T10:00:00.000Z',
      },
    ]);

    const data = await getAdminDashboardData();
    const john = data.users.find((user) => user.displayName === 'John Doe');

    expect(john?.attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2]);
    expect(john?.attempts[0]).toMatchObject({ score: 31, passed: false, ticketId: null });
    expect(john?.attempts[1]).toMatchObject({ score: 38, passed: true, ticketId: 'EG-2026-AAA111' });
    expect(john?.completedAttempts).toBe(2);
  });

  it('strips per-question records so they never reach the browser', async () => {
    seedParticipant('Hasan', [
      { attemptNumber: 1, score: 38, passed: true, status: 'completed', startedAt: '2026-02-01T10:00:00.000Z' },
    ]);

    const data = await getAdminDashboardData();
    const serialised = JSON.stringify(data);

    expect(serialised).not.toContain('optionOrder');
    expect(serialised).not.toContain('selectedDisplayIndex');
    expect(data.users[0]?.attempts[0]).not.toHaveProperty('questions');
  });

  it('carries the fields the dashboard renders', async () => {
    seedParticipant(
      'Hasan',
      [{ attemptNumber: 1, score: 38, passed: true, status: 'completed', startedAt: '2026-02-01T10:00:00.000Z' }],
      { retakeAllowed: true, retakeGrants: 2 },
    );

    const data = await getAdminDashboardData();
    const user = data.users[0];

    expect(user).toMatchObject({
      displayName: 'Hasan',
      normalizedName: 'hasan',
      retakeAllowed: true,
      retakeGrants: 2,
      lastScore: 38,
      bestScore: 38,
    });
    expect(data.recentAttempts[0]).toMatchObject({
      displayName: 'Hasan',
      attemptNumber: 1,
      userAgent: expect.stringContaining('Chrome'),
    });
  });

  it('rounds the pass rate rather than reporting a fraction', async () => {
    seedParticipant('A', [{ attemptNumber: 1, score: 40, passed: true, status: 'completed', startedAt: '2026-02-01T10:00:00.000Z' }]);
    seedParticipant('B', [{ attemptNumber: 1, score: 10, passed: false, status: 'completed', startedAt: '2026-02-02T10:00:00.000Z' }]);
    seedParticipant('C', [{ attemptNumber: 1, score: 10, passed: false, status: 'completed', startedAt: '2026-02-03T10:00:00.000Z' }]);

    const data = await getAdminDashboardData();
    expect(data.stats.passRate).toBe(33);
    expect(data.stats.averageScore).toBe(20);
  });
});
