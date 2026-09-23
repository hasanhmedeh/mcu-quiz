import { cn } from '@/lib/cn';

/**
 * Original "Endgame Encore" identity.
 *
 * Deliberately built from type and CSS only — there is no Marvel logo, movie
 * poster or official artwork anywhere in this project.
 */
export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <InfinityMark />
      <div className="leading-none">
        <div
          className={cn(
            'display font-black tracking-[0.18em] text-white',
            compact ? 'text-sm' : 'text-base sm:text-lg',
          )}
        >
          ENDGAME
        </div>
        <div
          className={cn(
            'display font-medium tracking-[0.42em] text-[color:var(--color-ion-soft)]',
            compact ? 'text-[0.55rem]' : 'text-[0.65rem]',
          )}
        >
          ENCORE
        </div>
      </div>
    </div>
  );
}

/** Abstract six-point gem cluster: an original mark, not a Marvel device. */
export function InfinityMark({ className, size = 34 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mcu-mark-gradient" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="var(--color-ember)" />
          <stop offset="55%" stopColor="var(--color-arc)" />
          <stop offset="100%" stopColor="var(--color-ion)" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="21" stroke="url(#mcu-mark-gradient)" strokeWidth="2" opacity="0.9" />
      <circle cx="24" cy="24" r="14.5" stroke="url(#mcu-mark-gradient)" strokeWidth="1" opacity="0.4" />
      {[0, 60, 120, 180, 240, 300].map((angle) => {
        const radians = (angle * Math.PI) / 180;
        return (
          <circle
            key={angle}
            cx={24 + Math.cos(radians) * 14.5}
            cy={24 + Math.sin(radians) * 14.5}
            r="2.8"
            fill="url(#mcu-mark-gradient)"
          />
        );
      })}
      <circle cx="24" cy="24" r="4.5" fill="url(#mcu-mark-gradient)" opacity="0.85" />
    </svg>
  );
}
