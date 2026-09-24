import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFieldValue, fakeDb, resetFakeDb } from './helpers/fakeFirestore';

/**
 * End-to-end tests for the rules that have to hold no matter what the browser
 * sends: one attempt per person, atomic starts, server-side scoring, and
 * retakes that preserve history.
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
  const { FakeFieldValue: fieldValue } = await import('./helpers/fakeFirestore');
  return { FieldValue: fieldValue };
});

const { QUESTION_BANK_BY_ID } = await import('@/data/questions');
const { setRetakeAllowed } = await import('@/lib/admin/service');
const {
  QuizError,
  getActiveExam,
  getAttemptResult,
  getTicket,
  regradeCompletedAttempts,
  startExam,
  submitExam,
} = await import('@/lib/quiz/service');
const { userIdForNormalizedName } = await import('@/lib/firebase/collections');
const { TICKET_PATTERN } = await import('@/lib/quiz/ticket');
const { PASSING_SCORE, TOTAL_QUESTIONS } = await import('@/types');

type AnswerSheet = Array<{ questionId: string; selectedIndex: number }>;

interface StartedLike {
  kind: 'started';
  attemptId: string;
  userId: string;
  attemptNumber: number;
  resumed: boolean;
  questions: ReadonlyArray<{ id: string; options: readonly string[] }>;
}

/** Device locking has its own suite; these tests exercise the name rules alone. */
function start(name: string, normalized: string) {
  return startExam({
    displayName: name,
    normalizedName: normalized,
    userAgent: 'vitest',
    device: null,
  });
}

/** Reads the stored option order to answer correctly, exactly as a perfect candidate would. */
function answerSheet(attemptId: string, correctCount: number): Map<string, number> {
  const attempt = fakeDb().read(`attempts/${attemptId}`);
  if (!attempt) throw new Error('attempt not found');

  const records = attempt.questions as Array<{ questionId: string; optionOrder: number[] }>;
  const answers = new Map<string, number>();

  records.forEach((record, index) => {
    const question = QUESTION_BANK_BY_ID.get(record.questionId);
    if (!question) throw new Error(`unknown question ${record.questionId}`);

    const correctDisplayIndex = record.optionOrder.indexOf(question.correctIndex);
    answers.set(
      record.questionId,
      index < correctCount ? correctDisplayIndex : (correctDisplayIndex + 1) % 4,
    );
  });

  return answers;
}

async function completeExam(name: string, normalized: string, correctCount: number) {
  const outcome = await start(name, normalized);
  if (outcome.kind !== 'started') throw new Error('expected a fresh exam');

  return submitExam({
    attemptId: outcome.attemptId,
    userId: outcome.userId,
    answers: answerSheet(outcome.attemptId, correctCount),
  });
}

beforeEach(() => {
  resetFakeDb();
});

describe('startExam', () => {
  it('opens an exam of 40 questions and records it', async () => {
    const outcome = (await start('Hasan Hmedeh', 'hasan hmedeh')) as StartedLike;

    expect(outcome.kind).toBe('started');
    expect(outcome.questions).toHaveLength(TOTAL_QUESTIONS);
    expect(outcome.attemptNumber).toBe(1);
    expect(outcome.resumed).toBe(false);

    expect(fakeDb().pathsIn('attempts')).toHaveLength(1);
    expect(fakeDb().read(`users/${userIdForNormalizedName('hasan hmedeh')}`)).toMatchObject({
      displayName: 'Hasan Hmedeh',
      normalizedName: 'hasan hmedeh',
      completedAttempts: 0,
      totalAttempts: 1,
    });
  });

  it('never sends the answer key to the client', async () => {
    const outcome = (await start('Hasan', 'hasan')) as StartedLike;
    const serialised = JSON.stringify(outcome.questions);

    expect(serialised).not.toContain('correctIndex');
    for (const question of outcome.questions) {
      expect(Object.keys(question).sort()).toEqual(['id', 'number', 'options', 'prompt']);
    }
  });

  it('resumes the same paper instead of issuing a second one', async () => {
    const first = (await start('Hasan', 'hasan')) as StartedLike;
    const second = (await start('HASAN', 'hasan')) as StartedLike;

    expect(second.resumed).toBe(true);
    expect(second.attemptId).toBe(first.attemptId);
    expect(second.questions.map((q) => q.id)).toEqual(first.questions.map((q) => q.id));
    expect(fakeDb().pathsIn('attempts')).toHaveLength(1);
  });

  it('blocks a second attempt once one is complete', async () => {
    await completeExam('Hasan', 'hasan', 20);

    const blocked = await start('hasan', 'hasan');

    expect(blocked.kind).toBe('blocked');
    if (blocked.kind !== 'blocked') throw new Error('unreachable');
    expect(blocked.score).toBe(20);
    expect(blocked.passed).toBe(false);
    expect(blocked.completedAttempts).toBe(1);
    expect(fakeDb().pathsIn('attempts')).toHaveLength(1);
  });

  it('treats different spellings of one name as the same person', async () => {
    await completeExam('Hasan Hmedeh', 'hasan hmedeh', 40);

    for (const variant of ['hasan hmedeh', '  HASAN   HMEDEH ', 'Hasan Hmedeh']) {
      const normalized = 'hasan hmedeh';
      const blocked = await startExam({
        displayName: variant.trim(),
        normalizedName: normalized,
        userAgent: null,
        device: null,
      });
      expect(blocked.kind).toBe('blocked');
    }

    expect(fakeDb().pathsIn('attempts')).toHaveLength(1);
  });

  it('does not let two racing tabs open two exams', async () => {
    const [first, second] = await Promise.all([start('Hasan', 'hasan'), start('Hasan', 'hasan')]);

    expect(first.kind).toBe('started');
    expect(second.kind).toBe('started');
    if (first.kind !== 'started' || second.kind !== 'started') throw new Error('unreachable');

    // One transaction lost the race, retried, and resumed the winner's exam.
    expect(first.attemptId).toBe(second.attemptId);
    expect(fakeDb().pathsIn('attempts')).toHaveLength(1);
    expect(fakeDb().read(`users/${userIdForNormalizedName('hasan')}`)).toMatchObject({
      totalAttempts: 1,
    });
  });

  it('does not let two racing submissions double-count a completed attempt', async () => {
    const outcome = (await start('Hasan', 'hasan')) as StartedLike;
    const answers = answerSheet(outcome.attemptId, 38);

    const [a, b] = await Promise.all([
      submitExam({ attemptId: outcome.attemptId, userId: outcome.userId, answers }),
      submitExam({ attemptId: outcome.attemptId, userId: outcome.userId, answers }),
    ]);

    expect(a.score).toBe(38);
    expect(b.score).toBe(38);
    expect(a.ticketId).toBe(b.ticketId);
    expect(fakeDb().read(`users/${userIdForNormalizedName('hasan')}`)).toMatchObject({
      completedAttempts: 1,
    });
    expect(fakeDb().pathsIn('tickets')).toHaveLength(1);
  });
});

describe('submitExam', () => {
  it('scores the paper server-side and issues a ticket on a pass', async () => {
    const result = await completeExam('Hasan', 'hasan', 38);

    expect(result.score).toBe(38);
    expect(result.passed).toBe(true);
    expect(result.ticketId).toMatch(TICKET_PATTERN);
    expect(result.totalQuestions).toBe(TOTAL_QUESTIONS);

    const ticket = await getTicket(result.ticketId as string);
    expect(ticket).toMatchObject({
      displayName: 'Hasan',
      score: 38,
      attemptId: result.attemptId,
    });
  });

  it('issues no ticket on a fail', async () => {
    const result = await completeExam('Hasan', 'hasan', PASSING_SCORE - 1);

    expect(result.score).toBe(24);
    expect(result.passed).toBe(false);
    expect(result.ticketId).toBeNull();
    expect(fakeDb().pathsIn('tickets')).toHaveLength(0);
  });

  it('draws the pass line at exactly 25', async () => {
    const pass = await completeExam('Pass Case', 'pass case', 25);
    expect(pass.passed).toBe(true);

    const fail = await completeExam('Fail Case', 'fail case', 24);
    expect(fail.passed).toBe(false);
  });

  it('ignores a forged answer sheet rather than trusting it', async () => {
    const outcome = (await start('Hasan', 'hasan')) as StartedLike;

    // Every question answered with option 0, as a tampered client might.
    const forged = new Map<string, number>();
    for (const question of outcome.questions) forged.set(question.id, 0);

    const result = await submitExam({
      attemptId: outcome.attemptId,
      userId: outcome.userId,
      answers: forged,
    });

    // Roughly a quarter right by luck — certainly not 40.
    expect(result.score).toBeLessThan(TOTAL_QUESTIONS);
    expect(result.score).toBe(
      (fakeDb().read(`attempts/${outcome.attemptId}`)?.questions as Array<{ correct: boolean }>)
        .filter((record) => record.correct).length,
    );
  });

  it('returns the stored result when the same attempt is submitted twice', async () => {
    const outcome = (await start('Hasan', 'hasan')) as StartedLike;
    const first = await submitExam({
      attemptId: outcome.attemptId,
      userId: outcome.userId,
      answers: answerSheet(outcome.attemptId, 36),
    });

    // A second submission cannot improve the score.
    const second = await submitExam({
      attemptId: outcome.attemptId,
      userId: outcome.userId,
      answers: answerSheet(outcome.attemptId, 40),
    });

    expect(second.score).toBe(first.score);
    expect(second.ticketId).toBe(first.ticketId);
    expect(fakeDb().read(`users/${userIdForNormalizedName('hasan')}`)).toMatchObject({
      completedAttempts: 1,
    });
  });

  it('refuses a submission from a session that does not own the attempt', async () => {
    const outcome = (await start('Hasan', 'hasan')) as StartedLike;

    await expect(
      submitExam({
        attemptId: outcome.attemptId,
        userId: 'someone-else',
        answers: new Map(),
      }),
    ).rejects.toThrow(QuizError);
  });

  it('refuses an unknown attempt', async () => {
    await expect(
      submitExam({ attemptId: 'does-not-exist', userId: 'u1', answers: new Map() }),
    ).rejects.toMatchObject({ code: 'attempt_not_found' });
  });

  it('refuses an expired session', async () => {
    const outcome = (await start('Hasan', 'hasan')) as StartedLike;
    const attempt = fakeDb().read(`attempts/${outcome.attemptId}`);
    if (!attempt) throw new Error('attempt missing');

    fakeDb().seed(`attempts/${outcome.attemptId}`, {
      ...attempt,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(
      submitExam({
        attemptId: outcome.attemptId,
        userId: outcome.userId,
        answers: new Map(),
      }),
    ).rejects.toMatchObject({ code: 'session_expired' });
  });
});

describe('retakes', () => {
  it('lets the organiser reopen the exam without erasing history', async () => {
    const first = await completeExam('John Doe', 'john doe', 21);
    expect(first.passed).toBe(false);

    const userId = userIdForNormalizedName('john doe');

    // Blocked until the organiser acts.
    expect((await start('John Doe', 'john doe')).kind).toBe('blocked');

    const grant = await setRetakeAllowed(userId, true);
    expect(grant).toMatchObject({ ok: true, displayName: 'John Doe', retakeAllowed: true });

    const second = (await start('John Doe', 'john doe')) as StartedLike;
    expect(second.kind).toBe('started');
    expect(second.attemptNumber).toBe(2);

    const secondResult = await submitExam({
      attemptId: second.attemptId,
      userId: second.userId,
      answers: answerSheet(second.attemptId, 37),
    });
    expect(secondResult.score).toBe(37);
    expect(secondResult.passed).toBe(true);

    // Both attempts survive, in order.
    const attempts = fakeDb()
      .docsIn('attempts')
      .sort((a, b) => Number(a.attemptNumber) - Number(b.attemptNumber));
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ attemptNumber: 1, score: 21, passed: false });
    expect(attempts[1]).toMatchObject({ attemptNumber: 2, score: 37, passed: true });
  });

  it('gives a fresh set of questions on the retake', async () => {
    const firstOutcome = (await start('John Doe', 'john doe')) as StartedLike;
    const firstIds = new Set(firstOutcome.questions.map((question) => question.id));
    await submitExam({
      attemptId: firstOutcome.attemptId,
      userId: firstOutcome.userId,
      answers: answerSheet(firstOutcome.attemptId, 10),
    });

    await setRetakeAllowed(userIdForNormalizedName('john doe'), true);

    const secondOutcome = (await start('John Doe', 'john doe')) as StartedLike;
    const overlap = secondOutcome.questions.filter((question) => firstIds.has(question.id));

    expect(overlap).toHaveLength(0);
  });

  it('consumes the grant so one click buys exactly one attempt', async () => {
    await completeExam('John Doe', 'john doe', 10);
    const userId = userIdForNormalizedName('john doe');

    await setRetakeAllowed(userId, true);
    const second = (await start('John Doe', 'john doe')) as StartedLike;

    expect(fakeDb().read(`users/${userId}`)).toMatchObject({ retakeAllowed: false });

    await submitExam({
      attemptId: second.attemptId,
      userId: second.userId,
      answers: answerSheet(second.attemptId, 12),
    });

    expect((await start('John Doe', 'john doe')).kind).toBe('blocked');
  });

  it('can be revoked before it is used', async () => {
    await completeExam('John Doe', 'john doe', 10);
    const userId = userIdForNormalizedName('john doe');

    await setRetakeAllowed(userId, true);
    await setRetakeAllowed(userId, false);

    expect((await start('John Doe', 'john doe')).kind).toBe('blocked');
  });

  it('reports an unknown participant instead of creating one', async () => {
    expect(await setRetakeAllowed('nobody', true)).toEqual({ ok: false, error: 'user_not_found' });
    expect(fakeDb().pathsIn('users')).toHaveLength(0);
  });

  it('counts how many grants a participant has had', async () => {
    await completeExam('John Doe', 'john doe', 10);
    const userId = userIdForNormalizedName('john doe');

    await setRetakeAllowed(userId, true);
    expect(fakeDb().read(`users/${userId}`)).toMatchObject({ retakeGrants: 1 });

    await setRetakeAllowed(userId, true);
    expect(fakeDb().read(`users/${userId}`)).toMatchObject({ retakeGrants: 2 });
  });
});

describe('lookups', () => {
  it('returns an in-progress exam for the matching session only', async () => {
    const outcome = (await start('Hasan', 'hasan')) as StartedLike;

    const mine = await getActiveExam(outcome.attemptId, outcome.userId);
    expect(mine.kind).toBe('active');
    if (mine.kind === 'active') {
      expect(mine.exam.questions).toHaveLength(TOTAL_QUESTIONS);
      expect(mine.exam.displayName).toBe('Hasan');
    }

    expect((await getActiveExam(outcome.attemptId, 'someone-else')).kind).toBe('missing');
    expect((await getActiveExam('nope', outcome.userId)).kind).toBe('missing');
  });

  it('reports a completed exam so the page can redirect to the result', async () => {
    const outcome = (await start('Hasan', 'hasan')) as StartedLike;
    await submitExam({
      attemptId: outcome.attemptId,
      userId: outcome.userId,
      answers: answerSheet(outcome.attemptId, 40),
    });

    expect(await getActiveExam(outcome.attemptId, outcome.userId)).toEqual({
      kind: 'completed',
      attemptId: outcome.attemptId,
    });
  });

  it('only returns results for finished attempts', async () => {
    const outcome = (await start('Hasan', 'hasan')) as StartedLike;
    expect(await getAttemptResult(outcome.attemptId)).toBeNull();

    await submitExam({
      attemptId: outcome.attemptId,
      userId: outcome.userId,
      answers: answerSheet(outcome.attemptId, 40),
    });

    expect(await getAttemptResult(outcome.attemptId)).toMatchObject({
      displayName: 'Hasan',
      score: 40,
      passed: true,
    });
    expect(await getAttemptResult('unknown-attempt')).toBeNull();
  });

  it('returns null for a ticket that does not exist', async () => {
    expect(await getTicket('EG-2026-ZZZZZZ')).toBeNull();
  });
});

describe('answer-sheet helper', () => {
  it('produces exactly the number of correct answers asked for', async () => {
    const outcome = (await start('Hasan', 'hasan')) as StartedLike;
    const sheet = answerSheet(outcome.attemptId, 7);
    expect(sheet.size).toBe(TOTAL_QUESTIONS);

    const result = await submitExam({
      attemptId: outcome.attemptId,
      userId: outcome.userId,
      answers: sheet,
    });
    expect(result.score).toBe(7);
  });
});

/** Guards the shape the API route builds before calling the service. */
describe('answer payload mapping', () => {
  it('collapses a duplicated question id to the last submitted selection', () => {
    const payload: AnswerSheet = [
      { questionId: 'e-001', selectedIndex: 0 },
      { questionId: 'e-001', selectedIndex: 3 },
    ];

    const answers = new Map<string, number>();
    for (const answer of payload) answers.set(answer.questionId, answer.selectedIndex);

    expect(answers.size).toBe(1);
    expect(answers.get('e-001')).toBe(3);
  });
});

/** The fake is only useful if it really does model contention. */
describe('fake Firestore', () => {
  it('retries a transaction whose read moved underneath it', async () => {
    const db = resetFakeDb();
    db.seed('counters/x', { value: 0 });

    await Promise.all([
      db.runTransaction(async (transaction) => {
        const reference = db.collection('counters').doc('x');
        const snapshot = await transaction.get(reference);
        const value = Number(snapshot.data()?.value ?? 0);
        transaction.update(reference, { value: value + 1 });
      }),
      db.runTransaction(async (transaction) => {
        const reference = db.collection('counters').doc('x');
        const snapshot = await transaction.get(reference);
        const value = Number(snapshot.data()?.value ?? 0);
        transaction.update(reference, { value: value + 1 });
      }),
    ]);

    expect(db.read('counters/x')).toEqual({ value: 2 });
    expect(db.transactionRuns).toBeGreaterThan(2);
  });

  it('applies increment sentinels', async () => {
    const db = resetFakeDb();
    db.seed('users/u', { completedAttempts: 1 });

    await db.runTransaction(async (transaction) => {
      const reference = db.collection('users').doc('u');
      await transaction.get(reference);
      transaction.update(reference, { completedAttempts: FakeFieldValue.increment(1) });
    });

    expect(db.read('users/u')).toEqual({ completedAttempts: 2 });
  });
});

describe('regradeCompletedAttempts', () => {
  /** Rewrites a finished attempt as if it had been graded under a stricter mark. */
  function markAsFailed(attemptId: string, userId: string) {
    const db = fakeDb();
    db.seed(`attempts/${attemptId}`, { ...db.read(`attempts/${attemptId}`), passed: false, ticketId: null });
    db.seed(`users/${userId}`, { ...db.read(`users/${userId}`), lastPassed: false });
    for (const path of db.pathsIn('tickets')) db.store.delete(path);
  }

  it('passes old attempts that clear the current mark and issues their tickets', async () => {
    const result = await completeExam('Old Fail', 'old fail', PASSING_SCORE + 3);
    const userId = userIdForNormalizedName('old fail');
    markAsFailed(result.attemptId, userId);

    const summary = await regradeCompletedAttempts();

    expect(summary.checked).toBe(1);
    expect(summary.promoted).toHaveLength(1);
    const { ticketId } = summary.promoted[0]!;
    expect(ticketId).toMatch(TICKET_PATTERN);

    expect(fakeDb().read(`attempts/${result.attemptId}`)).toMatchObject({ passed: true, ticketId });
    expect(fakeDb().read(`users/${userId}`)).toMatchObject({ lastPassed: true });
    expect(await getTicket(ticketId)).toMatchObject({
      attemptId: result.attemptId,
      displayName: 'Old Fail',
      score: PASSING_SCORE + 3,
    });
  });

  it('leaves genuine fails and existing passes alone, and is safe to re-run', async () => {
    const fail = await completeExam('Still Fail', 'still fail', PASSING_SCORE - 1);
    const pass = await completeExam('Already Pass', 'already pass', 40);

    const first = await regradeCompletedAttempts();
    const second = await regradeCompletedAttempts();

    expect(first).toEqual({ checked: 2, promoted: [] });
    expect(second).toEqual({ checked: 2, promoted: [] });
    expect(fakeDb().read(`attempts/${fail.attemptId}`)).toMatchObject({ passed: false, ticketId: null });
    expect(fakeDb().read(`attempts/${pass.attemptId}`)).toMatchObject({ passed: true, ticketId: pass.ticketId });
    expect(fakeDb().pathsIn('tickets')).toHaveLength(1);
  });
});

describe('deleteAttempt', () => {
  it('removes the only submission and its ticket, so the person can take the exam again', async () => {
    const { deleteAttempt } = await import('@/lib/admin/service');
    const result = await completeExam('Hasan', 'hasan', 38);
    expect(result.ticketId).toMatch(TICKET_PATTERN);

    const outcome = await deleteAttempt(result.attemptId);

    expect(outcome).toMatchObject({ ok: true, displayName: 'Hasan', attemptNumber: 1 });
    expect(fakeDb().read(`attempts/${result.attemptId}`)).toBeUndefined();
    expect(await getTicket(result.ticketId as string)).toBeNull();
    expect(fakeDb().read(`users/${userIdForNormalizedName('hasan')}`)).toBeUndefined();

    const again = (await start('Hasan', 'hasan')) as StartedLike;
    expect(again.kind).toBe('started');
    expect(again.attemptNumber).toBe(1);
  });

  it('rebuilds the summary from the attempts that remain', async () => {
    const { deleteAttempt } = await import('@/lib/admin/service');
    const first = await completeExam('John Doe', 'john doe', 21);
    const userId = userIdForNormalizedName('john doe');
    await setRetakeAllowed(userId, true);
    const second = await completeExam('John Doe', 'john doe', 38);

    await deleteAttempt(second.attemptId);

    expect(fakeDb().read(`users/${userId}`)).toMatchObject({
      completedAttempts: 1,
      totalAttempts: 1,
      latestAttemptId: first.attemptId,
      lastScore: 21,
      lastPassed: false,
      bestScore: 21,
    });
    expect(fakeDb().read(`attempts/${first.attemptId}`)).toBeDefined();
    expect(fakeDb().pathsIn('tickets')).toHaveLength(0);
    // Still has a finished attempt, so still blocked.
    expect((await start('John Doe', 'john doe')).kind).toBe('blocked');
  });

  it('reports a submission that is already gone', async () => {
    const { deleteAttempt } = await import('@/lib/admin/service');
    expect(await deleteAttempt('missing')).toEqual({ ok: false, error: 'attempt_not_found' });
  });
});
