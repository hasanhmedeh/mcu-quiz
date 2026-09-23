import { PageShell, Spinner } from '@/components/ui/primitives';

export default function AdminLoading() {
  return (
    <PageShell>
      <div className="h-7 w-64 animate-pulse rounded bg-[rgba(143,208,255,0.12)]" />

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <div key={card} className="h-20 animate-pulse rounded-2xl bg-[rgba(143,208,255,0.08)]" />
        ))}
      </div>

      <div className="mt-8 h-64 animate-pulse rounded-2xl bg-[rgba(143,208,255,0.06)]" />

      <p className="mt-6 text-center text-sm text-[color:var(--color-mist)]">
        <Spinner label="Loading the dashboard…" />
      </p>
    </PageShell>
  );
}
