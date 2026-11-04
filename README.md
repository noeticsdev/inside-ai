# Inside AI

See inside AI. Break it. Fix it. Know it.

A workshop of interactive machines: real arithmetic, controls you can touch, missions you can solve, and a checkpoint that shows what you understood. Predict → Play → Prove. Simulations with real math; independent project.

## Run locally

Use **Bun 1.4**. Once machine folders are present:

```sh
bun install && bun run build && bun run start
```

Open http://localhost:3000. SQLite is created at `data/inside-ai.db`; migrations run on startup. No environment variables are needed locally.

This platform worktree currently contains only `_template`, which the production builder deliberately excludes. For the nine-card **development preview**:

```sh
bun install
bun scripts/build.mjs --only _template
bun tests/preview-platform.mjs
bun run start
```

The preview has illustrative catalog entries and template thumbnails; each gallery card opens the real template. `dist/` is disposable and must never be committed or deployed as the finished catalog. Production builds need the nine real machine folders merged first.

## Project map

| Path | Purpose |
| --- | --- |
| `machines/<slug>/` | Pure model, figure, controls, content and tests |
| `kit/`, `vendor/` | Isometric drawing kit and authoring instructions |
| `platform/shell/` | Shared machine page, theme, missions and checkpoint SDK |
| `platform/pages/` | Static landing, account, learner and educator pages |
| `platform/public/` | Dependency-free page controller, copied to `dist/` |
| `server/` | Hono API, scrypt auth, SQLite/Turso, static serving |
| `api/`, `vercel.json`, `Dockerfile` | Hosting adapters and image |
| `tests/` | API tests, preview fixtures, Chrome visual and interaction checks |
| `scripts/` | Production machine build and verification |

To add a machine, read [AGENTS.md](AGENTS.md) and copy `machines/_template/`. The builder discovers complete machine folders and generates `dist/catalog.json`; the API uses it to validate and score events.

## Check the platform

```sh
bun test tests
# After building the development preview:
bun tests/verify-platform.mjs --pass=1
bun tests/verify-platform.mjs --pass=2
```

The Chrome check uses `/usr/bin/google-chrome` and writes `shots/platform/pass-{1,2}/`. It checks page overflow, browser exceptions, account/import flows, filters, theme, class insights, CSV and offline progress. Screenshots use development-only learner fixtures, never public fake statistics.

Account and class features need the API. A static host still shows machine progress from `localStorage` (`ia:progress:v1`). Sign-in imports this browser's progress; accounts use a 30-day httpOnly session cookie. A machine is complete after every mission and a best checkpoint of at least 4/5. Learning gain describes the change from predictions to latest check/post answers on matched machines; it is not a causal estimate.

See [DEPLOY.md](DEPLOY.md) for persistent SQLite or Vercel + Turso. Nothing is deployed automatically.
