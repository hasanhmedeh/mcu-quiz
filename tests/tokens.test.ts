import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MissingSecretError, createToken, safeEquals, verifyToken } from '@/lib/auth/tokens';

const SECRET = 'test-secret-value-at-least-16-chars';

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('session tokens', () => {
  it('round-trips a payload', () => {
    const token = createToken({ kind: 'quiz', attemptId: 'a1', userId: 'u1' }, 60);
    const payload = verifyToken(token);

    expect(payload?.kind).toBe('quiz');
    expect(payload?.attemptId).toBe('a1');
    expect(payload?.userId).toBe('u1');
  });

  it('rejects a tampered payload', () => {
    const token = createToken({ kind: 'admin' }, 60);
    const [, signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ kind: 'admin', exp: 9999999999 })).toString(
      'base64url',
    );

    expect(verifyToken(`${forgedPayload}.${signature}`)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = createToken({ kind: 'admin' }, 60);
    process.env.SESSION_SECRET = 'a-completely-different-secret-key';
    expect(verifyToken(token)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyToken(undefined)).toBeNull();
    expect(verifyToken(null)).toBeNull();
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('not-a-token')).toBeNull();
    expect(verifyToken('.signature-only')).toBeNull();
    expect(verifyToken('payload-only.')).toBeNull();
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = createToken({ kind: 'quiz' }, 60);

    vi.setSystemTime(new Date('2026-01-01T00:00:59Z'));
    expect(verifyToken(token)).not.toBeNull();

    vi.setSystemTime(new Date('2026-01-01T00:01:30Z'));
    expect(verifyToken(token)).toBeNull();
  });

  it('refuses to sign without a usable secret', () => {
    delete process.env.SESSION_SECRET;
    expect(() => createToken({ kind: 'quiz' }, 60)).toThrow(MissingSecretError);

    process.env.SESSION_SECRET = 'too-short';
    expect(() => createToken({ kind: 'quiz' }, 60)).toThrow(MissingSecretError);
  });

  it('treats an unverifiable token as invalid rather than throwing', () => {
    const token = createToken({ kind: 'quiz' }, 60);
    delete process.env.SESSION_SECRET;
    expect(verifyToken(token)).toBeNull();
  });
});

describe('safeEquals', () => {
  it('compares equal and unequal strings correctly', () => {
    expect(safeEquals('hasanhmedeh', 'hasanhmedeh')).toBe(true);
    expect(safeEquals('hasanhmedeh', 'hasanhmedej')).toBe(false);
    expect(safeEquals('short', 'a-much-longer-value')).toBe(false);
    expect(safeEquals('', '')).toBe(true);
  });
});
