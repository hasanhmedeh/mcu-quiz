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

  it('spreads across the keyspace instead of repeating', () => {
    const size = 2000;
    const batch = new Set(Array.from({ length: size }, () => generateTicketId(2026)));

    // 32^6 ≈ 1.07e9 possibilities, so ~2000 draws collide about 0.2% of the
    // time by the birthday paradox — demanding perfect uniqueness would make
    // this test flaky. A handful of collisions is normal; a broken generator
    // would produce orders of magnitude more. Real collisions are handled at
    // issue time anyway: submitExam re-rolls against Firestore.
    expect(batch.size).toBeGreaterThanOrEqual(size - 5);
  });

  it('uses the whole alphabet rather than a narrow slice', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      for (const character of generateTicketId(2026).slice('EG-2026-'.length)) {
        seen.add(character);
      }
    }
    // All 32 glyphs should appear across 3000 characters.
    expect(seen.size).toBe(32);
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
