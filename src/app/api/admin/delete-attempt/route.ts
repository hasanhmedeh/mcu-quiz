import { z } from 'zod';
import { isAdminAuthenticated } from '@/lib/auth/session';
import { deleteAttempt } from '@/lib/admin/service';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok, readJsonBody } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const deleteSchema = z.object({
  attemptId: z.string().min(1).max(128),
  /** Only when the organiser ticks the box; otherwise the stills stay in the gallery. */
  deleteSnapshots: z.boolean().optional().default(false),
});

/** Permanently removes one submission, along with its ticket. */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return fail('unauthorized', 'You need to sign in as the organiser first.', 401);
  }

  const parsed = deleteSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return fail('invalid_request', 'That request was not something we could act on.', 400);
  }

  try {
    const result = await deleteAttempt(parsed.data.attemptId, {
      deleteSnapshots: parsed.data.deleteSnapshots,
    });
    if (!result.ok) {
      return fail('attempt_not_found', 'That submission has already been deleted.', 404);
    }

    return ok({
      status: 'deleted' as const,
      displayName: result.displayName,
      attemptNumber: result.attemptNumber,
    });
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      logServerError('admin/delete-attempt: firebase not configured', error);
      return fail('service_unavailable', 'The admin database is unavailable right now.', 503);
    }
    logServerError('admin/delete-attempt', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
