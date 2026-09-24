import { isAdminAuthenticated } from '@/lib/auth/session';
import { findSnapshots, type SnapshotFilter } from '@/lib/proctoring/service';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isIsoDate(value: string | null): value is string {
  return value !== null && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

/**
 * Lists camera stills without their images — either for one attempt
 * (`?attemptId=`) or for a time range (`?from=&to=`, ISO timestamps).
 * Organiser only.
 */
export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return fail('unauthorized', 'You need to sign in as the organiser first.', 401);
  }

  const params = new URL(request.url).searchParams;
  const attemptId = params.get('attemptId');
  const from = params.get('from');
  const to = params.get('to');

  const validAttempt = attemptId && attemptId.length <= 128 ? attemptId : undefined;

  let filter: SnapshotFilter;
  if (isIsoDate(from) && isIsoDate(to)) {
    // A range, optionally narrowed to one attempt: "what is new since".
    filter = {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      attemptId: validAttempt,
    };
  } else if (validAttempt) {
    filter = { attemptId: validAttempt };
  } else {
    return fail('invalid_request', 'Give an attemptId, or a from and to date.', 400);
  }

  try {
    return ok({ snapshots: await findSnapshots(filter) });
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      logServerError('admin/snapshots: firebase not configured', error);
      return fail('service_unavailable', 'The admin database is unavailable right now.', 503);
    }
    logServerError('admin/snapshots', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
