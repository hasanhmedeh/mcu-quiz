import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { IdTokenError, verifyIdTokenWithKeys } from '@/lib/auth/firebaseIdToken';

const PROJECT = 'quiz-test';
const NOW = 1_800_000_000;
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEYS = { 'key-1': publicKey };

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A token shaped exactly like Firebase's, signed with the test key unless told otherwise. */
function token(
  overrides: Record<string, unknown> = {},
  { kid = 'key-1', alg = 'RS256', key = privateKey }: { kid?: string; alg?: string; key?: typeof privateKey } = {},
) {
  const header = b64({ alg, kid, typ: 'JWT' });
  const payload = b64({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    auth_time: NOW - 10,
    user_id: 'user-1',
    sub: 'user-1',
    iat: NOW - 10,
    exp: NOW + 3590,
    email: 'fan@example.com',
    email_verified: true,
    firebase: { sign_in_provider: 'password' },
    ...overrides,
  });
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(key).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

const verify = (jwt: string) => verifyIdTokenWithKeys(jwt, PROJECT, KEYS, NOW);

describe('verifyIdTokenWithKeys', () => {
  it('accepts a genuine token and reads the user from it', () => {
    expect(verify(token())).toEqual({
      uid: 'user-1',
      email: 'fan@example.com',
      emailVerified: true,
      authTime: NOW - 10,
    });
  });

  it('refuses a token signed by someone else', () => {
    expect(() => verify(token({}, { key: other.privateKey }))).toThrow(/bad signature/);
  });

  it('refuses a token whose payload was edited after signing', () => {
    const [header, , signature] = token().split('.');
    const forged = `${header}.${b64({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: 'admin', exp: NOW + 60, iat: NOW, auth_time: NOW })}.${signature}`;
    expect(() => verify(forged)).toThrow(/bad signature/);
  });

  it('refuses an unknown key id and any algorithm but RS256', () => {
    expect(() => verify(token({}, { kid: 'retired-key' }))).toThrow(/unknown or expired key/);
    expect(() => verify(token({}, { alg: 'none' }))).toThrow(/unexpected algorithm/);
  });

  it('refuses a token for another project', () => {
    expect(() => verify(token({ aud: 'someone-else' }))).toThrow(/not quiz-test/);
    expect(() => verify(token({ iss: 'https://securetoken.google.com/someone-else' }))).toThrow(/wrong issuer/);
  });

  it('refuses expired tokens and ones from the future, allowing a little clock skew', () => {
    expect(() => verify(token({ exp: NOW - 3600 }))).toThrow(/expired/);
    expect(() => verify(token({ iat: NOW + 3600 }))).toThrow(/future/);
    expect(verify(token({ exp: NOW - 60 })).uid).toBe('user-1');
  });

  it('refuses a token without a subject, and garbage', () => {
    expect(() => verify(token({ sub: '' }))).toThrow(/missing subject/);
    expect(() => verify('not-a-token')).toThrow(IdTokenError);
    expect(() => verify('a.b.c')).toThrow(IdTokenError);
  });

  it('reports an unverified email as such rather than trusting it', () => {
    expect(verify(token({ email_verified: false })).emailVerified).toBe(false);
  });
});
