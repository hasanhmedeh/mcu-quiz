import { isFirebaseConfigured } from '@/lib/firebase/admin';
import { isAdminConfigured } from '@/lib/auth/session';
import { bankCounts, validateQuestionBank } from '@/data/questions';
import { ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deployment self-check.
 *
 * Reports only whether each piece of configuration is *present* — never a
 * value, a key fragment, or the reason something failed.
 */
export async function GET() {
  const problems = validateQuestionBank();

  const healthy =
    isFirebaseConfigured() &&
    isAdminConfigured() &&
    Boolean(process.env.SESSION_SECRET) &&
    problems.length === 0;

  return ok(
    {
      status: healthy ? ('ok' as const) : ('degraded' as const),
      checks: {
        firebase: isFirebaseConfigured(),
        adminCredentials: isAdminConfigured(),
        sessionSecret: Boolean(process.env.SESSION_SECRET),
        questionBank: problems.length === 0,
      },
      questionBank: bankCounts(),
    },
    healthy ? 200 : 503,
  );
}
