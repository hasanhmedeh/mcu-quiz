'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NAME_MAX_LENGTH, validateName } from '@/lib/quiz/names';
import { Alert, Spinner } from '@/components/ui/primitives';

interface BlockedState {
  displayName: string;
  score: number | null;
  totalQuestions: number;
  passed: boolean | null;
  ticketId: string | null;
  attemptId: string | null;
}

interface ApiError {
  error?: { code?: string; message?: string };
}

/**
 * The gate on the front page: validate the name, ask the server to open an
 * exam, then hand over to /quiz. The server is the authority on whether this
 * person has already played — the same check happens again inside a Firestore
 * transaction, so nothing here can be bypassed from the console.
 */
export function NameGate() {
  const router = useRouter();
  const inputId = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<BlockedState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setBlocked(null);

    // Mirror of the server-side rule, purely so the feedback is instant.
    const validation = validateName(name);
    if (!validation.ok) {
      setError(validation.error);
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/quiz/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: validation.displayName }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (response.status === 409) {
        const data = payload as BlockedState & { status?: string };
        setBlocked({
          displayName: data.displayName,
          score: data.score,
          totalQuestions: data.totalQuestions,
          passed: data.passed,
          ticketId: data.ticketId,
          attemptId: data.attemptId,
        });
        setSubmitting(false);
        return;
      }

      if (!response.ok) {
        const data = payload as ApiError;
        setError(data?.error?.message ?? 'We could not start your exam. Please try again.');
        setSubmitting(false);
        return;
      }

      // The exam itself lives behind an HttpOnly session cookie; /quiz fetches
      // it on mount, which also makes a mid-exam refresh work.
      router.push('/quiz');
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  if (blocked) {
    return <AlreadyCompleted state={blocked} onReset={() => setBlocked(null)} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-[color:var(--color-mist)]">
          Enter your name to begin your MCU knowledge test
        </label>
        <input
          id={inputId}
          ref={inputRef}
          name="name"
          className="field"
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
          placeholder="e.g. Hasan Hmedeh"
          autoComplete="name"
          autoCapitalize="words"
          maxLength={NAME_MAX_LENGTH}
          required
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
      </div>

      {error ? (
        <div id={`${inputId}-error`}>
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
        {submitting ? <Spinner label="Opening your exam…" /> : 'Begin the exam'}
      </button>

      <p className="text-center text-xs text-[color:var(--color-mist)]/80">
        One attempt per person. Your name is the only thing we store about you.
      </p>
    </form>
  );
}

function AlreadyCompleted({ state, onReset }: { state: BlockedState; onReset: () => void }) {
  return (
    <div className="space-y-5 fade-up">
      <div className="rounded-xl border border-[rgba(245,197,66,0.35)] bg-[rgba(245,197,66,0.08)] p-5">
        <p className="display text-sm tracking-[0.2em] text-[color:var(--color-gold)]">
          Already on record
        </p>
        <p className="mt-2 text-lg font-semibold text-white">
          You already completed the MCU Endgame Preparation Quiz.
        </p>
        <p className="mt-1 text-sm text-[color:var(--color-mist)]">
          Welcome back, {state.displayName}. Here is how it went.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="stat-card flex-1 min-w-[9rem]">
          <p className="text-xs uppercase tracking-wider text-[color:var(--color-mist)]">Your score</p>
          <p className="display mt-1 text-2xl font-black text-white">
            {state.score ?? '—'} / {state.totalQuestions}
          </p>
        </div>
        <div className="stat-card flex-1 min-w-[9rem]">
          <p className="text-xs uppercase tracking-wider text-[color:var(--color-mist)]">Result</p>
          <p className="mt-2">
            <span className={state.passed ? 'chip chip-pass' : 'chip chip-fail'}>
              {state.passed ? 'Passed' : 'Failed'}
            </span>
          </p>
        </div>
      </div>

      {state.attemptId ? (
        <Link href={`/result/${state.attemptId}`} className="btn btn-ghost w-full">
          View your full result
        </Link>
      ) : null}

      <Alert tone="info" title="Want another go?">
        One attempt only. If Hasan feels generous, he can unlock another attempt for you from the
        organiser dashboard.
      </Alert>

      <button type="button" onClick={onReset} className="btn btn-ghost w-full">
        Try a different name
      </button>
    </div>
  );
}
