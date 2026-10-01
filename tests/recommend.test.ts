import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOWS, entryKey, type FlowId } from '@/data/timeline';
import { progressOf, recommend } from '@/lib/account/recommend';
import { markImportant } from '@/lib/timeline/order';

function keysOf(flowId: FlowId): string[] {
  return DEFAULT_FLOWS.find((flow) => flow.id === flowId)?.entries.map(entryKey) ?? [];
}

const mcu = keysOf('mcu');
const sony = keysOf('sony');

describe('recommend', () => {
  it('starts a new viewer at the beginning of the MCU', () => {
    const picks = recommend(DEFAULT_FLOWS, new Set());
    expect(picks.map((pick) => pick.key)).toEqual([mcu[0]]);
  });

  it('still starts a new viewer at the MCU when there are must-watches elsewhere', () => {
    const flows = markImportant(DEFAULT_FLOWS, [sony[0], sony[1]] as string[]);
    const keys = recommend(flows, new Set()).map((pick) => pick.key);
    expect(keys).toEqual([mcu[0], sony[0], sony[1]]);
  });

  it('suggests the next MCU title after the furthest one watched, first', () => {
    const watched = new Set([mcu[0], mcu[2]] as string[]);
    const [first] = recommend(DEFAULT_FLOWS, watched);
    expect(first?.key).toBe(mcu[3]);
    expect(first?.reasons[0]).toMatch(/^Next in /);
  });

  it('continues each other branch that has been started', () => {
    const watched = new Set([mcu[0], sony[0]] as string[]);
    const keys = recommend(DEFAULT_FLOWS, watched).map((pick) => pick.key);
    expect(keys).toEqual([mcu[1], sony[1]]);
  });

  it('puts starred must-watches right after the next MCU title, and never repeats one', () => {
    const starred = [mcu[10], sony[2]] as string[];
    const flows = markImportant(DEFAULT_FLOWS, starred);
    const picks = recommend(flows, new Set([mcu[0]] as string[]), 10);
    expect(picks.map((pick) => pick.key)).toEqual([mcu[1], sony[2], mcu[10]]);
    expect(picks[1]?.reasons).toEqual(['Starred as a must-watch by the admin']);
  });

  it('keeps every reason for a title picked twice', () => {
    const flows = markImportant(DEFAULT_FLOWS, [mcu[1] as string]);
    const [first] = recommend(flows, new Set([mcu[0]] as string[]));
    expect(first?.key).toBe(mcu[1]);
    expect(first?.reasons).toHaveLength(2);
  });

  it('never suggests something already watched, and stops when everything is', () => {
    const all = new Set(DEFAULT_FLOWS.flatMap((flow) => flow.entries.map(entryKey)));
    expect(recommend(markImportant(DEFAULT_FLOWS, [...all]), all)).toEqual([]);
  });

  it('respects the limit', () => {
    const flows = markImportant(DEFAULT_FLOWS, mcu.slice(5, 15));
    expect(recommend(flows, new Set(), 3)).toHaveLength(3);
  });
});

describe('progressOf', () => {
  it('counts watched titles overall, per branch and among must-watches', () => {
    const flows = markImportant(DEFAULT_FLOWS, [mcu[0], mcu[1]] as string[]);
    const progress = progressOf(flows, new Set([mcu[0], sony[0]] as string[]));
    expect(progress.watched).toBe(2);
    expect(progress.mustWatched).toBe(1);
    expect(progress.mustTotal).toBe(2);
    expect(progress.flows.find((flow) => flow.id === 'mcu')?.watched).toBe(1);
    expect(progress.total).toBe(DEFAULT_FLOWS.reduce((sum, flow) => sum + flow.entries.length, 0));
  });
});
