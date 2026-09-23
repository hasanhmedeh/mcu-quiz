import { randomInt } from 'node:crypto';

/**
 * Fisher-Yates shuffle backed by the CSPRNG, returning a new array.
 *
 * `randomInt` is used rather than `Math.random` so that exam composition and
 * option ordering cannot be predicted from anything observable in the client.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/** Picks `count` distinct items. Returns fewer only if the pool is smaller. */
export function sample<T>(items: readonly T[], count: number): T[] {
  if (count >= items.length) return shuffle(items);
  return shuffle(items).slice(0, count);
}
