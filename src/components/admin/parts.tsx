import { cn } from '@/lib/cn';

/** Building blocks shared by the organiser pages, so they all look alike. */

export function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'pass' | 'fail';
}) {
  return (
    <div className="stat-card">
      <dt className="text-[0.625rem] uppercase tracking-[0.16em] text-[color:var(--color-mist)]">
        {label}
      </dt>
      <dd
        className={cn(
          'display mt-1 text-2xl font-black',
          tone === 'pass' ? 'text-[#6ef2b0]' : tone === 'fail' ? 'text-[color:var(--color-ember-soft)]' : 'text-white',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel p-8 text-center">
      <p className="display text-base font-bold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[color:var(--color-mist)]">{body}</p>
    </div>
  );
}
