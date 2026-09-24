import { NameGate } from '@/components/quiz/NameGate';
import { PageShell, SectionLabel } from '@/components/ui/primitives';
import { EXAM_BLUEPRINT, PASSING_SCORE, QUESTION_TIME_SECONDS, TOTAL_QUESTIONS } from '@/types';

const FILMS = [
  'Iron Man',
  'The Incredible Hulk',
  'Iron Man 2',
  'Thor',
  'Captain America: The First Avenger',
  'The Avengers',
  'Iron Man 3',
  'Thor: The Dark World',
  'Captain America: The Winter Soldier',
  'Guardians of the Galaxy',
  'Avengers: Age of Ultron',
  'Ant-Man',
  'Captain America: Civil War',
  'Doctor Strange',
  'Guardians of the Galaxy Vol. 2',
  'Spider-Man: Homecoming',
  'Thor: Ragnarok',
  'Black Panther',
  'Avengers: Infinity War',
  'Ant-Man and the Wasp',
  'Captain Marvel',
] as const;

export default function HomePage() {
  return (
    <PageShell>
      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-start lg:gap-12">
        <section className="fade-up">
          <SectionLabel>Before you enter the Endgame…</SectionLabel>

          <h1 className="display mt-4 text-4xl font-black leading-[1.05] text-white sm:text-5xl lg:text-6xl">
            How well do you{' '}
            <span className="text-[color:var(--color-ember)] text-glow-ember">really</span> know the
            MCU?
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-[color:var(--color-mist)] sm:text-lg">
            One exam. Twenty-one films, from <em>Iron Man</em> (2008) to <em>Captain Marvel</em>{' '}
            (2019). It decides whether you are cleared for the Endgame screening — or whether you
            have some rewatching to do.
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={String(TOTAL_QUESTIONS)} label="Questions" accent="text-white" />
            <Stat value={String(EXAM_BLUEPRINT.easy)} label="Easy" accent="text-[color:var(--color-ion)]" />
            <Stat value={String(EXAM_BLUEPRINT.medium)} label="Medium" accent="text-[color:var(--color-arc)]" />
            <Stat value={String(EXAM_BLUEPRINT.hard)} label="Hard" accent="text-[color:var(--color-ember)]" />
          </dl>

          <p className="display mt-6 text-sm tracking-[0.18em] text-[color:var(--color-gold)]">
            {PASSING_SCORE} / {TOTAL_QUESTIONS} to prove you are ready
          </p>

          <ul className="mt-8 space-y-2.5 text-sm text-[color:var(--color-mist)]">
            <Rule>
              {QUESTION_TIME_SECONDS} seconds per question, and no going back. Run out of time and
              it counts as wrong.
            </Rule>
            <Rule>No spoilers — nothing after <em>Captain Marvel</em> is on the exam.</Rule>
            <Rule>Answers are graded on the server. You will see your score at the end.</Rule>
            <Rule>One attempt per person. Choose your moment.</Rule>
          </ul>
        </section>

        <section className="panel panel-glow fade-up p-6 sm:p-7">
          <h2 className="display text-lg font-bold text-white">Sign in to the exam</h2>
          <p className="mt-1.5 mb-6 text-sm text-[color:var(--color-mist)]">
            Use the name your friends know you by — it goes on the ticket.
          </p>
          <NameGate />
        </section>
      </div>

      <section className="mt-16 fade-up">
        <SectionLabel>Everything on the syllabus</SectionLabel>
        <ul className="mt-4 flex flex-wrap gap-2">
          {FILMS.map((film) => (
            <li
              key={film}
              className="rounded-full border border-[rgba(143,208,255,0.16)] bg-[rgba(13,16,36,0.6)] px-3 py-1.5 text-xs text-[color:var(--color-mist)]"
            >
              {film}
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div className="stat-card">
      <dt className="text-[0.6875rem] uppercase tracking-[0.16em] text-[color:var(--color-mist)]">
        {label}
      </dt>
      <dd className={`display mt-1 text-2xl font-black ${accent}`}>{value}</dd>
    </div>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden="true" className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-ion)]" />
      <span>{children}</span>
    </li>
  );
}
