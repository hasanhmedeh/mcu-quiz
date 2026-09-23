import { z } from 'zod';
import { validateName } from '@/lib/quiz/names';
import { startExam } from '@/lib/quiz/service';
import { setQuizSessionCookie } from '@/lib/auth/session';
import { consumeRateLimit, rateLimitKey } from '@/lib/auth/rateLimit';
import { FirebaseConfigError } from '@/lib/firebase/admin';
import {
  GENERIC_ERROR_MESSAGE,
  clientAddress,
  fail,
  logServerError,
  ok,
  readJsonBody,
  userAgent,
} from '@/lib/http';
import { PASSING_SCORE, TOTAL_QUESTIONS } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startSchema = z.object({ name: z.string() });

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return fail('invalid_request', 'Please enter your name to begin.', 400);
  }

  const validation = validateName(parsed.data.name);
  if (!validation.ok) {
    return fail('invalid_name', validation.error, 400);
  }

  try {
    // Generous enough that nobody taking the quiz will notice, tight enough
    // to stop someone scripting the endpoint to farm question sets.
    const limit = await consumeRateLimit(
      rateLimitKey('quiz-start', clientAddress(request)),
      20,
      60 * 10,
    );
    if (!limit.allowed) {
      return fail(
        'rate_limited',
        'Too many attempts from this connection. Please wait a few minutes.',
        429,
      );
    }

    const outcome = await startExam({
      displayName: validation.displayName,
      normalizedName: validation.normalizedName,
      userAgent: userAgent(request),
    });

    if (outcome.kind === 'blocked') {
      return ok(
        {
          status: 'already_completed' as const,
          displayName: outcome.displayName,
          score: outcome.score,
          totalQuestions: outcome.totalQuestions ?? TOTAL_QUESTIONS,
          passed: outcome.passed,
          ticketId: outcome.ticketId,
          completedAt: outcome.completedAt,
          attemptId: outcome.attemptId,
          passingScore: PASSING_SCORE,
        },
        409,
      );
    }

    await setQuizSessionCookie({ attemptId: outcome.attemptId, userId: outcome.userId });

    return ok({
      status: 'started' as const,
      attemptId: outcome.attemptId,
      displayName: outcome.displayName,
      attemptNumber: outcome.attemptNumber,
      resumed: outcome.resumed,
      totalQuestions: TOTAL_QUESTIONS,
      passingScore: PASSING_SCORE,
      questions: outcome.questions,
    });
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      logServerError('quiz/start: firebase not configured', error);
      return fail(
        'service_unavailable',
        'The quiz is not connected to its database yet. Please tell the organiser.',
        503,
      );
    }
    logServerError('quiz/start', error);
    return fail('server_error', GENERIC_ERROR_MESSAGE, 500);
  }
}
