import { z } from 'zod';
import { QuizError } from '@/lib/quiz/service';
import { MAX_SNAPSHOT_DATA_URL_LENGTH, saveSnapshot } from '@/lib/proctoring/service';
import { readQuizSession } from '@/lib/auth/session';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok, readJsonBody } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const snapshotSchema = z.object({
  // Screen stills are no longer taken; only the camera is accepted.
  kind: z.literal('camera'),
  reason: z.enum(['start', 'interval', 'exit']),
  image: z.string().max(MAX_SNAPSHOT_DATA_URL_LENGTH),
});

/** Receives one proctoring still (camera or screen) for the exam behind the session. */
export async function POST(request: Request) {
  const session = await readQuizSession();
  if (!session) {
    return fail('invalid_session', 'There is no exam open.', 401);
  }

  const parsed = snapshotSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return fail('invalid_request', 'That image was not accepted.', 400);
  }

  try {
    const outcome = await saveSnapshot({
      attemptId: session.attemptId,
      userId: session.userId,
      ...parsed.data,
    });
    return ok({ status: outcome });
  } catch (error) {
    if (error instanceof QuizError) {
      logServerError(`quiz/snapshot: ${error.code}`, error);
      return fail(error.code, 'That image was not accepted.', 409);
    }
    if (error instanceof FirebaseConfigError) {
      logServerError('quiz/snapshot: firebase not configured', error);
      return fail('service_unavailable', 'The quiz database is unavailable right now.', 503);
    }
    logServerError('quiz/snapshot', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
