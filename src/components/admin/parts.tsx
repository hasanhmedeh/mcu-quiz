import Link from 'next/link';
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

const PAGER_BUTTON =
  'rounded-lg border border-[rgba(143,208,255,0.24)] bg-[rgba(13,16,36,0.6)] px-3 py-2 text-xs font-semibold text-white hover:border-[rgba(143,208,255,0.45)]';

/**
 * Previous / next as links, for lists paged on the server. Same look as the
 * dashboard's pager; renders nothing when everything fits on one page.
 */
export function LinkPagination({
  page,
  pageCount,
  total,
  pageSize,
  noun,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  noun: string;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const step = (target: number, label: string, enabled: boolean) =>
    enabled ? (
      <Link href={hrefFor(target)} className={PAGER_BUTTON} scroll={false}>
        {label}
      </Link>
    ) : (
      <span aria-disabled="true" className={cn(PAGER_BUTTON, 'pointer-events-none opacity-40')}>
        {label}
      </span>
    );

  return (
    <nav
      aria-label={`${noun} pages`}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[color:var(--color-mist)]"
    >
      <p>
        {first}–{last} of {total} {noun}
        {total === 1 ? '' : 's'}
      </p>
      <div className="flex items-center gap-2">
        {step(page - 1, '← Newer', page > 1)}
        <span aria-current="page" className="px-1 tabular-nums">
          Page {page} of {pageCount}
        </span>
        {step(page + 1, 'Older →', page < pageCount)}
      </div>
    </nav>
  );
}
