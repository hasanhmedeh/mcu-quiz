import Link from 'next/link';
import type { Tally } from '@/lib/account/activity';

export type BarRow = Tally & {
  /** Makes the label a link, e.g. to a user's profile. */
  readonly href?: string;
  /** Shown after the value, e.g. a share of the whole. */
  readonly note?: string;
};

/**
 * A ranked list of horizontal bars, one series, value at each bar's tip.
 * The labels and values are plain text, so the list doubles as its own table.
 */
export function BarList({
  title,
  subtitle,
  rows,
  empty,
}: {
  title: string;
  subtitle?: string;
  rows: readonly BarRow[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <figure className="viz panel p-4">
      <figcaption>
        <span className="block text-sm font-semibold text-white">{title}</span>
        {subtitle ? <span className="mt-0.5 block text-xs text-[color:var(--color-mist)]">{subtitle}</span> : null}
      </figcaption>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-[color:var(--color-mist)]">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.href ?? row.label} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-xs">
              {row.href ? (
                <Link href={row.href} className="truncate text-[color:var(--color-mist)] underline-offset-2 hover:text-white hover:underline" title={row.label}>
                  {row.label}
                </Link>
              ) : (
                <span className="truncate text-[color:var(--color-mist)]" title={row.label}>
                  {row.label}
                </span>
              )}
              <span className="flex min-w-0 items-center gap-2">
                {row.count > 0 ? (
                  <span
                    className="viz-hbar"
                    style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold text-white">{row.count.toLocaleString()}</span>
                  {row.note ? <span className="text-[color:var(--color-mist)]"> · {row.note}</span> : null}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
