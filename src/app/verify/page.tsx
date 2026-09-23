import Link from 'next/link';
import { VerifyForm } from '@/components/quiz/VerifyForm';
import { InfinityMark } from '@/components/ui/Wordmark';
import { PageShell } from '@/components/ui/primitives';

export const metadata = {
  title: 'Verify a ticket — Endgame Encore',
};

export default function VerifyLandingPage() {
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

          <p className="mt-5 mb-6 text-sm leading-relaxed text-[color:var(--color-mist)]">
            Scanning the QR code on a ticket brings you straight here. You can also type the
            reference printed on it.
          </p>

          <VerifyForm />
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="btn btn-ghost">
            Back to the quiz
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
