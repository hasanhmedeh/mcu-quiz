import { DIFFICULTIES, EXAM_BLUEPRINT, type Difficulty, type QuizQuestion } from '@/types';
import { EASY_QUESTIONS } from './easy';
import { MEDIUM_QUESTIONS } from './medium';
import { HARD_QUESTIONS } from './hard';

/**
 * The complete question bank. This module is server-only in practice: nothing
 * under `src/app` imports it from a client component, so the `correctIndex`
 * values never reach a browser bundle.
 */
export const QUESTION_BANK: readonly QuizQuestion[] = [
  ...EASY_QUESTIONS,
  ...MEDIUM_QUESTIONS,
  ...HARD_QUESTIONS,
];

export const QUESTION_BANK_BY_ID: ReadonlyMap<string, QuizQuestion> = new Map(
  QUESTION_BANK.map((question) => [question.id, question]),
);

export function questionsByDifficulty(difficulty: Difficulty): readonly QuizQuestion[] {
  return QUESTION_BANK.filter((question) => question.difficulty === difficulty);
}

export function bankCounts(): Record<Difficulty, number> {
  return {
    easy: EASY_QUESTIONS.length,
    medium: MEDIUM_QUESTIONS.length,
    hard: HARD_QUESTIONS.length,
  };
}

/**
 * Structural validation of the bank, exercised by the test suite and by
 * `npm run verify:bank`. Catches the mistakes that are easy to make while
 * editing content: duplicate ids, a missing option, an out-of-range answer
 * key, two identical options, or a tier that can no longer fill an exam.
 */
export function validateQuestionBank(
  bank: readonly QuizQuestion[] = QUESTION_BANK,
): readonly string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();
  const seenPrompts = new Map<string, string>();

  for (const question of bank) {
    const where = `question ${question.id}`;

    if (seenIds.has(question.id)) problems.push(`Duplicate id: ${question.id}`);
    seenIds.add(question.id);

    const promptKey = question.prompt.trim().toLowerCase();
    const previous = seenPrompts.get(promptKey);
    if (previous) problems.push(`${where} duplicates the prompt of ${previous}`);
    else seenPrompts.set(promptKey, question.id);

    if (question.options.length !== 4) {
      problems.push(`${where} has ${question.options.length} options, expected 4`);
    }
    if (question.correctIndex < 0 || question.correctIndex >= question.options.length) {
      problems.push(`${where} has correctIndex ${question.correctIndex} out of range`);
    }
    if (question.prompt.trim().length === 0) problems.push(`${where} has an empty prompt`);

    const uniqueOptions = new Set(question.options.map((option) => option.trim().toLowerCase()));
    if (uniqueOptions.size !== question.options.length) {
      problems.push(`${where} has repeated options`);
    }
    if (question.options.some((option) => option.trim().length === 0)) {
      problems.push(`${where} has an empty option`);
    }
    if (!DIFFICULTIES.includes(question.difficulty)) {
      problems.push(`${where} has unknown difficulty "${question.difficulty}"`);
    }
  }

  for (const difficulty of DIFFICULTIES) {
    const available = bank.filter((question) => question.difficulty === difficulty).length;
    if (available < EXAM_BLUEPRINT[difficulty]) {
      problems.push(
        `Only ${available} ${difficulty} questions available, but an exam needs ${EXAM_BLUEPRINT[difficulty]}`,
      );
    }
  }

  return problems;
}

export { EASY_QUESTIONS, MEDIUM_QUESTIONS, HARD_QUESTIONS };
