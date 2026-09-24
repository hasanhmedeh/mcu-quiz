import { isAdminAuthenticated } from '@/lib/auth/session';
import { buildLiveAttempts, LIVE_ATTEMPT_LIMIT } from '@/lib/admin/service';
import { attemptsCollection } from '@/lib/firebase/collections';
import { fail, logServerError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serverless hosts cap how long one response may stay open. When the cap is
 * reached the stream simply ends and the browser's EventSource reconnects on
 * its own, so the organiser never notices.
 */
export const maxDuration = 300;

/** Keeps proxies from closing a quiet connection. */
const HEARTBEAT_MS = 15_000;

/**
 * The organiser's live feed, as Server-Sent Events.
 *
 * A Firestore listener on the newest attempts pushes a fresh snapshot every
 * time any of them changes — an answer picked, an exam started or submitted.
 * One-way server-to-browser push is all the live view needs, and unlike a
 * WebSocket it works on serverless hosting.
 */
export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return fail('unauthorized', 'You need to sign in as the organiser first.', 401);
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      // Reconnect quickly if the stream drops.
      write('retry: 3000\n\n');

      const unsubscribe = attemptsCollection()
        .orderBy('startedAt', 'desc')
        .limit(LIVE_ATTEMPT_LIMIT)
        .onSnapshot(
          (snapshot) => {
            const attempts = buildLiveAttempts(
              snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
              Date.now(),
            );
            write(`event: attempts\ndata: ${JSON.stringify(attempts)}\n\n`);
          },
          (error) => {
            logServerError('admin/live: listener failed', error);
            write(`event: failure\ndata: ${JSON.stringify({ message: 'The live feed stopped.' })}\n\n`);
            cleanup();
          },
        );

      const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };

      request.signal.addEventListener('abort', () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
