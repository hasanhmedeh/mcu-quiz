import {
  DIFFICULTIES,
  EXAM_BLUEPRINT,
  PASSING_SCORE,
  TOTAL_QUESTIONS,
  type AttemptQuestionRecord,
  type ClientQuestion,
  type Difficulty,
  type QuizQuestion,
} from '@/types';
import { sample, shuffle } from './random';

export interface BuiltExam {
  /** Server-side state, persisted on the attempt document. */
  readonly records: AttemptQuestionRecord[];
  /** Redacted payload for the browser — no answer key. */
  readonly clientQuestions: ClientQuestion[];
  readonly questionIds: string[];
}

/**
 * Picks `count` questions of one difficulty, preferring ones this person has
 * never seen. Previously-used questions are only reintroduced when the fresh
 * pool runs dry, which keeps admin-granted retakes meaningfully different
 * without ever failing to build an exam.
 */
export function selectForDifficulty(
  pool: readonly QuizQuestion[],
  count: number,
  excludedIds: ReadonlySet<string>,
): QuizQuestion[] {
  if (pool.length < count) {
    throw new Error(
      `Question bank is short: need ${count} questions but the pool holds ${pool.length}.`,
    );
  }

  const fresh = pool.filter((question) => !excludedIds.has(question.id));
  const picked = sample(fresh, count);

  if (picked.length < count) {
    const pickedIds = new Set(picked.map((question) => question.id));
    const recycled = pool.filter((question) => !pickedIds.has(question.id));
    picked.push(...sample(recycled, count - picked.length));
  }

  return picked;
}

/**
 * Builds one complete exam to the blueprint (30 easy + 10 medium), with question order
 * and option order both randomized.
 */
export function buildExam(
  bank: readonly QuizQuestion[],
  excludedIds: ReadonlySet<string> = new Set(),
): BuiltExam {
  const selected: QuizQuestion[] = [];

  for (const difficulty of DIFFICULTIES) {
    const pool = bank.filter((question) => question.difficulty === difficulty);
    selected.push(...selectForDifficulty(pool, EXAM_BLUEPRINT[difficulty], excludedIds));
  }

  // Shuffling across difficulties means position never hints at difficulty.
  const ordered = shuffle(selected);

  const records: AttemptQuestionRecord[] = [];
  const clientQuestions: ClientQuestion[] = [];

  ordered.forEach((question, index) => {
    // optionOrder[displayIndex] = authoring index
    const optionOrder = shuffle([0, 1, 2, 3]);

    records.push({
      questionId: question.id,
      difficulty: question.difficulty,
      optionOrder,
      selectedDisplayIndex: null,
      correct: null,
    });

    clientQuestions.push({
      id: question.id,
      number: index + 1,
      prompt: question.prompt,
      options: optionOrder.map((authoringIndex) => question.options[authoringIndex] as string),
    });
  });

  return {
    records,
    clientQuestions,
    questionIds: ordered.map((question) => question.id),
  };
}

/** Counts how many of each difficulty an exam ended up with. */
export function difficultyBreakdown(
  records: readonly Pick<AttemptQuestionRecord, 'difficulty'>[],
): Record<Difficulty, number> {
  const counts: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const record of records) counts[record.difficulty] += 1;
  return counts;
}

export interface GradeResult {
  readonly score: number;
  readonly passed: boolean;
  readonly gradedRecords: AttemptQuestionRecord[];
}

/**
 * Grades an attempt entirely from server-held state.
 *
 * `answers` maps question id to the *display* index the person clicked; the
 * stored `optionOrder` translates that back to the authored answer key. A
 * missing, out-of-range or unknown answer simply scores zero for that
 * question rather than aborting the submission.
 */
export function gradeAttempt(
  records: readonly AttemptQuestionRecord[],
  answers: ReadonlyMap<string, number>,
  bank: ReadonlyMap<string, QuizQuestion>,
): GradeResult {
  let score = 0;

  const gradedRecords = records.map((record): AttemptQuestionRecord => {
    const question = bank.get(record.questionId);
    const selected = answers.get(record.questionId);
    const hasSelection =
      typeof selected === 'number' &&
      Number.isInteger(selected) &&
      selected >= 0 &&
      selected < record.optionOrder.length;

    if (!question || !hasSelection) {
      return { ...record, selectedDisplayIndex: hasSelection ? selected : null, correct: false };
    }

    const authoringIndex = record.optionOrder[selected];
    const correct = authoringIndex === question.correctIndex;
    if (correct) score += 1;

    return { ...record, selectedDisplayIndex: selected, correct };
  });

  return { score, passed: isPassing(score), gradedRecords };
}

/** 25/40 or better clears the bar. */
export function isPassing(score: number, passMark: number = PASSING_SCORE): boolean {
  return score >= passMark;
}

export { PASSING_SCORE, TOTAL_QUESTIONS, EXAM_BLUEPRINT };
