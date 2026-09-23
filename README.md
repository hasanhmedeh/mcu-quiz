# MCU Endgame Preparation Quiz

A cinematic, single-attempt knowledge exam covering the Marvel Cinematic Universe from
**Iron Man (2008)** through **Captain Marvel (2019)** — built to settle, once and for all, who
among your friends is actually ready for *Avengers: Endgame*.

Forty questions. Twenty easy, fifteen medium, five hard. Thirty-five to pass. One attempt each,
enforced on the server, with a printable "Endgame Encore" ticket for whoever clears the bar.

> Unofficial and fan-made. No Marvel logos, posters, artwork or other official assets are used
> anywhere in this project — the entire visual identity is original.

---

## Table of contents

1. [What this is](#1-what-this-is)
2. [Requirements](#2-requirements)
3. [Installation](#3-installation)
4. [Creating the Firebase project](#4-creating-the-firebase-project)
5. [Firestore setup](#5-firestore-setup)
6. [Getting your Firebase credentials](#6-getting-your-firebase-credentials)
7. [Environment variables](#7-environment-variables)
8. [Local development](#8-local-development)
9. [Running checks](#9-running-checks)
10. [Deploying to Vercel](#10-deploying-to-vercel)
11. [Vercel environment variables](#11-vercel-environment-variables)
12. [Admin login](#12-admin-login)
13. [How retakes work](#13-how-retakes-work)
14. [Adding and editing questions](#14-adding-and-editing-questions)
15. [Security considerations](#15-security-considerations)
16. [Project structure](#16-project-structure)

---

## 1. What this is

| | |
| --- | --- |
| **Exam** | 40 questions — 20 easy, 15 medium, 5 hard |
| **Pass mark** | 35 / 40 |
| **Attempts** | One per person, enforced server-side in a Firestore transaction |
| **Timer** | None — this tests knowledge, not speed |
| **Scoring** | Entirely server-side; the browser never receives the answer key |
| **Reward** | A downloadable, printable ticket with a QR verification link |
| **Admin** | Password-protected dashboard with stats, search, history and retakes |

**Stack:** Next.js (App Router) · React · TypeScript (strict) · Tailwind CSS v4 ·
Firebase Admin SDK · Firestore · Vitest · pnpm · deployable to Vercel with no custom server.

---

## 2. Requirements

- **Node.js 20.9** or newer
- **pnpm 10** or newer — `corepack enable pnpm`, or `npm install -g pnpm`
- A **Google account** (for Firebase)
- A **Vercel account** (for deployment)

This project uses pnpm. `pnpm-lock.yaml` is the committed lockfile; there is no
`package-lock.json`.

### Toolchain version notes

Two dev dependencies are deliberately held back, because the newest releases do not yet work
together:

- **TypeScript is pinned to `^6`.** TypeScript 7 (the native compiler) is out, but
  `typescript-eslint` — which `eslint-config-next` depends on — does not support it yet and
  refuses to load. TS 6 compiles this project identically.
- **ESLint is pinned to `^9`.** `eslint-plugin-react` (pulled in by `eslint-config-next`) still
  declares a `^9.7` peer range and crashes on ESLint 10's removal of `context.getFilename()`.

Both can be raised once the Next.js ESLint config catches up; nothing in the source code depends
on the older versions.

---

## 3. Installation

```bash
git clone <your-repo-url>
cd mcu-quiz
pnpm install
```

`pnpm install` will ask to approve build scripts for three dependencies the first time. They are
already pre-approved in `pnpm-workspace.yaml`, so this should run without prompting.

---

## 4. Creating the Firebase project

1. Go to <https://console.firebase.google.com/> and sign in.
2. Click **Create a project** (or **Add project**).
3. Enter a project name, e.g. `mcu-endgame-quiz`. Click **Continue**.
4. Google Analytics is **not needed** — toggle it off and click **Create project**.
5. Wait for provisioning, then click **Continue**.

---

## 5. Firestore setup

1. In the left sidebar, open **Build → Firestore Database**.
2. Click **Create database**.
3. Choose **Start in production mode** (locked down — correct for this app, since all access is
   server-side). Click **Next**.
4. Pick a location close to your friends, e.g. `eur3` or `nam5`. Click **Enable**.

That is all the setup Firestore needs — collections (`users`, `attempts`, `tickets`,
`rateLimits`) are created automatically on first write.

### Deploying the security rules

`firestore.rules` in this repo denies **all** direct client access. Publish it:

**Via the console (easiest):**
Open **Firestore Database → Rules**, paste the contents of `firestore.rules`, click **Publish**.

**Via the CLI:**

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # select your project
firebase deploy --only firestore:rules
```

---

## 6. Getting your Firebase credentials

The app authenticates to Firestore with a **service account** — there is no browser-side Firebase
SDK, so you do **not** need the web API key, auth domain, or app ID.

1. In the Firebase Console, click the **gear icon** next to *Project Overview* → **Project
   settings**.
2. Open the **Service accounts** tab.
3. Make sure **Node.js** is selected, then click **Generate new private key**.
4. Confirm with **Generate key**. A JSON file downloads. **Treat it like a password.**
5. Open the JSON. You need three values from it:

   | JSON field | Environment variable |
   | --- | --- |
   | `project_id` | `FIREBASE_PROJECT_ID` |
   | `client_email` | `FIREBASE_CLIENT_EMAIL` |
   | `private_key` | `FIREBASE_PRIVATE_KEY` |

> **The private key is the fiddly one.** In the JSON it is a single line containing literal `\n`
> escape sequences. Copy it **exactly as it appears**, including those `\n` sequences and the
> surrounding double quotes. The app un-escapes them at startup.
>
> Never commit this file. `.gitignore` already excludes `*serviceAccount*.json` and
> `firebase-adminsdk*.json`.

**Alternative:** set `FIREBASE_SERVICE_ACCOUNT_JSON` to the entire JSON blob (raw or
base64-encoded) instead of the three separate variables. Useful where a dashboard mangles
multi-line values.

---

## 7. Environment variables

A `.env.local` has already been created for you with a generated `SESSION_SECRET` and your admin
credentials filled in. **The three Firebase values are still blank** — add them and you are ready
to run. (Starting fresh instead? `cp .env.example .env.local`.)

| Variable | Required | What it is |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | yes* | `project_id` from the service-account JSON |
| `FIREBASE_CLIENT_EMAIL` | yes* | `client_email` from the same file |
| `FIREBASE_PRIVATE_KEY` | yes* | `private_key`, quoted, with `\n` escapes intact |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | alternative | The whole JSON (raw or base64) instead of the three above |
| `SESSION_SECRET` | yes | Signs the HttpOnly session cookies. 16+ chars. `openssl rand -base64 32` |
| `ADMIN_USERNAME` | yes | Organiser sign-in for `/admin` |
| `ADMIN_PASSWORD` | yes | Organiser password — use a strong one |
| `NEXT_PUBLIC_SITE_URL` | no | Absolute origin for QR links. Only needed behind a custom domain or proxy |

\* Required unless you use `FIREBASE_SERVICE_ACCOUNT_JSON`.

Once the app is running, `GET /api/health` reports which of these are present (never their
values).

---

## 8. Local development

```bash
pnpm dev
```

Open <http://localhost:3000>.

| Route | What it is |
| --- | --- |
| `/` | Introduction and name entry |
| `/quiz` | The exam (requires an active session cookie) |
| `/result/[attemptId]` | Pass or fail screen, plus the ticket |
| `/verify` · `/verify/[ticketId]` | Public ticket verification (the QR target) |
| `/admin` | Organiser dashboard (password protected) |
| `/api/health` | Configuration self-check |

---

## 9. Running checks

```bash
pnpm lint        # ESLint
pnpm typecheck   # tsc --noEmit
pnpm test        # Vitest
pnpm check       # all three
pnpm build       # production build
```

The test suite covers name normalization, exam composition, randomization, server-side scoring,
pass/fail boundaries, ticket generation, duplicate-attempt prevention (including two racing
tabs), retake authorization, and question-bank integrity. Firestore is replaced by an in-memory
fake that models optimistic-concurrency retries, so the transactional guarantees are actually
exercised rather than assumed.

---

## 10. Deploying to Vercel

1. Push this repository to GitHub, GitLab or Bitbucket.
2. Go to <https://vercel.com/new> and **import** the repository.
3. Vercel detects Next.js automatically. Leave the build settings alone — it will pick up pnpm
   from `pnpm-lock.yaml` and the `packageManager` field.
4. **Before clicking Deploy**, expand **Environment Variables** and add the variables from the
   next section.
5. Click **Deploy**.

No custom server, Docker image, or long-running Node process is required; everything runs as
Next.js route handlers on Vercel's serverless runtime.

### CLI alternative

```bash
npm install -g vercel
vercel          # preview deployment
vercel --prod   # production
```

---

## 11. Vercel environment variables

In **Project → Settings → Environment Variables**, add each of these for **Production**,
**Preview** and **Development**:

| Name | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | from the service-account JSON |
| `FIREBASE_CLIENT_EMAIL` | from the service-account JSON |
| `FIREBASE_PRIVATE_KEY` | from the service-account JSON |
| `SESSION_SECRET` | a fresh random string (not the one from your laptop) |
| `ADMIN_USERNAME` | your organiser username |
| `ADMIN_PASSWORD` | your organiser password |

**Pasting the private key into Vercel:** paste the value exactly as it appears in the JSON,
including the `\n` sequences. Vercel's input accepts it as a single line. The app handles both
`\n`-escaped and genuinely multi-line values, and strips wrapping quotes if you include them.

After adding variables to an existing project, **redeploy** — environment variables are baked in
at build time.

Then visit `https://your-app.vercel.app/api/health`; every check should report `true`.

---

## 12. Admin login

The organiser dashboard lives at `/admin` and is protected by credentials held **only** in
environment variables:

```
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
```

They are never bundled into client JavaScript, returned by an API, rendered into HTML, written to
Firestore, or stored in the browser. Sign-in posts to a route handler that compares them
server-side in constant time, then issues an HttpOnly, SameSite=Strict, Secure session cookie
signed with `SESSION_SECRET` and valid for eight hours. Login attempts are rate-limited to ten
per fifteen minutes per IP address.

To change the credentials, update the environment variables and redeploy. Nothing in the source
code needs to change.

The dashboard shows:

- Totals — participants, attempts, completed, passed, failed, pass rate, average score
- A searchable, filterable participant table
- Per-participant attempt history (attempt number, score, status, date, ticket, device, ID)
- An **Allow retake** / **Revoke retake** control per participant

---

## 13. How retakes work

The rule is one attempt per person, and only the organiser can lift it.

1. Someone finishes the exam. Their result is final; re-entering the same name shows their score
   and refuses to start a new exam.
2. The organiser opens `/admin`, finds them, and clicks **Allow retake**.
3. That sets a single-use flag on the participant. **Nothing is deleted** — the previous attempt
   document stays exactly as it was.
4. The person enters the *same name* and gets a fresh exam.
5. Generating that exam consumes the grant, so one click buys exactly one attempt.

Both attempts appear in the dashboard history:

| Attempt | Score | Status | Date |
| --- | ---: | --- | --- |
| #1 | 31/40 | Failed | 23 Sep |
| #2 | 38/40 | Passed | 24 Sep |

**Different questions on a retake.** Every question ID a person has been served is recorded
against them. New exams draw from the unseen pool first and only reuse a question if a difficulty
tier genuinely runs dry. With 60 easy, 56 medium and 35 hard questions in the bank, at least two
completely distinct papers are guaranteed.

---

## 14. Adding and editing questions

The bank lives in plain TypeScript, one file per difficulty:

```
src/data/questions/easy.ts      60 questions
src/data/questions/medium.ts    56 questions
src/data/questions/hard.ts      35 questions
```

Each entry looks like this:

```ts
{
  id: 'e-061',                         // unique and stable — never reuse an old ID
  difficulty: 'easy',
  prompt: 'Who created the Iron Man suit?',
  options: ['Bruce Banner', 'Tony Stark', 'Steve Rogers', 'Thor'],
  correctIndex: 1,                     // 0-based index into `options`
  source: 'Iron Man',                  // the film, for editors
}
```

Rules to keep in mind:

- Exactly **four** options, exactly **one** correct.
- IDs must be unique and stable. Changing an existing ID breaks the "questions already seen"
  history for retakes.
- Nothing from *Endgame* or later — the exam covers *Iron Man* through *Captain Marvel* only.
- Avoid questions where two answers could reasonably be argued.

Then verify:

```bash
pnpm verify:bank
```

This checks for duplicate IDs, duplicate prompts, missing or repeated options, out-of-range
answer keys, off-syllabus references, and whether each tier can still fill an exam.

To change the exam shape or pass mark, edit `EXAM_BLUEPRINT` and `PASSING_SCORE` in
`src/types/index.ts` — every screen, test and validator reads from those constants.

---

## 15. Security considerations

**The answer key never reaches the browser.** The client receives question prompts and shuffled
options — nothing more. Correct answers exist only in server-side modules and in Firestore. You
can confirm this in DevTools: no `correctIndex` appears in any payload or bundle.

**Scores are computed server-side.** Submissions carry only *which option was clicked* per
question. The server maps each selection back through the stored shuffle order to the authored
answer key and computes the score itself. Editing the request in DevTools changes which wrong
answers get recorded, and nothing else.

**One attempt, enforced atomically.** Starting an exam runs inside a Firestore transaction. Two
tabs racing with the same name cannot produce two attempts: the loser is retried by Firestore,
sees the winner's active attempt, and resumes it. The same applies to double submissions — a
graded attempt returns its stored result rather than being re-scored.

**Names are normalized carefully.** `Hasan`, `hasan`, `HASAN` and `  Hasan  ` are one person.
Case is folded, Unicode is normalized, accents are stripped for comparison, and whitespace runs
are collapsed — but hyphens, apostrophes and periods are kept, because dropping them would merge
genuinely different people. The original spelling is what appears in the UI and on the ticket.

**Admin credentials live only in environment variables.** Never in source, never in the bundle,
never in Firestore. Compared in constant time, behind a rate limiter.

**Firestore is closed to the browser.** `firestore.rules` denies all client reads and writes. The
Admin SDK bypasses rules via its service account, so the app keeps working while a visitor with
the Firebase client SDK gets nothing.

**Sessions are signed, HttpOnly cookies.** Quiz sessions last three hours (resumable, not a
countdown); admin sessions last eight. Tokens are HMAC-SHA256 signed with `SESSION_SECRET` and
carry only identifiers — every consumer re-reads authoritative state from Firestore.

**Rate limiting survives serverless.** Counters live in Firestore rather than process memory, so
they hold across function instances. IP addresses are hashed, never stored raw.

**Minimal data collection.** A display name, the answers, the score, and enough attempt metadata
to prevent abuse and debug problems. No email addresses, no tracking, no analytics.

**Errors never leak internals.** Users see friendly messages; stack traces and configuration
details go to the server log only.

---

## 16. Project structure

```
src/
  app/
    page.tsx                      Landing page — intro, syllabus, name gate
    layout.tsx                    Root layout, fonts, starfield
    globals.css                   Design tokens and component styles
    error.tsx  not-found.tsx      Error and 404 boundaries
    quiz/
      page.tsx                    Server-rendered exam (reads the session cookie)
      loading.tsx
    result/[attemptId]/page.tsx   Pass / fail screens and the ticket
    verify/
      page.tsx                    Manual ticket lookup
      [ticketId]/page.tsx         QR verification target
    admin/
      page.tsx                    Auth gate -> login or dashboard
      loading.tsx
    api/
      quiz/start/route.ts         Opens or resumes an exam (transactional)
      quiz/submit/route.ts        Grades and finalises an attempt
      admin/login/route.ts        Credential check, rate limited
      admin/logout/route.ts
      admin/retake/route.ts       Grants or revokes another attempt
      health/route.ts             Configuration self-check

  components/
    quiz/    NameGate · QuizRunner · Ticket · TicketActions · VerifyForm
    admin/   AdminLogin · AdminDashboard
    ui/      primitives (PageShell, Alert, Spinner) · Wordmark

  lib/
    firebase/   admin (lazy Admin SDK init) · collections (typed refs)
    quiz/       exam (selection + grading) · service (transactions) ·
                names · random (CSPRNG) · ticket · qr
    auth/       session · sessionConfig · tokens (HMAC) · rateLimit
    http.ts     JSON helpers, safe error responses, logging
    cn.ts  siteUrl.ts

  data/questions/    easy.ts · medium.ts · hard.ts · index.ts (+ validator)
  types/index.ts     Domain types and the EXAM_BLUEPRINT / PASSING_SCORE constants

tests/               Vitest suites + an in-memory Firestore fake
firestore.rules      Deny-all client access
.env.example         Every variable, no secrets
```

---

## Licence and attribution

This is an unofficial fan project, not affiliated with, endorsed by, or connected to Marvel
Studios or The Walt Disney Company. All trademarks belong to their respective owners. The visual
design, the "Endgame Encore" identity and the question text are original work created for this
project.
