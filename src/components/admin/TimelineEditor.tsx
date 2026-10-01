'use client';

import { useEffect, useMemo, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { AdminNav } from './AdminNav';
import { EmptyState, StatCard } from './parts';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Alert, PageShell, SectionLabel, Spinner } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import {
  DEFAULT_FLOWS,
  entryKey,
  yearLabel,
  type FlowId,
  type TimelineEntry,
  type TimelineFlow,
  type TitleKind,
} from '@/data/timeline';

const KIND_LABEL: Record<TitleKind, string> = {
  film: 'Film',
  series: 'Series',
  animated: 'Animated',
  special: 'Special',
};

const KIND_CHIP: Record<TitleKind, string> = {
  film: 'border-[rgba(62,166,255,0.35)] bg-[rgba(62,166,255,0.12)] text-[color:var(--color-ion-soft)]',
  series: 'border-[rgba(168,85,247,0.4)] bg-[rgba(168,85,247,0.13)] text-[color:var(--color-arc-soft)]',
  animated: 'border-[rgba(245,197,66,0.4)] bg-[rgba(245,197,66,0.12)] text-[color:var(--color-gold)]',
  special: 'border-[rgba(255,59,74,0.35)] bg-[rgba(255,59,74,0.12)] text-[color:var(--color-ember-soft)]',
};

type KindFilter = 'all' | TitleKind;

const FILTERS: ReadonlyArray<{ id: KindFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'film', label: 'Films' },
  { id: 'series', label: 'Series' },
  { id: 'animated', label: 'Animated' },
  { id: 'special', label: 'Specials' },
];

type Notice = { tone: 'info' | 'error'; text: string };

/** A row as shown: the title plus where it really sits in its branch. */
interface Row {
  entry: TimelineEntry;
  key: string;
  index: number;
}

/** The same shape the API stores: each flow's title keys in order. */
function orderOf(flows: readonly TimelineFlow[]): Record<string, string[]> {
  return Object.fromEntries(flows.map((flow) => [flow.id, flow.entries.map(entryKey)]));
}

/** Keys of the titles marked important, as the API stores them. */
function importantOf(flows: readonly TimelineFlow[]): string[] {
  return flows.flatMap((flow) => flow.entries.filter((entry) => entry.important).map(entryKey));
}

/** Everything Save sends, for spotting unsaved changes. */
function snapshotOf(flows: readonly TimelineFlow[]): string {
  return JSON.stringify({ order: orderOf(flows), important: importantOf(flows) });
}

function formatSaved(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Reorder the public timeline: drag a title, or use its arrows, and switch
 * its branch from the Branch menu. The star marks a title important, which
 * tags it on the page. Nothing changes on the page until Save.
 */
export function TimelineEditor({
  initialFlows,
  initialUpdatedAt,
  customised: initialCustomised,
  loadError,
}: {
  initialFlows: TimelineFlow[];
  initialUpdatedAt: string | null;
  customised: boolean;
  loadError: string | null;
}) {
  const [flows, setFlows] = useState(initialFlows);
  const [savedFlows, setSavedFlows] = useState(initialFlows);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [customised, setCustomised] = useState(initialCustomised);
  const [activeId, setActiveId] = useState<FlowId>('mcu');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<KindFilter>('all');
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const dirty = useMemo(
    () => snapshotOf(flows) !== snapshotOf(savedFlows),
    [flows, savedFlows],
  );

  // A half-finished rearrangement is easy to lose by clicking away.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const stats = useMemo(() => {
    const all = flows.flatMap((flow) => flow.entries);
    const count = (kind: TitleKind) => all.filter((entry) => entry.kind === kind).length;
    return {
      total: all.length,
      films: count('film'),
      series: count('series'),
      other: count('animated') + count('special'),
      important: all.filter((entry) => entry.important).length,
    };
  }, [flows]);

  const active = flows.find((flow) => flow.id === activeId) ?? flows[0];
  const entries = active?.entries ?? [];

  const needle = query.trim().toLowerCase();
  const filtering = needle !== '' || filter !== 'all';
  const rows: Row[] = entries
    .map((entry, index) => ({ entry, key: entryKey(entry), index }))
    .filter(
      ({ entry }) =>
        (filter === 'all' || entry.kind === filter) &&
        (needle === '' || entry.title.toLowerCase().includes(needle) || String(entry.year).includes(needle)),
    );

  if (!active) return null;

  function edit(update: (flows: TimelineFlow[]) => TimelineFlow[]) {
    setFlows(update);
    setNotice(null);
  }

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= entries.length) return;
    edit((previous) =>
      previous.map((flow) => {
        if (flow.id !== activeId) return flow;
        const next = [...flow.entries];
        const [item] = next.splice(from, 1);
        if (item) next.splice(to, 0, item);
        return { ...flow, entries: next };
      }),
    );
  }

  /** Into another branch, at the spot its year puts it. */
  function moveToFlow(index: number, targetId: FlowId) {
    const item = entries[index];
    if (!item || targetId === activeId) return;
    edit((previous) =>
      previous.map((flow) => {
        if (flow.id === activeId) {
          return { ...flow, entries: flow.entries.filter((_, i) => i !== index) };
        }
        if (flow.id === targetId) {
          const at = flow.entries.findIndex((entry) => entry.year > item.year);
          const next = [...flow.entries];
          next.splice(at === -1 ? next.length : at, 0, item);
          return { ...flow, entries: next };
        }
        return flow;
      }),
    );
    const target = flows.find((flow) => flow.id === targetId);
    setNotice({ tone: 'info', text: `${item.title} moved to ${target?.name ?? 'another branch'}. Save to publish it.` });
  }

  function toggleImportant(index: number) {
    edit((previous) =>
      previous.map((flow) =>
        flow.id === activeId
          ? {
              ...flow,
              entries: flow.entries.map((entry, i) => (i === index ? { ...entry, important: !entry.important } : entry)),
            }
          : flow,
      ),
    );
  }

  /** Stable, so titles from the same year keep their current order. */
  function sortByYear() {
    edit((previous) =>
      previous.map((flow) =>
        flow.id === activeId ? { ...flow, entries: [...flow.entries].sort((a, b) => a.year - b.year) } : flow,
      ),
    );
  }

  async function save() {
    setBusy('save');
    setNotice(null);
    try {
      const response = await fetch('/api/admin/timeline', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderOf(flows), important: importantOf(flows) }),
      });
      const body = (await response.json().catch(() => null)) as
        | { updatedAt?: string; error?: { message?: string } }
        | null;
      if (!response.ok) {
        setNotice({ tone: 'error', text: body?.error?.message ?? 'The order could not be saved.' });
        return;
      }
      setSavedFlows(flows);
      setUpdatedAt(body?.updatedAt ?? new Date().toISOString());
      setCustomised(true);
      setNotice({ tone: 'info', text: 'Saved. The timeline page now shows these changes.' });
    } catch {
      setNotice({ tone: 'error', text: 'We could not reach the server. Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy('reset');
    setNotice(null);
    try {
      const response = await fetch('/api/admin/timeline', { method: 'DELETE' });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) {
        setNotice({ tone: 'error', text: body?.error?.message ?? 'The order could not be reset.' });
        return;
      }
      setFlows(DEFAULT_FLOWS);
      setSavedFlows(DEFAULT_FLOWS);
      setUpdatedAt(null);
      setCustomised(false);
      setNotice({ tone: 'info', text: 'Back to the built-in release order.' });
    } catch {
      setNotice({ tone: 'error', text: 'We could not reach the server. Please try again.' });
    } finally {
      setBusy(null);
      setConfirmReset(false);
    }
  }

  function endDrag() {
    setDragFrom(null);
    setDropAt(null);
  }

  function drop() {
    if (dragFrom !== null && dropAt !== null) {
      // Dropping below the dragged row: the gap it leaves shifts everything up by one.
      move(dragFrom, dropAt > dragFrom ? dropAt - 1 : dropAt);
    }
    endDrag();
  }

  /** Drag handlers for one row. Off while filtered: the gaps would make drops ambiguous. */
  function dragProps(row: Row) {
    if (filtering) return {};
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.dataTransfer.effectAllowed = 'move';
        // Firefox will not start a drag without some data.
        event.dataTransfer.setData('text/plain', row.key);
        setDragFrom(row.index);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (dragFrom === null) return;
        event.preventDefault();
        const box = event.currentTarget.getBoundingClientRect();
        setDropAt(event.clientY < box.top + box.height / 2 ? row.index : row.index + 1);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        drop();
      },
      onDragEnd: endDrag,
    };
  }

  function rowState(row: Row) {
    return cn(
      dragFrom === row.index && 'order-dragging',
      dropAt === row.index && 'order-drop-before',
      dropAt === row.index + 1 && row.index === entries.length - 1 && 'order-drop-after',
    );
  }

  const controls = (row: Row) => (
    <>
      <button
        type="button"
        className={cn('order-button', row.entry.important && 'order-button-on')}
        onClick={() => toggleImportant(row.index)}
        aria-pressed={row.entry.important === true}
        aria-label={`Star ${row.entry.title}`}
        title={row.entry.important ? 'Starred. Click to remove the star.' : 'Star as a must-watch'}
      >
        {row.entry.important ? '★' : '☆'}
      </button>
      <button
        type="button"
        className="order-button"
        onClick={() => move(row.index, row.index - 1)}
        disabled={row.index === 0}
        aria-label={`Move ${row.entry.title} earlier`}
      >
        ↑
      </button>
      <button
        type="button"
        className="order-button"
        onClick={() => move(row.index, row.index + 1)}
        disabled={row.index === entries.length - 1}
        aria-label={`Move ${row.entry.title} later`}
      >
        ↓
      </button>
    </>
  );

  const branchSelect = (row: Row) => (
    <select
      className="order-select"
      value={activeId}
      aria-label={`Branch for ${row.entry.title}`}
      onChange={(event) => moveToFlow(row.index, event.target.value as FlowId)}
    >
      {flows.map((flow) => (
        <option key={flow.id} value={flow.id}>
          {flow.name}
        </option>
      ))}
    </select>
  );

  return (
    <PageShell headerRight={<AdminNav current="timeline" />}>
      {confirmReset ? (
        <ConfirmDialog
          title="Reset the timeline order?"
          confirmLabel="Reset order"
          busy={busy === 'reset'}
          busyLabel="Resetting…"
          icon="warning"
          onConfirm={() => void reset()}
          onCancel={() => setConfirmReset(false)}
        >
          The saved order is deleted and every title goes back to its built-in branch and release
          order, with none marked important. This cannot be undone.
        </ConfirmDialog>
      ) : null}

      <div className="fade-up">
        <SectionLabel>Organiser dashboard</SectionLabel>
        <h1 className="display mt-3 text-2xl font-black text-white sm:text-3xl">
          The road to Doomsday
        </h1>
        <p className="mt-2 text-sm text-[color:var(--color-mist)]">
          Arrange the films and series on the{' '}
          <Link href="/timeline" target="_blank" className="text-[color:var(--color-ion-soft)] underline">
            timeline page
          </Link>
          . Drag a title or use its arrows to reorder it; change its branch to move it; use its
          ☆ to star it as a must-watch, which the page explains to visitors. Nothing changes on
          the page until you save.
        </p>
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          disabled={!customised || busy !== null}
          title="Delete the saved order and go back to the release order built into the site"
          className="mt-3 rounded-lg border border-[rgba(62,166,255,0.45)] bg-[rgba(62,166,255,0.14)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Reset to built-in order
        </button>
      </div>

      {/* ---------------- Statistics ---------------- */}
      <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Titles" value={String(stats.total)} />
        <StatCard label="Films" value={String(stats.films)} />
        <StatCard label="Series" value={String(stats.series)} />
        <StatCard label="Animated & specials" value={String(stats.other)} />
        <StatCard label="Important" value={String(stats.important)} />
        <StatCard label="Order" value={customised ? 'Custom' : 'Built-in'} tone={customised ? 'pass' : undefined} />
      </dl>

      <p className="mt-3 text-xs text-[color:var(--color-mist)]">
        {customised && updatedAt
          ? `Custom order last saved ${formatSaved(updatedAt)}.`
          : 'The page is showing the built-in release order.'}
      </p>

      {loadError ? (
        <Alert tone="warning" className="mt-5">
          {loadError}
        </Alert>
      ) : null}

      {notice ? (
        <Alert tone={notice.tone === 'error' ? 'error' : 'info'} className="mt-5">
          {notice.text}
        </Alert>
      ) : null}

      {/* ---------------- Save bar ---------------- */}
      <div className="panel sticky top-2 z-20 mt-6 flex flex-wrap items-center gap-3 px-4 py-3">
        <p className="flex items-center gap-2 text-sm" aria-live="polite">
          <span
            aria-hidden="true"
            className={cn(
              'h-2 w-2 rounded-full',
              dirty ? 'bg-[color:var(--color-gold)]' : 'bg-[#6ef2b0]',
            )}
          />
          <span className={dirty ? 'text-white' : 'text-[color:var(--color-mist)]'}>
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
        </p>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="btn btn-ghost min-h-0 px-4 py-2 text-sm"
            onClick={() => edit(() => savedFlows)}
            disabled={!dirty || busy !== null}
          >
            Discard
          </button>
          <button
            type="button"
            className="btn btn-primary min-h-0 px-4 py-2 text-sm"
            onClick={() => void save()}
            disabled={!dirty || busy !== null}
          >
            {busy === 'save' ? <Spinner label="Saving…" /> : 'Save changes'}
          </button>
        </div>
      </div>

      {/* ---------------- Tabs ---------------- */}
      <div
        role="tablist"
        aria-label="Branches"
        // Same inset-shadow divider as the dashboard tabs, so the underline never overflows.
        className="mt-8 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_rgba(143,208,255,0.16)] scrollbar-none [&::-webkit-scrollbar]:hidden"
      >
        {flows.map((flow) => (
          <button
            key={flow.id}
            id={`timeline-tab-${flow.id}`}
            type="button"
            role="tab"
            aria-selected={flow.id === activeId}
            aria-controls="timeline-panel"
            onClick={() => {
              setActiveId(flow.id);
              endDrag();
            }}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
              flow.id === activeId
                ? 'border-[color:var(--color-ion)] text-white'
                : 'border-transparent text-[color:var(--color-mist)] hover:text-white',
            )}
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: flow.color }} />
            {flow.name}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[0.65rem]',
                flow.id === activeId
                  ? 'bg-[rgba(62,166,255,0.2)] text-white'
                  : 'bg-[rgba(143,208,255,0.1)] text-[color:var(--color-mist)]',
              )}
            >
              {flow.entries.length}
            </span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id="timeline-panel" aria-labelledby={`timeline-tab-${activeId}`}>
        {/* ---------------- Search & filter ---------------- */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="sm:flex-1">
            <label htmlFor="timeline-search" className="sr-only">
              Search titles in this branch
            </label>
            <input
              id="timeline-search"
              className="field"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a title or year, e.g. Loki"
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={filter === option.id}
                className={cn(
                  'rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors',
                  filter === option.id
                    ? 'border-[rgba(62,166,255,0.7)] bg-[rgba(62,166,255,0.18)] text-white'
                    : 'border-[rgba(143,208,255,0.22)] bg-[rgba(13,16,36,0.6)] text-[color:var(--color-mist)] hover:border-[rgba(143,208,255,0.45)]',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[color:var(--color-mist)]">
            {filtering
              ? `${rows.length} of ${entries.length} titles shown. Clear the search and filter to drag.`
              : `${entries.length} titles, shown on the page in this order.`}
          </p>
          <button
            type="button"
            onClick={sortByYear}
            disabled={entries.length < 2}
            className="rounded-lg border border-[rgba(143,208,255,0.24)] bg-[rgba(13,16,36,0.6)] px-3 py-1.5 text-xs font-semibold text-white hover:border-[rgba(143,208,255,0.45)] disabled:opacity-40"
          >
            Sort this branch by year
          </button>
        </div>

        {/* ---------------- Titles ---------------- */}
        <section className="mt-4">
          <h2 className="sr-only">{active.name}</h2>

          {entries.length === 0 ? (
            <EmptyState
              title="No titles in this branch"
              body="It is hidden on the timeline page until a title is moved back into it."
            />
          ) : rows.length === 0 ? (
            <EmptyState title="No matches" body="Nothing matches that search and filter. Try clearing one of them." />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto panel md:block">
                <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                  <caption className="sr-only">{active.name}, in display order</caption>
                  <thead>
                    <tr className="border-b border-[rgba(143,208,255,0.16)] text-[0.6875rem] uppercase tracking-[0.14em] text-[color:var(--color-mist)]">
                      <th scope="col" className="w-20 px-4 py-3 font-medium">#</th>
                      <th scope="col" className="px-4 py-3 font-medium">Title</th>
                      <th scope="col" className="px-4 py-3 font-medium">Year</th>
                      <th scope="col" className="px-4 py-3 font-medium">Type</th>
                      <th scope="col" className="px-4 py-3 font-medium">Branch</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.key}
                        {...dragProps(row)}
                        className={cn('order-tr border-b border-[rgba(143,208,255,0.08)] last:border-0', rowState(row))}
                      >
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2">
                            {!filtering ? (
                              <span aria-hidden="true" className="order-handle" title="Drag to reorder">
                                ⠿
                              </span>
                            ) : null}
                            <span className="tabular-nums text-[color:var(--color-mist)]">{row.index + 1}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-white">
                          <span className="flex flex-wrap items-center gap-2">
                            {row.entry.title}
                            {row.entry.important ? <StarMark /> : null}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-[color:var(--color-mist)]">
                          {yearLabel(row.entry)}
                        </td>
                        <td className="px-4 py-2.5">
                          <KindChip kind={row.entry.kind} />
                        </td>
                        <td className="px-4 py-2.5">{branchSelect(row)}</td>
                        <td className="px-4 py-2.5">
                          <span className="flex justify-end gap-1.5">{controls(row)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ol className="grid gap-3 md:hidden">
                {rows.map((row) => (
                  <li key={row.key} {...dragProps(row)} className={cn('panel order-card p-4', rowState(row))}>
                    <div className="flex items-start gap-3">
                      <span className="display mt-0.5 w-7 shrink-0 text-sm font-black tabular-nums text-[color:var(--color-mist)]">
                        {row.index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white">{row.entry.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-mist)]">
                          {yearLabel(row.entry)}
                          <KindChip kind={row.entry.kind} />
                          {row.entry.important ? <StarMark /> : null}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="flex-1">{branchSelect(row)}</span>
                      {controls(row)}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function KindChip({ kind }: { kind: TitleKind }) {
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em]', KIND_CHIP[kind])}>
      {KIND_LABEL[kind]}
    </span>
  );
}

/** Decorative; the star button's pressed state carries the meaning. */
function StarMark() {
  return (
    <span aria-hidden="true" title="Starred" className="text-[color:var(--color-gold)]">
      ★
    </span>
  );
}
