import { describe, expect, it } from 'vitest';
import {
  EASY_QUESTIONS,
  HARD_QUESTIONS,
  MEDIUM_QUESTIONS,
  QUESTION_BANK,
  QUESTION_BANK_BY_ID,
  bankCounts,
  questionsByDifficulty,
  validateQuestionBank,
} from '@/data/questions';
import { EXAM_BLUEPRINT } from '@/types';

/** Films released after Captain Marvel are off-syllabus. */
const FORBIDDEN_TERMS = [
  'endgame',
  'far from home',
  'shang-chi',
  'eternals',
  'no way home',
  'wandavision',
  'multiverse of madness',
  'love and thunder',
  'wakanda forever',
  'quantumania',
];

describe('question bank integrity', () => {
  it('passes every structural check', () => {
    expect(validateQuestionBank()).toEqual([]);
  });

  it('holds comfortably more questions than one exam needs', () => {
    const counts = bankCounts();

    expect(counts.easy).toBeGreaterThanOrEqual(40);
    expect(counts.medium).toBeGreaterThanOrEqual(35);
    expect(counts.hard).toBeGreaterThanOrEqual(20);

    // Enough for at least two completely distinct papers per difficulty.
    expect(counts.easy).toBeGreaterThanOrEqual(EXAM_BLUEPRINT.easy * 2);
    expect(counts.medium).toBeGreaterThanOrEqual(EXAM_BLUEPRINT.medium * 2);
    expect(counts.hard).toBeGreaterThanOrEqual(EXAM_BLUEPRINT.hard * 2);
  });

  it('indexes every question by id exactly once', () => {
    expect(QUESTION_BANK_BY_ID.size).toBe(QUESTION_BANK.length);
  });

  it('files each question under the difficulty its id implies', () => {
    for (const question of EASY_QUESTIONS) expect(question.difficulty).toBe('easy');
    for (const question of MEDIUM_QUESTIONS) expect(question.difficulty).toBe('medium');
    for (const question of HARD_QUESTIONS) expect(question.difficulty).toBe('hard');
  });

  it('splits by difficulty consistently', () => {
    expect(questionsByDifficulty('easy')).toHaveLength(EASY_QUESTIONS.length);
    expect(questionsByDifficulty('medium')).toHaveLength(MEDIUM_QUESTIONS.length);
    expect(questionsByDifficulty('hard')).toHaveLength(HARD_QUESTIONS.length);
  });

  it('gives every question exactly one answer in range', () => {
    for (const question of QUESTION_BANK) {
      expect(question.options).toHaveLength(4);
      expect(question.correctIndex).toBeGreaterThanOrEqual(0);
      expect(question.correctIndex).toBeLessThan(4);
      expect(question.options[question.correctIndex]).toBeTruthy();
    }
  });

  it('cites a source film for every question', () => {
    for (const question of QUESTION_BANK) {
      expect(question.source.trim().length).toBeGreaterThan(0);
    }
  });

  it('stays inside the Iron Man to Captain Marvel window', () => {
    for (const question of QUESTION_BANK) {
      const haystack = [question.prompt, ...question.options, question.source]
        .join(' ')
        .toLowerCase();

      for (const term of FORBIDDEN_TERMS) {
        expect(
          haystack.includes(term),
          `Question ${question.id} mentions off-syllabus "${term}"`,
        ).toBe(false);
      }
    }
  });

  it('reports the problems it finds in a broken bank', () => {
    const problems = validateQuestionBank([
      {
        id: 'x-1',
        difficulty: 'easy',
        prompt: 'Duplicated option question',
        options: ['same', 'same', 'other', 'another'],
        correctIndex: 0,
        source: 'test',
      },
      {
        id: 'x-1',
        difficulty: 'easy',
        prompt: '',
        options: ['a', 'b', 'c', 'd'],
        correctIndex: 3,
        source: 'test',
      },
    ]);

    expect(problems.some((problem) => problem.includes('Duplicate id'))).toBe(true);
    expect(problems.some((problem) => problem.includes('repeated options'))).toBe(true);
    expect(problems.some((problem) => problem.includes('empty prompt'))).toBe(true);
    expect(problems.some((problem) => problem.includes('medium questions available'))).toBe(true);
  });
});
