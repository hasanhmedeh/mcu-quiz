'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/primitives';
import type { AdminSnapshot } from '@/types';
import { SnapshotLightbox, SnapshotThumb, formatClock, snapshotImageUrl } from './snapshots';

/** While an exam is under way the gallery refreshes itself this often. */
const LIVE_REFRESH_MS = 10_000;

/**
 * The camera stills for one attempt, newest first, with the latest shown
 * large. Opens as a full-screen dialog from the live view or the dashboard.
 */
export function ProctorGallery({
  attemptId,
  title,
  live,
  onClose,
}: {
  attemptId: string;
  title: string;
  live: boolean;
  onClose: () => void;
}) {
  const [snapshots, setSnapshots] = useState<AdminSnapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    /** Newest still seen so far; refreshes only ask for what came after it. */
    let since: string | null = null;

    async function load() {
      // The first load lists the attempt; every refresh after it asks only
      // for stills newer than the last one seen, so an open viewer costs a
      // read per new still rather than a read per still, every 10 seconds.
      const url =
        since === null
          ? `/api/admin/snapshots?attemptId=${encodeURIComponent(attemptId)}`
          : `/api/admin/snapshots?attemptId=${encodeURIComponent(attemptId)}` +
            `&from=${encodeURIComponent(since)}&to=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`;
      try {
        const response = await fetch(url);
        const body = (await response.json().catch(() => null)) as
          | { snapshots?: AdminSnapshot[]; error?: { message?: string } }
          | null;
        if (cancelled) return;
        if (!response.ok) {
          setError(body?.error?.message ?? 'The captures could not be loaded.');
          return;
        }
        setError(null);
        const incoming = body?.snapshots ?? [];
        const first = since === null;
        since = incoming.at(-1)?.takenAt ?? since ?? new Date(0).toISOString();
        setSnapshots((previous) => {
          if (first || !previous) return incoming;
          const known = new Set(previous.map((snapshot) => snapshot.id));
          const added = incoming.filter((snapshot) => !known.has(snapshot.id));
          return added.length === 0 ? previous : [...previous, ...added];
        });
      } catch {
        if (!cancelled) setError('We could not reach the server.');
      }
    }

    void load();
    const timer = live ? setInterval(() => void load(), LIVE_REFRESH_MS) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [attemptId, live]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && open === null) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const newestFirst = snapshots ? [...snapshots].reverse() : [];
  const latest = newestFirst[0];

  const handleDeleted = useCallback((id: string) => {
    setSnapshots((previous) => previous?.filter((snapshot) => snapshot.id !== id) ?? null);
    setOpen(null);
  }, []);

  return (
    <div
      className="confirm-backdrop fixed inset-0 z-60 overflow-y-auto p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-title"
        className="confirm-dialog panel mx-auto w-full max-w-5xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[rgba(143,208,255,0.12)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="gallery-title" className="display truncate text-base font-black text-white">
              {title}
            </h2>
            <p className="text-xs text-[color:var(--color-mist)]">
              {snapshots === null
                ? 'Loading…'
                : `${snapshots.length} image${snapshots.length === 1 ? '' : 's'}${live ? ' · updating live' : ''}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost min-h-0 px-4 py-2 text-sm">
            Close
          </button>
        </div>

        <div className="p-5">
          {error ? (
            <p role="alert" className="text-sm text-[color:var(--color-ember-soft)]">
              {error}
            </p>
          ) : snapshots === null ? (
            <div className="grid place-items-center py-16 text-sm text-[color:var(--color-mist)]">
              <Spinner label="Loading captures…" />
            </div>
          ) : newestFirst.length === 0 ? (
            <p className="py-12 text-center text-sm text-[color:var(--color-mist)]">
              No images for this attempt yet.
            </p>
          ) : (
            <>
              {latest ? (
                <div className="mb-6 grid gap-4 md:grid-cols-[2fr_1fr] md:items-end">
                  <button
                    type="button"
                    onClick={() => setOpen(0)}
                    className="block overflow-hidden rounded-xl border border-[rgba(143,208,255,0.18)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated images */}
                    <img
                      src={snapshotImageUrl(latest.id)}
                      alt="Latest camera still"
                      className="w-full bg-black object-contain"
                    />
                  </button>
                  <p className="text-xs text-[color:var(--color-mist)]">
                    Latest · {formatClock(latest.takenAt)}
                    <br />
                    Stills outlined in red were taken the moment they left the exam.
                  </p>
                </div>
              ) : null}

              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {newestFirst.map((snapshot, position) => (
                  <li key={snapshot.id}>
                    <SnapshotThumb snapshot={snapshot} onOpen={() => setOpen(position)} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {open !== null ? (
        <SnapshotLightbox
          snapshots={newestFirst}
          index={open}
          onIndexChange={setOpen}
          onClose={() => setOpen(null)}
          onDeleted={handleDeleted}
        />
      ) : null}
    </div>
  );
}
