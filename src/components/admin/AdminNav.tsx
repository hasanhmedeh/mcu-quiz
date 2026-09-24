'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';

export type AdminSection = 'dashboard' | 'live' | 'gallery';

/** State of the live feed, shown on the Live view button while on that page. */
export type LiveConnection = 'connecting' | 'live' | 'reconnecting' | 'failed';

const LINKS: ReadonlyArray<{ id: AdminSection; href: string; label: string }> = [
  { id: 'dashboard', href: '/admin', label: 'Dashboard' },
  { id: 'live', href: '/admin/live', label: 'Live view' },
  { id: 'gallery', href: '/admin/gallery', label: 'Gallery' },
];

const LIVE_STATUS_LABEL: Record<LiveConnection, string> = {
  connecting: 'connecting',
  live: 'connected',
  reconnecting: 'reconnecting',
  failed: 'feed stopped, reload the page',
};

/**
 * The same menu on every organiser page: Dashboard · Live view · Gallery ·
 * Sign out. The page you are on is the red button — except the live view,
 * whose button turns green while its feed is connected.
 */
export function AdminNav({
  current,
  liveConnection,
}: {
  current: AdminSection;
  /** Only passed by the live page. */
  liveConnection?: LiveConnection;
}) {
  const router = useRouter();

  async function signOut() {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => null);
    // Every admin page is gated on the server, so a refresh shows the login.
    router.refresh();
  }

  return (
    // On a phone the header wraps and this takes its own full-width row under the logo.
    <nav
      aria-label="Organiser"
      className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end"
    >
      {LINKS.map((link) => {
        const active = link.id === current;
        const liveHere = link.id === 'live' && active;
        const connected = liveConnection === 'live';

        return (
          <Link
            key={link.id}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            title={liveHere && liveConnection ? `Live feed: ${LIVE_STATUS_LABEL[liveConnection]}` : undefined}
            className={cn(
              'btn min-h-0 px-3 py-2 text-sm sm:px-4',
              liveHere
                ? connected
                  ? 'nav-live-on'
                  : 'btn-ghost nav-live-waiting'
                : active
                  ? 'btn-primary'
                  : 'btn-ghost',
            )}
          >
            {link.id === 'live' ? (
              <span
                aria-hidden="true"
                className={cn(
                  'mr-2 inline-block h-2 w-2 rounded-full',
                  liveHere
                    ? connected
                      ? 'live-dot bg-[#6ef2b0]'
                      : liveConnection === 'failed'
                        ? 'bg-[color:var(--color-ember)]'
                        : 'live-dot bg-[color:var(--color-gold)]'
                    : 'bg-[color:var(--color-ember)]',
                )}
              />
            ) : null}
            {link.label}
            {liveHere && liveConnection ? (
              <span className="sr-only"> — {LIVE_STATUS_LABEL[liveConnection]}</span>
            ) : null}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => void signOut()}
        className="btn btn-ghost min-h-0 px-3 py-2 text-sm sm:px-4"
      >
        Sign out
      </button>
    </nav>
  );
}
