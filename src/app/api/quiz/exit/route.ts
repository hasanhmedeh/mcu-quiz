import { z } from 'zod';
import { QuizError, recordExamExit } from '@/lib/quiz/service';
import { readQuizSession } from '@/lib/auth/session';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok, readJsonBody } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const exitSchema = z.object({
  kind: z.enum(['tab_hidden', 'window_blur', 'fullscreen_exit']),
  question: z.number().int().min(1).max(200),
});

/** Records that the candidate left the exam, and says whether it must now be submitted. */
export async function POST(request: Request) {
  const session = await readQuizSession();
  if (!session) {
    return fail('invalid_session', 'There is no exam open.', 401);
  }

  const parsed = exitSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return fail('invalid_request', 'That request was not something we could act on.', 400);
  }

  try {
    const result = await recordExamExit({
      attemptId: session.attemptId,
      userId: session.userId,
      kind: parsed.data.kind,
      question: parsed.data.question,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof QuizError) {
      logServerError(`quiz/exit: ${error.code}`, error);
      return fail(error.code, 'This exam is no longer open.', 409);
    }
    if (error instanceof FirebaseConfigError) {
      logServerError('quiz/exit: firebase not configured', error);
      return fail('service_unavailable', 'The quiz database is unavailable right now.', 503);
    }
    logServerError('quiz/exit', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
