'use client';

import { useEffect, useId, useRef } from 'react';
import { Spinner } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

interface ConfirmDialogProps {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` makes the confirm button the red, destructive one. */
  tone?: 'danger' | 'neutral';
  /** Shows a spinner on the confirm button and locks the dialog while an action runs. */
  busy?: boolean;
  busyLabel?: string;
  /** Which button gets focus (and Enter) when the dialog opens. Cancel is the safe default. */
  initialFocus?: 'cancel' | 'confirm';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The app's own confirmation dialog, in place of `window.confirm`.
 *
 * Escape and a click on the backdrop cancel; Tab stays inside the dialog; and
 * focus goes back to wherever it was when the dialog closes.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  busyLabel,
  initialFocus = 'cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Latest callbacks, read from the key handler without re-running the effect.
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  useEffect(() => {
    onCancelRef.current = onCancel;
    busyRef.current = busy;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    (initialFocus === 'confirm' ? confirmRef : cancelRef).current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)')];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [initialFocus]);

  return (
    <div
      className="confirm-backdrop fixed inset-0 z-60 grid place-items-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="confirm-dialog panel w-full max-w-md overflow-hidden"
      >
        <div
          aria-hidden="true"
          className={cn(
            'h-1 w-full',
            tone === 'danger'
              ? 'bg-[linear-gradient(90deg,var(--color-ember),#d42440)]'
              : 'bg-[linear-gradient(90deg,var(--color-ion),var(--color-arc))]',
          )}
        />

        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className={cn(
                'grid h-11 w-11 shrink-0 place-items-center rounded-full border',
                tone === 'danger'
                  ? 'border-[rgba(255,59,74,0.4)] bg-[rgba(255,59,74,0.12)] text-[color:var(--color-ember-soft)]'
                  : 'border-[rgba(62,166,255,0.4)] bg-[rgba(62,166,255,0.12)] text-[color:var(--color-ion-soft)]',
              )}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {tone === 'danger' ? (
                  <>
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </>
                ) : (
                  <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 16.5v.01" />
                  </>
                )}
              </svg>
            </span>

            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="display text-lg font-black leading-tight text-white">
                {title}
              </h2>
              <div id={bodyId} className="mt-2 text-sm leading-relaxed text-[color:var(--color-mist)]">
                {children}
              </div>
            </div>
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              ref={cancelRef}
              type="button"
              className="btn btn-ghost sm:min-w-32"
              onClick={onCancel}
              disabled={busy}
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={cn('btn sm:min-w-32', tone === 'danger' ? 'btn-primary' : 'btn-ghost')}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? <Spinner label={busyLabel ?? 'Working…'} /> : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
