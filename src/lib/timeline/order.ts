import { z } from 'zod';
import { DEFAULT_FLOWS, entryKey, type FlowId, type TimelineEntry, type TimelineFlow } from '@/data/timeline';

/**
 * The organiser's arrangement of the timeline: for each flow, its titles'
 * keys (see `entryKey`) in display order.
 *
 * Only the order is stored — the titles themselves stay in
 * src/data/timeline.ts — so fixing a typo or adding a new release in code
 * never fights with what was saved.
 */
export type TimelineOrder = Partial<Record<FlowId, string[]>>;

/** Far more than the timeline holds; only here to bound a request body. */
const MAX_KEYS_PER_FLOW = 500;

const keyList = z.array(z.string().min(1).max(160)).max(MAX_KEYS_PER_FLOW);

export const timelineOrderSchema = z
  .object({
    xmen: keyList.optional(),
    sony: keyList.optional(),
    legacy: keyList.optional(),
    mcu: keyList.optional(),
  })
  .strict() satisfies z.ZodType<TimelineOrder>;

/**
 * Lays a saved order over the built-in flows.
 *
 * Keys that no longer match a title are skipped, and a title listed twice is
 * placed once. Any title the saved order does not mention — typically one
 * added to the code after the order was saved — goes at the end of the flow
 * it belongs to by default, so nothing ever disappears from the page.
 */
export function applyTimelineOrder(
  order: TimelineOrder | null,
  flows: readonly TimelineFlow[] = DEFAULT_FLOWS,
): TimelineFlow[] {
  const byKey = new Map<string, TimelineEntry>();
  for (const flow of flows) {
    for (const entry of flow.entries) byKey.set(entryKey(entry), entry);
  }

  const placed = new Set<string>();
  const lists = new Map<FlowId, TimelineEntry[]>(flows.map((flow) => [flow.id, []]));

  for (const flow of flows) {
    const list = lists.get(flow.id) ?? [];
    for (const key of order?.[flow.id] ?? []) {
      const entry = byKey.get(key);
      if (!entry || placed.has(key)) continue;
      placed.add(key);
      list.push(entry);
    }
  }

  for (const flow of flows) {
    const list = lists.get(flow.id) ?? [];
    for (const entry of flow.entries) {
      const key = entryKey(entry);
      if (placed.has(key)) continue;
      placed.add(key);
      list.push(entry);
    }
  }

  return flows.map((flow) => ({ ...flow, entries: lists.get(flow.id) ?? [] }));
}

/** The order currently shown by a set of flows, ready to save. */
export function orderFromFlows(flows: readonly TimelineFlow[]): TimelineOrder {
  return Object.fromEntries(flows.map((flow) => [flow.id, flow.entries.map(entryKey)]));
}
