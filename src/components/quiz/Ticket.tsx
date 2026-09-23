import { InfinityMark } from '@/components/ui/Wordmark';

/**
 * The "Endgame Encore" ticket.
 *
 * An entirely original design — perforated stub, gem mark, holographic edge —
 * built from CSS and type. No Marvel logo, poster or artwork is used.
 */
export interface TicketProps {
  displayName: string;
  score: number;
  totalQuestions: number;
  ticketId: string;
  issuedAt: string;
  qrDataUrl: string | null;
  verifyUrl: string;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function Ticket({
  displayName,
  score,
  totalQuestions,
  ticketId,
  issuedAt,
  qrDataUrl,
  verifyUrl,
}: TicketProps) {
  return (
    <div
      id="endgame-ticket"
      className="print-only-ticket relative overflow-hidden rounded-2xl border border-[rgba(143,208,255,0.3)] bg-[linear-gradient(135deg,#0b0e22_0%,#141936_48%,#1b1230_100%)] shadow-[0_30px_80px_-40px_rgba(0,0,0,1)]"
    >
      {/* Holographic top edge */}
      <div
        aria-hidden="true"
        className="h-1 w-full"
        style={{
          background:
            'linear-gradient(90deg, var(--color-ember), var(--color-gold), var(--color-arc), var(--color-ion))',
        }}
      />

      <div className="grid gap-0 sm:grid-cols-[1fr_auto]">
        {/* ---------- Main body ---------- */}
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-3">
            <InfinityMark size={40} />
            <div>
              <p className="display text-lg font-black leading-none tracking-[0.16em] text-white sm:text-xl">
                AVENGERS: ENDGAME
              </p>
              <p className="display mt-1.5 text-[0.7rem] font-medium tracking-[0.45em] text-[color:var(--color-gold)]">
                ENCORE
              </p>
            </div>
          </div>

          <p className="display mt-5 text-[0.65rem] tracking-[0.3em] text-[color:var(--color-ion-soft)]">
            MCU KNOWLEDGE CERTIFICATION
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Name" value={displayName} wide />
            <Field label="Score" value={`${score} / ${totalQuestions}`} />
            <Field label="Status" value="PASSED" tone="pass" />
            <Field label="Issued" value={formatDate(issuedAt)} />
            <Field label="Admit" value="ONE" />
          </dl>

          <div className="mt-5 border-t border-dashed border-[rgba(143,208,255,0.25)] pt-4">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[color:var(--color-mist)]">
              Ticket reference
            </p>
            <p className="display mt-1 text-lg font-black tracking-[0.12em] text-white">
              {ticketId}
            </p>
          </div>
        </div>

        {/* ---------- Perforated stub ---------- */}
        <div className="relative flex flex-col items-center justify-center gap-3 border-t border-dashed border-[rgba(143,208,255,0.3)] bg-[rgba(4,5,14,0.55)] p-6 sm:border-l sm:border-t-0">
          {/* Perforation notches */}
          <span
            aria-hidden="true"
            className="absolute -left-2.5 top-[-0.625rem] hidden h-5 w-5 rounded-full bg-[color:var(--color-void)] sm:block"
          />
          <span
            aria-hidden="true"
            className="absolute -left-2.5 bottom-[-0.625rem] hidden h-5 w-5 rounded-full bg-[color:var(--color-void)] sm:block"
          />

          {qrDataUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- inline data URI, no loader needed */
            <img
              src={qrDataUrl}
              alt={`QR code linking to the verification page for ticket ${ticketId}`}
              className="h-32 w-32 rounded-lg bg-white p-1.5"
              width={128}
              height={128}
            />
          ) : (
            <div className="grid h-32 w-32 place-items-center rounded-lg border border-dashed border-[rgba(143,208,255,0.35)] p-3 text-center text-[0.6rem] text-[color:var(--color-mist)]">
              Verify at
              <br />
              {verifyUrl.replace(/^https?:\/\//, '')}
            </div>
          )}

          <p className="max-w-[9rem] text-center text-[0.6rem] leading-snug text-[color:var(--color-mist)]">
            Scan to verify this certification
          </p>

          <p className="display text-[0.6rem] tracking-[0.25em] text-[color:var(--color-gold)]">
            ENDGAME READY
          </p>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="h-1 w-full opacity-60"
        style={{
          background:
            'linear-gradient(90deg, var(--color-ion), var(--color-arc), var(--color-gold), var(--color-ember))',
        }}
      />
    </div>
  );
}

function Field({
  label,
  value,
  wide = false,
  tone,
}: {
  label: string;
  value: string;
  wide?: boolean;
  tone?: 'pass';
}) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-[0.625rem] uppercase tracking-[0.2em] text-[color:var(--color-mist)]">
        {label}
      </dt>
      <dd
        className={
          tone === 'pass'
            ? 'display mt-1 text-sm font-black tracking-[0.1em] text-[#6ef2b0]'
            : 'mt-1 text-base font-semibold text-white'
        }
      >
        {value}
      </dd>
    </div>
  );
}
