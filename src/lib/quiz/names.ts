/**
 * Name handling.
 *
 * Normalization is deliberately conservative: we fold case, unify Unicode
 * form, strip combining accents and collapse runs of whitespace — and nothing
 * else. Hyphens, apostrophes and periods are *kept*, because removing them
 * would merge genuinely different people ("Jean-Luc" vs "Jeanluc") far more
 * often than it would help.
 */

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 40;

/** Letters, marks, digits, spaces and the handful of punctuation marks real names use. */
const ALLOWED_NAME_PATTERN = /^[\p{L}\p{M}\p{N} '’\-.]+$/u;
const HAS_LETTER_PATTERN = /\p{L}/u;

/** Collapses any Unicode whitespace run (including NBSP) into a single space. */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

/**
 * Display form: exactly what the person typed, minus stray whitespace.
 * This is what shows up in the UI and on the ticket.
 */
export function toDisplayName(raw: string): string {
  return collapseWhitespace(raw.normalize('NFC'));
}

/**
 * Comparison form: `  Hasan   HMEDEH ` and `hasan hmedeh` both become
 * `hasan hmedeh`, and `José` matches `Jose`.
 */
export function normalizeName(raw: string): string {
  return collapseWhitespace(raw)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC')
    .toLowerCase();
}

export type NameValidation =
  | { readonly ok: true; readonly displayName: string; readonly normalizedName: string }
  | { readonly ok: false; readonly error: string };

/** Full validation used by both the form and the API route. */
export function validateName(raw: unknown): NameValidation {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Please enter your name.' };
  }

  const displayName = toDisplayName(raw);

  if (displayName.length === 0) {
    return { ok: false, error: 'Please enter your name.' };
  }
  if (displayName.length < NAME_MIN_LENGTH) {
    return { ok: false, error: `Your name needs at least ${NAME_MIN_LENGTH} characters.` };
  }
  if (displayName.length > NAME_MAX_LENGTH) {
    return { ok: false, error: `Please keep your name under ${NAME_MAX_LENGTH} characters.` };
  }
  if (!ALLOWED_NAME_PATTERN.test(displayName)) {
    return { ok: false, error: 'Your name contains characters we cannot accept.' };
  }
  if (!HAS_LETTER_PATTERN.test(displayName)) {
    return { ok: false, error: 'Your name needs to contain at least one letter.' };
  }

  const normalizedName = normalizeName(displayName);
  if (normalizedName.length === 0) {
    return { ok: false, error: 'Your name contains characters we cannot accept.' };
  }

  return { ok: true, displayName, normalizedName };
}
