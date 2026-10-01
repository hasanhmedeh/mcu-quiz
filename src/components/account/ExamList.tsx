import Link from 'next/link';
import { LocalTime } from '@/components/ui/LocalTime';
import { cn } from '@/lib/cn';
import type { AccountExam } from '@/lib/account/service';

export function examState(exam: Pick<AccountExam, 'status' | 'passed' | 'expired'>): {
  label: string;
  tone: string;
} {
  if (exam.status === 'completed') {
    return exam.passed
      ? { label: 'Passed', tone: 'border-[rgba(110,242,176,0.45)] bg-[rgba(110,242,176,0.12)] text-[#6ef2b0]' }
      : { label: 'Not passed', tone: 'border-[rgba(255,59,74,0.4)] bg-[rgba(255,59,74,0.1)] text-[color:var(--color-ember-soft)]' };
  }
  return exam.expired
    ? { label: 'Expired', tone: 'border-[rgba(143,208,255,0.24)] text-[color:var(--color-mist)]' }
    : { label: 'In progress', tone: 'border-[rgba(245,197,66,0.45)] bg-[rgba(245,197,66,0.1)] text-[color:var(--color-gold)]' };
}

export function ExamChip({ exam }: { exam: Pick<AccountExam, 'status' | 'passed' | 'expired'> }) {
  const { label, tone } = examState(exam);
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em]', tone)}>
      {label}
    </span>
  );
}

/** A viewer's own exams, newest first, each linking to its result. */
export function ExamList({ exams }: { exams: readonly AccountExam[] }) {
  return (
    <ul className="panel divide-y divide-[rgba(143,208,255,0.08)]">
      {exams.map((exam) => (
        <li key={exam.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white">Attempt #{exam.attemptNumber}</span>
              <ExamChip exam={exam} />
            </p>
            <p className="mt-0.5 text-xs text-[color:var(--color-mist)]">
              As {exam.displayName} · <LocalTime iso={exam.completedAt ?? exam.startedAt} />
              {exam.ticketId ? (
                <>
                  {' · '}
                  <span className="font-mono text-[color:var(--color-gold)]">{exam.ticketId}</span>
                </>
              ) : null}
            </p>
          </div>
          <span className="display text-lg font-black tabular-nums text-white">
            {exam.score === null ? '—' : `${exam.score} / ${exam.totalQuestions}`}
          </span>
          {exam.status === 'completed' ? (
            <Link href={`/result/${exam.id}`} className="btn btn-ghost min-h-0 px-3 py-1.5 text-xs">
              {exam.passed ? 'Ticket' : 'Result'}
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
