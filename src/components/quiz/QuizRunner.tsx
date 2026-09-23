'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientQuestion } from '@/types';
import { Alert, PageShell, Spinner } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Advance delay after a tap: long enough to register the choice, short enough not to drag. */
const ADVANCE_DELAY_MS = 260;

interface QuizRunnerProps {
  attemptId: string;
  displayName: string;
  attemptNumber: number;
  totalQuestions: number;
  passingScore: number;
  questions: ClientQuestion[];
}

type Answers = Record<string, number>;

interface ApiError {
  error?: { code?: string; message?: string };
}

function storageKey(attemptId: string): string {
  return `mcu-quiz:answers:${attemptId}`;
}

const NO_ANSWERS: Answers = {};

/**
 * Snapshots of what was recovered from sessionStorage, keyed by attempt.
 *
 * `useSyncExternalStore` calls `getSnapshot` on every render and compares by
 * reference, so the parsed result has to be memoised rather than rebuilt.
 */
const restoredByAttempt = new Map<string, Answers>();

/** Answers survive an accidental refresh; they are never the source of truth for scoring. */
function readSavedAnswers(attemptId: string, questions: ClientQuestion[]): Answers {
  const cached = restoredByAttempt.get(attemptId);
  if (cached) return cached;

  let restored: Answers = NO_ANSWERS;

  try {
    const raw = window.sessionStorage.getItem(storageKey(attemptId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;

    if (typeof parsed === 'object' && parsed !== null) {
      const valid = new Set(questions.map((question) => question.id));
      const recovered: Answers = {};

      for (const [questionId, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (valid.has(questionId) && typeof value === 'number' && value >= 0 && value <= 3) {
          recovered[questionId] = value;
        }
      }

      if (Object.keys(recovered).length > 0) restored = recovered;
    }
  } catch {
    // Disabled or full sessionStorage just means starting from a blank sheet.
  }

  restoredByAttempt.set(attemptId, restored);
  return restored;
}

/** No subscription: sessionStorage only ever changes from inside this component. */
function subscribeToNothing(): () => void {
  return () => {};
}

/** During SSR and hydration there is no storage, so the sheet starts empty. */
function serverSnapshot(): Answers {
  return NO_ANSWERS;
}

function firstUnansweredIndex(questions: ClientQuestion[], answers: Answers): number {
  const position = questions.findIndex((question) => !(question.id in answers));
  return position === -1 ? 0 : position;
}

export function QuizRunner({
  attemptId,
  displayName,
  attemptNumber,
  totalQuestions,
  passingScore,
  questions,
}: QuizRunnerProps) {
  const router = useRouter();

  // Recovered progress is read through an external-store subscription rather
  // than a mount effect: hydration uses the empty server snapshot, then React
  // swaps in the stored sheet on its own, with no cascading setState.
  const restored = useSyncExternalStore(
    subscribeToNothing,
    () => readSavedAnswers(attemptId, questions),
    serverSnapshot,
  );

  // `null` means "untouched this session", which is what lets the recovered
  // sheet and the recovered position act as the defaults.
  const [edited, setEdited] = useState<Answers | null>(null);
  const [indexOverride, setIndexOverride] = useState<number | null>(null);
  const [reviewOverride, setReviewOverride] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submittedRef = useRef(false);
  const focusOnUpdateRef = useRef(false);

  const answers = edited ?? restored;
  const answeredCount = Object.keys(answers).length;

  const resumedComplete =
    Object.keys(restored).length > 0 &&
    questions.every((question) => question.id in restored);

  const index = indexOverride ?? firstUnansweredIndex(questions, restored);
  const reviewing = reviewOverride ?? resumedComplete;
  const current = questions[index];

  // Only the person's own edits are written back, so the blank pre-hydration
  // sheet can never overwrite recovered progress.
  useEffect(() => {
    if (edited === null) return;
    try {
      window.sessionStorage.setItem(storageKey(attemptId), JSON.stringify(edited));
      restoredByAttempt.set(attemptId, edited);
    } catch {
      // A full or disabled sessionStorage is not worth interrupting the exam for.
    }
  }, [edited, attemptId]);

  // --- Warn before an accidental navigation away --------------------------
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (submittedRef.current || answeredCount === 0) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [answeredCount]);

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  // Move focus to the new question so screen readers announce it — but not on
  // first paint, where stealing focus would be disorienting.
  useEffect(() => {
    if (!focusOnUpdateRef.current) {
      focusOnUpdateRef.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [index, reviewing]);

  const goToQuestion = useCallback((target: number) => {
    setReviewOverride(false);
    setIndexOverride(target);
  }, []);

  const handleSelect = useCallback(
    (questionId: string, optionIndex: number) => {
      // One tap per question until the timer fires: stops a double-tap from
      // skipping the next question by accident.
      if (advanceTimer.current) return;

      setEdited((previous) => ({ ...(previous ?? restored), [questionId]: optionIndex }));

      const nextIndex = index + 1;

      advanceTimer.current = setTimeout(() => {
        advanceTimer.current = null;
        if (nextIndex >= questions.length) setReviewOverride(true);
        else setIndexOverride(nextIndex);
      }, ADVANCE_DELAY_MS);
    },
    [index, questions.length, restored],
  );

  // --- Keyboard shortcuts: A–D / 1–4 to answer, arrows to move ------------
  useEffect(() => {
    if (reviewing || submitting || !current) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!current) return;

      const key = event.key.toUpperCase();
      const letterIndex = OPTION_LETTERS.indexOf(key as (typeof OPTION_LETTERS)[number]);
      const numberIndex = /^[1-4]$/.test(key) ? Number(key) - 1 : -1;
      const chosen = letterIndex >= 0 ? letterIndex : numberIndex;

      if (chosen >= 0 && chosen < current.options.length) {
        event.preventDefault();
        handleSelect(current.id, chosen);
        return;
      }

      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        goToQuestion(index - 1);
      }
      if (event.key === 'ArrowRight' && index < questions.length - 1) {
        event.preventDefault();
        goToQuestion(index + 1);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [current, goToQuestion, handleSelect, index, questions.length, reviewing, submitting]);

  const unanswered = useMemo(
    () => questions.filter((question) => !(question.id in answers)),
    [answers, questions],
  );

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const payload = {
      answers: questions
        .filter((question) => question.id in answers)
        .map((question) => ({
          questionId: question.id,
          selectedIndex: answers[question.id] as number,
        })),
    };

    try {
      const response = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const data = body as ApiError;
        setError(data?.error?.message ?? 'We could not submit your answers. Please try again.');
        setSubmitting(false);
        return;
      }

      const data = body as { result?: { attemptId?: string } };
      const resultId = data.result?.attemptId ?? attemptId;

      submittedRef.current = true;
      restoredByAttempt.delete(attemptId);
      try {
        window.sessionStorage.removeItem(storageKey(attemptId));
      } catch {
        // Nothing to do — the attempt is already graded server-side.
      }

      router.push(`/result/${resultId}`);
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  const progress = Math.round((answeredCount / totalQuestions) * 100);

  return (
    <PageShell
      headerRight={
        <div className="text-right">
          <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-[color:var(--color-mist)]">
            Candidate
          </p>
          <p className="text-sm font-semibold text-white">{displayName}</p>
          {attemptNumber > 1 ? (
            <p className="text-[0.6875rem] text-[color:var(--color-gold)]">
              Attempt #{attemptNumber}
            </p>
          ) : null}
        </div>
      }
    >
      <div className="mx-auto max-w-3xl">
        <ProgressHeader
          current={reviewing ? totalQuestions : index + 1}
          total={totalQuestions}
          answered={answeredCount}
          progress={progress}
          reviewing={reviewing}
        />

        {error ? (
          <Alert tone="error" className="mt-5">
            {error}
          </Alert>
        ) : null}

        {reviewing ? (
          <ReviewPanel
            questions={questions}
            answers={answers}
            unanswered={unanswered}
            submitting={submitting}
            passingScore={passingScore}
            totalQuestions={totalQuestions}
            onJump={goToQuestion}
            onSubmit={handleSubmit}
            headingRef={headingRef}
          />
        ) : current ? (
          <QuestionPanel
            key={current.id}
            question={current}
            selected={answers[current.id]}
            disabled={submitting}
            onSelect={handleSelect}
            headingRef={headingRef}
          />
        ) : null}

        {!reviewing ? (
          <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Exam navigation">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => goToQuestion(index - 1)}
              disabled={index === 0 || submitting}
            >
              ← Previous
            </button>

            {index === questions.length - 1 ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setReviewOverride(true)}
              >
                Review answers
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => goToQuestion(index + 1)}
                disabled={submitting}
              >
                Skip →
              </button>
            )}
          </nav>
        ) : null}

        <p className="mt-6 text-center text-xs text-[color:var(--color-mist)]/70">
          No timer. Your answers are graded on the server when you submit — you will see the result
          then, not before.
        </p>
      </div>
    </PageShell>
  );
}

function ProgressHeader({
  current,
  total,
  answered,
  progress,
  reviewing,
}: {
  current: number;
  total: number;
  answered: number;
  progress: number;
  reviewing: boolean;
}) {
  return (
    <div className="fade-up">
      <div className="flex items-baseline justify-between gap-4">
        <p className="display text-sm font-bold tracking-[0.16em] text-white">
          {reviewing ? 'Final review' : `Question ${current} / ${total}`}
        </p>
        <p className="text-xs text-[color:var(--color-mist)]">
          {answered} of {total} answered
        </p>
      </div>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[rgba(143,208,255,0.12)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
        aria-label="Exam progress"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${progress}%`,
            background:
              'linear-gradient(90deg, var(--color-ember), var(--color-arc), var(--color-ion))',
          }}
        />
      </div>
    </div>
  );
}

function QuestionPanel({
  question,
  selected,
  disabled,
  onSelect,
  headingRef,
}: {
  question: ClientQuestion;
  selected: number | undefined;
  disabled: boolean;
  onSelect: (questionId: string, optionIndex: number) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section className="panel panel-glow fade-up mt-6 p-6 sm:p-8" aria-live="polite">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold leading-snug text-white outline-none sm:text-2xl"
      >
        {question.prompt}
      </h1>

      <div className="mt-6 grid gap-3" role="group" aria-label="Answer options">
        {question.options.map((option, optionIndex) => {
          const isSelected = selected === optionIndex;
          return (
            <button
              key={`${question.id}-${optionIndex}`}
              type="button"
              className={cn('answer', isSelected && 'answer-selected')}
              onClick={() => onSelect(question.id, optionIndex)}
              disabled={disabled}
              aria-pressed={isSelected}
            >
              <span className="answer-key" aria-hidden="true">
                {OPTION_LETTERS[optionIndex]}
              </span>
              <span>{option}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-5 hidden text-xs text-[color:var(--color-mist)]/70 sm:block">
        Tip: press A–D or 1–4 to answer, arrow keys to move between questions.
      </p>
    </section>
  );
}

function ReviewPanel({
  questions,
  answers,
  unanswered,
  submitting,
  passingScore,
  totalQuestions,
  onJump,
  onSubmit,
  headingRef,
}: {
  questions: ClientQuestion[];
  answers: Answers;
  unanswered: ClientQuestion[];
  submitting: boolean;
  passingScore: number;
  totalQuestions: number;
  onJump: (index: number) => void;
  onSubmit: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section className="panel panel-glow fade-up mt-6 p-6 sm:p-8">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="display text-xl font-black text-white outline-none sm:text-2xl"
      >
        Ready to submit?
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-mist)]">
        {unanswered.length === 0
          ? `All ${totalQuestions} questions answered. You need ${passingScore} correct to be cleared for the Endgame screening.`
          : `${unanswered.length} question${unanswered.length === 1 ? '' : 's'} still blank. Anything left blank counts as wrong.`}
      </p>

      <ol className="mt-6 grid grid-cols-5 gap-2 sm:grid-cols-8" aria-label="Question overview">
        {questions.map((question, questionIndex) => {
          const isAnswered = question.id in answers;
          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onJump(questionIndex)}
                disabled={submitting}
                aria-label={`Question ${questionIndex + 1}, ${isAnswered ? 'answered' : 'not answered'}`}
                className={cn(
                  'flex h-10 w-full items-center justify-center rounded-lg border text-sm font-semibold transition-colors',
                  isAnswered
                    ? 'border-[rgba(62,166,255,0.5)] bg-[rgba(62,166,255,0.16)] text-white'
                    : 'border-[rgba(255,59,74,0.4)] bg-[rgba(255,59,74,0.08)] text-[color:var(--color-ember-soft)]',
                )}
              >
                {questionIndex + 1}
              </button>
            </li>
          );
        })}
      </ol>

      {unanswered.length > 0 ? (
        <Alert tone="warning" className="mt-6">
          Jump back to any red square to fill it in. Submitting now scores those as incorrect.
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className="btn btn-ghost sm:flex-1"
          onClick={() => onJump(0)}
          disabled={submitting}
        >
          Back to question 1
        </button>
        <button
          type="button"
          className="btn btn-primary sm:flex-1"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? <Spinner label="Grading your exam…" /> : 'Submit my exam'}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-[color:var(--color-mist)]/70">
        Once submitted, this attempt is final.
      </p>
    </section>
  );
}
