import { cn } from '@/lib/cn';
import { Wordmark } from './Wordmark';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)} role="status">
      <svg
        className="h-4 w-4 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className={label ? '' : 'sr-only'}>{label ?? 'Loading'}</span>
    </span>
  );
}

export type AlertTone = 'error' | 'info' | 'warning';

const TONE_STYLES: Record<AlertTone, string> = {
  error: 'border-[rgba(255,59,74,0.4)] bg-[rgba(255,59,74,0.1)] text-[color:var(--color-ember-soft)]',
  info: 'border-[rgba(62,166,255,0.35)] bg-[rgba(62,166,255,0.1)] text-[color:var(--color-ion-soft)]',
  warning: 'border-[rgba(245,197,66,0.4)] bg-[rgba(245,197,66,0.1)] text-[color:var(--color-gold)]',
};

/**
 * Error and status messaging. `role="alert"` so screen readers announce a
 * failure the moment it appears rather than on next focus.
 */
export function Alert({
  tone = 'error',
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-xl border px-4 py-3 text-sm leading-relaxed', TONE_STYLES[tone], className)}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="text-[color:var(--color-mist)]">{children}</div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="display text-[0.6875rem] tracking-[0.35em] text-[color:var(--color-mist)]">
      {children}
    </p>
  );
}

/** Shared page frame: header wordmark plus a constrained content column. */
export function PageShell({
  children,
  footer,
  headerRight,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <a href="/" className="rounded-lg" aria-label="MCU Endgame Preparation Quiz — home">
          <Wordmark />
        </a>
        {headerRight}
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 sm:px-6">{children}</main>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs text-[color:var(--color-mist)]/70 sm:px-6">
        {footer ?? (
          <p>
            An unofficial fan-made quiz. Not affiliated with, endorsed by, or connected to Marvel
            Studios or The Walt Disney Company. No official logos or artwork are used.
          </p>
        )}
      </footer>
    </>
  );
}
