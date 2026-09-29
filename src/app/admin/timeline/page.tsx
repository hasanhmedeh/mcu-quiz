import { isAdminAuthenticated, isAdminConfigured } from '@/lib/auth/session';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { logServerError } from '@/lib/http';
import { applyTimelineOrder } from '@/lib/timeline/order';
import { readTimelineOrder, type SavedTimelineOrder } from '@/lib/timeline/service';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { TimelineEditor } from '@/components/admin/TimelineEditor';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Timeline order — MCU Endgame Preparation Quiz',
  robots: { index: false, follow: false },
};

/** The organiser arranges the public /timeline page here. */
export default async function AdminTimelinePage() {
  if (!(await isAdminAuthenticated())) {
    return <AdminLogin configured={isAdminConfigured()} />;
  }

  let saved: SavedTimelineOrder = { order: null, updatedAt: null };
  let loadError: string | null = null;
  try {
    saved = await readTimelineOrder();
  } catch (error) {
    const configIssue = error instanceof FirebaseConfigError;
    logServerError(configIssue ? 'admin timeline: firebase not configured' : 'admin timeline', error);
    loadError = configIssue
      ? 'Firebase credentials are missing from this deployment, so a new order cannot be saved.'
      : 'The saved order could not be loaded, so the built-in order is shown. Saving may fail too.';
  }

  return (
    <TimelineEditor
      initialFlows={applyTimelineOrder(saved.order)}
      initialUpdatedAt={saved.updatedAt}
      customised={saved.order !== null}
      loadError={loadError}
    />
  );
}
