'use client';

import { createContext, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';

interface WatchedState {
  readonly signedIn: boolean;
  isWatched(key: string): boolean;
  toggle(key: string): void;
}

const WatchedContext = createContext<WatchedState>({
  signedIn: false,
  isWatched: () => false,
  toggle: () => undefined,
});

/**
 * The signed-in viewer's watched titles, shared by every toggle on the page
 * (the timeline draws each title once per screen size). Changes show at once
 * and are rolled back if the save fails.
 */
export function WatchedProvider({
  signedIn,
  initialWatched,
  refreshOnChange = false,
  children,
}: {
  signedIn: boolean;
  initialWatched: readonly string[];
  /** Re-render the server page after each save, e.g. to update recommendations. */
  refreshOnChange?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [watched, setWatched] = useState(() => new Set(initialWatched));
  const [error, setError] = useState<string | null>(null);

  function flip(key: string, on: boolean) {
    setWatched((previous) => {
      const next = new Set(previous);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function toggle(key: string) {
    const on = !watched.has(key);
    flip(key, on);
    setError(null);
    try {
      const response = await fetch('/api/account/watched', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, watched: on }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? 'That could not be saved.');
      }
      if (refreshOnChange) router.refresh();
    } catch (caught) {
      flip(key, !on);
      setError(caught instanceof Error ? caught.message : 'That could not be saved.');
    }
  }

  return (
    <WatchedContext.Provider value={{ signedIn, isWatched: (key) => watched.has(key), toggle }}>
      {children}
      <p role="status" aria-live="polite" className={cn('watched-toast', error && 'watched-toast-on')}>
        {error}
      </p>
    </WatchedContext.Provider>
  );
}

export function useWatched(): WatchedState {
  return useContext(WatchedContext);
}

/** "Watched" tick for one title. Shows nothing to signed-out visitors. */
export function WatchToggle({ titleKey, title, className }: { titleKey: string; title: string; className?: string }) {
  const { signedIn, isWatched, toggle } = useWatched();
  if (!signedIn) return null;
  const watched = isWatched(titleKey);
  return (
    <button
      type="button"
      onClick={() => toggle(titleKey)}
      aria-pressed={watched}
      aria-label={`${title}: watched`}
      className={cn('watch-toggle', watched && 'watch-toggle-on', className)}
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
        {watched ? (
          <path d="M2 6.3 4.8 9 10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        )}
      </svg>
      {watched ? 'Watched' : 'Mark watched'}
    </button>
  );
}
