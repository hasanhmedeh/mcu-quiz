import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOWS, DOOMSDAY, entryKey } from '@/data/timeline';
import { TRAILERS, trailerIdFor, trailerSearchUrl } from '@/data/trailers';

const titles = [...DEFAULT_FLOWS.flatMap((flow) => flow.entries), DOOMSDAY];

describe('trailers', () => {
  it('has a trailer for every title on the timeline', () => {
    const missing = titles.filter((entry) => trailerIdFor(entry) === null).map(entryKey);
    expect(missing).toEqual([]);
  });

  it('only lists titles that are on the timeline', () => {
    const keys = new Set(titles.map(entryKey));
    expect(Object.keys(TRAILERS).filter((key) => !keys.has(key))).toEqual([]);
  });

  it('stores YouTube video ids', () => {
    for (const id of Object.values(TRAILERS)) expect(id).toMatch(/^[A-Za-z0-9_-]{11}$/);
  });

  it('falls back to a YouTube search for an unknown title', () => {
    const entry = { title: 'Blade', year: 2027 };
    expect(trailerIdFor(entry)).toBeNull();
    expect(trailerSearchUrl(entry)).toBe(
      'https://www.youtube.com/results?search_query=Blade%202027%20official%20trailer',
    );
  });
});
