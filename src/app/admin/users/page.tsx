import { AccountsTable } from '@/components/admin/AccountsTable';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { StatCard } from '@/components/admin/parts';
import { Alert, PageShell, SectionLabel } from '@/components/ui/primitives';
import { DEFAULT_FLOWS } from '@/data/timeline';
import { listAccountsForAdmin, type AdminAccountRow } from '@/lib/admin/accounts';
import { isAdminAuthenticated, isAdminConfigured } from '@/lib/auth/session';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { logServerError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Users — MCU Endgame Preparation Quiz',
  robots: { index: false, follow: false },
};

/** Everyone who signed up at /account, with their exams and activity a click away. */
export default async function AdminUsersPage() {
  if (!(await isAdminAuthenticated())) {
    return <AdminLogin configured={isAdminConfigured()} />;
  }

  let accounts: AdminAccountRow[] | null = null;
  let loadError: string | null = null;
  try {
    accounts = await listAccountsForAdmin();
  } catch (error) {
    const configIssue = error instanceof FirebaseConfigError;
    logServerError(configIssue ? 'admin users: firebase not configured' : 'admin users', error);
    loadError = configIssue
      ? 'Firebase credentials are missing from this deployment, so there is nothing to read yet.'
      : 'We could not load the accounts. Please try again in a moment.';
  }

  const totalTitles = DEFAULT_FLOWS.reduce((sum, flow) => sum + flow.entries.length, 0);
  const list = accounts ?? [];

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

      {loadError ? (
        <Alert tone="error" className="mt-6">
          {loadError}
        </Alert>
      ) : (
        <>
          <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Accounts" value={String(list.length)} />
            <StatCard
              label="Active this week"
              value={String(list.filter((account) => account.activeThisWeek).length)}
            />
            <StatCard label="Took the exam" value={String(list.filter((account) => account.examCount > 0).length)} />
            <StatCard label="Passed" value={String(list.filter((account) => account.passed).length)} tone="pass" />
          </dl>
          <div className="mt-6">
            <AccountsTable accounts={list} totalTitles={totalTitles} />
          </div>
        </>
      )}
    </PageShell>
  );
}
