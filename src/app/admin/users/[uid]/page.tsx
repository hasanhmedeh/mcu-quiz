import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { ActivityTimeCharts } from '@/components/admin/ActivityTimeCharts';
import { AdminNav } from '@/components/admin/AdminNav';
import { BarList } from '@/components/admin/BarList';
import { CapturesButton } from '@/components/admin/CapturesButton';
import { EmptyState, LinkPagination, StatCard } from '@/components/admin/parts';
import { LocalTime } from '@/components/ui/LocalTime';
import { Alert, PageShell, SectionLabel } from '@/components/ui/primitives';
import { yearLabel } from '@/data/timeline';
import { ACTIVITY_PAGE_SIZE, type ActivityEntry } from '@/lib/account/activity';
import { activityLabel } from '@/lib/account/activityTypes';
import { getAccountProfileForAdmin, type AdminAccountProfile } from '@/lib/admin/accounts';
import { isAdminAuthenticated, isAdminConfigured } from '@/lib/auth/session';
import { cn } from '@/lib/cn';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { logServerError } from '@/lib/http';
import type { AdminAttemptRow } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'User profile — MCU Endgame Preparation Quiz',
  robots: { index: false, follow: false },
};

interface ProfilePageProps {
  params: Promise<{ uid: string }>;
  /** `?page=N` pages through the activity log. */
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const EXIT_LABELS: Record<string, string> = {
  tab_hidden: 'switched tab or app',
  window_blur: 'clicked away from the window',
  fullscreen_exit: 'left fullscreen',
  camera_off: 'turned the camera off',
  screen_off: 'stopped screen sharing',
};

/** One account: their exams, what they watched, and their full activity log. */
export default async function AdminUserProfilePage({ params, searchParams }: ProfilePageProps) {
  if (!(await isAdminAuthenticated())) {
    return <AdminLogin configured={isAdminConfigured()} />;
  }
  const { uid } = await params;
  const pageParam = (await searchParams).page;
  const requestedPage = Number(Array.isArray(pageParam) ? pageParam[0] : pageParam) || 1;

  let profile: AdminAccountProfile | null;
  try {
    profile = await getAccountProfileForAdmin(uid, requestedPage);
  } catch (error) {
    const configIssue = error instanceof FirebaseConfigError;
    logServerError(configIssue ? 'admin profile: firebase not configured' : 'admin profile', error);
    return (
      <PageShell headerRight={<AdminNav current="users" />}>
        <Alert tone="error">
          {configIssue
            ? 'Firebase credentials are missing from this deployment.'
            : 'We could not load this profile. Please try again in a moment.'}
        </Alert>
      </PageShell>
    );
  }
  if (!profile) notFound();

  const { analytics } = profile;
  const completed = profile.exams.filter((exam) => exam.status === 'completed');
  const best = completed.reduce<number | null>((top, exam) => (exam.score === null ? top : Math.max(top ?? 0, exam.score)), null);

  return (
    <PageShell headerRight={<AdminNav current="users" />}>
      <div className="fade-up">
        <Link href="/admin/users" className="text-xs text-[color:var(--color-ion-soft)] underline">
          ← All users
        </Link>
        <div className="mt-4">
          <SectionLabel>User profile</SectionLabel>
        </div>
        <h1 className="display mt-3 break-all text-2xl font-black text-white sm:text-3xl">{profile.email}</h1>
        <p className="mt-2 text-sm text-[color:var(--color-mist)]">
          Signed up <LocalTime iso={profile.createdAt} /> · last signed in <LocalTime iso={profile.lastSignInAt} />
          {profile.lastActiveAt ? (
            <>
              {' · '}last active <LocalTime iso={profile.lastActiveAt} />
            </>
          ) : null}
        </p>
      </div>

      <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Exams" value={String(profile.exams.length)} />
        <StatCard
          label="Best score"
          value={best === null ? '—' : String(best)}
          tone={best === null ? undefined : completed.some((exam) => exam.passed) ? 'pass' : 'fail'}
        />
        <StatCard label="Watched" value={String(profile.watched.length)} />
        <StatCard label="Events logged" value={String(profile.activity.total)} />
      </dl>

      {/* ---------------- Exams ---------------- */}
      <section className="mt-10" aria-labelledby="exams-heading">
        <h2 id="exams-heading" className="display text-lg font-bold text-white">
          Exams
        </h2>
        {profile.exams.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No exams yet" body="Exams this person takes while signed in will show up here." />
          </div>
        ) : (
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
              <caption className="sr-only">Exams taken by {profile.email}</caption>
              <thead>
                <tr className="border-b border-[rgba(143,208,255,0.16)] text-[0.6875rem] uppercase tracking-[0.14em] text-[color:var(--color-mist)]">
                  <th scope="col" className="px-4 py-3 font-medium">Attempt</th>
                  <th scope="col" className="px-4 py-3 font-medium">Score</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  <th scope="col" className="px-4 py-3 font-medium">Ticket</th>
                  <th scope="col" className="px-4 py-3 font-medium">Left exam</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {profile.exams.map((exam) => (
                  <tr key={exam.id} className="border-b border-[rgba(143,208,255,0.08)] last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-white">#{exam.attemptNumber}</span>
                      <span className="block text-xs text-[color:var(--color-mist)]">as {exam.displayName}</span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-white">
                      {exam.score === null ? '—' : `${exam.score} / ${exam.totalQuestions}`}
                    </td>
                    <td className="px-4 py-2.5">
                      <AttemptChip exam={exam} />
                    </td>
                    <td className="px-4 py-2.5 text-[color:var(--color-mist)]">
                      <LocalTime iso={exam.completedAt ?? exam.startedAt} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[color:var(--color-gold)]">{exam.ticketId ?? '—'}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[color:var(--color-mist)]">
                      {exam.exitCount === 0 ? '—' : `${exam.exitCount}×${exam.forcedSubmit ? ' (forced submit)' : ''}`}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex justify-end gap-2 whitespace-nowrap">
                        <CapturesButton
                          attemptId={exam.id}
                          count={exam.snapshotCount}
                          title={`${exam.displayName} · attempt #${exam.attemptNumber}`}
                          live={exam.status === 'in_progress'}
                        />
                        {exam.status === 'completed' ? (
                          <Link
                            href={`/result/${exam.id}`}
                            className="rounded-lg border border-[rgba(143,208,255,0.35)] px-2.5 py-1.5 text-[0.7rem] font-semibold text-[color:var(--color-mist)] hover:text-white"
                          >
                            Result
                          </Link>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------------- Watched ---------------- */}
      <section className="mt-10" aria-labelledby="watched-heading">
        <h2 id="watched-heading" className="display text-lg font-bold text-white">
          Watched
        </h2>
        {profile.watched.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--color-mist)]">Nothing marked as watched yet.</p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {profile.watched.map(({ entry, at }) => (
              <li
                key={`${entry.title}-${entry.year}`}
                className="rounded-full border border-[rgba(110,242,176,0.35)] bg-[rgba(110,242,176,0.08)] px-3 py-1.5 text-xs text-white"
                title={`Marked ${new Date(at).toISOString()}`}
              >
                {entry.title} <span className="text-[color:var(--color-mist)]">· {yearLabel(entry)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- Analytics ---------------- */}
      <section className="mt-10" aria-labelledby="analytics-heading">
        <h2 id="analytics-heading" className="display text-lg font-bold text-white">
          Activity analytics
        </h2>
        <p className="mt-1 text-xs text-[color:var(--color-mist)]">
          {analytics.analysed < profile.activity.total
            ? `Based on their latest ${analytics.analysed.toLocaleString()} of ${profile.activity.total.toLocaleString()} events.`
            : 'Based on everything recorded while they were signed in.'}
        </p>
        {analytics.analysed === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--color-mist)]">Nothing to analyse yet.</p>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCard label="Sign-ins" value={analytics.counts.signIns.toLocaleString()} />
              <StatCard label="Page views" value={analytics.counts.pageViews.toLocaleString()} />
              <StatCard label="Trailers played" value={analytics.counts.trailers.toLocaleString()} />
              <StatCard label="Titles marked" value={analytics.counts.marked.toLocaleString()} />
              <StatCard
                label="Left the exam"
                value={analytics.counts.examExits.toLocaleString()}
                tone={analytics.counts.examExits > 0 ? 'fail' : undefined}
              />
            </dl>
            <div className="mt-4">
              <ActivityTimeCharts times={analytics.times} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <BarList
                title="What they did"
                rows={analytics.byType.map((row) => ({ label: activityLabel(row.type), count: row.count }))}
                empty="No events yet."
              />
              <BarList title="Most visited pages" rows={analytics.topPages} empty="No page views yet." />
              <BarList title="Most played trailers" rows={analytics.topTrailers} empty="No trailers played yet." />
            </div>
          </>
        )}
      </section>

      {/* ---------------- Activity ---------------- */}
      <section className="mt-10" aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="display text-lg font-bold text-white">
          Activity
        </h2>
        <p className="mt-1 text-xs text-[color:var(--color-mist)]">
          Everything recorded while they were signed in, newest first.
        </p>
        {profile.activity.total === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--color-mist)]">No activity recorded yet.</p>
        ) : (
          <ol className="panel mt-4 divide-y divide-[rgba(143,208,255,0.08)]">
            {profile.activity.entries.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <LocalTime iso={event.at} className="w-40 shrink-0 text-xs tabular-nums text-[color:var(--color-mist)]" />
                <span className={cn('font-semibold', EVENT_TONE[event.type] ?? 'text-white')}>{activityLabel(event.type)}</span>
                <span className="min-w-0 flex-1 text-[color:var(--color-mist)]">{describe(event)}</span>
              </li>
            ))}
          </ol>
        )}
        <LinkPagination
          page={profile.activity.page}
          pageCount={profile.activity.pageCount}
          total={profile.activity.total}
          pageSize={ACTIVITY_PAGE_SIZE}
          noun="event"
          hrefFor={(page) => (page === 1 ? `/admin/users/${uid}` : `/admin/users/${uid}?page=${page}`)}
        />
      </section>
    </PageShell>
  );
}

const EVENT_TONE: Record<string, string> = {
  signed_up: 'text-[color:var(--color-ion-soft)]',
  exam_submitted: 'text-[#6ef2b0]',
  exam_left: 'text-[color:var(--color-ember-soft)]',
  exam_blocked: 'text-[color:var(--color-ember-soft)]',
  exam_discarded: 'text-[color:var(--color-gold)]',
};

/** The one-line detail shown after an event's label. */
function describe(event: ActivityEntry): string {
  const d = event.detail;
  const text = (key: string) => (typeof d[key] === 'string' || typeof d[key] === 'number' ? String(d[key]) : null);
  switch (event.type) {
    case 'page_view':
      return event.path ?? '';
    case 'trailer_opened':
    case 'marked_watched':
    case 'unmarked_watched':
      return text('title') ?? '';
    case 'exam_started':
    case 'exam_resumed':
      return `as ${text('name') ?? '?'} · attempt #${text('attemptNumber') ?? '?'}`;
    case 'exam_blocked':
      return `as ${text('name') ?? '?'} · ${(text('reason') ?? '').replace(/_/g, ' ')}`;
    case 'exam_left':
      return `${EXIT_LABELS[text('kind') ?? ''] ?? text('kind') ?? ''} at question ${text('question') ?? '?'} (${text('exitCount') ?? '?'} so far)`;
    case 'exam_submitted':
      return [
        `${text('score') ?? '?'} / ${text('totalQuestions') ?? '?'}`,
        d.passed ? 'passed' : 'not passed',
        text('ticketId') ? `ticket ${text('ticketId')}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
    default:
      return '';
  }
}

function AttemptChip({ exam }: { exam: AdminAttemptRow }) {
  const [label, tone] =
    exam.status === 'completed'
      ? exam.passed
        ? ['Passed', 'border-[rgba(110,242,176,0.45)] bg-[rgba(110,242,176,0.12)] text-[#6ef2b0]']
        : ['Not passed', 'border-[rgba(255,59,74,0.4)] bg-[rgba(255,59,74,0.1)] text-[color:var(--color-ember-soft)]']
      : ['In progress', 'border-[rgba(245,197,66,0.45)] bg-[rgba(245,197,66,0.1)] text-[color:var(--color-gold)]'];
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em]', tone)}>
      {label}
    </span>
  );
}
