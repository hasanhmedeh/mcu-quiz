'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminNav } from './AdminNav';
import { PageShell, SectionLabel, Spinner } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import type { AdminSnapshot, SnapshotKind } from '@/types';
import { SnapshotLightbox, SnapshotThumb, formatClock, formatDay } from './snapshots';

/** Rendering thousands of thumbnails at once helps nobody; more load on request. */
const PAGE_SIZE = 240;

type KindFilter = 'all' | SnapshotKind;

/** yyyy-mm-dd in the organiser's own time zone. */
function toDayInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/** Start of a local day, and start of the day after another, as ISO timestamps. */
function rangeFor(fromDay: string, toDay: string): { from: string; to: string } {
  const from = new Date(`${fromDay}T00:00:00`);
  const to = new Date(`${toDay}T00:00:00`);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

interface SessionGroup {
  attemptId: string;
  displayName: string;
  snapshots: AdminSnapshot[];
}

interface DayGroup {
  day: string;
  label: string;
  sessions: SessionGroup[];
}

/** Newest day first; inside a day, newest session first; inside a session, newest still first. */
function groupByDayAndSession(snapshots: AdminSnapshot[]): DayGroup[] {
  const days = new Map<string, Map<string, SessionGroup>>();
  const labels = new Map<string, string>();

  for (const snapshot of snapshots) {
    const day = toDayInput(new Date(snapshot.takenAt));
    labels.set(day, formatDay(snapshot.takenAt));
    const sessions = days.get(day) ?? new Map<string, SessionGroup>();
    days.set(day, sessions);
    const session = sessions.get(snapshot.attemptId) ?? {
      attemptId: snapshot.attemptId,
      displayName: snapshot.displayName,
      snapshots: [],
    };
    session.snapshots.push(snapshot);
    sessions.set(snapshot.attemptId, session);
  }

  return [...days.entries()].map(([day, sessions]) => ({
    day,
    label: labels.get(day) ?? day,
    sessions: [...sessions.values()],
  }));
}

/**
 * Every proctoring image across all exams: filter by dates, person and type,
 * or narrow it to the moments someone left the exam.
 */
export function GalleryBrowser() {
  const [fromDay, setFromDay] = useState(() => toDayInput(daysAgo(6)));
  const [toDay, setToDay] = useState(() => toDayInput(new Date()));
  const [person, setPerson] = useState<string>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [onlyExits, setOnlyExits] = useState(false);

  const [snapshots, setSnapshots] = useState<AdminSnapshot[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [open, setOpen] = useState<number | null>(null);

  const rangeValid = fromDay !== '' && toDay !== '' && fromDay <= toDay;

  useEffect(() => {
    if (!rangeValid) return;
    let cancelled = false;
    const { from, to } = rangeFor(fromDay, toDay);

    fetch(`/api/admin/snapshots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { snapshots?: AdminSnapshot[]; error?: { message?: string } }
          | null;
        if (cancelled) return;
        if (!response.ok) {
          setError(body?.error?.message ?? 'The images could not be loaded.');
          return;
        }
        setError(null);
        // Newest first everywhere on this page.
        setSnapshots([...(body?.snapshots ?? [])].reverse());
        setShown(PAGE_SIZE);
      })
      .catch(() => {
        if (!cancelled) setError('We could not reach the server.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fromDay, toDay, rangeValid]);

  function changeRange(update: () => void) {
    setLoading(true);
    setOpen(null);
    update();
  }

  const people = useMemo(() => {
    const byUser = new Map<string, { name: string; count: number }>();
    for (const snapshot of snapshots ?? []) {
      const entry = byUser.get(snapshot.userId) ?? { name: snapshot.displayName, count: 0 };
      entry.count += 1;
      byUser.set(snapshot.userId, entry);
    }
    return [...byUser.entries()]
      .map(([userId, entry]) => ({ userId, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [snapshots]);

  const hasScreens = useMemo(
    () => (snapshots ?? []).some((snapshot) => snapshot.kind === 'screen'),
    [snapshots],
  );

  const filtered = useMemo(
    () =>
      (snapshots ?? []).filter(
        (snapshot) =>
          (person === 'all' || snapshot.userId === person) &&
          (kind === 'all' || snapshot.kind === kind) &&
          (!onlyExits || snapshot.reason === 'exit'),
      ),
    [kind, onlyExits, person, snapshots],
  );

  const visible = filtered.slice(0, shown);
  const groups = useMemo(() => groupByDayAndSession(visible), [visible]);
  const indexById = useMemo(() => new Map(visible.map((snapshot, i) => [snapshot.id, i])), [visible]);

  const exitsCount = filtered.filter((snapshot) => snapshot.reason === 'exit').length;
  const peopleCount = new Set(filtered.map((snapshot) => snapshot.userId)).size;

  const handleDeleted = useCallback((id: string) => {
    setSnapshots((previous) => previous?.filter((snapshot) => snapshot.id !== id) ?? null);
    setOpen(null);
  }, []);

  return (
    <PageShell
      headerRight={
        <AdminNav current="gallery" />
      }
    >
      <div className="fade-up">
        <SectionLabel>Organiser · captures</SectionLabel>
        <h1 className="display mt-3 text-2xl font-black text-white sm:text-3xl">Gallery</h1>
        <p className="mt-2 text-sm text-[color:var(--color-mist)]">
          Every camera image taken during exams. Red outlines mark the moment someone left the exam.
        </p>
      </div>

      {/* ---------------- Filters ---------------- */}
      <div className="panel mt-6 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr_auto_auto] lg:items-end">
        <Field label="From">
          <input
            type="date"
            className="field py-2"
            value={fromDay}
            max={toDay}
            onChange={(event) => changeRange(() => setFromDay(event.target.value))}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            className="field py-2"
            value={toDay}
            min={fromDay}
            max={toDayInput(new Date())}
            onChange={(event) => changeRange(() => setToDay(event.target.value))}
          />
        </Field>
        <Field label="Person">
          <select
            className="field py-2"
            value={person}
            onChange={(event) => {
              setPerson(event.target.value);
              setShown(PAGE_SIZE);
            }}
          >
            <option value="all">Everyone ({snapshots?.length ?? 0})</option>
            {people.map((entry) => (
              <option key={entry.userId} value={entry.userId}>
                {entry.name} ({entry.count})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <div className="flex gap-1.5" role="group" aria-label="Image type">
            {(['all', 'camera', ...(hasScreens ? (['screen'] as const) : [])] as KindFilter[]).map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={kind === option}
                  onClick={() => setKind(option)}
                  className={cn(
                    'rounded-full border px-3 py-2 text-xs font-semibold capitalize',
                    kind === option
                      ? 'border-[rgba(62,166,255,0.7)] bg-[rgba(62,166,255,0.18)] text-white'
                      : 'border-[rgba(143,208,255,0.22)] text-[color:var(--color-mist)]',
                  )}
                >
                  {option === 'all' ? 'All' : option === 'camera' ? 'Camera' : 'Screen'}
                </button>
              ),
            )}
          </div>
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[color:var(--color-mist)] lg:pb-2.5">
          <input
            type="checkbox"
            checked={onlyExits}
            onChange={(event) => setOnlyExits(event.target.checked)}
            className="h-4 w-4 accent-[color:var(--color-ember)]"
          />
          Only when they left
        </label>
      </div>

      {/* ---------------- Results ---------------- */}
      {!rangeValid ? (
        <p className="mt-8 text-sm text-[color:var(--color-ember-soft)]">
          The start date has to be on or before the end date.
        </p>
      ) : loading && snapshots === null ? (
        <div className="grid place-items-center py-20 text-sm text-[color:var(--color-mist)]">
          <Spinner label="Loading images…" />
        </div>
      ) : error ? (
        <p role="alert" className="mt-8 text-sm text-[color:var(--color-ember-soft)]">
          {error}
        </p>
      ) : filtered.length === 0 ? (
        <div className="panel mt-6 p-8 text-center">
          <p className="display text-base font-bold text-white">No images match</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[color:var(--color-mist)]">
            Try a wider date range, or clear the person and type filters.
          </p>
        </div>
      ) : (
        <>
          <p className={cn('mt-6 text-xs text-[color:var(--color-mist)]', loading && 'opacity-60')}>
            {filtered.length} image{filtered.length === 1 ? '' : 's'} · {peopleCount}{' '}
            {peopleCount === 1 ? 'person' : 'people'} · {exitsCount} taken as they left
            {loading ? ' · updating…' : ''}
          </p>

          {groups.map((group) => (
            <section key={group.day} className="mt-6">
              <h2 className="display text-xs tracking-[0.2em] text-[color:var(--color-mist)]">{group.label}</h2>

              <div className="mt-3 space-y-4">
                {group.sessions.map((session) => {
                  const newest = session.snapshots[0];
                  const oldest = session.snapshots.at(-1);
                  const exits = session.snapshots.filter((snapshot) => snapshot.reason === 'exit').length;
                  return (
                    <article key={`${group.day}-${session.attemptId}`} className="panel p-4">
                      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold text-white">{session.displayName}</h3>
                        <p className="text-xs text-[color:var(--color-mist)]">
                          {oldest && newest ? `${formatClock(oldest.takenAt)} – ${formatClock(newest.takenAt)}` : ''}{' '}
                          · {session.snapshots.length} image{session.snapshots.length === 1 ? '' : 's'}
                          {exits > 0 ? (
                            <span className="text-[color:var(--color-ember-soft)]"> · left {exits}×</span>
                          ) : null}
                        </p>
                      </div>
                      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                        {session.snapshots.map((snapshot) => (
                          <li key={snapshot.id}>
                            <SnapshotThumb
                              snapshot={snapshot}
                              onOpen={() => setOpen(indexById.get(snapshot.id) ?? 0)}
                            />
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          {filtered.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((count) => count + PAGE_SIZE)}
              className="btn btn-ghost mt-6 w-full"
            >
              Show {Math.min(PAGE_SIZE, filtered.length - shown)} more of {filtered.length - shown}
            </button>
          ) : null}
        </>
      )}

      {open !== null ? (
        <SnapshotLightbox
          snapshots={visible}
          index={open}
          onIndexChange={setOpen}
          onClose={() => setOpen(null)}
          onDeleted={handleDeleted}
        />
      ) : null}
    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[0.625rem] uppercase tracking-[0.16em] text-[color:var(--color-mist)]">{label}</p>
      {children}
    </div>
  );
}
