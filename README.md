# Inside AI

See inside AI. Break it. Fix it. Know it.

A workshop of interactive machines: real arithmetic, controls you can touch, missions you can solve, and a checkpoint that shows what you understood. Predict → Play → Prove. Simulations with real math; independent project.

## Run locally

Use **Bun 1.4**:

```sh
bun install && bun run build && bun run start
```

Open http://localhost:3000. SQLite is created at `data/inside-ai.db` and migrations run on startup. No environment variables are needed locally. Deploying: see [DEPLOY.md](DEPLOY.md).

## The machines

| # | Machine | Track | Level |
| --- | --- | --- | --- |
| 01 | Inside a tokenizer (BPE merges) | language | starter |
| 02 | Inside embeddings (cosine vs keyword search) | language | starter |
| 03 | Inside an attention head (QKᵀ/√d, softmax, masking) | language | core |
| 04 | Inside next-token sampling (temperature, top-k, top-p) | language | core |
| 05 | Inside training a neural net (backprop on XOR) | learning | core |
| 06 | Inside a RAG pipeline (chunk, embed, retrieve, cite) | systems | core |
| 07 | Inside an AI agent (tool loop, budget, approval gate) | systems | advanced |
| 08 | Inside LLM serving (KV cache, continuous batching) | systems | advanced |
| 09 | Inside a video-analytics pipeline (DeepStream pattern) | systems | advanced |

Every machine runs on a pure, tested model, and the numbers on screen come from real arithmetic. Each one has 4 missions the model checks and a 6-question checkpoint (1 prediction plus 5 questions).

## Check everything

```sh
bun test                                # every model and server test
bun run build && bun run verify         # headless Chrome: every machine, both themes, phone
bun tests/verify-platform.mjs           # landing, login, dashboards, educator insights
PORT=3917 bun run start & bun tests/e2e-machine.mjs http://127.0.0.1:3917 tokenizer
```

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
