import 'server-only';

import type { TimelineFlow } from '@/data/timeline';
import { timelineOrderDoc } from '@/lib/firebase/collections';
import { logServerError } from '@/lib/http';
import { applyTimelineOrder, orderFromFlows, timelineOrderSchema, type TimelineOrder } from './order';

export interface SavedTimelineOrder {
  /** `null` when the organiser has never saved one: the built-in order applies. */
  readonly order: TimelineOrder | null;
  readonly updatedAt: string | null;
}

/** One point read. A malformed document is treated as "no saved order". */
export async function readTimelineOrder(): Promise<SavedTimelineOrder> {
  const snapshot = await timelineOrderDoc().get();
  const data = snapshot.exists ? snapshot.data() : undefined;
  if (!data) return { order: null, updatedAt: null };

  const parsed = timelineOrderSchema.safeParse(data.flows);
  if (!parsed.success) {
    logServerError('timeline: stored order is malformed, using the default', parsed.error);
    return { order: null, updatedAt: null };
  }
  return { order: parsed.data, updatedAt: data.updatedAt ?? null };
}

/**
 * The flows for the public page. Never throws: if Firestore is unreachable
 * the page still renders, in the built-in order.
 */
export async function getTimelineFlows(): Promise<TimelineFlow[]> {
  try {
    const { order } = await readTimelineOrder();
    return applyTimelineOrder(order);
  } catch (error) {
    logServerError('timeline: could not read the saved order', error);
    return applyTimelineOrder(null);
  }
}

/**
 * Stores a new order. It is normalised first — unknown keys dropped, missing
 * titles added back — so what is saved is exactly what the page will show.
 */
export async function saveTimelineOrder(order: TimelineOrder): Promise<SavedTimelineOrder> {
  const normalized = orderFromFlows(applyTimelineOrder(order));
  const updatedAt = new Date().toISOString();
  await timelineOrderDoc().set({ flows: normalized, updatedAt });
  return { order: normalized, updatedAt };
}

/** Back to the order in src/data/timeline.ts. */
export async function resetTimelineOrder(): Promise<void> {
  await timelineOrderDoc().delete();
}
