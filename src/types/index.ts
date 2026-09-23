/**
 * Shared domain types.
 *
 * A note on trust boundaries: anything named `Client*` is safe to send to the
 * browser. Everything else lives server-side only (Firestore documents, the
 * question bank with its correct answers, session payloads).
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'] as const;

/** How many questions of each difficulty make up one exam. */
export const EXAM_BLUEPRINT: Readonly<Record<Difficulty, number>> = {
  easy: 20,
  medium: 15,
  hard: 5,
};

export const TOTAL_QUESTIONS = EXAM_BLUEPRINT.easy + EXAM_BLUEPRINT.medium + EXAM_BLUEPRINT.hard;

export const PASSING_SCORE = 35;

/** A question as authored in the bank. Never sent to the browser as-is. */
export interface QuizQuestion {
  /** Stable identifier, e.g. `e-014`. Changing it invalidates retake history. */
  readonly id: string;
  readonly difficulty: Difficulty;
  readonly prompt: string;
  /** Exactly four options in authoring order. */
  readonly options: readonly [string, string, string, string];
  /** Index into `options` of the single correct answer. */
  readonly correctIndex: 0 | 1 | 2 | 3;
  /** Film the question is drawn from — reference material for editors. */
  readonly source: string;
}

/** The redacted shape the browser receives: no correct answer anywhere. */
export interface ClientQuestion {
  readonly id: string;
  /** 1-based position within this exam. */
  readonly number: number;
  readonly prompt: string;
  /** Already shuffled for this attempt. */
  readonly options: readonly string[];
}

/**
 * Per-question state persisted on the attempt.
 *
 * `optionOrder[displayIndex] = authoringIndex`, which is what lets the server
 * map a submitted display index back onto the authored answer key.
 */
export interface AttemptQuestionRecord {
  questionId: string;
  difficulty: Difficulty;
  optionOrder: number[];
  selectedDisplayIndex: number | null;
  /** Filled in at grading time. */
  correct: boolean | null;
}

export type AttemptStatus = 'in_progress' | 'completed';

export interface AttemptDocument {
  userId: string;
  displayName: string;
  normalizedName: string;
  attemptNumber: number;
  status: AttemptStatus;
  questions: AttemptQuestionRecord[];
  questionIds: string[];
  totalQuestions: number;
  score: number | null;
  passed: boolean | null;
  ticketId: string | null;
  startedAt: string;
  expiresAt: string;
  completedAt: string | null;
  userAgent: string | null;
}

export interface UserDocument {
  normalizedName: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  /** Attempts that reached a score. Drives the one-attempt rule. */
  completedAttempts: number;
  /** Including the one currently in progress. */
  totalAttempts: number;
  retakeAllowed: boolean;
  retakeGrants: number;
  retakeGrantedAt: string | null;
  activeAttemptId: string | null;
  activeAttemptExpiresAt: string | null;
  latestAttemptId: string | null;
  lastScore: number | null;
  lastPassed: boolean | null;
  bestScore: number | null;
  /** Everything this person has already been asked, so retakes stay fresh. */
  usedQuestionIds: string[];
}

/** Admin-facing view of an attempt (includes the id). */
export interface AttemptSummary extends AttemptDocument {
  id: string;
}

/**
 * The slice of an attempt the dashboard actually renders.
 *
 * Deliberately excludes `questions` — there is no reason to ship 40 answer
 * records per attempt into the admin's browser just to draw a table row.
 */
export interface AdminAttemptRow {
  id: string;
  userId: string;
  displayName: string;
  attemptNumber: number;
  status: AttemptStatus;
  score: number | null;
  passed: boolean | null;
  totalQuestions: number;
  ticketId: string | null;
  startedAt: string;
  completedAt: string | null;
  userAgent: string | null;
}

export interface AdminUserRow {
  id: string;
  displayName: string;
  normalizedName: string;
  completedAttempts: number;
  totalAttempts: number;
  retakeAllowed: boolean;
  retakeGrants: number;
  lastScore: number | null;
  lastPassed: boolean | null;
  bestScore: number | null;
  updatedAt: string;
  attempts: AdminAttemptRow[];
}

export interface AdminStats {
  totalParticipants: number;
  totalAttempts: number;
  completedAttempts: number;
  passed: number;
  failed: number;
  passRate: number;
  averageScore: number | null;
}

/** Public result payload rendered on the result screen. */
export interface AttemptResult {
  attemptId: string;
  displayName: string;
  score: number;
  totalQuestions: number;
  passed: boolean;
  ticketId: string | null;
  completedAt: string;
  attemptNumber: number;
}
