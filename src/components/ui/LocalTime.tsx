'use client';

import { useSyncExternalStore } from 'react';

const noSubscription = () => () => undefined;

/**
 * A timestamp in the viewer's own time zone. The server cannot know it, so
 * the first render shows UTC and the browser swaps in local time straight
 * after hydration, without a mismatch.
 */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <span className={className}>—</span>;
  const text = inBrowser
    ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : `${date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
