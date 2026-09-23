import { isAdminAuthenticated, isAdminConfigured } from '@/lib/auth/session';
import { getAdminDashboardData, type AdminDashboardData } from '@/lib/admin/service';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { logServerError } from '@/lib/http';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { Alert, PageShell, SectionLabel } from '@/components/ui/primitives';
import { PASSING_SCORE, TOTAL_QUESTIONS } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Organiser dashboard — MCU Endgame Preparation Quiz',
  robots: { index: false, follow: false },
};

/**
 * The gate is the HttpOnly admin cookie, checked here on the server. An
 * unauthenticated visitor is served the login form and nothing else — no
 * participant data is fetched, let alone rendered.
 */
export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) {
    return <AdminLogin configured={isAdminConfigured()} />;
  }

  let data: AdminDashboardData;
  try {
    data = await getAdminDashboardData();
  } catch (error) {
    const configIssue = error instanceof FirebaseConfigError;
    logServerError(configIssue ? 'admin page: firebase not configured' : 'admin page', error);

    return (
      <PageShell>
        <div className="mx-auto max-w-lg panel p-7 fade-up">
          <SectionLabel>Organiser dashboard</SectionLabel>
          <h1 className="display mt-3 text-2xl font-black text-white">Dashboard unavailable</h1>
          <Alert tone="error" className="mt-4">
            {configIssue
              ? 'Firebase credentials are missing from this deployment, so there is nothing to read yet.'
              : 'We could not load the dashboard. Please try again in a moment.'}
          </Alert>
        </div>
      </PageShell>
    );
  }

  return (
    <AdminDashboard
      stats={data.stats}
      users={data.users}
      recentAttempts={data.recentAttempts}
      passingScore={PASSING_SCORE}
      totalQuestions={TOTAL_QUESTIONS}
    />
  );
}
