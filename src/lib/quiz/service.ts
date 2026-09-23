import 'server-only';

import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { getDb } from '@/lib/firebase/admin';
import {
  attemptsCollection,
  devicesCollection,
  ticketsCollection,
  userIdForNormalizedName,
  usersCollection,
  type DeviceDocument,
  type TicketDocument,
} from '@/lib/firebase/collections';
import { QUESTION_BANK, QUESTION_BANK_BY_ID } from '@/data/questions';
import {
  TOTAL_QUESTIONS,
  type AttemptDocument,
  type AttemptQuestionRecord,
  type AttemptResult,
  type ClientQuestion,
  type UserDocument,
} from '@/types';
import { buildExam, gradeAttempt } from './exam';
import { generateTicketId } from './ticket';
import { QUIZ_SESSION_TTL_SECONDS } from '@/lib/auth/sessionConfig';

/** Trim the exclusion list so a user document cannot grow without bound. */
const MAX_USED_QUESTION_IDS = 600;
const MAX_TICKET_GENERATION_ATTEMPTS = 5;

export type QuizErrorCode =
  | 'invalid_session'
  | 'attempt_not_found'
  | 'session_expired'
  | 'user_not_found';

export class QuizError extends Error {
  readonly code: QuizErrorCode;

  constructor(code: QuizErrorCode, message: string) {
    super(message);
    this.name = 'QuizError';
    this.code = code;
  }
}

export interface StartedExam {
  readonly kind: 'started';
  readonly attemptId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly attemptNumber: number;
  readonly questions: ClientQuestion[];
  /** True when an unfinished exam was handed back instead of a new one. */
  readonly resumed: boolean;
}

/**
 * Why someone was turned away.
 *
 * `already_completed` — this name has finished the exam.
 * `device_limit`      — this machine has already been used, under another name.
 */
export type BlockedReason = 'already_completed' | 'device_limit';

export interface BlockedExam {
  readonly kind: 'blocked';
  readonly reason: BlockedReason;
  readonly displayName: string;
  readonly attemptId: string | null;
  readonly score: number | null;
  readonly totalQuestions: number;
  readonly passed: boolean | null;
  readonly ticketId: string | null;
  readonly completedAt: string | null;
  readonly completedAttempts: number;
  /** For `device_limit`: who already played on this device. */
  readonly deviceOwnerName: string | null;
}

export type StartExamOutcome = StartedExam | BlockedExam;

/**
 * How the caller identified this browser.
 *
 * `primaryId` is derived from the fingerprint (or the cookie when scripting is
 * unavailable) and is the record that gets written. `alternateIds` are other
 * identifiers that might already hold this device's history — chiefly the
 * cookie, when fingerprint drift has produced a new hash.
 */
export interface DeviceIdentity {
  readonly primaryId: string;
  readonly alternateIds: readonly string[];
}

function emptyDevice(deviceId: string, now: string, userAgent: string | null): DeviceDocument {
  return {
    deviceId,
    firstSeenAt: now,
    lastSeenAt: now,
    startedUserIds: [],
    completedUserIds: [],
    completedAttempts: 0,
    lastCompletedDisplayName: null,
    releasedAt: null,
    releaseCount: 0,
    userAgent,
  };
}

/** Rebuilds the browser payload from stored per-question state. */
function toClientQuestions(records: readonly AttemptQuestionRecord[]): ClientQuestion[] | null {
  const questions: ClientQuestion[] = [];

  for (const [index, record] of records.entries()) {
    const question = QUESTION_BANK_BY_ID.get(record.questionId);
    // A question edited out of the bank mid-exam invalidates the resume.
    if (!question) return null;

    questions.push({
      id: question.id,
      number: index + 1,
      prompt: question.prompt,
      options: record.optionOrder.map((authoringIndex) => question.options[authoringIndex] ?? ''),
    });
  }

  return questions;
}

function emptyUser(normalizedName: string, displayName: string, now: string): UserDocument {
  return {
    normalizedName,
    displayName,
    createdAt: now,
    updatedAt: now,
    completedAttempts: 0,
    totalAttempts: 0,
    retakeAllowed: false,
    retakeGrants: 0,
    retakeGrantedAt: null,
    activeAttemptId: null,
    activeAttemptExpiresAt: null,
    latestAttemptId: null,
    lastScore: null,
    lastPassed: null,
    bestScore: null,
    usedQuestionIds: [],
  };
}

export interface StartExamInput {
  readonly displayName: string;
  readonly normalizedName: string;
  readonly userAgent: string | null;
  /** Null when device locking is switched off or the browser sent nothing. */
  readonly device: DeviceIdentity | null;
}

/**
 * Starts (or resumes) an exam inside a single Firestore transaction.
 *
 * The transaction is what makes the one-attempt rule real: two tabs racing
 * with the same name both read the same user document, and Firestore will
 * retry the loser, which then sees the winner's `activeAttemptId` and resumes
 * that exam rather than creating a second one.
 */
export async function startExam(input: StartExamInput): Promise<StartExamOutcome> {
  const db = getDb();
  const users = usersCollection();
  const attempts = attemptsCollection();
  const devices = devicesCollection();

  const userId = userIdForNormalizedName(input.normalizedName);
  const userRef = users.doc(userId);

  // De-duplicated, primary first, so the record that gets written is the one
  // the fingerprint currently resolves to.
  const deviceIds = input.device
    ? [...new Set([input.device.primaryId, ...input.device.alternateIds])]
    : [];

  return db.runTransaction<StartExamOutcome>(async (transaction) => {
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const expiresAt = new Date(nowDate.getTime() + QUIZ_SESSION_TTL_SECONDS * 1000).toISOString();

    const userSnapshot = await transaction.get(userRef);
    const existing = userSnapshot.data();

    // Every device read happens here, before any write, as Firestore requires.
    // Sequential rather than concurrent: there are only ever one or two ids,
    // and it keeps the read ordering inside the transaction unambiguous.
    const deviceRecords: Array<{ ref: DocumentReference<DeviceDocument>; data?: DeviceDocument }> =
      [];

    for (const deviceId of deviceIds) {
      const ref = devices.doc(deviceId);
      deviceRecords.push({ ref, data: (await transaction.get(ref)).data() });
    }

    // --- Resume an exam that is still open ------------------------------
    if (existing?.activeAttemptId && existing.activeAttemptExpiresAt) {
      const stillValid = new Date(existing.activeAttemptExpiresAt).getTime() > nowDate.getTime();
      if (stillValid) {
        const activeRef = attempts.doc(existing.activeAttemptId);
        const activeSnapshot = await transaction.get(activeRef);
        const active = activeSnapshot.data();

        if (active && active.status === 'in_progress') {
          const questions = toClientQuestions(active.questions);
          if (questions && questions.length === active.totalQuestions) {
            return {
              kind: 'started',
              attemptId: activeSnapshot.id,
              userId,
              displayName: active.displayName,
              attemptNumber: active.attemptNumber,
              questions,
              resumed: true,
            };
          }
        }
      }
    }

    // --- Enforce one completed attempt per person -----------------------
    if (existing && existing.completedAttempts > 0 && !existing.retakeAllowed) {
      let latest: AttemptDocument | undefined;
      if (existing.latestAttemptId) {
        const latestSnapshot = await transaction.get(attempts.doc(existing.latestAttemptId));
        latest = latestSnapshot.data();
      }

      return {
        kind: 'blocked',
        reason: 'already_completed',
        displayName: existing.displayName,
        attemptId: existing.latestAttemptId,
        score: latest?.score ?? existing.lastScore,
        totalQuestions: latest?.totalQuestions ?? TOTAL_QUESTIONS,
        passed: latest?.passed ?? existing.lastPassed,
        ticketId: latest?.ticketId ?? null,
        completedAt: latest?.completedAt ?? null,
        completedAttempts: existing.completedAttempts,
        deviceOwnerName: null,
      };
    }

    // --- Enforce one completed attempt per device -----------------------
    //
    // A device that has finished an exam under a *different* name is turned
    // away, which is what stops someone simply typing a new name. The person
    // who already played is unaffected: their own userId is on the record, so
    // resuming, viewing their result, and any organiser-granted retake all
    // still work. An organiser release clears the list entirely.
    const claimedElsewhere = deviceRecords.find(
      (record) =>
        record.data !== undefined &&
        record.data.completedUserIds.length > 0 &&
        !record.data.completedUserIds.includes(userId),
    );

    if (claimedElsewhere?.data) {
      return {
        kind: 'blocked',
        reason: 'device_limit',
        displayName: input.displayName,
        attemptId: null,
        score: null,
        totalQuestions: TOTAL_QUESTIONS,
        passed: null,
        ticketId: null,
        completedAt: null,
        completedAttempts: claimedElsewhere.data.completedAttempts,
        deviceOwnerName: claimedElsewhere.data.lastCompletedDisplayName,
      };
    }

    // --- Build a fresh exam ---------------------------------------------
    const base = existing ?? emptyUser(input.normalizedName, input.displayName, now);
    const excluded = new Set(base.usedQuestionIds);
    const exam = buildExam(QUESTION_BANK, excluded);

    const attemptRef = attempts.doc();
    const attemptNumber = base.completedAttempts + 1;

    const attemptDocument: AttemptDocument = {
      userId,
      displayName: input.displayName,
      normalizedName: input.normalizedName,
      attemptNumber,
      status: 'in_progress',
      questions: exam.records,
      questionIds: exam.questionIds,
      totalQuestions: TOTAL_QUESTIONS,
      score: null,
      passed: null,
      ticketId: null,
      startedAt: now,
      expiresAt,
      completedAt: null,
      userAgent: input.userAgent,
      deviceId: input.device?.primaryId ?? null,
    };

    transaction.set(attemptRef, attemptDocument);

    // Claim the device for this participant. Recorded at start, so abandoning
    // an exam and returning under a new name is caught too.
    if (input.device) {
      const primary =
        deviceRecords.find((record) => record.ref.id === input.device?.primaryId) ??
        deviceRecords[0];

      if (primary) {
        const base = primary.data ?? emptyDevice(primary.ref.id, now, input.userAgent);
        const deviceUpdate: DeviceDocument = {
          ...base,
          lastSeenAt: now,
          userAgent: input.userAgent ?? base.userAgent,
          startedUserIds: base.startedUserIds.includes(userId)
            ? base.startedUserIds
            : [...base.startedUserIds, userId],
        };
        transaction.set(primary.ref, deviceUpdate);
      }
    }

    // Questions are recorded as used at *start* time, not at completion, so
    // abandoning an exam and starting over yields a different paper.
    const usedQuestionIds = [...base.usedQuestionIds, ...exam.questionIds].slice(
      -MAX_USED_QUESTION_IDS,
    );

    const userUpdate: UserDocument = {
      ...base,
      // Keep the latest spelling/capitalisation the person actually typed.
      displayName: input.displayName,
      updatedAt: now,
      totalAttempts: base.totalAttempts + 1,
      // A granted retake is consumed the moment an exam is generated.
      retakeAllowed: false,
      activeAttemptId: attemptRef.id,
      activeAttemptExpiresAt: expiresAt,
      usedQuestionIds,
    };

    transaction.set(userRef, userUpdate);

    return {
      kind: 'started',
      attemptId: attemptRef.id,
      userId,
      displayName: input.displayName,
      attemptNumber,
      questions: exam.clientQuestions,
      resumed: false,
    };
  });
}

export interface SubmitExamInput {
  readonly attemptId: string;
  readonly userId: string;
  /** Question id -> the index of the option as it was displayed. */
  readonly answers: ReadonlyMap<string, number>;
}

/**
 * Grades and finalises an attempt. The client's answer sheet is the only
 * thing trusted here, and only as *selections*; the score itself is computed
 * from the answer key that never left the server.
 */
export async function submitExam(input: SubmitExamInput): Promise<AttemptResult> {
  const db = getDb();
  const attempts = attemptsCollection();
  const users = usersCollection();
  const tickets = ticketsCollection();

  const attemptRef = attempts.doc(input.attemptId);

  return db.runTransaction<AttemptResult>(async (transaction) => {
    const attemptSnapshot = await transaction.get(attemptRef);
    const attempt = attemptSnapshot.data();

    if (!attempt) throw new QuizError('attempt_not_found', 'Attempt does not exist.');
    if (attempt.userId !== input.userId) {
      throw new QuizError('invalid_session', 'Session does not match this attempt.');
    }

    // Re-submitting a graded attempt returns the stored result rather than
    // re-scoring it, so a double-tap or a retried request is harmless.
    if (attempt.status === 'completed') {
      return {
        attemptId: attemptSnapshot.id,
        displayName: attempt.displayName,
        score: attempt.score ?? 0,
        totalQuestions: attempt.totalQuestions,
        passed: attempt.passed ?? false,
        ticketId: attempt.ticketId,
        completedAt: attempt.completedAt ?? new Date().toISOString(),
        attemptNumber: attempt.attemptNumber,
      };
    }

    if (new Date(attempt.expiresAt).getTime() < Date.now()) {
      throw new QuizError('session_expired', 'This exam session has expired.');
    }

    const userRef = users.doc(attempt.userId);
    const userSnapshot = await transaction.get(userRef);
    const user = userSnapshot.data();
    if (!user) throw new QuizError('user_not_found', 'User record is missing.');

    // Read the device before any write, so the lock can be applied below.
    const deviceRef = attempt.deviceId ? devicesCollection().doc(attempt.deviceId) : null;
    const deviceData = deviceRef ? (await transaction.get(deviceRef)).data() : undefined;

    const { score, passed, gradedRecords } = gradeAttempt(
      attempt.questions,
      input.answers,
      QUESTION_BANK_BY_ID,
    );

    // Reserve a ticket id, re-rolling on the (vanishingly unlikely) collision.
    let ticketId: string | null = null;
    if (passed) {
      for (let i = 0; i < MAX_TICKET_GENERATION_ATTEMPTS; i += 1) {
        const candidate = generateTicketId();
        const candidateSnapshot = await transaction.get(tickets.doc(candidate));
        if (!candidateSnapshot.exists) {
          ticketId = candidate;
          break;
        }
      }
      if (!ticketId) {
        throw new QuizError('invalid_session', 'Could not allocate a ticket id.');
      }
    }

    const completedAt = new Date().toISOString();

    transaction.update(attemptRef, {
      status: 'completed',
      questions: gradedRecords,
      score,
      passed,
      ticketId,
      completedAt,
    });

    transaction.update(userRef, {
      updatedAt: completedAt,
      completedAttempts: FieldValue.increment(1),
      latestAttemptId: attemptSnapshot.id,
      activeAttemptId: null,
      activeAttemptExpiresAt: null,
      lastScore: score,
      lastPassed: passed,
      bestScore: user.bestScore === null ? score : Math.max(user.bestScore, score),
    });

    // Finishing is what locks the device: from here on, a different name on
    // this machine is turned away until the organiser releases it.
    if (deviceRef) {
      const base = deviceData ?? emptyDevice(deviceRef.id, completedAt, attempt.userAgent);
      const deviceUpdate: DeviceDocument = {
        ...base,
        lastSeenAt: completedAt,
        completedAttempts: base.completedAttempts + 1,
        completedUserIds: base.completedUserIds.includes(attempt.userId)
          ? base.completedUserIds
          : [...base.completedUserIds, attempt.userId],
        lastCompletedDisplayName: attempt.displayName,
      };
      transaction.set(deviceRef, deviceUpdate);
    }

    if (ticketId) {
      const ticket: TicketDocument = {
        ticketId,
        attemptId: attemptSnapshot.id,
        userId: attempt.userId,
        displayName: attempt.displayName,
        score,
        totalQuestions: attempt.totalQuestions,
        issuedAt: completedAt,
      };
      transaction.set(tickets.doc(ticketId), ticket);
    }

    return {
      attemptId: attemptSnapshot.id,
      displayName: attempt.displayName,
      score,
      totalQuestions: attempt.totalQuestions,
      passed,
      ticketId,
      completedAt,
      attemptNumber: attempt.attemptNumber,
    };
  });
}

export interface ActiveExam {
  readonly attemptId: string;
  readonly displayName: string;
  readonly attemptNumber: number;
  readonly totalQuestions: number;
  readonly questions: ClientQuestion[];
}

export type ActiveExamLookup =
  | { readonly kind: 'active'; readonly exam: ActiveExam }
  | { readonly kind: 'completed'; readonly attemptId: string }
  | { readonly kind: 'expired' }
  | { readonly kind: 'missing' };

/**
 * Loads the exam behind the current session cookie so `/quiz` can render on
 * the server. The answer key stays here: only prompts and shuffled options
 * cross into the payload.
 */
export async function getActiveExam(
  attemptId: string,
  userId: string,
): Promise<ActiveExamLookup> {
  const snapshot = await attemptsCollection().doc(attemptId).get();
  const attempt = snapshot.data();

  if (!attempt || attempt.userId !== userId) return { kind: 'missing' };
  if (attempt.status === 'completed') return { kind: 'completed', attemptId: snapshot.id };
  if (new Date(attempt.expiresAt).getTime() < Date.now()) return { kind: 'expired' };

  const questions = toClientQuestions(attempt.questions);
  if (!questions) return { kind: 'missing' };

  return {
    kind: 'active',
    exam: {
      attemptId: snapshot.id,
      displayName: attempt.displayName,
      attemptNumber: attempt.attemptNumber,
      totalQuestions: attempt.totalQuestions,
      questions,
    },
  };
}

/** Reads a finished attempt for the result screen. */
export async function getAttemptResult(attemptId: string): Promise<AttemptResult | null> {
  const snapshot = await attemptsCollection().doc(attemptId).get();
  const attempt = snapshot.data();
  if (!attempt || attempt.status !== 'completed') return null;

  return {
    attemptId: snapshot.id,
    displayName: attempt.displayName,
    score: attempt.score ?? 0,
    totalQuestions: attempt.totalQuestions,
    passed: attempt.passed ?? false,
    ticketId: attempt.ticketId,
    completedAt: attempt.completedAt ?? attempt.startedAt,
    attemptNumber: attempt.attemptNumber,
  };
}

/** Public ticket lookup used by the verification page. */
export async function getTicket(ticketId: string): Promise<TicketDocument | null> {
  const snapshot = await ticketsCollection().doc(ticketId).get();
  return snapshot.data() ?? null;
}
