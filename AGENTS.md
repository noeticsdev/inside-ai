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

## Machine contract — `machines/<slug>/`

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

- Each engineer works in **their own git worktree and branch** (`eng/<slug>` or `eng/platform`) and touches only their own folder: `machines/<slug>/`, or `server/`, `platform/pages/` and `tests/` for the platform engineer. Need a change outside your folder? Write it in your final report instead of making it.
- Commit subjects use conventional commits of 72 characters or fewer: `feat(machine/tokenizer): ...`, `feat(platform): ...`. The body explains why. Make a few logical commits, not one giant one.
- Never commit `dist/`, `node_modules/`, `*.db`, screenshots or `.env`.

## Definition of done (per machine)

1. `bun test machines/<slug>` passes with at least 8 tests.
2. `bun scripts/build.mjs --only <slug>` writes `dist/m/<slug>/index.html` without errors.
3. `bun scripts/verify.mjs --only <slug>` passes: no console errors, `__machine.finish()` completes, every mission is reachable via `M.MISSIONS` + configs, and screenshots are written in light and dark at desktop and 390 px. **Open and look at your PNGs** and fix what looks wrong: clipped labels, overlapping pills, bare slabs, text overflow.
4. Content: 6 quiz items, missions, sources, big idea. Every claim true. Plain English, no hype words.
5. Final report: what you built, the test count, the screenshot paths, known gaps.
