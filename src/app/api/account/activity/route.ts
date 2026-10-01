import { z } from 'zod';
import { logActivity } from '@/lib/account/activity';
import { CLIENT_ACTIVITY_TYPES } from '@/lib/account/activityTypes';
import { readAccountSession } from '@/lib/auth/session';
import { fail, ok, readJsonBody } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const activitySchema = z.object({
  type: z.enum(CLIENT_ACTIVITY_TYPES),
  path: z.string().startsWith('/').max(300),
  title: z.string().max(160).optional(),
});

/**
 * What the browser reports about a signed-in viewer: pages they open and
 * trailers they play. Anything else is recorded by the server where it
 * happens. Signed-out visitors are not tracked; their reports are ignored.
 */
export async function POST(request: Request) {
  const parsed = activitySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return fail('invalid_request', 'Unknown activity.', 400);

  const session = await readAccountSession();
  if (!session) return ok({ status: 'ignored' as const });

  const { type, path, title } = parsed.data;
  await logActivity(session.uid, type, { path, detail: title ? { title } : {} });
  return ok({ status: 'recorded' as const });
}
