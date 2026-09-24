'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, PageShell, SectionLabel, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/cn';
import type { AdminAttemptRow, AdminDeviceRow, AdminStats, AdminUserRow } from '@/types';

interface AdminDashboardProps {
  stats: AdminStats;
  users: AdminUserRow[];
  recentAttempts: AdminAttemptRow[];
  devices: AdminDeviceRow[];
  passingScore: number;
  totalQuestions: number;
}

type Filter = 'all' | 'passed' | 'failed' | 'retake' | 'in_progress';

const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Everyone' },
  { id: 'passed', label: 'Passed' },
  { id: 'failed', label: 'Failed' },
  { id: 'retake', label: 'Retake granted' },
  { id: 'in_progress', label: 'In progress' },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "Chrome on Windows" is all the device detail that is ever useful here. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return '—';
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : 'Browser';

  const platform =
    /iPhone|iPad|iPod/.test(userAgent) ? 'iOS'
    : /Android/.test(userAgent) ? 'Android'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : 'Unknown';

  return `${browser} · ${platform}`;
}

export function AdminDashboard({
  stats,
  users,
  recentAttempts,
  devices,
  passingScore,
  totalQuestions,
}: AdminDashboardProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [pendingAttemptId, setPendingAttemptId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<{
    user: AdminUserRow;
    attempt: AdminAttemptRow;
  } | null>(null);
  const [regrading, setRegrading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [isRefreshing, startTransition] = useTransition();

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return users.filter((user) => {
      if (needle && !user.displayName.toLowerCase().includes(needle) && !user.normalizedName.includes(needle)) {
        return false;
      }

      switch (filter) {
        case 'passed':
          return user.attempts.some((attempt) => attempt.passed === true);
        case 'failed':
          return user.completedAttempts > 0 && !user.attempts.some((a) => a.passed === true);
        case 'retake':
          return user.retakeAllowed;
        case 'in_progress':
          return user.attempts.some((attempt) => attempt.status === 'in_progress');
        default:
          return true;
      }
    });
  }, [filter, query, users]);

  async function handleRetake(user: AdminUserRow, allowed: boolean) {
    setPendingUserId(user.id);
    setNotice(null);

    try {
      const response = await fetch('/api/admin/retake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, allowed }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setNotice({
          tone: 'error',
          text: body?.error?.message ?? 'That change did not go through. Please try again.',
        });
        setPendingUserId(null);
        return;
      }

      setNotice({
        tone: 'info',
        text: allowed
          ? `${user.displayName} can take the exam again — they will get a fresh set of questions.`
          : `Retake permission removed for ${user.displayName}.`,
      });
      startTransition(() => router.refresh());
    } catch {
      setNotice({ tone: 'error', text: 'We could not reach the server. Please try again.' });
    } finally {
      setPendingUserId(null);
    }
  }

  function handleDeleteAttempt(user: AdminUserRow, attempt: AdminAttemptRow) {
    setNotice(null);
    setConfirmingDelete({ user, attempt });
  }

  async function deleteConfirmedAttempt() {
    if (!confirmingDelete) return;
    const { user, attempt } = confirmingDelete;

    setPendingAttemptId(attempt.id);
    setNotice(null);

    try {
      const response = await fetch('/api/admin/delete-attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: attempt.id }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setNotice({
          tone: 'error',
          text: body?.error?.message ?? 'That submission could not be deleted. Please try again.',
        });
        return;
      }

      setNotice({
        tone: 'info',
        text: `Deleted attempt #${attempt.attemptNumber} by ${user.displayName}.`,
      });
      startTransition(() => router.refresh());
    } catch {
      setNotice({ tone: 'error', text: 'We could not reach the server. Please try again.' });
    } finally {
      setPendingAttemptId(null);
      setConfirmingDelete(null);
    }
  }

  async function handleReleaseDevice(device: AdminDeviceRow) {
    setPendingDeviceId(device.id);
    setNotice(null);

    try {
      const response = await fetch('/api/admin/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setNotice({
          tone: 'error',
          text: body?.error?.message ?? 'That device could not be released. Please try again.',
        });
        setPendingDeviceId(null);
        return;
      }

      setNotice({
        tone: 'info',
        text: 'Device released — someone new can now take the exam on it. Anyone who has already played still cannot go again.',
      });
      startTransition(() => router.refresh());
    } catch {
      setNotice({ tone: 'error', text: 'We could not reach the server. Please try again.' });
    } finally {
      setPendingDeviceId(null);
    }
  }

  async function handleRegrade() {
    setRegrading(true);
    setNotice(null);

    try {
      const response = await fetch('/api/admin/regrade', { method: 'POST' });
      const body = (await response.json().catch(() => null)) as
        | { checked?: number; promoted?: Array<{ displayName: string }>; error?: { message?: string } }
        | null;

      if (!response.ok) {
        setNotice({
          tone: 'error',
          text: body?.error?.message ?? 'The re-grade did not go through. Please try again.',
        });
        return;
      }

      const promoted = body?.promoted ?? [];
      setNotice({
        tone: 'info',
        text:
          promoted.length === 0
            ? `Checked ${body?.checked ?? 0} completed attempts — nobody needed updating.`
            : `${promoted.length} attempt${promoted.length === 1 ? '' : 's'} now pass${promoted.length === 1 ? 'es' : ''} and got a ticket: ${promoted.map((p) => p.displayName).join(', ')}.`,
      });
      startTransition(() => router.refresh());
    } catch {
      setNotice({ tone: 'error', text: 'We could not reach the server. Please try again.' });
    } finally {
      setRegrading(false);
    }
  }

  async function handleSignOut() {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => null);
    router.refresh();
  }

  return (
    <PageShell
      headerRight={
        <div className="flex items-center gap-3">
          {isRefreshing ? <Spinner /> : null}
          <button type="button" className="btn btn-ghost min-h-0 px-4 py-2 text-sm" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      }
    >
      {confirmingDelete ? (
        <ConfirmDialog
          title="Delete this submission?"
          confirmLabel="Delete submission"
          busy={pendingAttemptId === confirmingDelete.attempt.id}
          busyLabel="Deleting…"
          onConfirm={deleteConfirmedAttempt}
          onCancel={() => setConfirmingDelete(null)}
        >
          <DeleteSummary
            user={confirmingDelete.user}
            attempt={confirmingDelete.attempt}
            totalQuestions={totalQuestions}
          />
        </ConfirmDialog>
      ) : null}

      <div className="fade-up">
        <SectionLabel>Organiser dashboard</SectionLabel>
        <h1 className="display mt-3 text-2xl font-black text-white sm:text-3xl">
          Who is ready for the Endgame?
        </h1>
        <p className="mt-2 text-sm text-[color:var(--color-mist)]">
          Pass mark is {passingScore} / {totalQuestions}. Granting a retake keeps every previous
          attempt on record.
        </p>
        <button
          type="button"
          onClick={handleRegrade}
          disabled={regrading}
          title="Mark past attempts that clear the current pass mark as passed and issue their tickets"
          className="mt-3 rounded-lg border border-[rgba(62,166,255,0.45)] bg-[rgba(62,166,255,0.14)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {regrading ? 'Re-grading…' : `Re-grade past attempts at ${passingScore} / ${totalQuestions}`}
        </button>
      </div>

      {/* ---------------- Statistics ---------------- */}
      <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Participants" value={String(stats.totalParticipants)} />
        <StatCard label="Attempts" value={String(stats.totalAttempts)} />
        <StatCard label="Completed" value={String(stats.completedAttempts)} />
        <StatCard label="Passed" value={String(stats.passed)} tone="pass" />
        <StatCard label="Failed" value={String(stats.failed)} tone="fail" />
        <StatCard label="Pass rate" value={`${stats.passRate}%`} />
      </dl>

      {stats.averageScore !== null ? (
        <p className="mt-3 text-xs text-[color:var(--color-mist)]">
          Average score across completed exams: {stats.averageScore} / {totalQuestions}
        </p>
      ) : null}

      {notice ? (
        <Alert tone={notice.tone === 'error' ? 'error' : 'info'} className="mt-5">
          {notice.text}
        </Alert>
      ) : null}

      {/* ---------------- Search & filter ---------------- */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:flex-1">
          <label htmlFor="admin-search" className="sr-only">
            Search participants by name
          </label>
          <input
            id="admin-search"
            className="field"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a name, e.g. Hasan"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter participants">
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

      {/* ---------------- Participants ---------------- */}
      <section className="mt-6">
        <h2 className="sr-only">Participants</h2>

        {users.length === 0 ? (
          <EmptyState
            title="Nobody has taken the exam yet"
            body="Share the link with your friends — results will appear here as they finish."
          />
        ) : visibleUsers.length === 0 ? (
          <EmptyState
            title="No matches"
            body="Nobody matches that search and filter. Try clearing one of them."
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto panel md:block">
              <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Participants, their latest score and retake status
                </caption>
                <thead>
                  <tr className="border-b border-[rgba(143,208,255,0.16)] text-[0.6875rem] uppercase tracking-[0.14em] text-[color:var(--color-mist)]">
                    <th scope="col" className="px-4 py-3 font-medium">Name</th>
                    <th scope="col" className="px-4 py-3 font-medium">Latest score</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 font-medium">Attempts</th>
                    <th scope="col" className="px-4 py-3 font-medium">Last activity</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Retake</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <UserRows
                      key={user.id}
                      user={user}
                      totalQuestions={totalQuestions}
                      expanded={expanded === user.id}
                      pending={pendingUserId === user.id}
                      onToggle={() => setExpanded(expanded === user.id ? null : user.id)}
                      onRetake={handleRetake}
                      pendingAttemptId={pendingAttemptId}
                      onDeleteAttempt={handleDeleteAttempt}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 md:hidden">
              {visibleUsers.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  totalQuestions={totalQuestions}
                  expanded={expanded === user.id}
                  pending={pendingUserId === user.id}
                  onToggle={() => setExpanded(expanded === user.id ? null : user.id)}
                  onRetake={handleRetake}
                  pendingAttemptId={pendingAttemptId}
                  onDeleteAttempt={handleDeleteAttempt}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ---------------- Devices ---------------- */}
      {devices.length > 0 ? (
        <section className="mt-10">
          <SectionLabel>Devices</SectionLabel>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[color:var(--color-mist)]">
            Each machine gets one attempt, so changing name on the same phone or laptop does not
            buy another go. Release a device when two genuinely different people need to share
            one — it lets the next person in without giving anyone a second attempt.
          </p>

          <ul className="mt-4 grid gap-2">
            {devices.map((device) => (
              <li
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(143,208,255,0.14)] bg-[rgba(13,16,36,0.55)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {device.lastCompletedDisplayName ?? 'No completed attempt yet'}
                  </p>
                  <p className="mt-0.5 text-xs text-[color:var(--color-mist)]">
                    {describeDevice(device.userAgent)} · {device.completedAttempts} completed ·{' '}
                    {device.participantCount} name{device.participantCount === 1 ? '' : 's'} ·{' '}
                    last seen {formatDateTime(device.lastSeenAt)}
                  </p>
                  <p className="mt-0.5 font-mono text-[0.65rem] text-[color:var(--color-mist)]/60">
                    {device.id}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {device.releaseCount > 0 ? (
                    <span className="text-[0.65rem] text-[color:var(--color-mist)]">
                      released {device.releaseCount}×
                    </span>
                  ) : null}

                  <span className={device.locked ? 'chip chip-fail' : 'chip chip-neutral'}>
                    {device.locked ? 'Locked' : 'Open'}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleReleaseDevice(device)}
                    disabled={pendingDeviceId === device.id || !device.locked}
                    title={device.locked ? undefined : 'Nothing has been completed on this device'}
                    className="rounded-lg border border-[rgba(62,166,255,0.45)] bg-[rgba(62,166,255,0.14)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    {pendingDeviceId === device.id ? 'Working…' : 'Release device'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---------------- Recent activity ---------------- */}
      {recentAttempts.length > 0 ? (
        <section className="mt-10">
          <SectionLabel>Recent attempts</SectionLabel>
          <ul className="mt-4 grid gap-2">
            {recentAttempts.slice(0, 12).map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(143,208,255,0.14)] bg-[rgba(13,16,36,0.55)] px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{attempt.displayName}</p>
                  <p className="text-xs text-[color:var(--color-mist)]">
                    Attempt #{attempt.attemptNumber} · {describeDevice(attempt.userAgent)}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-[color:var(--color-mist)]">
                    {formatDateTime(attempt.completedAt ?? attempt.startedAt)}
                  </span>
                  <StatusChip attempt={attempt} totalQuestions={totalQuestions} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

interface RowProps {
  user: AdminUserRow;
  totalQuestions: number;
  expanded: boolean;
  pending: boolean;
  onToggle: () => void;
  onRetake: (user: AdminUserRow, allowed: boolean) => void;
  pendingAttemptId: string | null;
  onDeleteAttempt: (user: AdminUserRow, attempt: AdminAttemptRow) => void;
}

function UserRows({
  user,
  totalQuestions,
  expanded,
  pending,
  onToggle,
  onRetake,
  pendingAttemptId,
  onDeleteAttempt,
}: RowProps) {
  const latest = user.attempts.at(-1) ?? null;

  return (
    <>
      <tr className="border-b border-[rgba(143,208,255,0.1)] align-middle">
        <th scope="row" className="px-4 py-3 text-left font-semibold text-white">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 text-left hover:text-[color:var(--color-ion-soft)]"
            aria-expanded={expanded}
          >
            <span aria-hidden="true" className={cn('text-xs transition-transform', expanded && 'rotate-90')}>
              ▶
            </span>
            {user.displayName}
          </button>
        </th>

        <td className="px-4 py-3 text-[color:var(--color-mist)]">
          {user.lastScore === null ? '—' : `${user.lastScore} / ${totalQuestions}`}
        </td>

        <td className="px-4 py-3">
          <UserStatusChip user={user} />
        </td>

        <td className="px-4 py-3 text-[color:var(--color-mist)]">{user.completedAttempts}</td>

        <td className="px-4 py-3 text-xs text-[color:var(--color-mist)]">
          {formatDateTime(user.updatedAt)}
        </td>

        <td className="px-4 py-3 text-right">
          <RetakeButton user={user} pending={pending} onRetake={onRetake} />
        </td>
      </tr>

      {expanded ? (
        <tr className="border-b border-[rgba(143,208,255,0.1)] bg-[rgba(6,8,20,0.5)]">
          <td colSpan={6} className="px-4 py-4">
            <AttemptHistory
              user={user}
              attempts={user.attempts}
              totalQuestions={totalQuestions}
              latestId={latest?.id ?? null}
              pendingAttemptId={pendingAttemptId}
              onDelete={(attempt) => onDeleteAttempt(user, attempt)}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function UserCard({
  user,
  totalQuestions,
  expanded,
  pending,
  onToggle,
  onRetake,
  pendingAttemptId,
  onDeleteAttempt,
}: RowProps) {
  return (
    <article className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-white">{user.displayName}</h3>
          <p className="mt-0.5 text-xs text-[color:var(--color-mist)]">
            {user.lastScore === null ? 'No score yet' : `${user.lastScore} / ${totalQuestions}`} ·{' '}
            {user.completedAttempts} attempt{user.completedAttempts === 1 ? '' : 's'}
          </p>
        </div>
        <UserStatusChip user={user} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <RetakeButton user={user} pending={pending} onRetake={onRetake} />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="rounded-lg border border-[rgba(143,208,255,0.24)] px-3 py-2 text-xs font-semibold text-[color:var(--color-mist)]"
        >
          {expanded ? 'Hide history' : 'History'}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4">
          <AttemptHistory
            user={user}
            attempts={user.attempts}
            totalQuestions={totalQuestions}
            latestId={user.attempts.at(-1)?.id ?? null}
            pendingAttemptId={pendingAttemptId}
            onDelete={(attempt) => onDeleteAttempt(user, attempt)}
          />
        </div>
      ) : null}
    </article>
  );
}

function AttemptHistory({
  user,
  attempts,
  totalQuestions,
  latestId,
  pendingAttemptId,
  onDelete,
}: {
  user: AdminUserRow;
  attempts: AdminAttemptRow[];
  totalQuestions: number;
  latestId: string | null;
  pendingAttemptId: string | null;
  onDelete: (attempt: AdminAttemptRow) => void;
}) {
  if (attempts.length === 0) {
    return <p className="text-sm text-[color:var(--color-mist)]">No attempts recorded yet.</p>;
  }

  return (
    <div>
      <p className="display mb-3 text-[0.65rem] tracking-[0.2em] text-[color:var(--color-mist)]">
        {user.displayName} — full history
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-left text-xs">
          <caption className="sr-only">Every attempt {user.displayName} has made</caption>
          <thead>
            <tr className="text-[0.625rem] uppercase tracking-[0.14em] text-[color:var(--color-mist)]">
              <th scope="col" className="py-2 pr-4 font-medium">Attempt</th>
              <th scope="col" className="py-2 pr-4 font-medium">Score</th>
              <th scope="col" className="py-2 pr-4 font-medium">Status</th>
              <th scope="col" className="py-2 pr-4 font-medium">Date</th>
              <th scope="col" className="py-2 pr-4 font-medium">Ticket</th>
              <th scope="col" className="py-2 pr-4 font-medium">Device</th>
              <th scope="col" className="py-2 pr-4 font-medium">Attempt ID</th>
              <th scope="col" className="py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((attempt) => (
              <tr
                key={attempt.id}
                className={cn(
                  'border-t border-[rgba(143,208,255,0.1)]',
                  attempt.id === latestId && 'bg-[rgba(62,166,255,0.06)]',
                )}
              >
                <td className="py-2 pr-4 font-semibold text-white">#{attempt.attemptNumber}</td>
                <td className="py-2 pr-4 text-[color:var(--color-mist)]">
                  {attempt.score === null ? '—' : `${attempt.score} / ${attempt.totalQuestions ?? totalQuestions}`}
                </td>
                <td className="py-2 pr-4">
                  <StatusChip attempt={attempt} totalQuestions={totalQuestions} />
                </td>
                <td className="py-2 pr-4 text-[color:var(--color-mist)]">
                  {formatDateTime(attempt.completedAt ?? attempt.startedAt)}
                </td>
                <td className="py-2 pr-4 font-mono text-[0.7rem] text-[color:var(--color-gold)]">
                  {attempt.ticketId ?? '—'}
                </td>
                <td className="py-2 pr-4 text-[color:var(--color-mist)]">
                  {describeDevice(attempt.userAgent)}
                </td>
                <td className="py-2 pr-4 font-mono text-[0.7rem] text-[color:var(--color-mist)]/70">
                  {attempt.id}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(attempt)}
                    disabled={pendingAttemptId === attempt.id}
                    aria-label={`Delete attempt #${attempt.attemptNumber} by ${user.displayName}`}
                    className="rounded-lg border border-[rgba(255,59,74,0.45)] bg-[rgba(255,59,74,0.1)] px-2.5 py-1.5 text-[0.7rem] font-semibold text-[color:var(--color-ember-soft)] disabled:opacity-40"
                  >
                    {pendingAttemptId === attempt.id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** What the organiser is about to delete, and what follows from it. */
function DeleteSummary({
  user,
  attempt,
  totalQuestions,
}: {
  user: AdminUserRow;
  attempt: AdminAttemptRow;
  totalQuestions: number;
}) {
  const onlyOne = user.attempts.length === 1;

  return (
    <>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-[rgba(143,208,255,0.14)] bg-[rgba(6,8,20,0.55)] px-4 py-3 text-xs">
        <dt className="text-[color:var(--color-mist)]/70">Participant</dt>
        <dd className="truncate font-semibold text-white">{user.displayName}</dd>
        <dt className="text-[color:var(--color-mist)]/70">Attempt</dt>
        <dd className="text-white">#{attempt.attemptNumber}</dd>
        <dt className="text-[color:var(--color-mist)]/70">Result</dt>
        <dd>
          <StatusChip attempt={attempt} totalQuestions={totalQuestions} />
        </dd>
        {attempt.ticketId ? (
          <>
            <dt className="text-[color:var(--color-mist)]/70">Ticket</dt>
            <dd className="font-mono text-[color:var(--color-gold)]">{attempt.ticketId}</dd>
          </>
        ) : null}
      </dl>

      <ul className="mt-4 space-y-1.5">
        {attempt.ticketId ? <li>• Their ticket stops verifying.</li> : null}
        <li>
          •{' '}
          {onlyOne
            ? 'This is their only attempt, so they can take the exam again.'
            : 'Their other attempts are kept.'}
        </li>
        <li className="font-semibold text-[color:var(--color-ember-soft)]">• This cannot be undone.</li>
      </ul>
    </>
  );
}

function RetakeButton({
  user,
  pending,
  onRetake,
}: {
  user: AdminUserRow;
  pending: boolean;
  onRetake: (user: AdminUserRow, allowed: boolean) => void;
}) {
  if (user.retakeAllowed) {
    return (
      <button
        type="button"
        onClick={() => onRetake(user, false)}
        disabled={pending}
        className="rounded-lg border border-[rgba(245,197,66,0.45)] bg-[rgba(245,197,66,0.12)] px-3 py-2 text-xs font-semibold text-[color:var(--color-gold)] disabled:opacity-50"
      >
        {pending ? 'Working…' : 'Revoke retake'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onRetake(user, true)}
      disabled={pending || user.completedAttempts === 0}
      title={user.completedAttempts === 0 ? 'They have not finished an attempt yet' : undefined}
      className="rounded-lg border border-[rgba(62,166,255,0.45)] bg-[rgba(62,166,255,0.14)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
    >
      {pending ? 'Working…' : 'Allow retake'}
    </button>
  );
}

function UserStatusChip({ user }: { user: AdminUserRow }) {
  if (user.retakeAllowed) {
    return <span className="chip chip-neutral text-[color:var(--color-gold)]">Retake granted</span>;
  }
  if (user.completedAttempts === 0) {
    // No attempts at all means they discarded the only exam they opened.
    return (
      <span className="chip chip-neutral">
        {user.attempts.length === 0 ? 'Not started' : 'In progress'}
      </span>
    );
  }
  const passedEver = user.attempts.some((attempt) => attempt.passed === true);
  return (
    <span className={passedEver ? 'chip chip-pass' : 'chip chip-fail'}>
      {passedEver ? 'Passed' : 'Failed'}
    </span>
  );
}

function StatusChip({
  attempt,
  totalQuestions,
}: {
  attempt: AdminAttemptRow;
  totalQuestions: number;
}) {
  if (attempt.status === 'in_progress') {
    return <span className="chip chip-neutral">In progress</span>;
  }
  return (
    <span className={attempt.passed ? 'chip chip-pass' : 'chip chip-fail'}>
      {attempt.passed ? 'Passed' : 'Failed'} {attempt.score ?? 0}/{attempt.totalQuestions ?? totalQuestions}
    </span>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'pass' | 'fail';
}) {
  return (
    <div className="stat-card">
      <dt className="text-[0.625rem] uppercase tracking-[0.16em] text-[color:var(--color-mist)]">
        {label}
      </dt>
      <dd
        className={cn(
          'display mt-1 text-2xl font-black',
          tone === 'pass' ? 'text-[#6ef2b0]' : tone === 'fail' ? 'text-[color:var(--color-ember-soft)]' : 'text-white',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel p-8 text-center">
      <p className="display text-base font-bold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[color:var(--color-mist)]">{body}</p>
    </div>
  );
}
