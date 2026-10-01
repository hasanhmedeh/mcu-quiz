import Link from 'next/link';
import { ExamList } from '@/components/account/ExamList';
import { SignInForm } from '@/components/account/SignInForm';
import { SignOutButton } from '@/components/account/SignOutButton';
import { WatchToggle, WatchedProvider } from '@/components/account/Watched';
import { TrailerButton } from '@/components/timeline/TrailerButton';
import { PageShell, SectionLabel } from '@/components/ui/primitives';
import { entryKey, yearLabel, type TimelineEntry } from '@/data/timeline';
import { trailerIdFor } from '@/data/trailers';
import { progressOf, recommend, type Recommendation } from '@/lib/account/recommend';
import { getCurrentAccount, listAccountExams, type AccountExam } from '@/lib/account/service';
import { logServerError } from '@/lib/http';
import { getTimelineFlows } from '@/lib/timeline/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Your account — Endgame Encore',
  description: 'Your exam results, the Marvel films and series you have watched, and what to watch next.',
};

const timelineLink = (
  <Link href="/timeline" className="btn btn-ghost min-h-0 px-4 py-2 text-sm">
    Road to Doomsday
  </Link>
);

export default async function AccountPage() {
  const account = await getCurrentAccount();
  if (!account) return <SignedOut />;

  const flows = (await getTimelineFlows()).filter((flow) => flow.entries.length > 0);
  const titles = new Map(flows.flatMap((flow) => flow.entries.map((entry) => [entryKey(entry), entry] as const)));
  // Ignore anything ticked that has since left the timeline.
  const watchedKeys = Object.keys(account.watched).filter((key) => titles.has(key));
  const watched = new Set(watchedKeys);

  const progress = progressOf(flows, watched);
  const upNext = recommend(flows, watched);
  const recent = watchedKeys
    .sort((a, b) => (account.watched[b] ?? '').localeCompare(account.watched[a] ?? ''))
    .slice(0, 6)
    .map((key) => titles.get(key))
    .filter((entry): entry is TimelineEntry => entry !== undefined);
  const percent = progress.total === 0 ? 0 : Math.round((progress.watched / progress.total) * 100);

  let exams: AccountExam[] | null = null;
  try {
    exams = await listAccountExams(account.uid);
  } catch (error) {
    logServerError('account page: could not list exams', error);
  }

  return (
    <PageShell
      headerRight={
        <div className="flex gap-2">
          {timelineLink}
          <SignOutButton />
        </div>
      }
    >
      <WatchedProvider signedIn initialWatched={watchedKeys} refreshOnChange>
        <section className="fade-up">
          <SectionLabel>Your road to Doomsday</SectionLabel>
          <h1 className="display mt-3 text-3xl font-black text-white sm:text-4xl">Your account</h1>
          <p className="mt-2 text-sm text-[color:var(--color-mist)]">
            Signed in as <span className="text-white">{account.email}</span>
          </p>
        </section>

        {/* ---------------- Exams ---------------- */}
        <section className="mt-8 fade-up" aria-labelledby="exams-heading">
          <h2 id="exams-heading" className="display text-lg font-bold text-white">
            Your exams
          </h2>
          {exams === null ? (
            <p className="mt-3 text-sm text-[color:var(--color-mist)]">
              Your exams could not be loaded right now. Please try again in a moment.
            </p>
          ) : exams.length === 0 ? (
            <p className="mt-3 text-sm text-[color:var(--color-mist)]">
              None yet. Exams you take while signed in show up here.{' '}
              <Link href="/" className="text-[color:var(--color-ion-soft)] underline">
                Take the exam →
              </Link>
            </p>
          ) : (
            <div className="mt-4">
              <ExamList exams={exams} />
            </div>
          )}
        </section>

        {/* ---------------- Progress ---------------- */}
        <section className="mt-12 fade-up" aria-labelledby="progress-heading">
          <h2 id="progress-heading" className="display mb-4 text-lg font-bold text-white">
            Watch progress
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Watched" value={`${progress.watched} / ${progress.total}`} />
            <Stat label="Complete" value={`${percent}%`} />
            {progress.mustTotal > 0 ? (
              <Stat label="★ Must-watches" value={`${progress.mustWatched} / ${progress.mustTotal}`} />
            ) : null}
          </dl>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {progress.flows.map((flow) => (
              <li key={flow.id} className="panel px-4 py-3">
                <p className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-white">{flow.name}</span>
                  <span className="tabular-nums text-[color:var(--color-mist)]">
                    {flow.watched} / {flow.total}
                  </span>
                </p>
                <div className="progress-track mt-2" aria-hidden="true">
                  <span
                    className="progress-fill"
                    style={{ width: `${(flow.watched / flow.total) * 100}%`, background: flow.color }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------- Up next ---------------- */}
        <section className="mt-12 fade-up" aria-labelledby="next-heading">
          <h2 id="next-heading" className="display text-lg font-bold text-white">
            Watch next
          </h2>
          {upNext.length === 0 ? (
            <p className="panel mt-4 p-5 text-sm text-[color:var(--color-mist)]">
              You have watched every title on the timeline. You are ready for{' '}
              <em className="text-white">Avengers: Doomsday</em>.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {upNext.map((pick) => (
                <NextCard key={pick.key} pick={pick} />
              ))}
            </ul>
          )}
        </section>

        {/* ---------------- Recently watched ---------------- */}
        <section className="mt-12 fade-up" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="display text-lg font-bold text-white">
            Recently watched
          </h2>
          {recent.length === 0 ? (
            <p className="mt-3 text-sm text-[color:var(--color-mist)]">
              Nothing yet. Tick off what you have seen here or on the timeline.
            </p>
          ) : (
            <ul className="panel mt-4 divide-y divide-[rgba(143,208,255,0.08)]">
              {recent.map((entry) => (
                <li key={entryKey(entry)} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white">{entry.title}</span>
                    <span className="text-xs text-[color:var(--color-mist)]">{yearLabel(entry)}</span>
                  </span>
                  <WatchToggle titleKey={entryKey(entry)} title={entry.title} />
                </li>
              ))}
            </ul>
          )}
          <Link href="/timeline" className="mt-5 inline-block text-sm text-[color:var(--color-ion-soft)] underline">
            Tick off more titles on the timeline →
          </Link>
        </section>
      </WatchedProvider>
    </PageShell>
  );
}

function SignedOut() {
  return (
    <PageShell headerRight={timelineLink}>
      <div className="mx-auto max-w-sm">
        <div className="panel panel-glow fade-up p-7">
          <SectionLabel>Your road to Doomsday</SectionLabel>
          <h1 className="display mt-3 text-2xl font-black text-white">Sign in or sign up</h1>
          <p className="mt-2 mb-6 text-sm text-[color:var(--color-mist)]">
            Keep track of the films and series you have watched, and see what to watch next before{' '}
            <em>Avengers: Doomsday</em>.
          </p>
          <SignInForm />
        </div>
      </div>
    </PageShell>
  );
}

function NextCard({ pick }: { pick: Recommendation }) {
  const videoId = trailerIdFor(pick.entry);
  return (
    <li className="panel flex flex-col gap-3 p-4">
      <div>
        <p className="font-semibold text-white">{pick.entry.title}</p>
        <p className="mt-0.5 text-xs text-[color:var(--color-mist)]">
          {yearLabel(pick.entry)} · {pick.flowName}
        </p>
      </div>
      <ul className="space-y-1 text-xs">
        {pick.reasons.map((reason) => (
          <li key={reason} className={reason.startsWith('Starred') ? 'text-[color:var(--color-gold)]' : 'text-[color:var(--color-ion-soft)]'}>
            {reason.startsWith('Starred') ? '★ ' : '→ '}
            {reason}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap gap-2">
        <WatchToggle titleKey={pick.key} title={pick.entry.title} />
        {videoId ? <TrailerButton title={pick.entry.title} videoId={videoId} /> : null}
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <dt className="text-[0.6875rem] uppercase tracking-[0.16em] text-[color:var(--color-mist)]">{label}</dt>
      <dd className="display mt-1 text-2xl font-black text-white">{value}</dd>
    </div>
  );
}
