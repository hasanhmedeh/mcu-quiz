import { z } from 'zod';
import { validateName } from '@/lib/quiz/names';
import { startExam, type DeviceIdentity } from '@/lib/quiz/service';
import {
  addOwnedUserId,
  readDeviceCookie,
  readOwnedUserIds,
  setDeviceCookie,
  setQuizSessionCookie,
} from '@/lib/auth/session';
import { userIdForNormalizedName } from '@/lib/firebase/collections';
import {
  deviceIdFromSignals,
  deviceSignalsSchema,
  isDeviceLockEnabled,
} from '@/lib/device/identity';
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

// The device block is optional: a browser with scripting restrictions still
// gets to sit the exam, it is just recognised by its cookie alone.
const startSchema = z.object({
  name: z.string(),
  device: deviceSignalsSchema.optional(),
});

/**
 * Works out which device this is.
 *
 * Two identifiers are in play — the one the fingerprint produces now, and the
 * one stored in the cookie from last time. They usually agree. When they do
 * not (fingerprint drift after a driver update, or a cleared cookie), both are
 * checked so history is not lost, and the fingerprint's id wins for writing.
 */
async function resolveDevice(
  signals: z.infer<typeof deviceSignalsSchema> | undefined,
  userAgentValue: string | null,
): Promise<DeviceIdentity | null> {
  if (!isDeviceLockEnabled()) return null;

  const cookieId = await readDeviceCookie();
  const fingerprintId = signals ? deviceIdFromSignals(signals, userAgentValue) : null;
  const primaryId = fingerprintId ?? cookieId;
  if (!primaryId) return null;

  const alternateIds = [cookieId, fingerprintId].filter(
    (id): id is string => typeof id === 'string' && id !== primaryId,
  );

  return { primaryId, alternateIds };
}

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

    const agent = userAgent(request);
    const device = await resolveDevice(parsed.data.device, agent);

    const outcome = await startExam({
      displayName: validation.displayName,
      normalizedName: validation.normalizedName,
      userAgent: agent,
      device,
      ownedUserIds: await readOwnedUserIds(),
    });

    // Remember the device either way — including when it was just blocked, so
    // the next visit is recognised without re-running the fingerprint.
    if (device) await setDeviceCookie(device.primaryId);

    if (outcome.kind === 'blocked') {
      // Someone recognised by their device alone gets the owner cookie too, so
      // their result page opens for them from now on.
      if (outcome.ownedByRequester) {
        await addOwnedUserId(userIdForNormalizedName(validation.normalizedName));
      }

      return ok(
        {
          status: outcome.reason,
          private: !outcome.ownedByRequester,
          displayName: outcome.displayName,
          score: outcome.score,
          totalQuestions: outcome.totalQuestions ?? TOTAL_QUESTIONS,
          passed: outcome.passed,
          ticketId: outcome.ticketId,
          completedAt: outcome.completedAt,
          attemptId: outcome.attemptId,
          deviceOwnerName: outcome.deviceOwnerName,
          passingScore: PASSING_SCORE,
        },
        409,
      );
    }

    await setQuizSessionCookie({ attemptId: outcome.attemptId, userId: outcome.userId });
    await addOwnedUserId(outcome.userId);

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
