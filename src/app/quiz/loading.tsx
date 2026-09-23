import { PageShell, Spinner } from '@/components/ui/primitives';

export default function QuizLoading() {
  return (
    <PageShell>
      <div className="mx-auto max-w-3xl">
        <div className="h-2 w-full animate-pulse rounded-full bg-[rgba(143,208,255,0.12)]" />

        <div className="panel mt-6 p-8">
          <div className="space-y-3">
            <div className="h-6 w-3/4 animate-pulse rounded bg-[rgba(143,208,255,0.12)]" />
            <div className="h-6 w-1/2 animate-pulse rounded bg-[rgba(143,208,255,0.08)]" />
          </div>

          <div className="mt-8 space-y-3">
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="h-14 w-full animate-pulse rounded-2xl bg-[rgba(143,208,255,0.07)]"
              />
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-[color:var(--color-mist)]">
          <Spinner label="Preparing your exam…" />
        </p>
      </div>
    </PageShell>
  );
}
