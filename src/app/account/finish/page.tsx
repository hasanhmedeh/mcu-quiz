import { FinishSignIn } from '@/components/account/FinishSignIn';
import { PageShell, SectionLabel } from '@/components/ui/primitives';

export const metadata = {
  title: 'Signing in — Endgame Encore',
  robots: { index: false, follow: false },
};

/** Where the emailed sign-in link lands. */
export default function FinishSignInPage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-sm">
        <div className="panel panel-glow fade-up p-7">
          <SectionLabel>Your road to Doomsday</SectionLabel>
          <h1 className="display mt-3 mb-5 text-2xl font-black text-white">Signing in</h1>
          <FinishSignIn />
        </div>
      </div>
    </PageShell>
  );
}
