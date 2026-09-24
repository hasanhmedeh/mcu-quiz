import { isAdminAuthenticated } from '@/lib/auth/session';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { regradeCompletedAttempts } from '@/lib/quiz/service';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Re-applies the current pass mark to past attempts, issuing any tickets now owed. */
export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return fail('unauthorized', 'You need to sign in as the organiser first.', 401);
  }

  try {
    const summary = await regradeCompletedAttempts();
    return ok({ status: 'regraded' as const, checked: summary.checked, promoted: summary.promoted });
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      logServerError('admin/regrade: firebase not configured', error);
      return fail('service_unavailable', 'The admin database is unavailable right now.', 503);
    }
    logServerError('admin/regrade', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
