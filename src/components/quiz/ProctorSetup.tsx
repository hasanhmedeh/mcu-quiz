'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Spinner } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { PROCTORING } from '@/types';
import {
  ProctorError,
  SERVER_PROCTOR_STATUS,
  getCameraStream,
  getProctorStatus,
  startCamera,
  subscribeToProctoring,
} from './proctoring';

export function useProctorStatus() {
  return useSyncExternalStore(subscribeToProctoring, getProctorStatus, () => SERVER_PROCTOR_STATUS);
}

/** A live, mirrored self-view of the camera. */
export function CameraPreview({ className }: { className?: string }) {
  const status = useProctorStatus();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = status.camera ? getCameraStream() : null;
    if (status.camera) void video.play().catch(() => {});
  }, [status.camera]);

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      aria-label="Your camera"
      className={cn('-scale-x-100 bg-black object-cover', className)}
    />
  );
}

/**
 * Explains the proctoring and switches the camera on — from a click, which is
 * the only time browsers show the camera prompt.
 */
export function ProctorSetup({ children }: { children?: React.ReactNode }) {
  const status = useProctorStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      await startCamera();
    } catch (caught) {
      setError(caught instanceof ProctorError ? caught.message : 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[rgba(62,166,255,0.35)] bg-[rgba(62,166,255,0.08)] p-4 text-sm leading-relaxed text-[color:var(--color-mist)]">
        <p className="font-semibold text-white">This exam is proctored</p>
        <p className="mt-1">
          While you answer, a still from your camera is taken every {PROCTORING.minIntervalSeconds}–
          {PROCTORING.maxIntervalSeconds} seconds, and whenever you leave the exam. Only the
          organiser can see them.
        </p>
      </div>

      <div
        className={cn(
          'rounded-xl border p-4',
          status.camera
            ? 'border-[rgba(46,204,130,0.35)] bg-[rgba(46,204,130,0.06)]'
            : 'border-[rgba(143,208,255,0.18)] bg-[rgba(13,16,36,0.55)]',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                status.camera
                  ? 'bg-[#2ecc82] text-[#04050e]'
                  : 'border border-[rgba(143,208,255,0.35)] text-white',
              )}
            >
              {status.camera ? '✓' : '1'}
            </span>
            <p className="text-sm font-semibold text-white">Turn on your camera</p>
          </div>

          {status.camera ? (
            <span className="chip chip-pass shrink-0">Camera on</span>
          ) : (
            <button
              type="button"
              onClick={() => void turnOn()}
              disabled={busy}
              className="btn btn-ghost min-h-0 shrink-0 px-4 py-2 text-sm"
            >
              {busy ? <Spinner label="Waiting…" /> : 'Turn on camera'}
            </button>
          )}
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-xs text-[color:var(--color-ember-soft)]">
            {error}
          </p>
        ) : null}
        {status.camera ? (
          <CameraPreview className="mt-3 h-28 w-40 rounded-lg border border-[rgba(143,208,255,0.2)]" />
        ) : null}
      </div>

      {children}
    </div>
  );
}
