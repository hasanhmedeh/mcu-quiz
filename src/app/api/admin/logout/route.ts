import { clearAdminSessionCookie } from '@/lib/auth/session';
import { ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  await clearAdminSessionCookie();
  return ok({ status: 'signed_out' as const });
}
