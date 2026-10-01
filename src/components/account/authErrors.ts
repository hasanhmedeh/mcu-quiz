/** Firebase Auth error codes, turned into something a visitor can act on. */
const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That does not look like an email address.',
  'auth/missing-email': 'Enter your email address.',
  'auth/invalid-action-code': 'That sign-in link has expired or was already used. Ask for a new one.',
  'auth/expired-action-code': 'That sign-in link has expired. Ask for a new one.',
  'auth/quota-exceeded': 'Too many sign-in emails were sent today. Please try again tomorrow.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'We could not reach the sign-in service. Check your connection.',
  'auth/operation-not-allowed': 'Email-link sign-in is not switched on for this site yet.',
  'auth/unauthorized-continue-uri': 'This site’s address is not on the sign-in allow list yet.',
};

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return (typeof code === 'string' && MESSAGES[code]) || 'Something went wrong. Please try again.';
}
