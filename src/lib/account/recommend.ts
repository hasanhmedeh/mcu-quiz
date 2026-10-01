import { entryKey, type FlowId, type TimelineEntry, type TimelineFlow } from '@/data/timeline';

export interface FlowProgress {
  readonly id: FlowId;
  readonly name: string;
  readonly color: string;
  readonly watched: number;
  readonly total: number;
}

export interface Progress {
  readonly watched: number;
  readonly total: number;
  /** Titles the organiser starred as must-watches. */
  readonly mustWatched: number;
  readonly mustTotal: number;
  readonly flows: FlowProgress[];
}

export interface Recommendation {
  readonly entry: TimelineEntry;
  readonly key: string;
  readonly flowName: string;
  /** Why it is suggested, most important first. */
  readonly reasons: string[];
}

/** How far through the timeline someone is, overall and per branch. */
export function progressOf(flows: readonly TimelineFlow[], watched: ReadonlySet<string>): Progress {
  const all = flows.flatMap((flow) => flow.entries);
  const must = all.filter((entry) => entry.important);
  const seen = (entry: TimelineEntry) => watched.has(entryKey(entry));
  return {
    watched: all.filter(seen).length,
    total: all.length,
    mustWatched: must.filter(seen).length,
    mustTotal: must.length,
    flows: flows
      .filter((flow) => flow.entries.length > 0)
      .map((flow) => ({
        id: flow.id,
        name: flow.name,
        color: flow.color,
        watched: flow.entries.filter(seen).length,
        total: flow.entries.length,
      })),
  };
}

/**
 * Lower comes first. The MCU's first title stands in for "next in the MCU"
 * for someone who has watched nothing, so it shares that rank.
 */
const RANK = { mcuNext: 0, start: 0, mustWatch: 1, branchNext: 2 } as const;

/**
 * What to watch next, in the organiser's timeline order.
 *
 * - The next unwatched title after the furthest one watched in the MCU, since
 *   that is the road that runs into Doomsday.
 * - Every unwatched title the organiser starred as a must-watch.
 * - The next unwatched title in each other branch someone has started.
 * - With nothing watched yet, the first title of the MCU, ahead of the rest.
 *
 * A title picked for more than one reason keeps them all and takes the best
 * rank. Ties go to timeline order.
 */
export function recommend(
  flows: readonly TimelineFlow[],
  watched: ReadonlySet<string>,
  limit = 4,
): Recommendation[] {
  const picks = new Map<string, Recommendation & { rank: number; position: number }>();
  let position = 0;
  const positions = new Map<string, number>();
  for (const flow of flows) for (const entry of flow.entries) positions.set(entryKey(entry), position++);

  function add(entry: TimelineEntry, flow: TimelineFlow, rank: number, reason: string) {
    const key = entryKey(entry);
    if (watched.has(key)) return;
    const existing = picks.get(key);
    if (existing) {
      picks.set(key, {
        ...existing,
        rank: Math.min(existing.rank, rank),
        reasons: rank < existing.rank ? [reason, ...existing.reasons] : [...existing.reasons, reason],
      });
      return;
    }
    picks.set(key, { entry, key, flowName: flow.name, reasons: [reason], rank, position: positions.get(key) ?? 0 });
  }

  for (const flow of flows) {
    let furthest = -1;
    flow.entries.forEach((entry, index) => {
      if (watched.has(entryKey(entry))) furthest = index;
    });
    if (furthest !== -1) {
      const next = flow.entries.slice(furthest + 1).find((entry) => !watched.has(entryKey(entry)));
      const last = flow.entries[furthest];
      if (next && last) {
        add(next, flow, flow.tier === 'mcu' ? RANK.mcuNext : RANK.branchNext, `Next in ${flow.name} after ${last.title}`);
      }
    }
    for (const entry of flow.entries) {
      if (entry.important) add(entry, flow, RANK.mustWatch, 'Starred as a must-watch by the admin');
    }
  }

  if (watched.size === 0) {
    const mcu = flows.find((flow) => flow.tier === 'mcu');
    const first = mcu?.entries[0];
    if (mcu && first) add(first, mcu, RANK.start, `Where ${mcu.name} begins`);
  }

  return [...picks.values()]
    .sort((a, b) => a.rank - b.rank || a.position - b.position)
    .slice(0, limit)
    .map(({ entry, key, flowName, reasons }) => ({ entry, key, flowName, reasons }));
}
