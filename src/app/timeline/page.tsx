import { Fragment, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Bebas_Neue, Cinzel } from 'next/font/google';
import { PageShell, SectionLabel } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { getTimelineFlows } from '@/lib/timeline/service';
import {
  DOOMSDAY,
  entryKey,
  wordmarkFor,
  yearLabel,
  type TimelineEntry,
  type TimelineFlow,
  type TitleKind,
} from '@/data/timeline';
import { trailerIdFor, trailerSearchUrl } from '@/data/trailers';
import { TrailerButton } from '@/components/timeline/TrailerButton';
import { WatchToggle, WatchedProvider } from '@/components/account/Watched';
import { getCurrentAccount } from '@/lib/account/service';

// The organiser can reorder the timeline at any time from /admin/timeline.
export const dynamic = 'force-dynamic';

// Poster-style type for the wordmarks; only this page loads them.
const logoFont = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-logo', display: 'swap' });
const mythFont = Cinzel({ weight: ['700', '900'], subsets: ['latin'], variable: '--font-myth', display: 'swap' });

export const metadata = {
  title: 'The Road to Doomsday — Endgame Encore',
  description:
    'Every Marvel film and series — MCU, X-Men, Sony and more — as one flowchart in release order, all leading to Avengers: Doomsday.',
};

const KIND_LABEL: Record<TitleKind, string | null> = {
  film: null,
  series: 'Series',
  animated: 'Animated',
  special: 'Special',
};

/**
 * Colour treatment for each wordmark, picked from the title. Order matters:
 * the first match wins, so "Deadpool & Wolverine" is a Deadpool mark.
 */
const LOOKS: [RegExp, string][] = [
  [/doomsday/i, 'doom'],
  [/deadpool/i, 'merc'],
  [/spider-verse|what if/i, 'verse'],
  [/spider-man/i, 'spider'],
  [/iron man|ironheart|shang-chi/i, 'iron'],
  [/hulk/i, 'gamma'],
  [/thor|eternals|loki/i, 'myth'],
  [/captain america|falcon|agent carter/i, 'cap'],
  [/guardians|groot/i, 'cosmic'],
  [/panther|wakanda/i, 'panther'],
  [/strange|iron fist/i, 'mystic'],
  [/captain marvel|the marvels|ms\. marvel|wonder man/i, 'marvel'],
  [/ant-man/i, 'ant'],
  [/black widow/i, 'widow'],
  [/wandavision|agatha|visionquest|jessica jones/i, 'hex'],
  [/wolverine|logan|luke cage/i, 'claw'],
  [/fantastic four/i, 'four'],
  [/x-men|x2|legion|gifted|mutants|phoenix/i, 'mutant'],
  [/venom|kraven|madame web/i, 'symbiote'],
  [/daredevil|elektra/i, 'devil'],
  [/punisher/i, 'skull'],
  [/blade|morbius|helstrom|werewolf/i, 'blood'],
  [/ghost rider/i, 'hellfire'],
  [/zombies|secret invasion/i, 'gamma'],
  [/s\.h\.i\.e\.l\.d|inhumans|runaways|cloak/i, 'shield'],
];

function lookFor(title: string) {
  return LOOKS.find(([pattern]) => pattern.test(title))?.[1] ?? 'steel';
}

function flowStyle(color: string): CSSProperties {
  return { '--flow': color } as CSSProperties;
}

/** Static class names, so Tailwind can see them. */
const GRID_COLUMNS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
};

export default async function TimelinePage() {
  // A branch the organiser has emptied is left off the page.
  const flows = (await getTimelineFlows()).filter((flow) => flow.entries.length > 0);
  const outer = flows.filter((flow) => flow.tier === 'outer');
  const mcu = flows.filter((flow) => flow.tier === 'mcu');
  const outerColumns = GRID_COLUMNS[outer.length] ?? 'lg:grid-cols-3';
  const hasStars = flows.some((flow) => flow.entries.some((entry) => entry.important));
  const account = await getCurrentAccount();

  return (
    <PageShell
      wide
      headerRight={
        <div className="flex gap-2">
          <Link href="/" className="btn btn-ghost min-h-0 px-4 py-2 text-sm">
            Back to the exam
          </Link>
          <Link href="/account" className="btn btn-ghost min-h-0 px-4 py-2 text-sm">
            {account ? 'My account' : 'Sign in'}
          </Link>
        </div>
      }
    >
      <WatchedProvider signedIn={account !== null} initialWatched={Object.keys(account?.watched ?? {})}>
        <div className={cn(logoFont.variable, mythFont.variable)}>
          <section className="fade-up text-center">
            <SectionLabel>The multiverse, mapped</SectionLabel>
            <h1 className="display mt-4 text-4xl font-black leading-[1.05] text-white sm:text-5xl">
              The road to{' '}
              <span className="text-[color:var(--color-doom)] text-glow-doom">Doomsday</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[color:var(--color-mist)] sm:text-lg">
              Every Marvel film and series in release order. The universes that grew up outside the
              MCU cross into it, and every line ends at <em>{DOOMSDAY.title}</em>.
            </p>
            {hasStars ? <StarLegend /> : null}
            {account ? null : (
              <p className="mt-4 text-sm text-[color:var(--color-mist)]">
                <Link href="/account" className="text-[color:var(--color-ion-soft)] underline">
                  Sign in
                </Link>{' '}
                to tick off what you have watched and get suggestions for what to watch next.
              </p>
            )}
          </section>
          {hasStars ? <StarPopover /> : null}

          {outer.length > 0 ? (
            <>
              <Tier label="Beyond the MCU" flows={outer} columns={outerColumns} />
              <Converge count={outer.length} className={outerColumns} />
            </>
          ) : null}

          {mcu.length > 0 ? (
            <>
              <Tier flows={mcu} columns="" />
              <Converge count={1} className="lg:grid-cols-1" />
            </>
          ) : null}
          <Finale />
        </div>
      </WatchedProvider>
    </PageShell>
  );
}

/* ------------------------------------------------------------------
   Tiers and flows
   ------------------------------------------------------------------ */

function Tier({ label, flows, columns }: { label?: string; flows: TimelineFlow[]; columns: string }) {
  return (
    <section className="mt-14 fade-up">
      {label ? (
        <p className="display mb-6 text-center text-[0.7rem] tracking-[0.35em] text-[color:var(--color-mist)]">
          {label}
        </p>
      ) : null}
      <div className={cn('grid gap-12 lg:gap-8', columns)}>
        {flows.map((flow) => (
          <Flow key={flow.id} flow={flow} />
        ))}
      </div>
    </section>
  );
}

function Flow({ flow }: { flow: TimelineFlow }) {
  return (
    <article
      id={flow.id}
      aria-labelledby={`${flow.id}-heading`}
      style={flowStyle(flow.color)}
      className="flex scroll-mt-6 flex-col"
    >
      <header className="flow-header">
        <h2 id={`${flow.id}-heading`} className="display text-base font-black tracking-[0.14em] text-white">
          {flow.name}
        </h2>
        <p className="mt-1 text-[0.7rem] tracking-[0.12em] text-[color:var(--flow)] uppercase">{flow.studio}</p>
      </header>

      {/* Two titles per row on phones, three on tablets; the snake is recomputed for each. */}
      {flow.cols === 2 ? (
        <Serpentine entries={flow.entries} cols={2} />
      ) : (
        <>
          <Serpentine entries={flow.entries} cols={2} className="sm:hidden" />
          <Serpentine entries={flow.entries} cols={3} className="hidden sm:block lg:hidden" />
          <Serpentine entries={flow.entries} cols={flow.cols} className="hidden lg:block" />
        </>
      )}

      <p className="flow-exit">{flow.exit}</p>
      {/* Stretches shorter flows down to the shared bracket below. */}
      <span aria-hidden="true" className="flow-tail" />
    </article>
  );
}

/**
 * Lays titles out as a snake: left→right, down, right→left, down, and so on,
 * like a board game path. Reversed rows use an RTL grid so a short last row
 * still starts from the turn.
 */
function Serpentine({ entries, cols, className }: { entries: TimelineEntry[]; cols: number; className?: string }) {
  const rows: TimelineEntry[][] = [];
  for (let i = 0; i < entries.length; i += cols) rows.push(entries.slice(i, i + cols));
  // Wide gutters so each link reads as a line between titles, not a glyph.
  const template = Array.from({ length: cols }, () => 'minmax(0,1fr)').join(' var(--link-gap) ');
  const lastColumn = cols * 2 - 1;

  return (
    <ol className={cn('flow-snake mt-5', className)}>
      {rows.map((row, r) => {
        const reversed = r % 2 === 1;
        const isLast = r === rows.length - 1;
        const direction = reversed ? 'rtl' : 'ltr';
        return (
          <li key={r}>
            <ol className="grid items-center" style={{ gridTemplateColumns: template, direction }}>
              {row.map((entry, j) => (
                <Fragment key={entryKey(entry)}>
                  <li style={{ gridColumn: j * 2 + 1, direction: 'ltr' }}>
                    <Logo entry={entry} />
                  </li>
                  {j < row.length - 1 ? (
                    <li aria-hidden="true" style={{ gridColumn: j * 2 + 2 }}>
                      <FlowLink axis="x" reversed={reversed} step={r * cols + j} />
                    </li>
                  ) : null}
                </Fragment>
              ))}
            </ol>
            <div aria-hidden="true" className="grid" style={{ gridTemplateColumns: template, direction }}>
              <span style={{ gridColumn: isLast ? (row.length - 1) * 2 + 1 : lastColumn }}>
                <FlowLink axis="y" step={r * cols + row.length - 1} />
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A connector between two titles: a dashed line that marches in the reading
 * direction, with a glowing pulse travelling along it. `step` staggers the
 * pulses so they ripple down the snake instead of firing all at once.
 */
function FlowLink({ axis, reversed = false, step }: { axis: 'x' | 'y'; reversed?: boolean; step: number }) {
  return (
    <span
      className={cn('flow-link', axis === 'x' ? 'flow-link-x' : 'flow-link-y', reversed && 'flow-link-reverse')}
      style={{ '--link-delay': `${(step % 12) * 0.22}s` } as CSSProperties}
    >
      <span className="flow-pulse" />
    </span>
  );
}

function Logo({ entry }: { entry: TimelineEntry }) {
  const kind = KIND_LABEL[entry.kind];
  return (
    <div className={cn('logo-tile', entry.important && 'logo-tile-important')}>
      <div className="logo-art" aria-label={`${entry.title}, ${yearLabel(entry)}`} role="img">
        {entry.logo ? (
          <span className="relative block h-14 w-full">
            <Image src={entry.logo} alt="" fill sizes="200px" className="object-contain" />
          </span>
        ) : (
          <Wordmark title={entry.title} mark={wordmarkFor(entry)} />
        )}
        <span className="logo-year">
          {yearLabel(entry)}
          {kind ? <span className="opacity-70"> · {kind}</span> : null}
        </span>
      </div>
      <span className="flex flex-wrap justify-center gap-1.5">
        <TrailerLink entry={entry} />
        <WatchToggle titleKey={entryKey(entry)} title={entry.title} />
      </span>
      {entry.important ? (
        <button
          type="button"
          popoverTarget={STAR_POPOVER_ID}
          className="logo-star"
          aria-label={`${entry.title} is starred. What does the star mean?`}
        >
          ★
        </button>
      ) : null}
    </div>
  );
}

/** Plays the trailer in a popup; a title with no trailer on file links to a YouTube search instead. */
function TrailerLink({ entry, className }: { entry: Pick<TimelineEntry, 'title' | 'year'>; className?: string }) {
  const videoId = trailerIdFor(entry);
  if (videoId) return <TrailerButton title={entry.title} videoId={videoId} className={className} />;
  return (
    <a
      href={trailerSearchUrl(entry)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('trailer-link', className)}
      aria-label={`Watch the ${entry.title} trailer on YouTube (opens in a new tab)`}
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
        <path d="M3 1.8v8.4L10 6z" />
      </svg>
      Trailer
    </a>
  );
}

/* ------------------------------------------------------------------
   The star: titles the organiser marked important in /admin/timeline.
   ------------------------------------------------------------------ */

const STAR_POPOVER_ID = 'star-info';
const STAR_MEANING = 'Starred titles were picked by the admin as must-watches on the road to Doomsday.';

function StarLegend() {
  return (
    <p className="star-legend">
      <span aria-hidden="true" className="star-legend-star">
        ★
      </span>
      {STAR_MEANING}
    </p>
  );
}

/**
 * One shared popup that every star opens. A native popover, so it needs no
 * client code: clicking outside it or pressing Escape closes it.
 */
function StarPopover() {
  return (
    <div id={STAR_POPOVER_ID} popover="auto" className="star-popover" aria-labelledby="star-info-title">
      <p id="star-info-title" className="flex items-center gap-2 font-semibold text-white">
        <span aria-hidden="true" className="star-legend-star">
          ★
        </span>
        What does the star mean?
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-mist)]">{STAR_MEANING}</p>
      <button
        type="button"
        popoverTarget={STAR_POPOVER_ID}
        popoverTargetAction="hide"
        className="btn btn-ghost mt-4 min-h-0 w-full px-4 py-2 text-sm"
      >
        Got it
      </button>
    </div>
  );
}

function Wordmark({
  title,
  mark,
  large = false,
}: {
  title: string;
  mark: ReturnType<typeof wordmarkFor>;
  large?: boolean;
}) {
  const look = lookFor(title);
  const length = mark.main.length;
  const size = large
    ? 'text-6xl sm:text-7xl'
    : length <= 6
      ? 'text-[2rem]'
      : length <= 10
        ? 'text-[1.6rem]'
        : length <= 14
          ? 'text-[1.3rem]'
          : 'text-[1.1rem]';
  return (
    <span className={cn('wm', `wm-${look}`)}>
      {mark.pre ? <span className="wm-small">{mark.pre}</span> : null}
      <span className={cn('wm-main', size)}>{mark.main}</span>
      {mark.sub ? <span className="wm-small">{mark.sub}</span> : null}
    </span>
  );
}

function Arrow({ direction }: { direction: 'left' | 'right' | 'down' }) {
  const rotate = { right: '', left: 'rotate-180', down: 'rotate-90' }[direction];
  return (
    <svg viewBox="0 0 24 12" className={cn('h-3 w-5', rotate)} fill="none" aria-hidden="true">
      <path d="M1 6h20M16 1.5 21 6l-5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------
   Brackets that pull the flows above into one line below.
   ------------------------------------------------------------------ */

function Converge({ count, className }: { count: number; className: string }) {
  return (
    <div aria-hidden="true">
      {/* Side-by-side columns: a bracket joining every column's centre. A single
          column has nothing to join, so its tail runs straight into the stem. */}
      <div className={cn('hidden lg:gap-8', count > 1 && 'lg:grid', className)}>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={cn(
              'converge-cell',
              i === 0 && 'converge-first',
              i === count - 1 && 'converge-last',
            )}
          />
        ))}
      </div>
      <div className="converge-stem hidden lg:flex">
        <span className="converge-line" />
        <Arrow direction="down" />
      </div>
      {/* Stacked columns on smaller screens: one arrow down. */}
      <div className="converge-stem flex lg:hidden">
        <span className="converge-line" />
        <Arrow direction="down" />
      </div>
    </div>
  );
}

function Finale() {
  return (
    <section
      id="doomsday"
      aria-labelledby="doomsday-heading"
      className="doom-panel mx-auto max-w-2xl scroll-mt-6 px-6 py-10 text-center fade-up"
    >
      <h2 id="doomsday-heading" className="sr-only">
        {DOOMSDAY.title}
      </h2>
      <div aria-hidden="true" className="flex flex-col items-center">
        <Wordmark title="Avengers" mark={{ main: 'Avengers' }} large />
        <span className="wm wm-doom -mt-1">
          <span className="wm-main text-4xl tracking-[0.3em] sm:text-5xl">Doomsday</span>
        </span>
      </div>
      <p className="display mt-5 text-[0.7rem] tracking-[0.3em] text-[color:var(--color-doom)]">
        In cinemas {DOOMSDAY.releaseDate}
      </p>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[color:var(--color-mist)] sm:text-base">
        {DOOMSDAY.summary}
      </p>
      <TrailerLink entry={DOOMSDAY} className="mt-5" />
    </section>
  );
}
