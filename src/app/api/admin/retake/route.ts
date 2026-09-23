import { z } from 'zod';
import { isAdminAuthenticated } from '@/lib/auth/session';
import { setRetakeAllowed } from '@/lib/admin/service';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok, readJsonBody } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const retakeSchema = z.object({
  userId: z.string().min(1).max(128),
  allowed: z.boolean(),
});

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return fail('unauthorized', 'You need to sign in as the organiser first.', 401);
  }

  const parsed = retakeSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return fail('invalid_request', 'That request was not something we could act on.', 400);
  }

  try {
    const result = await setRetakeAllowed(parsed.data.userId, parsed.data.allowed);
    if (!result.ok) {
      return fail('user_not_found', 'That participant no longer exists.', 404);
    }

    return ok({
      status: 'updated' as const,
      displayName: result.displayName,
      retakeAllowed: result.retakeAllowed,
    });
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      logServerError('admin/retake: firebase not configured', error);
      return fail('service_unavailable', 'The admin database is unavailable right now.', 503);
    }
    logServerError('admin/retake', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
