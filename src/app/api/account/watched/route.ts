import { z } from 'zod';
import { DEFAULT_FLOWS, entryKey } from '@/data/timeline';
import { logActivity } from '@/lib/account/activity';
import { recordSignIn, setWatched } from '@/lib/account/service';
import { readAccountSession } from '@/lib/auth/session';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok, readJsonBody } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Only titles that are actually on the timeline can be ticked. */
const TITLES = new Map(DEFAULT_FLOWS.flatMap((flow) => flow.entries.map((entry) => [entryKey(entry), entry.title] as const)));

const watchedSchema = z.object({
  key: z.string().refine((key) => TITLES.has(key)),
  watched: z.boolean(),
});

/** Firestore's NOT_FOUND, from updating an account document that is gone. */
const NOT_FOUND = 5;

/** Marks one timeline title as watched, or not, for the signed-in viewer. */
export async function PUT(request: Request) {
  const session = await readAccountSession();
  if (!session) {
    return fail('unauthorized', 'Sign in to keep track of what you have watched.', 401);
  }

  const parsed = watchedSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return fail('invalid_request', 'That title is not on the timeline.', 400);
  }

  const { key, watched } = parsed.data;
  try {
    try {
      await setWatched(session.uid, key, watched);
    } catch (error) {
      if ((error as { code?: unknown }).code !== NOT_FOUND) throw error;
      // The account document was removed while the cookie lived on: recreate it.
      await recordSignIn(session.uid, session.email);
      await setWatched(session.uid, key, watched);
    }
    await logActivity(session.uid, watched ? 'marked_watched' : 'unmarked_watched', {
      detail: { title: TITLES.get(key) ?? key, key },
    });
    return ok({ status: 'saved' as const, key, watched });
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      logServerError('account/watched: firebase not configured', error);
      return fail('service_unavailable', 'Accounts are unavailable right now.', 503);
    }
    logServerError('account/watched', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
