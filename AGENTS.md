# AGENTS.md — Inside AI

Operating manual for every engineer (human, Claude, Codex, Muse) touching this repo. Read all of it before writing code.

## What we are building

**Inside AI** is a learning platform of interactive machines. Each machine is one AI or systems idea built as a working isometric machine on a bench. You learn by running it, breaking it and tuning it, not by reading a long course. Audience: university students, generalists, hobbyists and industry engineers. The page has to work for all of them at once. The machine is the lesson, the missions are the practice, and the six-question checkpoint is the proof.

Product rules:

1. **Learn something real. No gimmicks.** Every number on screen comes from a pure model doing real arithmetic: real BPE merges, real cosine similarity, real softmax, real gradient descent. A scripted part says "fixed script" in its copy. A page with simulated timing says "This is a simulation." and that times are fixed costs, not measurements.
2. **Not a boring course.** No walls of text. A learner should touch a control within 10 seconds of opening a machine. Copy is short, concrete and plain: one-line captions, a "big idea" sentence, mission goals in one sentence each.
3. **Predict, play, prove.** Every machine page runs the same loop:
   - **Predict**: the pre-question asks for a guess before the learner runs anything. They can skip it.
   - **Play**: 3 to 4 missions with goals the model can check, such as "make the tokenizer use under 30 tokens", "break retrieval so the answer is wrong", or "get the loss under 0.05 in 40 steps".
   - **Prove**: a checkpoint of 3 check questions and 2 post questions, then reveal the prediction ("You guessed X. The machine showed Y.").
4. **Honest.** No fake metrics, no fake services. Independent demos say they are not affiliated with any vendor (for example NVIDIA).

## Repo layout

```text
kit/                     Anatomy iso kit + ink layer (iso-kit.mjs, ink.mjs, lathe.mjs, tube.mjs). MIT. Do not edit casually.
vendor/anatomy/          Anatomy skill: SKILL.md, references/ (craft, kit, motion, verify), scripts/ (capture, drive, lines).
vendor/isometric-explainer/  The machine-page method: SKILL.md, references/, templates/. READ THIS FIRST.
machines/<slug>/         One machine per folder (contract below). `_template/` is the working reference.
platform/shell/          Machine-page shell: shell.css, sdk.js (window.IA), page.mjs. Owned by the CTO.
platform/pages/          Landing, catalog, login, dashboard, educator pages. Owned by the platform engineer.
server/                  Hono API on Bun: auth, events, progress, classes, insights. Owned by the platform engineer.
scripts/build.mjs        Builds every machine + pages into dist/.
scripts/verify.mjs       Headless Chrome screenshots of every machine.
dist/                    Build output. Never committed.
```

## Toolchain

- Runtime is **Bun** (`bun` 1.4). Node is not installed. Run scripts with `bun file.mjs` and tests with `bun test`.
- Chrome is at `/usr/bin/google-chrome` for headless verification.
- Dependencies: `hono`, `@libsql/client`. Nothing else without CTO approval. Machines use no runtime dependencies: plain ESM and SVG.
- Plain JavaScript ESM (`.mjs`) for machines. TypeScript is fine in `server/`.

## Guided-build lessons: `lessons/<slug>/` (the current format)

The isometric machines below were rejected as gimmicks: they had metaphor machines, "step" buttons that only highlighted stations, and missions that were just clicking. Every lesson is now a **guided build**, like an IKEA assembly guide (usebygga.com is the reference). The reader assembles the real system one part per screen, and every screen asks them to work something out. `lessons/deepstream/` is the reference implementation: read all of it before you write a line.

**Page.** `content.mjs` sets `layout: "guide"`, and the build uses `platform/shell/guide.mjs`. The page has a stage on the left and a panel on the right. The panel has a kicker, a verb title, 2 or 3 sentences of lead, a "You add" parts list with real config or code lines, one task in "Your move", "What just happened" after the task is solved, and "Up next". The footer holds Back and Next. **Next is locked until the step's task is solved.** After 2 wrong tries the reader can choose "Show me the answer".

**Runtime.** `page.js` calls `createGuide({ M, steps, board, onBoard?, init?, done })` from `platform/shell/guide-runtime.js`. The runtime owns navigation, gating, persistence, the task widgets, the footer, predict and the checkpoint. Do not copy it, and do not edit it. If you need a change, write it in your report. Helpers are exported from the runtime: `h`, `s`, `T_`, `svgBox`, `fmt`, `r3`, `glyph`, `metricsRow`, `pyCell`, `still`.

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
5. A final report covering what each step teaches, the test count and the known gaps.

## Machine contract — `machines/<slug>/` (legacy: being replaced by lessons)

Copy `machines/_template/` to start. Files:

| File | Runs in | Purpose |
|---|---|---|
| `content.mjs` | build | `export default { slug, title, hook, level, minutes, order, track, bigIdea, machine, stations, quiz, sources, notes }` |
| `model.mjs` | build + browser | Pure, deterministic state model. No DOM, no clock, no `Math.random` (use a seeded PRNG). |
| `model.test.mjs` | `bun test` | At least 8 tests (see below). |
| `figure.mjs` | build | `export function figure()` returns `{ svg, data, css, controls, readouts }`. Static SVG geometry built once with the kit. |
| `live.js` | browser | Animation and controls. Plain script (not a module). Uses the globals `K` (iso-kit), `Ink`, `M` (your model.mjs), `D` (your `figure().data`) and `IA` (platform SDK). |

### content.mjs fields

- `slug`: folder name. `title`: "Inside a tokenizer". `hook`: one line, 12 words or fewer.
- `level`: `"starter" | "core" | "advanced"`. `minutes`: 8 to 15. `order`: integer position in the catalog.
- `track`: `"language" | "learning" | "systems"`.
- `bigIdea`: one sentence in plain words.
- `machine`: the one-sentence machine statement: "X moves through Y, and that motion means Z."
- `stations`: `[{ id, concept, does, fails }]`, one per station. `concept` is the pill label word in CAPS.
- `quiz`: exactly 6 items `{ stage, question, options[4], correct, explanation }` in the order pre, check, check, check, post, post. `correct` is zero-indexed. Spread the correct index across positions. Keep distractors about as long as the correct option. The explanation is non-empty and refers to something the learner saw in the machine.
- `sources`: `[{ label, url }]` pointing to canonical papers, specs or official docs.
- `notes`: optional honesty line, such as a disclaimer.

### model.mjs exports

- `DEFAULTS`, `configOf(input)`, `simulate(config)` returning `{ config, events, totals }`. Each event is `{ index, type, station, trace, ...fields }`, and `trace` is a short human sentence.
- `encode(config)` / `decode(search)`: URL round-trip.
- `MISSIONS`: 3 or 4 entries `{ id, title, goal, hint, try, check(run) }`. `try` is a config that passes the mission (the shell's "Show me" button loads it after the learner opens the hint; `scripts/verify.mjs` loads it through the real page). `check` is pure over a `simulate` result. The default config must NOT pass every mission. Each mission must be reachable through the page's controls, and a test proves both.

### model.test.mjs must cover

1. Determinism: the same config gives deep-equal results, swept over every control combination (or a representative grid).
2. Exact numbers the page prints, for example "the default text gives 41 tokens after 12 merges".
3. Invariants: event indices are sequential, every event has a `trace`, any clock never goes back.
4. URL round-trip, including garbage input falling back to `DEFAULTS`.
5. For each mission: a config that passes it, and that the default config fails at least one mission.
6. The quiz in `content.mjs` has exactly 6 items in the right stage order and valid `correct` indices.

### figure.mjs

- Follow `vendor/isometric-explainer/SKILL.md` and its references: elevation 30°, one azimuth, `inkSolid` tones, pill labels with leaders, cast shadows, a depth key per item, and movers only change `transform`.
- Size: Figure tier (40–80 parts) by default. Hero (80–150) for the flagship machines. Detailed parts, not slabs (see `vendor/anatomy/SKILL.md`, "Every creation is highly detailed").
- `svg` must include `data-ie-svg`, a `[data-layer]` group and a `[data-pills]` group (the template shows how).
- `controls`: an HTML string of buttons, selects, ranges and toggles. Use the class `ia-btn` for buttons, `ia-select` for selects and `ia-range` for range inputs. Every button is at least 44 px tall (the shell CSS handles it).
- `readouts`: `[{ key, label }]`. The shell renders them as `<strong data-ro="key">`.

### live.js

- It runs inside an IIFE in which `K`, `Ink`, `M`, `D` and `IA` exist. Query the DOM under `document.querySelector("[data-ia-machine]")`.
- Shell elements you can use: `[data-ia-stage]` (holds your svg), `[data-ia-controls]` (your controls html), `[data-ro="key"]` readouts, and `[data-ia-live]` (aria-live).
- **Calls into the platform SDK:**
  - `IA.ran(run)`: call when a run finishes (or at once for an instant model). The shell checks `M.MISSIONS` against `run`, marks completed missions, celebrates and records progress. **Missions only complete through this call.**
  - `IA.event(type, data)`: interactions such as `"control"` `{ name, value }`, `"run"`, `"step"`, `"break"`, `"explode"`.
  - `IA.trace(text)`: appends one line to the live log in the rail. Call it with each event's `trace` as it plays.
  - `IA.onLoad(fn)`: register `fn(config)` so the shell can load a config (the mission "Show me" buttons and resets).
- Keyboard: the stage takes focus. Space runs or pauses, the right arrow steps, and E explodes, if your machine has those actions.
- Reduced motion: runs advance 40× faster. No loop runs while the stage is offscreen or nothing moves.
- Expose `window.__machine = { state, load, finish }` for the headless checks. `load(config)` loads a config. `finish()` runs to the end synchronously and must end with `IA.ran(run)`.
- Do not autoplay on load. The learner predicts first and presses Run.

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

API routes (owned by the platform engineer):

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

The machine catalog is generated at build time at `dist/catalog.json`: `[{ slug, title, hook, level, minutes, order, track, bigIdea, missions: [{ id, title, goal }], quiz: [{ stage, question, options, correct }] }]`. The server reads it to score and label insights.

## Git and workflow

- Each engineer works in **their own git worktree and branch** (`eng/<slug>` or `eng/platform`) and touches only their own folder: `lessons/<slug>/` (or the legacy `machines/<slug>/`), or `server/`, `platform/pages/` and `tests/` for the platform engineer. Need a change outside your folder? Write it in your final report instead of making it.
- Commit subjects use conventional commits of 72 characters or fewer: `feat(machine/tokenizer): ...`, `feat(platform): ...`. The body explains why. Make a few logical commits, not one giant one.
- Never commit `dist/`, `node_modules/`, `*.db`, screenshots or `.env`.

## Definition of done (per machine)

1. `bun test machines/<slug>` passes with at least 8 tests.
2. `bun scripts/build.mjs --only <slug>` writes `dist/m/<slug>/index.html` without errors.
3. `bun scripts/verify.mjs --only <slug>` passes: no console errors, `__machine.finish()` completes, every mission is reachable via `M.MISSIONS` + configs, and screenshots are written in light and dark at desktop and 390 px. **Open and look at your PNGs** and fix what looks wrong: clipped labels, overlapping pills, bare slabs, text overflow.
4. Content: 6 quiz items, missions, sources, big idea. Every claim true. Plain English, no hype words.
5. Final report: what you built, the test count, the screenshot paths, known gaps.
