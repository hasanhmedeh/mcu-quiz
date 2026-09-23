import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAttemptResult } from '@/lib/quiz/service';
import { renderQrDataUrl } from '@/lib/quiz/qr';
import { getSiteOrigin } from '@/lib/siteUrl';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { logServerError } from '@/lib/http';
import { Ticket } from '@/components/quiz/Ticket';
import { TicketActions } from '@/components/quiz/TicketActions';
import { Alert, PageShell, SectionLabel } from '@/components/ui/primitives';
import { PASSING_SCORE, type AttemptResult } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Your result — MCU Endgame Preparation Quiz',
};

interface ResultPageProps {
  params: Promise<{ attemptId: string }>;
}

export default async function ResultPage({ params }: ResultPageProps) {
  const { attemptId } = await params;

  let result: AttemptResult | null;
  try {
    result = await getAttemptResult(attemptId);
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      logServerError('result page: firebase not configured', error);
      return <ResultUnavailable />;
    }
    logServerError('result page', error);
    return <ResultUnavailable />;
  }

  if (!result) notFound();

  if (!result.passed) return <FailResult result={result} />;

  const origin = await getSiteOrigin();
  const verifyUrl = result.ticketId ? `${origin}/verify/${result.ticketId}` : origin;
  const qrDataUrl = result.ticketId ? await renderQrDataUrl(verifyUrl) : null;

  return <PassResult result={result} verifyUrl={verifyUrl} qrDataUrl={qrDataUrl} />;
}

/* ------------------------------------------------------------------ */
/* Pass                                                                */
/* ------------------------------------------------------------------ */

function PassResult({
  result,
  verifyUrl,
  qrDataUrl,
}: {
  result: AttemptResult;
  verifyUrl: string;
  qrDataUrl: string | null;
}) {
  return (
    <PageShell>
      <div className="mx-auto max-w-2xl">
        <section className="text-center fade-up">
          <SectionLabel>Clearance granted</SectionLabel>

          <h1 className="display mt-4 text-3xl font-black leading-tight text-white sm:text-5xl">
            <span aria-hidden="true">🦸</span> YOU&apos;RE READY
            <br />
            FOR ENDGAME
          </h1>

          <p className="display mt-5 text-lg tracking-[0.12em] text-[color:var(--color-ion-soft)] text-glow-ion sm:text-xl">
            The Avengers need you.
          </p>

          <p className="mt-4 text-base text-[color:var(--color-mist)]">
            Congratulations, <span className="font-semibold text-white">{result.displayName}</span>.
          </p>

          <div className="mx-auto mt-7 max-w-xs">
            <ScoreDial score={result.score} total={result.totalQuestions} passed />
          </div>

          <p className="mt-5 text-sm text-[color:var(--color-mist)]">
            Your MCU knowledge has been approved. Present the ticket below at the screening.
          </p>
        </section>

        <section className="mt-10 fade-up">
          <h2 className="sr-only">Your Endgame Encore ticket</h2>
          {result.ticketId ? (
            <>
              <Ticket
                displayName={result.displayName}
                score={result.score}
                totalQuestions={result.totalQuestions}
                ticketId={result.ticketId}
                issuedAt={result.completedAt}
                qrDataUrl={qrDataUrl}
                verifyUrl={verifyUrl}
              />
              <TicketActions ticketId={result.ticketId} verifyUrl={verifyUrl} />
            </>
          ) : (
            <Alert tone="warning">
              Your pass is recorded, but the ticket reference could not be issued. Ask the organiser
              to re-issue it.
            </Alert>
          )}
        </section>

        <div className="no-print mt-8 text-center">
          <Link href="/" className="btn btn-ghost">
            Back to the start
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Fail                                                                */
/* ------------------------------------------------------------------ */

function FailResult({ result }: { result: AttemptResult }) {
  const shortfall = PASSING_SCORE - result.score;

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl">
        <section className="text-center fade-up">
          <SectionLabel>Clearance denied</SectionLabel>

          <h1 className="display mt-4 text-3xl font-black leading-tight text-white sm:text-5xl">
            <span aria-hidden="true">❌</span> NOT READY
            <br />
            FOR ENDGAME
          </h1>

          <p className="mt-5 text-base text-[color:var(--color-mist)]">
            <span className="font-semibold text-white">{result.displayName}</span>, you scored{' '}
            <span className="font-semibold text-white">
              {result.score} / {result.totalQuestions}
            </span>
            .
          </p>

          <div className="mx-auto mt-7 max-w-xs">
            <ScoreDial score={result.score} total={result.totalQuestions} passed={false} />
          </div>

          <p className="display mt-6 text-base tracking-[0.1em] text-[color:var(--color-ember-soft)] sm:text-lg">
            Yeah… we&apos;re gonna need to talk about your MCU knowledge. <span aria-hidden="true">😂</span>
          </p>

          <p className="mt-4 text-sm leading-relaxed text-[color:var(--color-mist)]">
            You needed {PASSING_SCORE} to pass — {shortfall} more question
            {shortfall === 1 ? '' : 's'} and you would have been cleared. Unfortunately, your MCU
            knowledge is not sufficient.
          </p>
        </section>

        <section className="panel fade-up mt-9 p-6 text-center sm:p-7">
          <p className="display text-lg font-black text-white">Beg Hasan for another chance.</p>
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-mist)]">
            One attempt only. If Hasan feels generous, he can unlock another attempt for you from
            the organiser dashboard — and you will get a fresh set of questions when he does.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="stat-card text-left">
              <p className="text-[0.6875rem] uppercase tracking-[0.16em] text-[color:var(--color-mist)]">
                Attempt
              </p>
              <p className="display mt-1 text-xl font-black text-white">#{result.attemptNumber}</p>
            </div>
            <div className="stat-card text-left">
              <p className="text-[0.6875rem] uppercase tracking-[0.16em] text-[color:var(--color-mist)]">
                Reference
              </p>
              <p className="mt-1 truncate font-mono text-xs text-[color:var(--color-mist)]">
                {result.attemptId}
              </p>
            </div>
          </div>
        </section>

        <div className="mt-8 text-center">
          <Link href="/" className="btn btn-ghost">
            Back to the start
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

/** Circular score gauge. Pure SVG, no animation loop. */
function ScoreDial({ score, total, passed }: { score: number; total: number; passed: boolean }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const ratio = total === 0 ? 0 : Math.min(1, Math.max(0, score / total));
  const accent = passed ? 'var(--color-ion)' : 'var(--color-ember)';

  return (
    <div className="relative mx-auto aspect-square w-40">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="rgba(143,208,255,0.14)"
          strokeWidth="9"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="display text-3xl font-black leading-none text-white">{score}</p>
          <p className="mt-1 text-xs text-[color:var(--color-mist)]">out of {total}</p>
        </div>
      </div>

      <p className="sr-only">
        You scored {score} out of {total}. {passed ? 'You passed.' : 'You did not pass.'}
      </p>
    </div>
  );
}

function ResultUnavailable() {
  return (
    <PageShell>
      <div className="mx-auto max-w-lg panel p-7 fade-up">
        <SectionLabel>Something went wrong</SectionLabel>
        <h1 className="display mt-3 text-2xl font-black text-white">Result unavailable</h1>
        <Alert tone="error" className="mt-4">
          We could not load this result right now. Please try again in a moment.
        </Alert>
        <Link href="/" className="btn btn-ghost mt-6 w-full">
          Back to the start
        </Link>
      </div>
    </PageShell>
  );
}
