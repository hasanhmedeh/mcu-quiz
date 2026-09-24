import { QuizError, discardExam } from '@/lib/quiz/service';
import { clearQuizSessionCookie, readQuizSession } from '@/lib/auth/session';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Throws away the exam behind the session cookie without grading it. */
export async function POST() {
  const session = await readQuizSession();
  if (!session) {
    return fail('invalid_session', 'There is no exam open to discard.', 401);
  }

  try {
    // Camera stills are kept: discarding must not be a way to erase them.
    // The organiser can remove them from the gallery.
    await discardExam({ attemptId: session.attemptId, userId: session.userId });
    await clearQuizSessionCookie();
    return ok({ status: 'discarded' as const });
  } catch (error) {
    if (error instanceof QuizError) {
      // Already gone (or already submitted): either way there is nothing to resume.
      await clearQuizSessionCookie();
      logServerError(`quiz/discard: ${error.code}`, error);
      return fail(error.code, 'This exam can no longer be discarded.', 409);
    }
    if (error instanceof FirebaseConfigError) {
      logServerError('quiz/discard: firebase not configured', error);
      return fail('service_unavailable', 'The quiz database is unavailable right now.', 503);
    }
    logServerError('quiz/discard', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
