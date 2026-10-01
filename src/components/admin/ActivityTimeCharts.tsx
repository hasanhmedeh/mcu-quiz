'use client';

import { useSyncExternalStore } from 'react';

const noSubscription = () => () => undefined;
export const DAYS_SHOWN = 30;

export interface Column {
  readonly key: string;
  /** Full label, for the tooltip and the table. */
  readonly label: string;
  /** Axis label, on the few columns that get one. */
  readonly tick?: string;
  readonly value: number;
}

/**
 * Time charts group by the admin's own time zone, which only the browser
 * knows: this is false while rendering on the server and during hydration.
 */
export function useInBrowser(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

/** Two empty chart panels, the same size as the real ones, for the server render. */
export function ChartsPlaceholder() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
      <div className="panel h-[15.5rem]" />
      <div className="panel h-[15.5rem]" />
    </div>
  );
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** The last `DAYS_SHOWN` local days, oldest first, with a tick every week ending today. */
export function lastDays(): Array<{ date: Date; key: string; label: string; tick?: string }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: DAYS_SHOWN }, (_, index) => {
    const fromEnd = DAYS_SHOWN - 1 - index;
    const date = new Date(today);
    date.setDate(today.getDate() - fromEnd);
    return {
      date,
      key: dayKey(date),
      label: date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
      tick: fromEnd % 7 === 0 ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : undefined,
    };
  });
}

export function hourLabel(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });
}

/** Twenty-four hour-of-day columns, with a tick every six hours. */
export function hourColumns(perHour: readonly number[]): Column[] {
  return perHour.map((value, hour) => ({
    key: String(hour),
    label: `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`,
    tick: hour % 6 === 0 ? hourLabel(hour) : undefined,
    value,
  }));
}

/** 1, 2, 5, 10, 20, 50… — the smallest clean ceiling at or above `value`. */
function niceCeil(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((multiple) => multiple * magnitude >= value) ?? 10;
  return step * magnitude;
}

/**
 * When one viewer is active: events per day over the last 30 days, and by
 * hour of day, across everything they did.
 */
export function ActivityTimeCharts({ times }: { times: readonly number[] }) {
  const inBrowser = useInBrowser();
  if (!inBrowser) return <ChartsPlaceholder />;

  const dates = times.map((seconds) => new Date(seconds * 1000));
  const perDay = new Map<string, number>();
  for (const date of dates) perDay.set(dayKey(date), (perDay.get(dayKey(date)) ?? 0) + 1);

  const days: Column[] = lastDays().map(({ key, label, tick }) => ({ key, label, tick, value: perDay.get(key) ?? 0 }));
  const activeRecently = days.filter((day) => day.value > 0).length;
  const activeEver = new Set(dates.map(dayKey)).size;

  const perHour = Array.from({ length: 24 }, () => 0);
  for (const date of dates) perHour[date.getHours()] = (perHour[date.getHours()] ?? 0) + 1;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ColumnChart
        title="Events per day"
        subtitle={`Active on ${activeRecently} of the last ${DAYS_SHOWN} days · ${activeEver} active day${activeEver === 1 ? '' : 's'} in all`}
        columns={days}
        axis="Day"
        noun={['event', 'events']}
      />
      <ColumnChart
        title="Events by hour of day"
        subtitle="Your local time, across all their events"
        columns={hourColumns(perHour)}
        axis="Hour"
        noun={['event', 'events']}
      />
    </div>
  );
}

/**
 * One series of columns on a clean-ceiling scale: hairline grid, the peak
 * labelled, a tooltip per column on hover and keyboard focus, and the same
 * numbers as a table.
 */
export function ColumnChart({
  title,
  subtitle,
  columns,
  axis,
  noun,
}: {
  title: string;
  subtitle: string;
  columns: readonly Column[];
  /** The table's first column heading. */
  axis: string;
  /** What a value counts, singular and plural. */
  noun: readonly [string, string];
}) {
  const max = Math.max(0, ...columns.map((column) => column.value));
  const ceiling = niceCeil(max);
  const peak = max > 0 ? columns.findIndex((column) => column.value === max) : -1;
  const counted = (value: number) => `${value} ${value === 1 ? noun[0] : noun[1]}`;

  return (
    <figure className="viz panel p-4">
      <figcaption>
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-xs text-[color:var(--color-mist)]">{subtitle}</span>
      </figcaption>

      {/* The right gutter holds the grid's value labels, clear of the bars. */}
      <div className="mt-6 pr-7">
        <div className="relative">
          {/* Hairline grid at the clean ceiling, and at its half when that is a whole count. */}
          {[ceiling, ceiling / 2].filter(Number.isInteger).map((value) => (
            <div key={value} className="viz-gridline" style={{ bottom: `${(value / ceiling) * 100}%` }} aria-hidden="true">
              <span className="viz-gridlabel">{value}</span>
            </div>
          ))}

          <ol className="viz-plot" aria-label={title}>
            {columns.map((column, index) => (
              <li key={column.key} className="viz-col" tabIndex={0} aria-label={`${column.label}: ${counted(column.value)}`}>
                {column.value > 0 ? (
                  <span
                    className="viz-bar"
                    style={{ height: `${Math.max(2, (column.value / ceiling) * 100)}%` }}
                    aria-hidden="true"
                  />
                ) : null}
                {index === peak ? (
                  <span className="viz-peak" style={{ bottom: `${(column.value / ceiling) * 100}%` }} aria-hidden="true">
                    {column.value}
                  </span>
                ) : null}
                <span className="viz-tip" aria-hidden="true">
                  <strong className="text-white">{column.value}</strong>{' '}
                  <span className="text-[color:var(--color-mist)]">· {column.label}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="viz-ticks" aria-hidden="true">
          {columns.map((column) => (
            <span key={column.key}>{column.tick ?? ''}</span>
          ))}
        </div>
      </div>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-[color:var(--color-mist)] hover:text-white">View as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-[color:var(--color-mist)]">
              <th scope="col" className="py-1 font-medium">
                {axis}
              </th>
              <th scope="col" className="py-1 text-right font-medium capitalize">
                {noun[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
              <tr key={column.key} className="border-t border-[rgba(143,208,255,0.08)]">
                <td className="py-1 text-[color:var(--color-mist)]">{column.label}</td>
                <td className="py-1 text-right tabular-nums text-white">{column.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
