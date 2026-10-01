import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOWS, entryKey, type FlowId } from '@/data/timeline';
import {
  applyTimelineOrder,
  importantFromFlows,
  markImportant,
  orderFromFlows,
  timelineOrderSchema,
} from '@/lib/timeline/order';

function keysOf(flowId: FlowId, flows = applyTimelineOrder(null)): string[] {
  return flows.find((flow) => flow.id === flowId)?.entries.map(entryKey) ?? [];
}

const DEFAULT_ORDER = orderFromFlows(DEFAULT_FLOWS);
const mcuDefault = DEFAULT_ORDER.mcu ?? [];
const legacyDefault = DEFAULT_ORDER.legacy ?? [];

describe('timeline data', () => {
  it('gives every title a unique key', () => {
    const keys = DEFAULT_FLOWS.flatMap((flow) => flow.entries.map(entryKey));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps titles that share a name apart by year', () => {
    expect(entryKey({ title: 'Daredevil', year: 2003 })).toBe('daredevil-2003');
    expect(entryKey({ title: 'Daredevil', year: 2015 })).toBe('daredevil-2015');
  });

  it('merges the MCU films and series into one flow', () => {
    const mcu = DEFAULT_FLOWS.find((flow) => flow.id === 'mcu');
    const kinds = new Set(mcu?.entries.map((entry) => entry.kind));
    expect(kinds.has('film')).toBe(true);
    expect(kinds.has('series')).toBe(true);
  });
});

describe('applyTimelineOrder', () => {
  it('returns the built-in order when nothing is saved', () => {
    expect(orderFromFlows(applyTimelineOrder(null))).toEqual(DEFAULT_ORDER);
  });

  it('reorders titles inside a flow', () => {
    const reversed = [...mcuDefault].reverse();
    expect(keysOf('mcu', applyTimelineOrder({ ...DEFAULT_ORDER, mcu: reversed }))).toEqual(reversed);
  });

  it('moves a title to another flow', () => {
    const blade = legacyDefault[0] as string;
    const order = {
      ...DEFAULT_ORDER,
      legacy: legacyDefault.slice(1),
      mcu: [blade, ...mcuDefault],
    };
    const flows = applyTimelineOrder(order);
    expect(keysOf('mcu', flows)[0]).toBe(blade);
    expect(keysOf('legacy', flows)).not.toContain(blade);
  });

  it('ignores unknown keys and places a title listed twice only once', () => {
    const first = mcuDefault[0] as string;
    const flows = applyTimelineOrder({
      ...DEFAULT_ORDER,
      mcu: ['not-a-real-title-1999', ...mcuDefault],
      sony: [first, ...(DEFAULT_ORDER.sony ?? [])],
    });
    expect(keysOf('mcu', flows)).not.toContain('not-a-real-title-1999');
    const all = flows.flatMap((flow) => flow.entries.map(entryKey));
    expect(all.filter((key) => key === first)).toHaveLength(1);
  });

  it('adds titles the saved order does not mention to the end of their own flow', () => {
    const [missing, ...rest] = mcuDefault;
    const flows = applyTimelineOrder({ mcu: rest });
    expect(keysOf('mcu', flows).at(-1)).toBe(missing);
    // Flows missing from the saved order keep their built-in order.
    expect(keysOf('xmen', flows)).toEqual(DEFAULT_ORDER.xmen);
  });

  it('never loses or duplicates a title', () => {
    const shuffled = { mcu: [...legacyDefault, ...mcuDefault].reverse(), legacy: [] };
    const total = DEFAULT_FLOWS.reduce((sum, flow) => sum + flow.entries.length, 0);
    const flows = applyTimelineOrder(shuffled);
    const all = flows.flatMap((flow) => flow.entries.map(entryKey));
    expect(all).toHaveLength(total);
    expect(new Set(all).size).toBe(total);
  });
});

describe('markImportant', () => {
  it('flags only the listed titles, wherever they sit', () => {
    const blade = legacyDefault[0] as string;
    const first = mcuDefault[0] as string;
    const flows = markImportant(applyTimelineOrder(null), [first, blade, 'not-a-real-title-1999']);
    expect(importantFromFlows(flows).sort()).toEqual([blade, first].sort());
  });

  it('clears flags that are no longer listed', () => {
    const first = mcuDefault[0] as string;
    const flagged = markImportant(applyTimelineOrder(null), [first]);
    const cleared = markImportant(flagged, []);
    expect(importantFromFlows(cleared)).toEqual([]);
    expect(cleared.flatMap((flow) => flow.entries).some((entry) => 'important' in entry)).toBe(false);
  });

  it('leaves the order untouched', () => {
    const flows = markImportant(applyTimelineOrder(null), mcuDefault.slice(0, 3));
    expect(orderFromFlows(flows)).toEqual(DEFAULT_ORDER);
  });
});

describe('timelineOrderSchema', () => {
  it('accepts a saved order', () => {
    expect(timelineOrderSchema.safeParse(DEFAULT_ORDER).success).toBe(true);
  });

  it('rejects unknown branches and non-string keys', () => {
    expect(timelineOrderSchema.safeParse({ dc: ['batman-1989'] }).success).toBe(false);
    expect(timelineOrderSchema.safeParse({ mcu: [42] }).success).toBe(false);
  });
});
