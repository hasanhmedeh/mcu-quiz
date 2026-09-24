'use client';

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/cn';
import type { AdminSnapshot, SnapshotReason } from '@/types';

export const REASON_LABEL: Record<SnapshotReason, string> = {
  start: 'Start',
  interval: 'Timed',
  exit: 'Left the exam',
};

/** Where one still's JPEG lives; organiser-only, loaded as a plain image. */
export function snapshotImageUrl(id: string): string {
  return `/api/admin/snapshots/${encodeURIComponent(id)}`;
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** A lazily loaded thumbnail. Stills from the moment someone left are outlined in red. */
export function SnapshotThumb({
  snapshot,
  onOpen,
  showName = false,
}: {
  snapshot: AdminSnapshot;
  onOpen: () => void;
  showName?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'block w-full overflow-hidden rounded-lg border text-left',
        snapshot.reason === 'exit'
          ? 'border-[rgba(255,59,74,0.6)]'
          : 'border-[rgba(143,208,255,0.16)] hover:border-[rgba(143,208,255,0.45)]',
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated images; nothing to optimise */}
      <img
        src={snapshotImageUrl(snapshot.id)}
        alt=""
        loading="lazy"
        decoding="async"
        className="aspect-[4/3] w-full bg-black object-cover"
      />
      <span className="flex items-center justify-between gap-1 px-2 py-1 text-[0.625rem] text-[color:var(--color-mist)]">
        <span className="truncate">
          {showName ? `${snapshot.displayName} · ` : ''}
          {snapshot.kind === 'screen' ? 'Screen · ' : ''}
          {formatClock(snapshot.takenAt)}
        </span>
        {snapshot.reason === 'exit' ? (
          <span className="shrink-0 font-semibold text-[color:var(--color-ember-soft)]">left</span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * One still, large, with arrows (and ←/→) to step through the current list,
 * and a way to delete it.
 */
export function SnapshotLightbox({
  snapshots,
  index,
  onIndexChange,
  onClose,
  onDeleted,
}: {
  snapshots: AdminSnapshot[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const snapshot = snapshots[index];
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (confirming) return;
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      if (event.key === 'ArrowRight' && index < snapshots.length - 1) onIndexChange(index + 1);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirming, index, onClose, onIndexChange, snapshots.length]);

  if (!snapshot) return null;

  async function remove() {
    if (!snapshot) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(snapshotImageUrl(snapshot.id), { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        setError('That image could not be deleted. Please try again.');
        return;
      }
      setConfirming(false);
      onDeleted(snapshot.id);
    } catch {
      setError('We could not reach the server.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-70 flex flex-col bg-[rgba(4,5,14,0.94)] p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 pb-3 text-xs text-[color:var(--color-mist)]">
        <p className="min-w-0 truncate">
          <span className="font-semibold text-white">{snapshot.displayName}</span> ·{' '}
          {formatDay(snapshot.takenAt)} · {formatClock(snapshot.takenAt)} · {REASON_LABEL[snapshot.reason]}
          {snapshot.kind === 'screen' ? ' · screen' : ''} · {index + 1} of {snapshots.length}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-[rgba(255,59,74,0.45)] bg-[rgba(255,59,74,0.1)] px-3 py-1.5 font-semibold text-[color:var(--color-ember-soft)]"
          >
            Delete
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost min-h-0 px-3 py-1.5 text-xs">
            Close
          </button>
        </div>
      </div>

      <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated images; nothing to optimise */}
        <img
          key={snapshot.id}
          src={snapshotImageUrl(snapshot.id)}
          alt={`Camera still of ${snapshot.displayName} at ${formatClock(snapshot.takenAt)}`}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
        <NavButton side="left" disabled={index === 0} onClick={() => onIndexChange(index - 1)} />
        <NavButton
          side="right"
          disabled={index === snapshots.length - 1}
          onClick={() => onIndexChange(index + 1)}
        />
      </div>

      {confirming ? (
        <ConfirmDialog
          title="Delete this image?"
          confirmLabel="Delete image"
          busy={deleting}
          busyLabel="Deleting…"
          onConfirm={() => void remove()}
          onCancel={() => setConfirming(false)}
        >
          {snapshot.displayName}, {formatClock(snapshot.takenAt)}. This cannot be undone.
          {error ? <span className="mt-2 block text-[color:var(--color-ember-soft)]">{error}</span> : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function NavButton({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Previous image' : 'Next image'}
      className={cn(
        'absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[rgba(143,208,255,0.3)] bg-[rgba(9,11,26,0.85)] text-lg text-white disabled:opacity-20',
        side === 'left' ? 'left-2' : 'right-2',
      )}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}
