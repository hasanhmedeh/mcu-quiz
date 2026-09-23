import Link from 'next/link';
import { getTicket } from '@/lib/quiz/service';
import { isValidTicketId, normalizeTicketInput } from '@/lib/quiz/ticket';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { logServerError } from '@/lib/http';
import { InfinityMark } from '@/components/ui/Wordmark';
import { Alert, PageShell, SectionLabel } from '@/components/ui/primitives';
import type { TicketDocument } from '@/lib/firebase/collections';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Verify a ticket — Endgame Encore',
};

interface VerifyPageProps {
  params: Promise<{ ticketId: string }>;
}

/**
 * Public verification endpoint behind the QR code.
 *
 * It confirms only what the ticket already shows to anyone holding it: the
 * name, the score and the issue date. There is no way to enumerate tickets
 * from here — an id is six random characters from a 32-glyph alphabet.
 */
export default async function VerifyTicketPage({ params }: VerifyPageProps) {
  const { ticketId } = await params;
  const normalized = normalizeTicketInput(decodeURIComponent(ticketId));

  if (!isValidTicketId(normalized)) {
    return <VerifyResult ticket={null} query={normalized} reason="malformed" />;
  }

  // The lookup is kept out of the returned JSX: a render-time throw belongs to
  // the error boundary, not to this try/catch.
  let ticket: TicketDocument | null = null;
  let reason: VerifyReason = 'not_found';

  try {
    ticket = await getTicket(normalized);
    reason = ticket ? 'ok' : 'not_found';
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      logServerError('verify page: firebase not configured', error);
    } else {
      logServerError('verify page', error);
    }
    reason = 'unavailable';
  }

  return <VerifyResult ticket={ticket} query={normalized} reason={reason} />;
}

type VerifyReason = 'ok' | 'not_found' | 'malformed' | 'unavailable';

function VerifyResult({
  ticket,
  query,
  reason,
}: {
  ticket: TicketDocument | null;
  query: string;
  reason: VerifyReason;
}) {
  return (
    <PageShell>
      <div className="mx-auto max-w-lg">
        <div className="panel panel-glow fade-up p-7">
          <div className="flex items-center gap-3">
            <InfinityMark size={38} />
            <div>
              <p className="display text-base font-black tracking-[0.16em] text-white">
                ENDGAME ENCORE
              </p>
              <p className="display text-[0.6rem] tracking-[0.3em] text-[color:var(--color-ion-soft)]">
                TICKET VERIFICATION
              </p>
            </div>
          </div>

          {ticket ? (
            <>
              <div className="mt-6 rounded-xl border border-[rgba(46,204,130,0.35)] bg-[rgba(46,204,130,0.1)] p-5 text-center">
                <p className="display text-lg font-black tracking-[0.1em] text-[#6ef2b0]">
                  VALID TICKET
                </p>
                <p className="mt-1 text-sm text-[color:var(--color-mist)]">
                  This certification was issued by the organiser.
                </p>
              </div>

              <dl className="mt-6 space-y-3">
                <Row label="Name" value={ticket.displayName} />
                <Row label="Score" value={`${ticket.score} / ${ticket.totalQuestions}`} />
                <Row label="Status" value="PASSED" />
                <Row
                  label="Issued"
                  value={new Date(ticket.issuedAt).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                />
                <Row label="Reference" value={ticket.ticketId} mono />
              </dl>
            </>
          ) : (
            <div className="mt-6">
              <Alert tone={reason === 'unavailable' ? 'warning' : 'error'}>
                {reason === 'malformed'
                  ? 'That is not a valid ticket reference. They look like EG-2026-8F3K92.'
                  : reason === 'unavailable'
                    ? 'We cannot check tickets right now. Please try again in a moment.'
                    : `No ticket was found with the reference ${query}.`}
              </Alert>
            </div>
          )}

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <Link href="/verify" className="btn btn-ghost">
              Check another
            </Link>
            <Link href="/" className="btn btn-ghost">
              Back to the quiz
            </Link>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-[color:var(--color-mist)]/70">
          <SectionLabel>Unofficial fan-made certification</SectionLabel>
        </p>
      </div>
    </PageShell>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[rgba(143,208,255,0.12)] pb-3">
      <dt className="text-[0.6875rem] uppercase tracking-[0.18em] text-[color:var(--color-mist)]">
        {label}
      </dt>
      <dd className={mono ? 'font-mono text-sm text-white' : 'text-sm font-semibold text-white'}>
        {value}
      </dd>
    </div>
  );
}
