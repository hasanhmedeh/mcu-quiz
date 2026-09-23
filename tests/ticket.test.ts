import { describe, expect, it } from 'vitest';
import {
  TICKET_PATTERN,
  generateTicketId,
  isValidTicketId,
  normalizeTicketInput,
} from '@/lib/quiz/ticket';

describe('generateTicketId', () => {
  it('produces the EG-YYYY-XXXXXX shape', () => {
    expect(generateTicketId(2026)).toMatch(TICKET_PATTERN);
    expect(generateTicketId(2026).startsWith('EG-2026-')).toBe(true);
  });

  it('defaults to the current year', () => {
    const year = new Date().getUTCFullYear();
    expect(generateTicketId().startsWith(`EG-${year}-`)).toBe(true);
  });

  it('omits glyphs that are ambiguous when read off a screen', () => {
    // I, L, O and U are excluded from the alphabet on purpose.
    for (let i = 0; i < 400; i += 1) {
      const body = generateTicketId(2026).slice('EG-2026-'.length);
      expect(body).not.toMatch(/[ILOU]/);
    }
  });

  it('does not repeat itself across a large batch', () => {
    const batch = new Set(Array.from({ length: 2000 }, () => generateTicketId(2026)));
    // 32^6 ≈ 1.07e9 possibilities; a collision in 2000 draws would be remarkable.
    expect(batch.size).toBe(2000);
  });
});

describe('isValidTicketId', () => {
  it('accepts a well-formed id', () => {
    expect(isValidTicketId('EG-2026-8F3K92')).toBe(true);
  });

  it('rejects malformed ids', () => {
    expect(isValidTicketId('EG-2026-8F3K9')).toBe(false);
    expect(isValidTicketId('eg-2026-8f3k92')).toBe(false);
    expect(isValidTicketId('XX-2026-8F3K92')).toBe(false);
    expect(isValidTicketId('EG-2026-8F3K9I')).toBe(false);
    expect(isValidTicketId('')).toBe(false);
    expect(isValidTicketId('../../etc/passwd')).toBe(false);
  });
});

describe('normalizeTicketInput', () => {
  it('tidies what someone types by hand', () => {
    expect(normalizeTicketInput('  eg-2026-8f3k92 ')).toBe('EG-2026-8F3K92');
    expect(normalizeTicketInput('EG-2026- 8F3K92')).toBe('EG-2026-8F3K92');
  });

  it('feeds straight into validation', () => {
    expect(isValidTicketId(normalizeTicketInput(' eg-2026-8f3k92 '))).toBe(true);
  });
});
