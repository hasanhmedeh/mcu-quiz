import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readQuizSession } from '@/lib/auth/session';
import { getActiveExam } from '@/lib/quiz/service';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { logServerError } from '@/lib/http';
import { QuizRunner } from '@/components/quiz/QuizRunner';
import { Alert, PageShell, SectionLabel } from '@/components/ui/primitives';
import { PASSING_SCORE } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Your exam — MCU Endgame Preparation Quiz',
};

/**
 * The exam is rendered on the server from the attempt behind the HttpOnly
 * session cookie. Nothing about the answer key is serialised into the page, and
 * a refresh mid-exam simply re-renders the same paper.
 */
export default async function QuizPage() {
  const session = await readQuizSession();
  if (!session) redirect('/');

  let lookup;
  try {
    lookup = await getActiveExam(session.attemptId, session.userId);
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      logServerError('quiz page: firebase not configured', error);
      return <QuizUnavailable reason="database" />;
    }
    logServerError('quiz page', error);
    return <QuizUnavailable reason="unknown" />;
  }

  if (lookup.kind === 'completed') redirect(`/result/${lookup.attemptId}`);
  if (lookup.kind === 'expired') return <SessionExpired />;
  if (lookup.kind === 'missing') redirect('/');

  return (
    <QuizRunner
      attemptId={lookup.exam.attemptId}
      displayName={lookup.exam.displayName}
      attemptNumber={lookup.exam.attemptNumber}
      totalQuestions={lookup.exam.totalQuestions}
      passingScore={PASSING_SCORE}
      questions={lookup.exam.questions}
      initialExitCount={lookup.exam.exitCount}
    />
  );
}

function SessionExpired() {
  return (
    <PageShell>
      <div className="mx-auto max-w-lg panel p-7 text-center fade-up">
        <SectionLabel>Session closed</SectionLabel>
        <h1 className="display mt-3 text-2xl font-black text-white">Your exam timed out</h1>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-mist)]">
          An exam stays open for three hours. This one was left unfinished past that, so it has been
          closed. Ask the organiser to unlock another attempt for you.
        </p>
        <Link href="/" className="btn btn-ghost mt-6 w-full">
          Back to the start
        </Link>
      </div>
    </PageShell>
  );
}

function QuizUnavailable({ reason }: { reason: 'database' | 'unknown' }) {
  return (
    <PageShell>
      <div className="mx-auto max-w-lg panel p-7 fade-up">
        <SectionLabel>Something went wrong</SectionLabel>
        <h1 className="display mt-3 text-2xl font-black text-white">The exam is not available</h1>
        <Alert tone="error" className="mt-4">
          {reason === 'database'
            ? 'The quiz is not connected to its database yet. Please tell the organiser.'
            : 'We could not load your exam. Please head back and try again in a moment.'}
        </Alert>
        <Link href="/" className="btn btn-ghost mt-6 w-full">
          Back to the start
        </Link>
      </div>
    </PageShell>
  );
}
