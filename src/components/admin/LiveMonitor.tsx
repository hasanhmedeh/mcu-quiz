'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageShell, SectionLabel } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import type { LiveAttempt, LiveQuestion } from '@/types';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

type Connection = 'connecting' | 'live' | 'reconnecting' | 'failed';

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The organiser's live view: every exam under way, answer by answer, as it
 * happens. Fed by the Server-Sent Events stream at /api/admin/live, which the
 * browser keeps reconnected on its own.
 */
export function LiveMonitor({ passingScore }: { passingScore: number }) {
  const [attempts, setAttempts] = useState<LiveAttempt[] | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const source = new EventSource('/api/admin/live');

    source.addEventListener('open', () => setConnection('live'));
    source.addEventListener('error', () => setConnection('reconnecting'));
    source.addEventListener('attempts', (event) => {
      try {
        setAttempts(JSON.parse((event as MessageEvent<string>).data) as LiveAttempt[]);
        setConnection('live');
      } catch {
        // A malformed frame is skipped; the next snapshot replaces it anyway.
      }
    });
    source.addEventListener('failure', () => setConnection('failed'));

    return () => source.close();
  }, []);

  function toggle(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const running = attempts?.filter((attempt) => attempt.status === 'in_progress') ?? [];
  const finished = attempts?.filter((attempt) => attempt.status === 'completed') ?? [];

  return (
    <PageShell
      headerRight={
        <div className="flex items-center gap-3">
          <ConnectionChip connection={connection} />
          <Link href="/admin" className="btn btn-ghost min-h-0 px-4 py-2 text-sm">
            Dashboard
          </Link>
        </div>
      }
    >
      <div className="fade-up">
        <SectionLabel>Organiser · live</SectionLabel>
        <h1 className="display mt-3 text-2xl font-black text-white sm:text-3xl">Exams in progress</h1>
        <p className="mt-2 text-sm text-[color:var(--color-mist)]">
          Every answer appears the moment it is picked, with the right answer beside any miss.
          Expected score is accuracy so far applied to the whole exam. Pass mark {passingScore}.
        </p>
      </div>

      {attempts === null ? (
        <p className="mt-10 text-center text-sm text-[color:var(--color-mist)]">Connecting to the live feed…</p>
      ) : attempts.length === 0 ? (
        <div className="panel mt-8 p-8 text-center">
          <p className="display text-base font-bold text-white">Nobody is taking the exam right now</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[color:var(--color-mist)]">
            Exams show up here the second someone starts, and stay for an hour after they submit.
          </p>
        </div>
      ) : (
        <>
          <Section title={`Live now · ${running.length}`}>
            {running.length === 0 ? (
              <p className="text-sm text-[color:var(--color-mist)]">No exam is under way at the moment.</p>
            ) : (
              running.map((attempt) => (
                <AttemptCard
                  key={attempt.id}
                  attempt={attempt}
                  passingScore={passingScore}
                  expanded={expanded.has(attempt.id)}
                  onToggle={() => toggle(attempt.id)}
                />
              ))
            )}
          </Section>

          {finished.length > 0 ? (
            <Section title={`Submitted in the last hour · ${finished.length}`}>
              {finished.map((attempt) => (
                <AttemptCard
                  key={attempt.id}
                  attempt={attempt}
                  passingScore={passingScore}
                  expanded={expanded.has(attempt.id)}
                  onToggle={() => toggle(attempt.id)}
                />
              ))}
            </Section>
          ) : null}
        </>
      )}
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="display mb-3 text-xs tracking-[0.2em] text-[color:var(--color-mist)]">{title}</h2>
      <div className="grid gap-4 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function ConnectionChip({ connection }: { connection: Connection }) {
  const label =
    connection === 'live'
      ? 'Live'
      : connection === 'failed'
        ? 'Feed stopped — reload'
        : connection === 'reconnecting'
          ? 'Reconnecting…'
          : 'Connecting…';

  return (
    <span
      className={cn(
        'chip',
        connection === 'live' ? 'chip-pass' : connection === 'failed' ? 'chip-fail' : 'chip-neutral',
      )}
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className={cn(
          'mr-1.5 inline-block h-2 w-2 rounded-full',
          connection === 'live' ? 'live-dot bg-[#6ef2b0]' : 'bg-current opacity-70',
        )}
      />
      {/* Just the dot on a phone, where the header is tight. */}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  );
}

function AttemptCard({
  attempt,
  passingScore,
  expanded,
  onToggle,
}: {
  attempt: LiveAttempt;
  passingScore: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const live = attempt.status === 'in_progress';
  const onTrack = attempt.expectedScore !== null && attempt.expectedScore >= passingScore;
  const reached = attempt.questions.filter((question) => question.state !== 'pending');
  const latest = [...reached].reverse().find((question) => question.state === 'answered');
  const currentNumber = live ? Math.min(attempt.seen + 1, attempt.totalQuestions) : null;

  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white">{attempt.displayName}</h3>
          <p className="mt-0.5 text-xs text-[color:var(--color-mist)]">
            Attempt #{attempt.attemptNumber} · started {formatTime(attempt.startedAt)}
            {attempt.completedAt ? ` · submitted ${formatTime(attempt.completedAt)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {attempt.exitCount > 0 ? <span className="chip chip-fail">left {attempt.exitCount}×</span> : null}
          <span className={cn('chip', live ? 'chip-neutral' : onTrack ? 'chip-pass' : 'chip-fail')}>
            {live ? (
              <>
                <span aria-hidden="true" className="live-dot mr-1.5 inline-block h-2 w-2 rounded-full bg-[color:var(--color-ember)]" />
                Q{currentNumber} of {attempt.totalQuestions}
              </>
            ) : onTrack ? (
              'Passed'
            ) : (
              'Failed'
            )}
          </span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Correct" value={String(attempt.correct)} tone="pass" />
        <Stat label="Wrong" value={String(attempt.wrong)} tone="fail" />
        <Stat
          label={live ? 'Expected' : 'Final'}
          value={attempt.expectedScore === null ? '—' : `${attempt.expectedScore}/${attempt.totalQuestions}`}
          tone={attempt.expectedScore === null ? undefined : onTrack ? 'pass' : 'fail'}
          hint={
            attempt.expectedScore === null
              ? 'after the first answer'
              : live
                ? onTrack
                  ? 'on course to pass'
                  : 'on course to fail'
                : undefined
          }
        />
      </dl>

      <QuestionStrip questions={attempt.questions} currentNumber={currentNumber} />

      {latest && live ? (
        <div className="mt-4 rounded-xl border border-[rgba(143,208,255,0.14)] bg-[rgba(6,8,20,0.55)] p-3">
          <p className="text-[0.625rem] uppercase tracking-[0.16em] text-[color:var(--color-mist)]">Latest answer</p>
          <AnswerDetail question={latest} compact />
        </div>
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="mt-4 w-full rounded-lg border border-[rgba(143,208,255,0.24)] px-3 py-2 text-xs font-semibold text-[color:var(--color-mist)] hover:border-[rgba(143,208,255,0.45)] hover:text-white"
      >
        {expanded ? 'Hide answers' : `Show all ${reached.length} answers`}
      </button>

      {expanded ? (
        <ol className="mt-3 space-y-2">
          {[...reached].reverse().map((question) => (
            <li
              key={question.number}
              className="rounded-xl border border-[rgba(143,208,255,0.12)] bg-[rgba(6,8,20,0.45)] p-3"
            >
              <AnswerDetail question={question} />
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: 'pass' | 'fail';
  hint?: string;
}) {
  return (
    <div className="stat-card">
      <dt className="text-[0.625rem] uppercase tracking-[0.16em] text-[color:var(--color-mist)]">{label}</dt>
      <dd
        className={cn(
          'display mt-1 text-xl font-black',
          tone === 'pass' ? 'text-[#6ef2b0]' : tone === 'fail' ? 'text-[color:var(--color-ember-soft)]' : 'text-white',
        )}
      >
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-[0.625rem] text-[color:var(--color-mist)]/80">{hint}</p> : null}
    </div>
  );
}

/** One square per question: green right, red wrong, striped timed out, dim not reached. */
function QuestionStrip({
  questions,
  currentNumber,
}: {
  questions: LiveQuestion[];
  currentNumber: number | null;
}) {
  return (
    <ol className="mt-4 grid grid-cols-10 gap-1" aria-label="Answers so far">
      {questions.map((question) => {
        const right = question.state === 'answered' && question.selectedIndex === question.correctIndex;
        const label =
          question.state === 'pending'
            ? 'not reached'
            : question.state === 'timed_out'
              ? 'timed out'
              : right
                ? 'correct'
                : 'wrong';
        return (
          <li
            key={question.number}
            title={`Q${question.number}: ${label}`}
            aria-label={`Question ${question.number}, ${label}`}
            className={cn(
              'h-3 rounded-sm',
              question.state === 'pending' && 'bg-[rgba(143,208,255,0.1)]',
              question.state === 'timed_out' && 'live-timeout',
              question.state === 'answered' && (right ? 'bg-[#2ecc82]' : 'bg-[color:var(--color-ember)]'),
              question.number === currentNumber && 'ring-2 ring-[color:var(--color-ion-soft)]',
            )}
          />
        );
      })}
    </ol>
  );
}

function AnswerDetail({ question, compact = false }: { question: LiveQuestion; compact?: boolean }) {
  const right = question.state === 'answered' && question.selectedIndex === question.correctIndex;
  const picked = question.selectedIndex === null ? null : question.options[question.selectedIndex];
  const correct = question.options[question.correctIndex];

  return (
    <div className={compact ? 'mt-1.5' : undefined}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug text-white">
          <span className="mr-1.5 text-[color:var(--color-mist)]">Q{question.number}</span>
          {question.prompt}
        </p>
        <span className="shrink-0 text-[0.625rem] uppercase tracking-[0.14em] text-[color:var(--color-mist)]/80">
          {question.difficulty}
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-1.5 text-xs">
        {question.state === 'timed_out' ? (
          <AnswerLine tone="fail" mark="⏱" text="No answer — ran out of time" />
        ) : (
          <AnswerLine
            tone={right ? 'pass' : 'fail'}
            mark={right ? '✓' : '✗'}
            text={`${OPTION_LETTERS[question.selectedIndex ?? 0]}. ${picked ?? ''}`}
            label="Picked"
          />
        )}
        {!right ? (
          <AnswerLine
            tone="pass"
            mark="✓"
            text={`${OPTION_LETTERS[question.correctIndex] ?? '?'}. ${correct ?? 'unknown'}`}
            label="Correct"
          />
        ) : null}
      </div>
    </div>
  );
}

function AnswerLine({
  tone,
  mark,
  text,
  label,
}: {
  tone: 'pass' | 'fail';
  mark: string;
  text: string;
  label?: string;
}) {
  return (
    <p
      className={cn(
        'flex items-center gap-2 rounded-lg border px-2.5 py-1.5',
        tone === 'pass'
          ? 'border-[rgba(46,204,130,0.35)] bg-[rgba(46,204,130,0.1)] text-[#9ff5c8]'
          : 'border-[rgba(255,59,74,0.35)] bg-[rgba(255,59,74,0.1)] text-[color:var(--color-ember-soft)]',
      )}
    >
      <span aria-hidden="true" className="font-bold">
        {mark}
      </span>
      {label ? <span className="font-semibold uppercase tracking-[0.12em] opacity-80">{label}</span> : null}
      <span className="min-w-0 truncate">{text}</span>
    </p>
  );
}
