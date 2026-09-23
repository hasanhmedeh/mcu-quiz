import Link from 'next/link';
import { PageShell, SectionLabel } from '@/components/ui/primitives';

export default function NotFound() {
  return (
    <PageShell>
      <div className="mx-auto max-w-lg panel p-8 text-center fade-up">
        <SectionLabel>404</SectionLabel>
        <h1 className="display mt-3 text-2xl font-black text-white">Nothing here</h1>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-mist)]">
          This page does not exist — or the result you are looking for was never completed.
        </p>
        <Link href="/" className="btn btn-ghost mt-6 w-full">
          Back to the start
        </Link>
      </div>
    </PageShell>
  );
}
