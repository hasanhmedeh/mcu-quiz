'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Alert, PageShell, SectionLabel } from '@/components/ui/primitives';

/**
 * Route-level error boundary. Users see a friendly message; the digest is the
 * only thing that links this screen to the real error in the server logs.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[mcu-quiz] client boundary', error.message);
  }, [error]);

  return (
    <PageShell>
      <div className="mx-auto max-w-lg panel p-7 fade-up">
        <SectionLabel>Unexpected error</SectionLabel>
        <h1 className="display mt-3 text-2xl font-black text-white">That did not go to plan</h1>

        <Alert tone="error" className="mt-4">
          Something broke on our side. Trying again usually sorts it — if it does not, tell the
          organiser.
        </Alert>

        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-[color:var(--color-mist)]/70">
            Reference: {error.digest}
          </p>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn btn-ghost">
            Back to the start
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
