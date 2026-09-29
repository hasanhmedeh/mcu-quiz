/**
 * Every Marvel screen universe as a set of flows, in release order, all
 * converging on Avengers: Doomsday.
 *
 * The universes outside the MCU (Fox's X-Men, Sony's Spider-Man, the pre-MCU
 * standalones) each merge into the MCU, whose films and series then run into
 * Doomsday. Inside a flow the array order *is* the chronology — `year` is only
 * for display. Series carry the year they premiered, plus `endYear` once they
 * finished.
 *
 * This is the default. The organiser can reorder titles, and move them between
 * flows, from /admin/timeline; that order is stored in Firestore and laid over
 * this list by `applyTimelineOrder` (src/lib/timeline/order.ts).
 */

export type TitleKind = 'film' | 'series' | 'animated' | 'special';

export interface Wordmark {
  /** Small line above the main word, e.g. "The" in "The Incredible Hulk". */
  pre?: string;
  main: string;
  /** Small line below, e.g. "Infinity War". */
  sub?: string;
}

export interface TimelineEntry {
  title: string;
  year: number;
  endYear?: number;
  kind: TitleKind;
  /** How the title is laid out as a wordmark; derived from `title` when omitted. */
  wordmark?: Wordmark;
  /** Optional logo image (e.g. `/logos/iron-man.png` in `public/`), shown instead of the wordmark. */
  logo?: string;
}

export type FlowId = 'xmen' | 'sony' | 'legacy' | 'mcu';

export interface TimelineFlow {
  id: FlowId;
  /** `outer` flows sit side by side and merge into the `mcu` tier below them. */
  tier: 'outer' | 'mcu';
  name: string;
  studio: string;
  /** Brand-neutral accent for the flow's heading and arrows. */
  color: string;
  /** Titles per row on large screens; phones use two and tablets at most three. */
  cols: 2 | 5;
  entries: TimelineEntry[];
  /** Where this flow hands over to the next tier. */
  exit: string;
}

export const DOOMSDAY = {
  title: 'Avengers: Doomsday',
  year: 2026,
  releaseDate: 'December 18, 2026',
  summary:
    'The Multiverse Saga comes to a head. Robert Downey Jr. returns — this time as Victor von Doom — and heroes from the MCU, the Fantastic Four’s world and Fox’s original X-Men team end up in the same fight.',
} as const;

/** Universes that grew up outside the MCU and later crossed into it. */
export const OUTER_FLOWS: TimelineFlow[] = [
  {
    id: 'xmen',
    tier: 'outer',
    name: 'X-Men Universe',
    studio: '20th Century Fox · Marvel Animation',
    color: '#f5c542',
    cols: 2,
    exit: 'Merges into the MCU in Deadpool & Wolverine',
    entries: [
      { title: 'X-Men: The Animated Series', year: 1992, endYear: 1997, kind: 'animated' },
      { title: 'X-Men', year: 2000, kind: 'film' },
      { title: 'X2: X-Men United', year: 2003, kind: 'film', wordmark: { main: 'X2', sub: 'X-Men United' } },
      { title: 'Fantastic Four', year: 2005, kind: 'film' },
      { title: 'X-Men: The Last Stand', year: 2006, kind: 'film' },
      { title: 'Fantastic Four: Rise of the Silver Surfer', year: 2007, kind: 'film' },
      { title: 'X-Men Origins: Wolverine', year: 2009, kind: 'film', wordmark: { pre: 'X-Men Origins', main: 'Wolverine' } },
      { title: 'X-Men: First Class', year: 2011, kind: 'film' },
      { title: 'The Wolverine', year: 2013, kind: 'film' },
      { title: 'X-Men: Days of Future Past', year: 2014, kind: 'film' },
      { title: 'Fantastic Four', year: 2015, kind: 'film', wordmark: { main: 'Fant4stic' } },
      { title: 'Deadpool', year: 2016, kind: 'film' },
      { title: 'X-Men: Apocalypse', year: 2016, kind: 'film' },
      { title: 'Legion', year: 2017, endYear: 2019, kind: 'series' },
      { title: 'Logan', year: 2017, kind: 'film' },
      { title: 'The Gifted', year: 2017, endYear: 2019, kind: 'series' },
      { title: 'Deadpool 2', year: 2018, kind: 'film' },
      { title: 'Dark Phoenix', year: 2019, kind: 'film', wordmark: { pre: 'X-Men', main: 'Dark Phoenix' } },
      { title: 'The New Mutants', year: 2020, kind: 'film' },
      { title: 'X-Men ’97', year: 2024, kind: 'animated' },
    ],
  },
  {
    id: 'sony',
    tier: 'outer',
    name: 'Sony’s Spider-Man Universe',
    studio: 'Sony Pictures · Columbia',
    color: '#3ea6ff',
    cols: 2,
    exit: 'Crosses into the MCU in Spider-Man: No Way Home',
    entries: [
      { title: 'Spider-Man', year: 2002, kind: 'film' },
      { title: 'Spider-Man 2', year: 2004, kind: 'film' },
      { title: 'Spider-Man 3', year: 2007, kind: 'film' },
      { title: 'The Amazing Spider-Man', year: 2012, kind: 'film', wordmark: { pre: 'The Amazing', main: 'Spider-Man' } },
      { title: 'The Amazing Spider-Man 2', year: 2014, kind: 'film', wordmark: { pre: 'The Amazing', main: 'Spider-Man 2' } },
      { title: 'Venom', year: 2018, kind: 'film' },
      { title: 'Spider-Man: Into the Spider-Verse', year: 2018, kind: 'film' },
      { title: 'Venom: Let There Be Carnage', year: 2021, kind: 'film' },
      { title: 'Morbius', year: 2022, kind: 'film' },
      { title: 'Spider-Man: Across the Spider-Verse', year: 2023, kind: 'film' },
      { title: 'Madame Web', year: 2024, kind: 'film' },
      { title: 'Venom: The Last Dance', year: 2024, kind: 'film' },
      { title: 'Kraven the Hunter', year: 2024, kind: 'film', wordmark: { main: 'Kraven', sub: 'The Hunter' } },
    ],
  },
  {
    id: 'legacy',
    tier: 'outer',
    name: 'Legacy Heroes',
    studio: 'New Line · Fox · Lionsgate · Columbia',
    color: '#aab3d4',
    cols: 2,
    exit: 'Blade and Elektra return in Deadpool & Wolverine',
    entries: [
      { title: 'Blade', year: 1998, kind: 'film' },
      { title: 'Blade II', year: 2002, kind: 'film' },
      { title: 'Daredevil', year: 2003, kind: 'film' },
      { title: 'Hulk', year: 2003, kind: 'film' },
      { title: 'The Punisher', year: 2004, kind: 'film' },
      { title: 'Blade: Trinity', year: 2004, kind: 'film' },
      { title: 'Elektra', year: 2005, kind: 'film' },
      { title: 'Ghost Rider', year: 2007, kind: 'film' },
      { title: 'Punisher: War Zone', year: 2008, kind: 'film' },
      { title: 'Ghost Rider: Spirit of Vengeance', year: 2012, kind: 'film' },
    ],
  },
];

/** The MCU itself: films and series together, in release order. */
export const MCU_FLOW: TimelineFlow = {
  id: 'mcu',
  tier: 'mcu',
  name: 'Marvel Cinematic Universe',
  studio: 'Marvel Studios · ABC · Netflix · Hulu · Disney+',
  color: '#ff3b4a',
  cols: 5,
  exit: 'Into Avengers: Doomsday',
  entries: [
    { title: 'Iron Man', year: 2008, kind: 'film' },
    { title: 'The Incredible Hulk', year: 2008, kind: 'film' },
    { title: 'Iron Man 2', year: 2010, kind: 'film' },
    { title: 'Thor', year: 2011, kind: 'film' },
    { title: 'Captain America: The First Avenger', year: 2011, kind: 'film' },
    { title: 'The Avengers', year: 2012, kind: 'film' },
    { title: 'Iron Man 3', year: 2013, kind: 'film' },
    { title: 'Agents of S.H.I.E.L.D.', year: 2013, endYear: 2020, kind: 'series', wordmark: { pre: 'Agents of', main: 'S.H.I.E.L.D.' } },
    { title: 'Thor: The Dark World', year: 2013, kind: 'film' },
    { title: 'Captain America: The Winter Soldier', year: 2014, kind: 'film' },
    { title: 'Guardians of the Galaxy', year: 2014, kind: 'film', wordmark: { main: 'Guardians', sub: 'of the Galaxy' } },
    { title: 'Agent Carter', year: 2015, endYear: 2016, kind: 'series' },
    { title: 'Daredevil', year: 2015, endYear: 2018, kind: 'series' },
    { title: 'Avengers: Age of Ultron', year: 2015, kind: 'film' },
    { title: 'Ant-Man', year: 2015, kind: 'film' },
    { title: 'Jessica Jones', year: 2015, endYear: 2019, kind: 'series' },
    { title: 'Captain America: Civil War', year: 2016, kind: 'film' },
    { title: 'Luke Cage', year: 2016, endYear: 2018, kind: 'series' },
    { title: 'Doctor Strange', year: 2016, kind: 'film' },
    { title: 'Iron Fist', year: 2017, endYear: 2018, kind: 'series' },
    { title: 'Guardians of the Galaxy Vol. 2', year: 2017, kind: 'film', wordmark: { main: 'Guardians', sub: 'of the Galaxy Vol. 2' } },
    { title: 'Spider-Man: Homecoming', year: 2017, kind: 'film' },
    { title: 'The Defenders', year: 2017, kind: 'series' },
    { title: 'Inhumans', year: 2017, kind: 'series' },
    { title: 'Thor: Ragnarok', year: 2017, kind: 'film' },
    { title: 'The Punisher', year: 2017, endYear: 2019, kind: 'series' },
    { title: 'Runaways', year: 2017, endYear: 2019, kind: 'series' },
    { title: 'Black Panther', year: 2018, kind: 'film' },
    { title: 'Avengers: Infinity War', year: 2018, kind: 'film' },
    { title: 'Cloak & Dagger', year: 2018, endYear: 2019, kind: 'series' },
    { title: 'Ant-Man and the Wasp', year: 2018, kind: 'film', wordmark: { main: 'Ant-Man', sub: 'and the Wasp' } },
    { title: 'Captain Marvel', year: 2019, kind: 'film' },
    { title: 'Avengers: Endgame', year: 2019, kind: 'film' },
    { title: 'Spider-Man: Far From Home', year: 2019, kind: 'film' },
    { title: 'Helstrom', year: 2020, kind: 'series' },
    { title: 'WandaVision', year: 2021, kind: 'series' },
    { title: 'The Falcon and the Winter Soldier', year: 2021, kind: 'series', wordmark: { pre: 'The Falcon and the', main: 'Winter Soldier' } },
    { title: 'Loki', year: 2021, kind: 'series' },
    { title: 'Black Widow', year: 2021, kind: 'film' },
    { title: 'What If...?', year: 2021, kind: 'animated' },
    {
      title: 'Shang-Chi and the Legend of the Ten Rings',
      year: 2021,
      kind: 'film',
      wordmark: { main: 'Shang-Chi', sub: 'and the Legend of the Ten Rings' },
    },
    { title: 'Eternals', year: 2021, kind: 'film' },
    { title: 'Hawkeye', year: 2021, kind: 'series' },
    { title: 'Spider-Man: No Way Home', year: 2021, kind: 'film' },
    { title: 'Moon Knight', year: 2022, kind: 'series' },
    {
      title: 'Doctor Strange in the Multiverse of Madness',
      year: 2022,
      kind: 'film',
      wordmark: { main: 'Doctor Strange', sub: 'in the Multiverse of Madness' },
    },
    { title: 'Ms. Marvel', year: 2022, kind: 'series' },
    { title: 'Thor: Love and Thunder', year: 2022, kind: 'film' },
    { title: 'I Am Groot', year: 2022, kind: 'animated' },
    { title: 'She-Hulk: Attorney at Law', year: 2022, kind: 'series' },
    { title: 'Werewolf by Night', year: 2022, kind: 'special' },
    { title: 'Black Panther: Wakanda Forever', year: 2022, kind: 'film' },
    {
      title: 'The Guardians of the Galaxy Holiday Special',
      year: 2022,
      kind: 'special',
      wordmark: { pre: 'The', main: 'Guardians', sub: 'Holiday Special' },
    },
    { title: 'Ant-Man and the Wasp: Quantumania', year: 2023, kind: 'film', wordmark: { pre: 'Ant-Man and the Wasp', main: 'Quantumania' } },
    { title: 'Guardians of the Galaxy Vol. 3', year: 2023, kind: 'film', wordmark: { main: 'Guardians', sub: 'of the Galaxy Vol. 3' } },
    { title: 'Secret Invasion', year: 2023, kind: 'series' },
    { title: 'Loki — Season 2', year: 2023, kind: 'series' },
    { title: 'The Marvels', year: 2023, kind: 'film' },
    { title: 'What If...? — Season 2', year: 2023, kind: 'animated' },
    { title: 'Echo', year: 2024, kind: 'series' },
    { title: 'Deadpool & Wolverine', year: 2024, kind: 'film', wordmark: { main: 'Deadpool', sub: '& Wolverine' } },
    { title: 'Agatha All Along', year: 2024, kind: 'series' },
    { title: 'What If...? — Season 3', year: 2024, kind: 'animated' },
    {
      title: 'Your Friendly Neighborhood Spider-Man',
      year: 2025,
      kind: 'animated',
      wordmark: { pre: 'Your Friendly Neighborhood', main: 'Spider-Man' },
    },
    { title: 'Captain America: Brave New World', year: 2025, kind: 'film' },
    { title: 'Daredevil: Born Again', year: 2025, kind: 'series' },
    { title: 'Thunderbolts*', year: 2025, kind: 'film' },
    { title: 'Ironheart', year: 2025, kind: 'series' },
    { title: 'The Fantastic Four: First Steps', year: 2025, kind: 'film' },
    { title: 'Eyes of Wakanda', year: 2025, kind: 'animated', wordmark: { pre: 'Eyes of', main: 'Wakanda' } },
    { title: 'Marvel Zombies', year: 2025, kind: 'animated' },
    { title: 'Wonder Man', year: 2026, kind: 'series' },
    { title: 'Daredevil: Born Again — Season 2', year: 2026, kind: 'series', wordmark: { main: 'Daredevil', sub: 'Born Again · Season 2' } },
    { title: 'The Punisher — Special Presentation', year: 2026, kind: 'special', wordmark: { main: 'Punisher', sub: 'Special Presentation' } },
    { title: 'Spider-Man: Brand New Day', year: 2026, kind: 'film' },
    { title: 'VisionQuest', year: 2026, kind: 'series' },
  ],
};

/** Every flow in page order: the outer universes first, then the MCU. */
export const DEFAULT_FLOWS: TimelineFlow[] = [...OUTER_FLOWS, MCU_FLOW];

/**
 * Stable id for a title, used to store the organiser's order. Title plus year,
 * so "Daredevil" (2003 film) and "Daredevil" (2015 series) stay apart.
 */
export function entryKey(entry: Pick<TimelineEntry, 'title' | 'year'>): string {
  const slug = entry.title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}-${entry.year}`;
}

/** "Avengers: Infinity War" → main "Avengers", sub "Infinity War"; a leading "The" moves above. */
export function wordmarkFor(entry: TimelineEntry): Wordmark {
  if (entry.wordmark) return entry.wordmark;
  const [head = entry.title, ...rest] = entry.title.split(/: | — /);
  const sub = rest.length ? rest.join(' · ') : undefined;
  const leadingThe = /^The (.+)$/.exec(head);
  return leadingThe?.[1] ? { pre: 'The', main: leadingThe[1], sub } : { main: head, sub };
}

export function yearLabel(entry: TimelineEntry): string {
  return entry.endYear && entry.endYear !== entry.year ? `${entry.year}–${entry.endYear}` : String(entry.year);
}
