import { z } from 'zod';
import {
  isAdminConfigured,
  setAdminSessionCookie,
  verifyAdminCredentials,
} from '@/lib/auth/session';
import { consumeRateLimit, rateLimitKey } from '@/lib/auth/rateLimit';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import {
  GENERIC_ERROR_MESSAGE,
  clientAddress,
  fail,
  logServerError,
  ok,
  readJsonBody,
} from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const loginSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(256),
});

/** Ten tries per quarter hour per address. */
const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_WINDOW_SECONDS = 60 * 15;

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    logServerError('admin/login', new Error('ADMIN_USERNAME / ADMIN_PASSWORD are not set'));
    return fail('not_configured', 'Admin access has not been configured on this deployment.', 503);
  }

  const parsed = loginSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return fail('invalid_request', 'Enter both a username and a password.', 400);
  }

  try {
    const limit = await consumeRateLimit(
      rateLimitKey('admin-login', clientAddress(request)),
      LOGIN_ATTEMPT_LIMIT,
      LOGIN_WINDOW_SECONDS,
    );
    if (!limit.allowed) {
      return fail(
        'rate_limited',
        `Too many sign-in attempts. Try again in about ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
        429,
      );
    }

    // One message for both a wrong username and a wrong password, so the
    // response never confirms that a username exists.
    if (!verifyAdminCredentials(parsed.data.username, parsed.data.password)) {
      return fail('invalid_credentials', 'Incorrect username or password.', 401);
    }

    await setAdminSessionCookie(parsed.data.username);
    return ok({ status: 'signed_in' as const });
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      logServerError('admin/login: firebase not configured', error);
      return fail('service_unavailable', 'The admin database is unavailable right now.', 503);
    }
    logServerError('admin/login', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
