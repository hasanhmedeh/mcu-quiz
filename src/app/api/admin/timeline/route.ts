import { z } from 'zod';
import { isAdminAuthenticated } from '@/lib/auth/session';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok, readJsonBody } from '@/lib/http';
import { importantKeysSchema, timelineOrderSchema } from '@/lib/timeline/order';
import { resetTimelineOrder, saveTimelineOrder } from '@/lib/timeline/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const saveSchema = z.object({ order: timelineOrderSchema, important: importantKeysSchema });

function failure(context: string, error: unknown) {
  if (error instanceof FirebaseConfigError) {
    logServerError(`${context}: firebase not configured`, error);
    return fail('service_unavailable', 'The admin database is unavailable right now.', 503);
  }
  logServerError(context, error);
  return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
}

/** Saves the organiser's order, and important titles, for the /timeline page. */
export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return fail('unauthorized', 'You need to sign in as the organiser first.', 401);
  }

  const parsed = saveSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return fail('invalid_request', 'That order was not something we could save.', 400);
  }

  try {
    const saved = await saveTimelineOrder(parsed.data.order, parsed.data.important);
    return ok({ status: 'saved' as const, ...saved });
  } catch (error) {
    return failure('admin/timeline save', error);
  }
}

/** Drops the saved order, so the page goes back to the built-in one. */
export async function DELETE() {
  if (!(await isAdminAuthenticated())) {
    return fail('unauthorized', 'You need to sign in as the organiser first.', 401);
  }

  try {
    await resetTimelineOrder();
    return ok({ status: 'reset' as const });
  } catch (error) {
    return failure('admin/timeline reset', error);
  }
}
