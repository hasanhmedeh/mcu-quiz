import { describe, expect, it } from 'vitest';
import {
  buildExam,
  difficultyBreakdown,
  gradeAttempt,
  isPassing,
  selectForDifficulty,
} from '@/lib/quiz/exam';
import { QUESTION_BANK, QUESTION_BANK_BY_ID } from '@/data/questions';
import {
  EXAM_BLUEPRINT,
  PASSING_SCORE,
  TOTAL_QUESTIONS,
  type AttemptQuestionRecord,
  type QuizQuestion,
} from '@/types';

/** Answers every question correctly by reading the key the server holds. */
function perfectAnswers(records: readonly AttemptQuestionRecord[]): Map<string, number> {
  const answers = new Map<string, number>();

  for (const record of records) {
    const question = QUESTION_BANK_BY_ID.get(record.questionId);
    if (!question) throw new Error(`Question ${record.questionId} missing from bank`);
    const displayIndex = record.optionOrder.indexOf(question.correctIndex);
    answers.set(record.questionId, displayIndex);
  }

  return answers;
}

describe('buildExam', () => {
  it('always produces exactly 20 easy + 15 medium + 5 hard', () => {
    for (let i = 0; i < 25; i += 1) {
      const exam = buildExam(QUESTION_BANK);
      expect(exam.records).toHaveLength(TOTAL_QUESTIONS);
      expect(difficultyBreakdown(exam.records)).toEqual({ easy: 20, medium: 15, hard: 5 });
    }
  });

  it('matches the blueprint constants rather than hard-coded numbers', () => {
    const exam = buildExam(QUESTION_BANK);
    expect(difficultyBreakdown(exam.records)).toEqual(EXAM_BLUEPRINT);
  });

  it('never repeats a question within one exam', () => {
    for (let i = 0; i < 10; i += 1) {
      const exam = buildExam(QUESTION_BANK);
      expect(new Set(exam.questionIds).size).toBe(TOTAL_QUESTIONS);
    }
  });

  it('gives every question four options and a valid display order', () => {
    const exam = buildExam(QUESTION_BANK);

    for (const question of exam.clientQuestions) {
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
    }

    for (const record of exam.records) {
      expect([...record.optionOrder].sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('numbers client questions 1..40 in order', () => {
    const exam = buildExam(QUESTION_BANK);
    expect(exam.clientQuestions.map((question) => question.number)).toEqual(
      Array.from({ length: TOTAL_QUESTIONS }, (_, index) => index + 1),
    );
  });

  it('leaks nothing about the answer key to the client payload', () => {
    const exam = buildExam(QUESTION_BANK);
    const serialised = JSON.stringify(exam.clientQuestions);

    expect(serialised).not.toContain('correctIndex');
    expect(serialised).not.toContain('difficulty');
    expect(serialised).not.toContain('optionOrder');

    for (const question of exam.clientQuestions) {
      expect(Object.keys(question).sort()).toEqual(['id', 'number', 'options', 'prompt']);
    }
  });

  it('shuffles difficulty through the paper so position is not a hint', () => {
    // Across several exams, hard questions should not all cluster at the end.
    const positions: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      buildExam(QUESTION_BANK).records.forEach((record, index) => {
        if (record.difficulty === 'hard') positions.push(index);
      });
    }
    const early = positions.filter((position) => position < TOTAL_QUESTIONS / 2).length;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(positions.length);
  });

  it('produces a different paper each time', () => {
    const first = buildExam(QUESTION_BANK).questionIds.join(',');
    const second = buildExam(QUESTION_BANK).questionIds.join(',');
    expect(first).not.toBe(second);
  });

  it('randomizes option order rather than always echoing the authored order', () => {
    let shuffledAtLeastOnce = false;
    for (let i = 0; i < 5 && !shuffledAtLeastOnce; i += 1) {
      shuffledAtLeastOnce = buildExam(QUESTION_BANK).records.some(
        (record) => record.optionOrder.join(',') !== '0,1,2,3',
      );
    }
    expect(shuffledAtLeastOnce).toBe(true);
  });

  it('avoids questions the person has already been asked', () => {
    const first = buildExam(QUESTION_BANK);
    const seen = new Set(first.questionIds);

    const second = buildExam(QUESTION_BANK, seen);
    const overlap = second.questionIds.filter((id) => seen.has(id));

    // The bank is large enough that a second paper can be entirely fresh.
    expect(overlap).toHaveLength(0);
  });

  it('recycles questions rather than failing once the fresh pool runs dry', () => {
    const everything = new Set(QUESTION_BANK.map((question) => question.id));
    const exam = buildExam(QUESTION_BANK, everything);

    expect(exam.records).toHaveLength(TOTAL_QUESTIONS);
    expect(difficultyBreakdown(exam.records)).toEqual(EXAM_BLUEPRINT);
    expect(new Set(exam.questionIds).size).toBe(TOTAL_QUESTIONS);
  });
});

describe('selectForDifficulty', () => {
  const pool: QuizQuestion[] = Array.from({ length: 6 }, (_, index) => ({
    id: `t-${index}`,
    difficulty: 'easy',
    prompt: `Prompt ${index}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    source: 'test',
  }));

  it('prefers unseen questions', () => {
    const excluded = new Set(['t-0', 't-1', 't-2']);
    const picked = selectForDifficulty(pool, 3, excluded);
    expect(picked.map((question) => question.id).sort()).toEqual(['t-3', 't-4', 't-5']);
  });

  it('tops up from seen questions when it must', () => {
    const excluded = new Set(['t-0', 't-1', 't-2', 't-3', 't-4']);
    const picked = selectForDifficulty(pool, 3, excluded);

    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((question) => question.id)).size).toBe(3);
    expect(picked.some((question) => question.id === 't-5')).toBe(true);
  });

  it('throws when the pool cannot fill the requirement at all', () => {
    expect(() => selectForDifficulty(pool, 7, new Set())).toThrow(/Question bank is short/);
  });
});

describe('gradeAttempt', () => {
  it('awards 40/40 for a perfect paper', () => {
    const exam = buildExam(QUESTION_BANK);
    const result = gradeAttempt(exam.records, perfectAnswers(exam.records), QUESTION_BANK_BY_ID);

    expect(result.score).toBe(TOTAL_QUESTIONS);
    expect(result.passed).toBe(true);
    expect(result.gradedRecords.every((record) => record.correct === true)).toBe(true);
  });

  it('awards zero when every answer is wrong', () => {
    const exam = buildExam(QUESTION_BANK);
    const answers = new Map<string, number>();

    for (const record of exam.records) {
      const question = QUESTION_BANK_BY_ID.get(record.questionId);
      if (!question) throw new Error('missing question');
      const correctDisplay = record.optionOrder.indexOf(question.correctIndex);
      answers.set(record.questionId, (correctDisplay + 1) % 4);
    }

    const result = gradeAttempt(exam.records, answers, QUESTION_BANK_BY_ID);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('scores unanswered questions as wrong without throwing', () => {
    const exam = buildExam(QUESTION_BANK);
    const answers = perfectAnswers(exam.records);
    const firstRecord = exam.records[0];
    if (!firstRecord) throw new Error('empty exam');
    answers.delete(firstRecord.questionId);

    const result = gradeAttempt(exam.records, answers, QUESTION_BANK_BY_ID);

    expect(result.score).toBe(TOTAL_QUESTIONS - 1);
    expect(result.gradedRecords[0]?.correct).toBe(false);
    expect(result.gradedRecords[0]?.selectedDisplayIndex).toBeNull();
  });

  it('ignores out-of-range and non-integer selections instead of trusting them', () => {
    const exam = buildExam(QUESTION_BANK);
    const answers = perfectAnswers(exam.records);
    const [a, b, c] = exam.records;
    if (!a || !b || !c) throw new Error('empty exam');

    answers.set(a.questionId, 99);
    answers.set(b.questionId, -1);
    answers.set(c.questionId, 1.5);

    const result = gradeAttempt(exam.records, answers, QUESTION_BANK_BY_ID);
    expect(result.score).toBe(TOTAL_QUESTIONS - 3);
  });

  it('ignores answers for questions that are not on the paper', () => {
    const exam = buildExam(QUESTION_BANK);
    const answers = perfectAnswers(exam.records);
    answers.set('not-a-real-question', 0);

    const result = gradeAttempt(exam.records, answers, QUESTION_BANK_BY_ID);
    expect(result.score).toBe(TOTAL_QUESTIONS);
    expect(result.gradedRecords).toHaveLength(TOTAL_QUESTIONS);
  });

  it('honours the shuffled option order rather than the authored index', () => {
    const question = QUESTION_BANK[0];
    if (!question) throw new Error('empty bank');

    // Display order reverses the authored order.
    const optionOrder = [3, 2, 1, 0];
    const records: AttemptQuestionRecord[] = [
      {
        questionId: question.id,
        difficulty: question.difficulty,
        optionOrder,
        selectedDisplayIndex: null,
        correct: null,
      },
    ];

    const correctDisplayIndex = optionOrder.indexOf(question.correctIndex);
    const right = gradeAttempt(
      records,
      new Map([[question.id, correctDisplayIndex]]),
      QUESTION_BANK_BY_ID,
    );
    expect(right.score).toBe(1);

    // The authored index is only correct by coincidence if it maps to itself.
    if (question.correctIndex !== correctDisplayIndex) {
      const wrong = gradeAttempt(
        records,
        new Map([[question.id, question.correctIndex]]),
        QUESTION_BANK_BY_ID,
      );
      expect(wrong.score).toBe(0);
    }
  });
});

describe('isPassing', () => {
  it('draws the line at 25 out of 40', () => {
    expect(PASSING_SCORE).toBe(25);
    expect(isPassing(24)).toBe(false);
    expect(isPassing(25)).toBe(true);
    expect(isPassing(36)).toBe(true);
    expect(isPassing(40)).toBe(true);
    expect(isPassing(0)).toBe(false);
  });
});
