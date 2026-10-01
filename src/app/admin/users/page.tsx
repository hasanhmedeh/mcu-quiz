import { AccountsTable } from '@/components/admin/AccountsTable';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { BarList } from '@/components/admin/BarList';
import { StatCard } from '@/components/admin/parts';
import { UsersTimeCharts } from '@/components/admin/UsersTimeCharts';
import { Alert, PageShell, SectionLabel } from '@/components/ui/primitives';
import { DEFAULT_FLOWS } from '@/data/timeline';
import { getUsersOverview, type UsersOverview } from '@/lib/admin/accounts';
import { isAdminAuthenticated, isAdminConfigured } from '@/lib/auth/session';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { logServerError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Users — MCU Endgame Preparation Quiz',
  robots: { index: false, follow: false },
};

function percent(part: number, whole: number): string {
  return whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;
}

/** Everyone who signed up at /account: analytics across all of them, then the list. */
export default async function AdminUsersPage() {
  if (!(await isAdminAuthenticated())) {
    return <AdminLogin configured={isAdminConfigured()} />;
  }

  let overview: UsersOverview | null = null;
  let loadError: string | null = null;
  try {
    overview = await getUsersOverview();
  } catch (error) {
    const configIssue = error instanceof FirebaseConfigError;
    logServerError(configIssue ? 'admin users: firebase not configured' : 'admin users', error);
    loadError = configIssue
      ? 'Firebase credentials are missing from this deployment, so there is nothing to read yet.'
      : 'We could not load the accounts. Please try again in a moment.';
  }

  const totalTitles = DEFAULT_FLOWS.reduce((sum, flow) => sum + flow.entries.length, 0);

  return (
    <PageShell headerRight={<AdminNav current="users" />}>
      <div className="fade-up">
        <SectionLabel>Organiser dashboard</SectionLabel>
        <h1 className="display mt-3 text-2xl font-black text-white sm:text-3xl">Users</h1>
        <p className="mt-2 text-sm text-[color:var(--color-mist)]">
          Everyone who signed up with an email link. Open someone to see their exams, what they
          have watched, and everything they did while signed in.
        </p>
      </div>

      {loadError || !overview ? (
        <Alert tone="error" className="mt-6">
          {loadError}
        </Alert>
      ) : (
        <UsersBody overview={overview} totalTitles={totalTitles} />
      )}
    </PageShell>
  );
}

function UsersBody({ overview, totalTitles }: { overview: UsersOverview; totalTitles: number }) {
  const { accounts, analytics } = overview;
  const signedUp = accounts.length;

  return (
    <>
      <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Accounts" value={String(signedUp)} />
        <StatCard label="Active this week" value={String(accounts.filter((account) => account.activeThisWeek).length)} />
        <StatCard label="Took the exam" value={String(accounts.filter((account) => account.examCount > 0).length)} />
        <StatCard label="Passed" value={String(accounts.filter((account) => account.passed).length)} tone="pass" />
      </dl>

      {/* ---------------- Analytics ---------------- */}
      <section className="mt-10" aria-labelledby="analytics-heading">
        <h2 id="analytics-heading" className="display text-lg font-bold text-white">
          Analytics
        </h2>
        <p className="mt-1 text-xs text-[color:var(--color-mist)]">
          {analytics.capped
            ? `Activity is based on a sample of ${analytics.analysed.toLocaleString()} events; there are more.`
            : `Across everyone, from ${analytics.analysed.toLocaleString()} recorded events.`}
        </p>

        {signedUp === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--color-mist)]">Nothing to analyse until someone signs up.</p>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Page views" value={analytics.counts.pageViews.toLocaleString()} />
              <StatCard label="Trailers played" value={analytics.counts.trailers.toLocaleString()} />
              <StatCard label="Titles marked" value={analytics.counts.marked.toLocaleString()} />
              <StatCard
                label="Left an exam"
                value={analytics.counts.examExits.toLocaleString()}
                tone={analytics.counts.examExits > 0 ? 'fail' : undefined}
              />
            </dl>

            <div className="mt-4">
              <UsersTimeCharts hourly={analytics.hourly} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <BarList
                title="How far people get"
                subtitle="Accounts that reached each step, and their share of sign-ups"
                rows={analytics.funnel.map((step) => ({ ...step, note: percent(step.count, signedUp) }))}
                empty="No accounts yet."
              />
              <BarList
                title="Most active users"
                subtitle="By events recorded; open one for their full history"
                rows={analytics.mostActive}
                empty="No activity yet."
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <BarList title="Most visited pages" rows={analytics.topPages} empty="No page views yet." />
              <BarList title="Most played trailers" rows={analytics.topTrailers} empty="No trailers played yet." />
              <BarList
                title="Most watched titles"
                subtitle="Marked as watched, by number of people"
                rows={analytics.topWatched}
                empty="Nothing marked yet."
              />
            </div>
          </>
        )}
      </section>

      {/* ---------------- Everyone ---------------- */}
      <section className="mt-10" aria-labelledby="everyone-heading">
        <h2 id="everyone-heading" className="display mb-4 text-lg font-bold text-white">
          All users
        </h2>
        <AccountsTable accounts={accounts} totalTitles={totalTitles} />
      </section>
    </>
  );
}
