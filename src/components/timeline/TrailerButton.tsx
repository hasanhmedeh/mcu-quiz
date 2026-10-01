'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { trackActivity } from '@/components/account/activity';
import { cn } from '@/lib/cn';

function PlayIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
      <path d="M3 1.8v8.4L10 6z" />
    </svg>
  );
}

/**
 * "▶ Trailer" button that plays the title's trailer in a popup on the page.
 *
 * The player only exists while the popup is open, so closing it stops the
 * video. A native modal <dialog> keeps focus inside, closes on Escape, and
 * hands focus back to the button afterwards.
 */
export function TrailerButton({
  title,
  videoId,
  className,
}: {
  title: string;
  videoId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          trackActivity('trailer_opened', { title });
        }}
        className={cn('trailer-link', className)}
        aria-label={`Watch the ${title} trailer`}
        aria-haspopup="dialog"
      >
        <PlayIcon />
        Trailer
      </button>
      {open ? <TrailerDialog title={title} videoId={videoId} onClosed={() => setOpen(false)} /> : null}
    </>
  );
}

function TrailerDialog({ title, videoId, onClosed }: { title: string; videoId: string; onClosed: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // Always close through the dialog itself, so the browser restores focus
  // before the player is removed.
  const close = () => ref.current?.close();

  // Portalled to <body> so the tile's layout and type styles do not leak in.
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="trailer-dialog"
      onClose={onClosed}
      // A click on the dimmed area around the panel lands on the dialog itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
          {title} <span className="font-normal text-[color:var(--color-mist)]">· Trailer</span>
        </h2>
        <button type="button" onClick={close} className="trailer-close" aria-label="Close trailer">
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="aspect-video w-full bg-black">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title={`${title} trailer`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
      <p className="px-4 py-2.5 text-right text-xs">
        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--color-mist)] underline hover:text-white"
        >
          Not playing? Watch on YouTube
        </a>
      </p>
    </dialog>,
    document.body,
  );
}
