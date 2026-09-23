'use client';

import { useState } from 'react';

type Status = 'idle' | 'working' | 'copied' | 'error';

/**
 * Client island for the ticket's actions. Kept separate from the ticket markup
 * so the ticket itself can stay a server component.
 *
 * `html-to-image` is imported lazily: it is only needed the moment someone
 * actually downloads, so it stays out of the initial page load.
 */
export function TicketActions({ ticketId, verifyUrl }: { ticketId: string; verifyUrl: string }) {
  const [status, setStatus] = useState<Status>('idle');

  async function handleDownload() {
    const node = document.getElementById('endgame-ticket');
    if (!node) return;

    setStatus('working');
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#04050e',
      });

      const link = document.createElement('a');
      link.download = `endgame-encore-${ticketId}.png`;
      link.href = dataUrl;
      link.click();
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 2200);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="no-print mt-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleDownload}
          disabled={status === 'working'}
        >
          {status === 'working' ? 'Preparing…' : 'Download ticket'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
          Print ticket
        </button>
        <button type="button" className="btn btn-ghost" onClick={handleCopy}>
          {status === 'copied' ? 'Link copied ✓' : 'Copy verify link'}
        </button>
      </div>

      <p aria-live="polite" className="mt-2 min-h-[1rem] text-center text-xs text-[color:var(--color-mist)]">
        {status === 'error' ? 'That did not work in this browser — try printing instead.' : ''}
      </p>
    </div>
  );
}
