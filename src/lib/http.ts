import { NextResponse } from 'next/server';

export interface ApiErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}

/** Successful JSON response. `no-store` keeps quiz payloads out of caches. */
export function ok<T extends object>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Error response with a deliberately user-safe message. Internal details go
 * to the server log via `logServerError`, never into the body.
 */
export function fail(code: string, message: string, status: number): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GENERIC_ERROR_MESSAGE =
  'Something went wrong on our end. Please try again in a moment.';

/** Single place where server-side failures are written out. */
export function logServerError(context: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[mcu-quiz] ${context} :: ${detail}`);
  if (error instanceof Error && error.stack) console.error(error.stack);
}

/** Reads the caller's JSON body, tolerating an empty or malformed payload. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Best-effort client address from the proxy headers Vercel sets. */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function userAgent(request: Request): string | null {
  const value = request.headers.get('user-agent');
  if (!value) return null;
  // Truncated: enough to tell a phone from a laptop when debugging, no more.
  return value.slice(0, 256);
}
