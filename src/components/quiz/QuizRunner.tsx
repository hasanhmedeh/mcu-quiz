'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { QUESTION_TIME_SECONDS, type ClientQuestion } from '@/types';
import { Alert, PageShell, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/cn';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Advance delay after a tap: long enough to register the choice, short enough not to drag. */
const ADVANCE_DELAY_MS = 260;

const QUESTION_TIME_MS = QUESTION_TIME_SECONDS * 1000;

/** How often the countdown re-renders. Fine enough that the bar drains smoothly. */
const TICK_MS = 250;

/** For the last this-many seconds the countdown turns red and the page edge flashes. */
const WARNING_SECONDS = 5;

interface QuizRunnerProps {
  attemptId: string;
  displayName: string;
  attemptNumber: number;
  totalQuestions: number;
  passingScore: number;
  questions: ClientQuestion[];
}

type Answers = Record<string, number>;

/**
 * Where the candidate is and when the current question runs out.
 *
 * `index === questions.length` is the final review screen. The exam only ever
 * moves forward, so this pair is the whole of the navigation state.
 */
interface Clock {
  index: number;
  deadline: number;
}

interface ApiError {
  error?: { code?: string; message?: string };
}

function storageKey(attemptId: string): string {
  return `mcu-quiz:answers:${attemptId}`;
}

function clockKey(attemptId: string): string {
  return `mcu-quiz:clock:${attemptId}`;
}

const NO_ANSWERS: Answers = {};

/**
 * Snapshots of what was recovered from sessionStorage, keyed by attempt.
 *
 * `useSyncExternalStore` calls `getSnapshot` on every render and compares by
 * reference, so the parsed result has to be memoised rather than rebuilt.
 */
const restoredByAttempt = new Map<string, Answers>();
const restoredClockByAttempt = new Map<string, Clock | null>();

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

/** The clock is saved too, so a refresh neither resets the countdown nor reopens a question. */
function readSavedClock(attemptId: string, questionCount: number): Clock | null {
  if (restoredClockByAttempt.has(attemptId)) return restoredClockByAttempt.get(attemptId) ?? null;

  let restored: Clock | null = null;

  try {
    const raw = window.sessionStorage.getItem(clockKey(attemptId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;

    if (typeof parsed === 'object' && parsed !== null) {
      const { index, deadline } = parsed as Record<string, unknown>;
      if (
        typeof index === 'number' &&
        Number.isInteger(index) &&
        index >= 0 &&
        index <= questionCount &&
        typeof deadline === 'number'
      ) {
        restored = { index, deadline };
      }
    }
  } catch {
    // Starting the clock afresh is the only sensible fallback.
  }

  restoredClockByAttempt.set(attemptId, restored);
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

function serverClockSnapshot(): Clock | null {
  return null;
}

/**
 * Moves past every question whose time is up.
 *
 * Deadlines chain from the previous one rather than from `now`, so time spent
 * away from the tab still burns through the questions that would have expired.
 */
function catchUp(clock: Clock, now: number, questionCount: number): Clock {
  let { index, deadline } = clock;
  while (index < questionCount && deadline <= now) {
    index += 1;
    deadline += QUESTION_TIME_MS;
  }
  return index === clock.index ? clock : { index, deadline };
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
  const questionCount = questions.length;

  // Recovered progress is read through an external-store subscription rather
  // than a mount effect: hydration uses the empty server snapshot, then React
  // swaps in the stored sheet on its own, with no cascading setState.
  const restored = useSyncExternalStore(
    subscribeToNothing,
    () => readSavedAnswers(attemptId, questions),
    serverSnapshot,
  );
  const restoredClock = useSyncExternalStore(
    subscribeToNothing,
    () => readSavedClock(attemptId, questionCount),
    serverClockSnapshot,
  );

  // `null` means "untouched this session", which is what lets the recovered
  // sheet and the recovered clock act as the defaults.
  const [edited, setEdited] = useState<Answers | null>(null);
  const [clockOverride, setClockOverride] = useState<Clock | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const stayInExam = useCallback(() => setLeaving(false), []);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submittedRef = useRef(false);
  const focusOnUpdateRef = useRef(false);

  const answers = edited ?? restored;
  const answeredCount = Object.keys(answers).length;

  // Before the first tick there is no clock yet: question 1 is shown at full time.
  const clock = clockOverride ?? restoredClock;
  const index = clock?.index ?? 0;
  const reviewing = index >= questionCount;
  const current = questions[index];

  const remainingMs =
    clock && now !== null ? Math.max(0, Math.min(QUESTION_TIME_MS, clock.deadline - now)) : QUESTION_TIME_MS;
  const secondsLeft = Math.ceil(remainingMs / 1000);

  // The warning stops as soon as the question is answered.
  const inFinalSeconds =
    current !== undefined &&
    !(current.id in answers) &&
    !submitting &&
    clock !== null &&
    now !== null &&
    secondsLeft > 0 &&
    secondsLeft <= WARNING_SECONDS;

  // Only changes made this session are written back, so the blank
  // pre-hydration state can never overwrite recovered progress.
  useEffect(() => {
    if (edited === null) return;
    try {
      window.sessionStorage.setItem(storageKey(attemptId), JSON.stringify(edited));
      restoredByAttempt.set(attemptId, edited);
    } catch {
      // A full or disabled sessionStorage is not worth interrupting the exam for.
    }
  }, [edited, attemptId]);

  useEffect(() => {
    if (clockOverride === null) return;
    try {
      window.sessionStorage.setItem(clockKey(attemptId), JSON.stringify(clockOverride));
      restoredClockByAttempt.set(attemptId, clockOverride);
    } catch {
      // As above: the countdown keeps running in memory regardless.
    }
  }, [clockOverride, attemptId]);

  // --- The countdown -------------------------------------------------------
  // Every tick starts the clock if it has not started, and skips any question
  // whose time has run out. The updater returns the same object when nothing
  // moved, so an idle tick only re-renders the countdown itself.
  useEffect(() => {
    if (reviewing || submitting || discarding) return;

    const id = setInterval(() => {
      const tickAt = Date.now();
      setNow(tickAt);
      setClockOverride((previous) => {
        const base = previous ?? restoredClock;
        if (!base) return { index: 0, deadline: tickAt + QUESTION_TIME_MS };
        const next = catchUp(base, tickAt, questionCount);
        return next === base ? previous : next;
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, [discarding, questionCount, restoredClock, reviewing, submitting]);

  // --- Leaving mid-exam ends it ---------------------------------------------
  // Clicking a link (the logo, say) or pressing Back asks first; confirming
  // submits whatever has been answered. Nothing navigates away silently.
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (submittedRef.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;

      // Capture phase on window runs before React's handlers, so the Link never navigates.
      event.preventDefault();
      event.stopPropagation();
      setLeaving(true);
    }

    // A duplicate entry for this page turns Back into an event we can catch,
    // instead of an immediate trip to the previous page.
    window.history.pushState(null, '', window.location.href);

    function handlePopState() {
      if (submittedRef.current) return;
      window.history.pushState(null, '', window.location.href);
      setLeaving(true);
    }

    window.addEventListener('click', handleClick, true);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('click', handleClick, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // --- Warn before a reload or closing the tab -------------------------------
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (submittedRef.current || (answeredCount === 0 && index === 0)) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [answeredCount, index]);

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
  }, [index]);

  const handleSelect = useCallback(
    (questionId: string, optionIndex: number) => {
      // One tap per question: stops a double-tap from answering the next
      // question by accident. A question whose time is up takes no answer.
      if (advanceTimer.current || remainingMs <= 0) return;

      setEdited((previous) => ({ ...(previous ?? restored), [questionId]: optionIndex }));

      const answeredIndex = index;

      advanceTimer.current = setTimeout(() => {
        advanceTimer.current = null;
        // Only advance if the countdown has not already moved on meanwhile.
        setClockOverride((previous) => {
          const base = previous ?? restoredClock;
          if (base && base.index !== answeredIndex) return previous;
          return { index: answeredIndex + 1, deadline: Date.now() + QUESTION_TIME_MS };
        });
      }, ADVANCE_DELAY_MS);
    },
    [index, remainingMs, restored, restoredClock],
  );

  // --- Keyboard shortcuts: A–D / 1–4 to answer ------------------------------
  useEffect(() => {
    if (reviewing || submitting || leaving || !current) return;

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
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [current, handleSelect, leaving, reviewing, submitting]);

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
      restoredClockByAttempt.delete(attemptId);
      try {
        window.sessionStorage.removeItem(storageKey(attemptId));
        window.sessionStorage.removeItem(clockKey(attemptId));
      } catch {
        // Nothing to do — the attempt is already graded server-side.
      }

      router.push(`/result/${resultId}`);
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  async function handleDiscard() {
    if (discarding || submitting) return;
    setDiscarding(true);
    setError(null);

    try {
      const response = await fetch('/api/quiz/discard', { method: 'POST' });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as ApiError | null;
        setError(data?.error?.message ?? 'We could not discard your exam. Please try again.');
        setLeaving(false);
        setDiscarding(false);
        return;
      }

      submittedRef.current = true;
      restoredByAttempt.delete(attemptId);
      restoredClockByAttempt.delete(attemptId);
      try {
        window.sessionStorage.removeItem(storageKey(attemptId));
        window.sessionStorage.removeItem(clockKey(attemptId));
      } catch {
        // The attempt is already gone server-side.
      }

      router.replace('/');
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
      setLeaving(false);
      setDiscarding(false);
    }
  }

  const progress = Math.round((Math.min(index, questionCount) / totalQuestions) * 100);

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
      {inFinalSeconds ? <div className="time-warning" aria-hidden="true" /> : null}

      {leaving ? (
        <ConfirmDialog
          title="Leave the exam?"
          icon="warning"
          cancelLabel="Keep going"
          confirmLabel="Submit and leave"
          busy={discarding}
          busyLabel="Discarding…"
          secondaryAction={{ label: 'Discard exam', onClick: () => void handleDiscard() }}
          onCancel={stayInExam}
          onConfirm={() => {
            setLeaving(false);
            void handleSubmit();
          }}
        >
          <p>
            <span className="font-semibold text-white">Submit and leave</span> grades the{' '}
            {answeredCount} of {totalQuestions} answers you have given. Everything else counts as
            wrong.
          </p>
          <p className="mt-2">
            <span className="font-semibold text-white">Discard exam</span> throws this attempt
            away without a score. You can start again later with a different set of questions.
          </p>
        </ConfirmDialog>
      ) : null}

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
            onSubmit={handleSubmit}
            headingRef={headingRef}
          />
        ) : current ? (
          <>
            <Countdown remainingMs={remainingMs} />
            <QuestionPanel
              key={current.id}
              question={current}
              selected={answers[current.id]}
              disabled={submitting || remainingMs <= 0}
              onSelect={handleSelect}
              headingRef={headingRef}
            />
          </>
        ) : null}

        <p className="mt-6 text-center text-xs text-[color:var(--color-mist)]/70">
          {QUESTION_TIME_SECONDS} seconds per question, and no going back. Your answers are graded on
          the server when you submit — you will see the result then, not before.
        </p>

        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setLeaving(true)}
            disabled={submitting || discarding}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[color:var(--color-mist)] underline-offset-4 hover:text-white hover:underline disabled:opacity-40"
          >
            Leave exam
          </button>
        </div>
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
        aria-valuenow={reviewing ? total : current - 1}
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

function Countdown({ remainingMs }: { remainingMs: number }) {
  const seconds = Math.ceil(remainingMs / 1000);
  const warning = seconds <= WARNING_SECONDS;
  const fraction = remainingMs / QUESTION_TIME_MS;

  return (
    <div className="mt-5 flex items-center gap-3">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(143,208,255,0.12)]"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full transition-[width] duration-200 ease-linear"
          style={{
            width: `${fraction * 100}%`,
            background: warning ? 'var(--color-ember)' : 'var(--color-ion)',
          }}
        />
      </div>
      <p
        className={cn(
          'display w-12 text-right text-sm font-bold tabular-nums',
          warning ? 'text-[color:var(--color-ember-soft)]' : 'text-white',
        )}
      >
        <span className="sr-only">Time left: </span>
        0:{String(seconds).padStart(2, '0')}
      </p>
      {/* Announced once, not every second. */}
      <span className="sr-only" aria-live="assertive">
        {seconds === WARNING_SECONDS ? `${WARNING_SECONDS} seconds left` : ''}
      </span>
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
    <section className="panel panel-glow fade-up mt-4 p-6 sm:p-8" aria-live="polite">
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
        Tip: press A–D or 1–4 to answer.
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
  onSubmit,
  headingRef,
}: {
  questions: ClientQuestion[];
  answers: Answers;
  unanswered: ClientQuestion[];
  submitting: boolean;
  passingScore: number;
  totalQuestions: number;
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
          : `${unanswered.length} question${unanswered.length === 1 ? '' : 's'} ran out of time and will count as wrong. You need ${passingScore} correct to pass.`}
      </p>

      <ol className="mt-6 grid grid-cols-5 gap-2 sm:grid-cols-8" aria-label="Question overview">
        {questions.map((question, questionIndex) => {
          const isAnswered = question.id in answers;
          return (
            <li
              key={question.id}
              aria-label={`Question ${questionIndex + 1}, ${isAnswered ? 'answered' : 'timed out'}`}
              className={cn(
                'flex h-10 w-full items-center justify-center rounded-lg border text-sm font-semibold',
                isAnswered
                  ? 'border-[rgba(62,166,255,0.5)] bg-[rgba(62,166,255,0.16)] text-white'
                  : 'border-[rgba(255,59,74,0.4)] bg-[rgba(255,59,74,0.08)] text-[color:var(--color-ember-soft)]',
              )}
            >
              {questionIndex + 1}
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        className="btn btn-primary mt-6 w-full"
        onClick={onSubmit}
        disabled={submitting}
      >
        {submitting ? <Spinner label="Grading your exam…" /> : 'Submit my exam'}
      </button>

      <p className="mt-4 text-center text-xs text-[color:var(--color-mist)]/70">
        Once submitted, this attempt is final.
      </p>
    </section>
  );
}
