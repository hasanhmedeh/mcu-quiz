import { z } from 'zod';
import { isAdminAuthenticated } from '@/lib/auth/session';
import { releaseDevice } from '@/lib/admin/service';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok, readJsonBody } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const releaseSchema = z.object({
  deviceId: z.string().min(1).max(128),
});

/** Lifts a device lock so a genuinely different person can use a shared machine. */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return fail('unauthorized', 'You need to sign in as the organiser first.', 401);
  }

  const parsed = releaseSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return fail('invalid_request', 'That request was not something we could act on.', 400);
  }

  try {
    const result = await releaseDevice(parsed.data.deviceId);
    if (!result.ok) {
      return fail('device_not_found', 'That device is no longer on record.', 404);
    }

    return ok({ status: 'released' as const, deviceId: result.deviceId });
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      logServerError('admin/device: firebase not configured', error);
      return fail('service_unavailable', 'The admin database is unavailable right now.', 503);
    }
    logServerError('admin/device', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
