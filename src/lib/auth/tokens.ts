import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal signed-token helper.
 *
 * Tokens are `base64url(payloadJson).base64url(hmacSha256)`. They are *signed,
 * not encrypted* — the payload is readable by the holder, so only
 * non-sensitive identifiers go in (an attempt id, the admin flag). Tampering
 * is what the signature prevents, and every consumer re-reads authoritative
 * state from Firestore anyway.
 */

export class MissingSecretError extends Error {
  constructor() {
    super('SESSION_SECRET is not set. Generate one with: openssl rand -base64 32');
    this.name = 'MissingSecretError';
  }
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 16) throw new MissingSecretError();
  return secret;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export interface TokenPayload {
  /** Unix seconds. */
  readonly exp: number;
  readonly [key: string]: string | number | boolean;
}

export function createToken(payload: Omit<TokenPayload, 'exp'>, ttlSeconds: number): string {
  const body: TokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = base64UrlEncode(JSON.stringify(body));
  return `${encoded}.${sign(encoded)}`;
}

/** Returns the payload, or null for anything malformed, forged or expired. */
export function verifyToken(token: string | undefined | null): TokenPayload | null {
  if (!token) return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  let expected: string;
  try {
    expected = sign(encoded);
  } catch {
    return null;
  }

  const provided = Buffer.from(signature, 'base64url');
  const computed = Buffer.from(expected, 'base64url');
  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload !== 'object' || payload === null) return null;
  const candidate = payload as TokenPayload;
  if (typeof candidate.exp !== 'number' || candidate.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return candidate;
}

/** Constant-time string comparison that tolerates differing lengths. */
export function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    // Still run a comparison so the timing does not leak the length.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
