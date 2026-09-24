import { isAdminAuthenticated } from '@/lib/auth/session';
import { deleteSnapshot, getSnapshotImage } from '@/lib/proctoring/service';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

function handleError(context: string, error: unknown) {
  if (error instanceof FirebaseConfigError) {
    logServerError(`${context}: firebase not configured`, error);
    return fail('service_unavailable', 'The admin database is unavailable right now.', 503);
  }
  logServerError(context, error);
  return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
}

/**
 * One camera still as a JPEG, so thumbnails load lazily as plain images.
 * Organiser only, and cached only in the organiser's own browser.
 */
export async function GET(_request: Request, { params }: Context) {
  if (!(await isAdminAuthenticated())) {
    return fail('unauthorized', 'You need to sign in as the organiser first.', 401);
  }

  const { id } = await params;
  try {
    const image = await getSnapshotImage(id);
    if (!image) return fail('not_found', 'That image no longer exists.', 404);

    return new Response(new Uint8Array(image), {
      headers: {
        'Content-Type': 'image/jpeg',
        // A still never changes, so the organiser's browser can keep it —
        // but no shared cache ever should.
        'Cache-Control': 'private, max-age=86400, immutable',
      },
    });
  } catch (error) {
    return handleError('admin/snapshots/[id] GET', error);
  }
}

/** Deletes one still. */
export async function DELETE(_request: Request, { params }: Context) {
  if (!(await isAdminAuthenticated())) {
    return fail('unauthorized', 'You need to sign in as the organiser first.', 401);
  }

  const { id } = await params;
  try {
    if (!(await deleteSnapshot(id))) return fail('not_found', 'That image no longer exists.', 404);
    return ok({ status: 'deleted' as const });
  } catch (error) {
    return handleError('admin/snapshots/[id] DELETE', error);
  }
}
