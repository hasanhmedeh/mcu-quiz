import { isAdminAuthenticated, isAdminConfigured } from '@/lib/auth/session';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { LiveMonitor } from '@/components/admin/LiveMonitor';
import { PASSING_SCORE } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Live exams — MCU Endgame Preparation Quiz',
  robots: { index: false, follow: false },
};

/** Same gate as the dashboard: the answer key never reaches anyone but the organiser. */
export default async function AdminLivePage() {
  if (!(await isAdminAuthenticated())) {
    return <AdminLogin configured={isAdminConfigured()} />;
  }

  return <LiveMonitor passingScore={PASSING_SCORE} />;
}
