import { z } from 'zod';
import { QuizError, recordAnswer } from '@/lib/quiz/service';
import { readQuizSession } from '@/lib/auth/session';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok, readJsonBody } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const answerSchema = z.object({
  questionId: z.string().min(1).max(64),
  selectedIndex: z.number().int().min(0).max(3),
});

/** Stores one answer as it is picked, for the organiser's live view. */
export async function POST(request: Request) {
  const session = await readQuizSession();
  if (!session) {
    return fail('invalid_session', 'There is no exam open.', 401);
  }

  const parsed = answerSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return fail('invalid_request', 'That request was not something we could act on.', 400);
  }

  try {
    const outcome = await recordAnswer({
      attemptId: session.attemptId,
      userId: session.userId,
      questionId: parsed.data.questionId,
      selectedIndex: parsed.data.selectedIndex,
    });
    return ok({ status: outcome });
  } catch (error) {
    if (error instanceof QuizError) {
      logServerError(`quiz/answer: ${error.code}`, error);
      return fail(error.code, 'That answer could not be recorded.', 409);
    }
    if (error instanceof FirebaseConfigError) {
      logServerError('quiz/answer: firebase not configured', error);
      return fail('service_unavailable', 'The quiz database is unavailable right now.', 503);
    }
    logServerError('quiz/answer', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
