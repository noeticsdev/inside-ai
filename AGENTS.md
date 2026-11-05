# AGENTS.md — Inside AI

Operating manual for every contributor, human or AI agent, touching this repo. Read all of it before writing code.

## What we are building

**Inside AI** is a set of guided-build lessons about AI systems. In each lesson the reader assembles a real system (a tokenizer, an attention head, a RAG pipeline, an inference server) one component per screen and works out one number or decision per step. Audience: university students, generalists, hobbyists and industry engineers. The page has to work for all of them at once.

Product rules:

1. **Learn something real. No gimmicks.** Every number on screen comes from a pure model doing real arithmetic: real BPE merges, real cosine similarity, real softmax, real gradient descent. Clicking through is never a task.
2. **The reader always knows what to do next.** One action per screen, a clear task, and Next stays locked until it is solved. No walls of text.
3. **Predict, build, prove.** A prediction before the first step, one reasoning task per step, and a checkpoint at the end that compares the answers with the prediction.
4. **Honest.** No fake metrics and no fake services. Fixed example values say "simulation". Lessons about a vendor's product say they are independent and not affiliated with that vendor (for example NVIDIA).

## Repo layout

```text
lessons/<slug>/          One guided-build lesson per folder (contract below). lessons/deepstream/ is the reference.
platform/shell/          Lesson page template (guide.mjs, guide.css), step runtime (guide-runtime.js), SDK (sdk.js, window.IA), Python cells (pycell.js).
platform/pages/          Landing, About, login, learner dashboard and educator pages.
platform/public/         Page controller (platform.js) and brand assets, copied to dist/.
server/                  Hono API on Bun: auth, events, progress, classes, insights.
api/                     Vercel function adapter for the same Hono app.
scripts/build.mjs        Builds every lesson and page into dist/.
tests/                   API and page tests, lesson-check.mjs (lesson browser walk), verify-platform.mjs.
machines/, kit/, vendor/ The earlier isometric format, kept for reference (see "Legacy machines").
dist/                    Build output. Never committed.
```

## Toolchain

- Runtime is **Bun** (`bun` 1.4). Run scripts with `bun file.mjs` and tests with `bun test`.
- Chrome at `/usr/bin/google-chrome` runs the headless checks.
- Dependencies: `hono` and `@libsql/client`. Add nothing else without discussing it first. Lessons use no runtime dependencies: plain ESM and SVG.
- Plain JavaScript ESM for lessons. TypeScript is fine in `server/`.

## Lesson contract: `lessons/<slug>/`

Every lesson is a **guided build**, like a step-by-step assembly guide. The reader assembles the real system one part per screen, and every screen asks them to work something out. `lessons/deepstream/` is the reference implementation: read all of it before you write a line.

**Page.** `content.mjs` sets `layout: "guide"`, and the build uses `platform/shell/guide.mjs`. The page has a stage on the left and a panel on the right. The panel has a kicker, a verb title, 2 or 3 sentences of lead, a "You add" parts list with real config or code lines, one task in "Your move", "What just happened" after the task is solved, and "Up next". The footer holds Back and Next. **Next is locked until the step's task is solved.** After 2 wrong tries the reader can choose "Show me the answer".

**Runtime.** `page.js` calls `createGuide({ M, steps, board, onBoard?, init?, done })` from `platform/shell/guide-runtime.js`. The runtime owns navigation, gating, persistence, the task widgets, the footer, predict and the checkpoint. Do not copy it into a lesson. Change it only in its own commit, and run `lesson-check` on every lesson afterwards. Helpers are exported from the runtime: `h`, `s`, `T_`, `svgBox`, `fmt`, `r3`, `glyph`, `metricsRow`, `pyCell`, `still`.

**Step fields** (see the STEPS array in `lessons/deepstream/page.js`):

- `id`, `phase`: `kit` comes first, then `build` steps, then optional `scale` steps, then exactly one `done`.
- `kicker`, `title` (an imperative verb), `lead` (HTML), `minutes`.
- `view: "board" | "bench"`, `on` (the board part ids to light).
- `parts(g)` on the kit step, as rows of `{ title, n }` or `{ glyph, name, runs, hw }`.
- `adds` (an array or `(g) => array` of `{ glyph, name, runs, conf }`) and `addsLabel`.
- `close(g)`, `closeLabel`, `closeHint`: the close-up under the board, showing the real data at this point.
- `code`: an optional pycell spec, shown as "Code it in Python".
- `bench(host, g)` for steps that need the whole stage.
- `mission`, the id of an entry in `M.MISSIONS`.
- `task(ui, g)`, `after(g)` (HTML), `onReveal(g)`, `replay`, `nextLabel`, `where`.

**Task widgets** on `ui`:

- `number({ prompt, placeholder, check, hint(v, tries), onTry, unit })`
- `choice({ prompt, options: [[id, label, whyWrong]], check, why })`
- `order({ prompt, items: [[id, label]], order, why, check })`
- `sliders({ prompt, sliders: [{ label, min, max, step, get, set, format }], check })`
- `selects({ prompt, selects: [{ label, options: [[value, label]], get, set, parse }], check })`
- `code({ prompt, fallback: [[label, good, whyWrong]] })`

For `sliders` and `selects`, `check()` returns `true` when the task is solved, or a string that says what is still wrong. A Python step mounts its cell on the bench with `pyCell(host, { ..., onPass: () => g.pass(missionId) })`.

**`g`** (the guide) provides:

- `g.solved(id)` and `g.pass(id)`
- `g.rerender({ animate })` and `g.refreshParts()`
- `g.settings`, a persisted object (keep reader choices here), and `g.saveSettings()`
- `g.play(fn, ms)`, `g.stop()` and `g.playing()`, the one shared timer for play buttons
- `g.IA`, for events

**Board.** `board(ctx)` returns an SVG of the real thing being built (hardware, a data structure, matrices, a pipeline), with crisp 1px lines, no wobble filter, and `viewBox` 1000 × 600 or close to it. `ctx` holds:

- `built`: the number of build steps done so far, so you draw only the parts added so far
- `fresh`: the 1-based build index of the part being added, which you draw in accent
- `on`: the part ids to light
- `enter`: true when the step was just entered
- `hit`: on the kit step, a tap handler for parts
- `step`, `solved`, `settings`

A readout panel on the board should fill in real values ("?" until the step is solved). Use the CSS classes in `platform/shell/guide.css` and `lesson.css` (`hw-*`, `tag`, `route`, `token`, `cu-*`, `ro-*`, `meter*`, `fg`, `dt`, `metrics`, `formula`). Put lesson-only CSS in `lessons/<slug>/page.css`. Board text must stay readable: 13 to 16 units, mono.

**Pedagogy rules.**

1. Every build step adds one real component, with real names and real config or code (the API, the file or the parameter a practitioner would type).
2. Every step has one task that needs reasoning: a computation, a prediction, an ordering, or a tuning with a checkable target. Never "click next" or "press play". Every task has hints for the 2 or 3 most common wrong answers, and the hint text says why the answer is wrong.
3. Every number comes from `model.mjs` (pure, deterministic, no DOM) and is pinned in `model.test.mjs`. The answers and the checks live in `M.ANSWERS` and `M.MISSIONS`.
4. Exactly one step needs a Python cell that the reader writes and runs (Pyodide, with 4 to 6 checks), with a `fallback` choice. Other steps can offer an optional `code`.
5. The finish screen (`done` in `createGuide`) hands back an artifact built from the reader's own choices (a config, a schema, a merges file) plus 3 stats.
6. The copy is plain technical English. Leads are 2 to 3 sentences. "What just happened" shows the worked arithmetic. Say "simulation" wherever a number is a fixed example value.

**Files.**

- `content.mjs`: slug, title, `short`, `subtitle`, `hook`, `layout: "guide"`, level, minutes, order, track, bigIdea, objectives, 6 quiz items (1 pre, 3 check, 2 post), sources and notes.
- `model.mjs` and `model.test.mjs`
- `page.js`
- `walk.mjs`: one entry per step before `done`. Each entry lists a wrong answer with its `expect` hint text, then the right one with `solves: true`. Action types: `answer`, `choose`, `tap`, `slide`, `select`, `python` (with `code`), `click`, `fallback`.
- `page.css` (optional)
- `figure.svg`, which `tests/lesson-check.mjs` exports.

**Definition of done (lessons).**

1. `bun test lessons/<slug>` passes with at least 12 tests, and they pin every number the copy quotes.
2. `bun scripts/build.mjs --only <slug>` passes.
3. `bun tests/lesson-check.mjs <slug>` passes every check: the walkthrough, gating, Python, 390 px on every step, no console errors, reload resumes, and the thumbnail export.
4. You opened every PNG in `shots/lesson-<slug>/` and fixed clipped, overlapping or unreadable text.
5. The pull request says what each step teaches, the test count and the known gaps.

## Legacy machines

`machines/<slug>/` holds the earlier isometric "machine" pages, built with the Anatomy kit in `kit/` and `vendor/`. The build still supports them, but a `lessons/<slug>/` folder replaces the machine with the same slug, and every current slug has a lesson. Do not add new machines.

## Platform contract (shell ⇄ server)

The shell posts events with `fetch("/api/events", { method: "POST", credentials: "include", keepalive: true, body: JSON.stringify({ events: [...] }) })`, batched every 5 s and on `pagehide`. If the API is missing (a static host), it fails silently and progress stays in `localStorage` (`ia:progress:v1`).

Event shape: `{ slug, type, data, at }`, where `at` is ms since the epoch. Types:

| type | data |
|---|---|
| `view` | `{}` |
| `heartbeat` | `{ seconds }`: active seconds since the last heartbeat (tab visible and interacted with within the last 60 s) |
| `run` / `step` / `break` / `explode` | `{}` |
| `control` | `{ name, value }` |
| `mission` | `{ id }`: completed |
| `predict` | `{ answer, correct }`: the pre-question answer |
| `answer` | `{ index, stage, answer, correct }`: quiz question index 0–5 |
| `quiz_done` | `{ score, of }`: score over the check and post questions (of = 5) |

API routes:

| Route | Purpose |
|---|---|
| `POST /api/auth/signup` `{ email, password, name, role }` | role is `learner` or `educator`. Sets an httpOnly session cookie `ia_session`. |
| `POST /api/auth/login` `{ email, password }` / `POST /api/auth/logout` | |
| `POST /api/auth/guest` | Creates a guest user and session. Signup while a guest upgrades the same user and keeps their progress. |
| `GET /api/me` | `{ user: { id, name, email, role, guest } \| null }` |
| `POST /api/events` | Batch insert. Without a session, creates a guest session first. |
| `GET /api/progress` | Per-machine progress for the current user: missions done, prediction, quiz score, active seconds, runs, last seen. |
| `POST /api/classes` `{ name }` (educator) → `{ id, code }` | 6-character join code. |
| `POST /api/classes/join` `{ code }` | |
| `GET /api/classes` / `GET /api/classes/:id/insights` | Educator insights: per student × machine completion, per-question correctness, pre→post learning gain, most-missed questions, time on task. |
| `GET /api/stats` | Public aggregate counts for the landing page. |

The catalog is generated at build time at `dist/catalog.json`: `[{ slug, title, hook, level, minutes, order, track, bigIdea, missions: [{ id, title, goal }], quiz: [{ stage, question, options, correct }] }]`. The server reads it to score and label insights.

## Git and workflow

- Work on a branch, or in a git worktree for parallel work. Keep each change inside the folders it needs: `lessons/<slug>/` for a lesson, `platform/` and `server/` for the platform.
- Commit subjects use conventional commits of 72 characters or fewer: `feat(lesson/tokenizer): ...`, `feat(platform): ...`, `fix(server): ...`. The body explains why. Make a few logical commits, not one giant one.
- Never commit `dist/`, `node_modules/`, `*.db`, screenshots or `.env`.

## License

MIT, see `LICENSE`. The Noetics name and logos in `platform/public/brand/` are not covered by it. `kit/` and `vendor/anatomy/` keep their own MIT license.
