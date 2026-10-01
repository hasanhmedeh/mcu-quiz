import 'server-only';

import type { TimelineFlow } from '@/data/timeline';
import { timelineOrderDoc } from '@/lib/firebase/collections';
import { logServerError } from '@/lib/http';
import {
  applyTimelineOrder,
  importantFromFlows,
  importantKeysSchema,
  markImportant,
  orderFromFlows,
  timelineOrderSchema,
  type TimelineOrder,
} from './order';

export interface SavedTimelineOrder {
  /** `null` when the organiser has never saved one: the built-in order applies. */
  readonly order: TimelineOrder | null;
  /** Keys of the titles marked important. */
  readonly important: string[];
  readonly updatedAt: string | null;
}

const NOTHING_SAVED: SavedTimelineOrder = { order: null, important: [], updatedAt: null };

/** One point read. A malformed document is treated as "no saved order". */
export async function readTimelineOrder(): Promise<SavedTimelineOrder> {
  const snapshot = await timelineOrderDoc().get();
  const data = snapshot.exists ? snapshot.data() : undefined;
  if (!data) return NOTHING_SAVED;

  const parsed = timelineOrderSchema.safeParse(data.flows);
  if (!parsed.success) {
    logServerError('timeline: stored order is malformed, using the default', parsed.error);
    return NOTHING_SAVED;
  }

  // A bad list of flags only loses the flags, not the order.
  const important = importantKeysSchema.safeParse(data.important ?? []);
  if (!important.success) {
    logServerError('timeline: stored important titles are malformed, ignoring them', important.error);
  }
  return {
    order: parsed.data,
    important: important.success ? important.data : [],
    updatedAt: data.updatedAt ?? null,
  };
}

/** The flows a saved order describes: its arrangement, with its titles flagged. */
export function flowsFromSaved(saved: SavedTimelineOrder): TimelineFlow[] {
  return markImportant(applyTimelineOrder(saved.order), saved.important);
}

/**
 * The flows for the public page. Never throws: if Firestore is unreachable
 * the page still renders, in the built-in order.
 */
export async function getTimelineFlows(): Promise<TimelineFlow[]> {
  try {
    return flowsFromSaved(await readTimelineOrder());
  } catch (error) {
    logServerError('timeline: could not read the saved order', error);
    return flowsFromSaved(NOTHING_SAVED);
  }
}

/**
 * Stores a new order and set of important titles. Both are normalised first —
 * unknown keys dropped, missing titles added back — so what is saved is
 * exactly what the page will show.
 */
export async function saveTimelineOrder(
  order: TimelineOrder,
  important: readonly string[],
): Promise<SavedTimelineOrder> {
  const flows = markImportant(applyTimelineOrder(order), important);
  const saved = {
    order: orderFromFlows(flows),
    important: importantFromFlows(flows),
    updatedAt: new Date().toISOString(),
  };
  await timelineOrderDoc().set({ flows: saved.order, important: saved.important, updatedAt: saved.updatedAt });
  return saved;
}

/** Back to the order in src/data/timeline.ts, with no title marked important. */
export async function resetTimelineOrder(): Promise<void> {
  await timelineOrderDoc().delete();
}
