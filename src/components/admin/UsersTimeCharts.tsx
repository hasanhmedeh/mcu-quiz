'use client';

import { ChartsPlaceholder, ColumnChart, DAYS_SHOWN, dayKey, hourColumns, lastDays, useInBrowser, type Column } from './ActivityTimeCharts';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Across everyone: how many people were active each day, and when in the day
 * events happen. Two charts rather than one with two scales, since users and
 * events count different things.
 *
 * The server sends hourly UTC buckets; they are regrouped here into the
 * admin's local days and hours.
 */
export function UsersTimeCharts({
  hourly,
}: {
  hourly: ReadonlyArray<{ hour: number; events: number; accounts: readonly number[] }>;
}) {
  const inBrowser = useInBrowser();
  if (!inBrowser) return <ChartsPlaceholder />;

  const activePerDay = new Map<string, Set<number>>();
  const perHour = Array.from({ length: 24 }, () => 0);
  const days = lastDays();
  const shown = new Set(days.map((day) => day.key));

  for (const bucket of hourly) {
    const start = new Date(bucket.hour * HOUR_MS);
    const key = dayKey(start);
    if (!shown.has(key)) continue;
    const active = activePerDay.get(key) ?? new Set<number>();
    for (const account of bucket.accounts) active.add(account);
    activePerDay.set(key, active);
    perHour[start.getHours()] = (perHour[start.getHours()] ?? 0) + bucket.events;
  }

  const activeColumns: Column[] = days.map(({ key, label, tick }) => ({
    key,
    label,
    tick,
    value: activePerDay.get(key)?.size ?? 0,
  }));
  const everyone = new Set([...activePerDay.values()].flatMap((set) => [...set])).size;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ColumnChart
        title="Active users per day"
        subtitle={`${everyone} different ${everyone === 1 ? 'person' : 'people'} active in the last ${DAYS_SHOWN} days`}
        columns={activeColumns}
        axis="Day"
        noun={['user', 'users']}
      />
      <ColumnChart
        title="Events by hour of day"
        subtitle={`Your local time, last ${DAYS_SHOWN} days, everyone together`}
        columns={hourColumns(perHour)}
        axis="Hour"
        noun={['event', 'events']}
      />
    </div>
  );
}
