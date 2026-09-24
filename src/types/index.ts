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

export const PASSING_SCORE = 25;

/** Each question gets this long; when it runs out the question is left blank. */
export const QUESTION_TIME_SECONDS = 20;

/**
 * How many times someone may leave the exam (switch tab or app, leave
 * fullscreen) and be let back in with a warning. The next time it is submitted.
 */
export const ALLOWED_EXAM_EXITS = 2;

/** What pulled the candidate away from the exam. */
export type ExamExitKind = 'tab_hidden' | 'window_blur' | 'fullscreen_exit';

export interface ExamExit {
  kind: ExamExitKind;
  at: string;
  /** Which question was on screen, 1-based. */
  question: number;
}

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
  /** Which device this was taken on, for the one-attempt-per-device rule. */
  deviceId: string | null;
  /** Every time the candidate left the exam. Absent on attempts from before this existed. */
  exits?: ExamExit[];
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
/** A device lock the organiser can see and release. */
export interface AdminDeviceRow {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  completedAttempts: number;
  /** More than one means the device is shared, or someone tried a second name. */
  participantCount: number;
  lastCompletedDisplayName: string | null;
  locked: boolean;
  releaseCount: number;
  userAgent: string | null;
}

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
  /** How many times they left the exam. */
  exitCount: number;
  /** True when leaving too often is what submitted it. */
  forcedSubmit: boolean;
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

/**
 * One question of an exam as the organiser's live view shows it. Carries the
 * answer key, so it is only ever sent to an authenticated admin.
 */
export interface LiveQuestion {
  /** 1-based position in the exam. */
  number: number;
  prompt: string;
  difficulty: Difficulty;
  /** In the order the candidate saw them. */
  options: string[];
  /** Display index they picked; null when not answered (yet, or ever). */
  selectedIndex: number | null;
  /** Display index of the right answer. */
  correctIndex: number;
  /**
   * `answered` — picked something; `timed_out` — passed without an answer;
   * `pending` — not reached yet.
   */
  state: 'answered' | 'timed_out' | 'pending';
}

export interface LiveAttempt {
  id: string;
  displayName: string;
  attemptNumber: number;
  status: AttemptStatus;
  startedAt: string;
  completedAt: string | null;
  totalQuestions: number;
  /** Questions reached so far: answered or timed out. */
  seen: number;
  correct: number;
  wrong: number;
  /**
   * Where they are heading: accuracy so far applied to the whole exam. Null
   * until they have seen a question. The final score once submitted.
   */
  expectedScore: number | null;
  exitCount: number;
  questions: LiveQuestion[];
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
