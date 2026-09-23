import { randomInt } from 'node:crypto';

/**
 * Crockford base32 minus the ambiguous glyphs, so a ticket read off a phone
 * screen and typed into the verifier survives the trip.
 */
const TICKET_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TICKET_BODY_LENGTH = 6;

export const TICKET_PATTERN = /^EG-\d{4}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

/** Produces an id shaped like `EG-2026-8F3K92`. */
export function generateTicketId(year: number = new Date().getUTCFullYear()): string {
  let body = '';
  for (let i = 0; i < TICKET_BODY_LENGTH; i += 1) {
    body += TICKET_ALPHABET[randomInt(TICKET_ALPHABET.length)];
  }
  return `EG-${year}-${body}`;
}

export function isValidTicketId(value: string): boolean {
  return TICKET_PATTERN.test(value);
}

/** Normalizes user-typed ticket input (lowercase, stray spaces, O/0 confusion). */
export function normalizeTicketInput(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}
