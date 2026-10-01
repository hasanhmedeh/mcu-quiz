import { z } from 'zod';
import { logActivity } from '@/lib/account/activity';
import { recordSignIn } from '@/lib/account/service';
import { consumeRateLimit, rateLimitKey } from '@/lib/auth/rateLimit';
import { clearAccountSessionCookie, readAccountSession, setAccountSessionCookie } from '@/lib/auth/session';
import { FirebaseConfigError, getAdminAuth } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, clientAddress, fail, logServerError, ok, readJsonBody } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const signInSchema = z.object({ idToken: z.string().min(1).max(8192) });

/** Twenty sign-ins per quarter hour per address. */
const SIGN_IN_LIMIT = 20;
const SIGN_IN_WINDOW_SECONDS = 60 * 15;

/** The ID token must come from a sign-in that just happened, not one replayed later. */
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;

/**
 * Finishes an email-link sign-in: the browser has just completed the link
 * with Firebase Auth and sends the ID token here. Once it checks out, the
 * account is created if new and the app's own session cookie is set.
 */
export async function POST(request: Request) {
  const parsed = signInSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return fail('invalid_request', 'That sign-in link could not be completed.', 400);
  }

  try {
    const limit = await consumeRateLimit(
      rateLimitKey('account-sign-in', clientAddress(request)),
      SIGN_IN_LIMIT,
      SIGN_IN_WINDOW_SECONDS,
    );
    if (!limit.allowed) {
      return fail('rate_limited', 'Too many sign-in attempts. Try again in a few minutes.', 429);
    }

    // Outside the try below: if the auth library itself fails to load, that is
    // a server fault for the log, not a bad link.
    const auth = await getAdminAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(parsed.data.idToken, true);
    } catch (error) {
      logServerError('account/session: rejected ID token', error);
      return fail('invalid_token', 'That sign-in link has expired or was already used.', 401);
    }

    const fresh = Date.now() / 1000 - decoded.auth_time < MAX_SIGN_IN_AGE_SECONDS;
    if (!decoded.email || !decoded.email_verified || !fresh) {
      return fail('invalid_token', 'That sign-in link has expired or was already used.', 401);
    }

    const email = decoded.email.toLowerCase();
    const isNew = await recordSignIn(decoded.uid, email);
    await setAccountSessionCookie({ uid: decoded.uid, email });
    await logActivity(decoded.uid, isNew ? 'signed_up' : 'signed_in');
    return ok({ status: 'signed_in' as const, email });
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      logServerError('account/session: firebase not configured', error);
      return fail('service_unavailable', 'Accounts are unavailable right now.', 503);
    }
    logServerError('account/session', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}

/** Signs out. The watched list stays on the account for next time. */
export async function DELETE() {
  const session = await readAccountSession();
  if (session) await logActivity(session.uid, 'signed_out');
  await clearAccountSessionCookie();
  return ok({ status: 'signed_out' as const });
}
