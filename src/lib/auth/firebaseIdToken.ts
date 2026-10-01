import { X509Certificate, createVerify, type KeyObject } from 'node:crypto';

/**
 * Verifies the ID tokens Firebase Auth issues after an email-link sign-in,
 * following Firebase's documented checks for third-party verification:
 * an RS256 signature by one of Google's current keys, this project as the
 * audience, Google's issuer, a subject, and sane times.
 *
 * Done with `node:crypto` rather than `firebase-admin/auth`, whose token
 * library chain failed to load on the deployed server. No Firebase SDK is
 * involved here, so it runs on any Node version.
 */

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
/** Leeway for clocks that disagree by a little. */
const CLOCK_SKEW_SECONDS = 5 * 60;

export interface FirebaseIdToken {
  readonly uid: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  /** When the user actually signed in (Unix seconds). */
  readonly authTime: number;
}

/** A token that was refused, and why (for the server log, never the user). */
export class IdTokenError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'IdTokenError';
  }
}

function decodePart(part: string | undefined, what: string): Record<string, unknown> {
  if (!part) throw new IdTokenError(`missing ${what}`);
  try {
    const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
  } catch {
    // Reported below.
  }
  throw new IdTokenError(`unreadable ${what}`);
}

/**
 * The checks themselves, given Google's keys by key id. Pure, so it can be
 * tested with keys generated on the spot.
 */
export function verifyIdTokenWithKeys(
  token: string,
  projectId: string,
  keys: Readonly<Record<string, KeyObject>>,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): FirebaseIdToken {
  const parts = token.split('.');
  if (parts.length !== 3) throw new IdTokenError('not a JWT');
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  const header = decodePart(headerPart, 'header');
  if (header.alg !== 'RS256') throw new IdTokenError(`unexpected algorithm ${String(header.alg)}`);
  const key = typeof header.kid === 'string' ? keys[header.kid] : undefined;
  if (!key) throw new IdTokenError('signed with an unknown or expired key');

  const signatureOk = createVerify('RSA-SHA256')
    .update(`${headerPart}.${payloadPart}`)
    .verify(key, Buffer.from(signaturePart, 'base64url'));
  if (!signatureOk) throw new IdTokenError('bad signature');

  const payload = decodePart(payloadPart, 'payload');
  if (payload.aud !== projectId) throw new IdTokenError(`issued for project ${String(payload.aud)}, not ${projectId}`);
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new IdTokenError('wrong issuer');
  if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 128) {
    throw new IdTokenError('missing subject');
  }
  const exp = Number(payload.exp);
  const iat = Number(payload.iat);
  const authTime = Number(payload.auth_time);
  if (!Number.isFinite(exp) || exp + CLOCK_SKEW_SECONDS < nowSeconds) throw new IdTokenError('expired');
  if (!Number.isFinite(iat) || iat - CLOCK_SKEW_SECONDS > nowSeconds) throw new IdTokenError('issued in the future');
  if (!Number.isFinite(authTime) || authTime - CLOCK_SKEW_SECONDS > nowSeconds) {
    throw new IdTokenError('signed in in the future');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
    authTime,
  };
}

let cachedKeys: { keys: Record<string, KeyObject>; expiresAt: number } | null = null;

/** Google's current signing keys, cached for as long as Google says they are good. */
async function googleKeys(): Promise<Record<string, KeyObject>> {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;

  const response = await fetch(CERTS_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not fetch Google's signing keys (HTTP ${response.status})`);
  const certificates = (await response.json()) as Record<string, string>;
  const keys = Object.fromEntries(
    Object.entries(certificates).map(([kid, pem]) => [kid, new X509Certificate(pem).publicKey]),
  );

  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1]);
  cachedKeys = { keys, expiresAt: Date.now() + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge * 1000 : 60 * 60 * 1000) };
  return keys;
}

/** Verifies a Firebase ID token for `projectId`. Throws `IdTokenError` when it is refused. */
export async function verifyFirebaseIdToken(token: string, projectId: string): Promise<FirebaseIdToken> {
  return verifyIdTokenWithKeys(token, projectId, await googleKeys());
}
