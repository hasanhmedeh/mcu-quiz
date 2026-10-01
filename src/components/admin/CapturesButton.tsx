'use client';

import { useState } from 'react';
import { ProctorGallery } from './ProctorGallery';

/** "Captures · N" for one attempt, opening the same gallery as the dashboard. */
export function CapturesButton({
  attemptId,
  count,
  title,
  live,
}: {
  attemptId: string;
  count: number;
  title: string;
  live: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Camera and screen captures for ${title}`}
        className="rounded-lg border border-[rgba(143,208,255,0.35)] px-2.5 py-1.5 text-[0.7rem] font-semibold text-[color:var(--color-mist)] hover:text-white"
      >
        Captures · {count}
      </button>
      {open ? <ProctorGallery attemptId={attemptId} title={title} live={live} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
