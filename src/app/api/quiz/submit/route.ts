import { z } from 'zod';
import { QuizError, submitExam } from '@/lib/quiz/service';
import { clearQuizSessionCookie, readQuizSession } from '@/lib/auth/session';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import { GENERIC_ERROR_MESSAGE, fail, logServerError, ok, readJsonBody } from '@/lib/http';
import { TOTAL_QUESTIONS } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The browser submits only *which option it clicked*, per question. It has
 * never been told which option is correct, and the score is recomputed here
 * from the answer key held server-side — so editing this payload in DevTools
 * changes nothing except which wrong answers get recorded.
 */
const submitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(64),
        selectedIndex: z.number().int().min(0).max(3),
      }),
    )
    .max(TOTAL_QUESTIONS),
});

export async function POST(request: Request) {
  const session = await readQuizSession();
  if (!session) {
    return fail(
      'invalid_session',
      'Your quiz session has expired. Please start again from the home page.',
      401,
    );
  }

  const parsed = submitSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return fail('invalid_request', 'We could not read your answers. Please try again.', 400);
  }

  const answers = new Map<string, number>();
  for (const answer of parsed.data.answers) {
    answers.set(answer.questionId, answer.selectedIndex);
  }

  try {
    const result = await submitExam({
      attemptId: session.attemptId,
      userId: session.userId,
      answers,
    });

    await clearQuizSessionCookie();
    return ok({ status: 'completed' as const, result });
  } catch (error) {
    if (error instanceof QuizError) {
      const status = error.code === 'session_expired' ? 410 : 400;
      const message =
        error.code === 'session_expired'
          ? 'This exam session has expired. Ask the organiser to unlock another attempt.'
          : 'We could not find your exam session. Please start again from the home page.';
      logServerError(`quiz/submit: ${error.code}`, error);
      return fail(error.code, message, status);
    }
    if (error instanceof FirebaseConfigError) {
      logServerError('quiz/submit: firebase not configured', error);
      return fail('service_unavailable', 'The quiz database is unavailable right now.', 503);
    }
    logServerError('quiz/submit', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
