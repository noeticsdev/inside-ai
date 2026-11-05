# Inside AI

Build real AI systems one part at a time, and work out every number yourself.

Inside AI is a set of guided-build lessons. Each lesson puts a real system on the stage: a tokenizer, an attention head, a RAG pipeline, an inference server. Every step adds one component and asks one question, and the next step unlocks when you answer it. One step in each lesson runs your own Python in the browser. The finish screen hands back an artifact built from your choices, and a short checkpoint shows what stuck.

Built by [Noetics](https://noetics.dev).

## The lessons

| # | Lesson | Track | Level |
| --- | --- | --- | --- |
| 01 | Build a BPE tokenizer | foundations | starter |
| 02 | Build a semantic search index | foundations | core |
| 03 | Build one attention head | models | core |
| 04 | Build a token sampler | models | core |
| 05 | Train a tiny network by hand | models | core |
| 06 | Build a RAG pipeline | systems | core |
| 07 | Build a tool-using agent loop | systems | advanced |
| 08 | Build an LLM inference server | systems | advanced |
| 09 | Build a video-analytics pipeline | systems | advanced |

Every number on screen comes from a pure, tested model in `lessons/<slug>/model.mjs`. Where a value is a fixed example rather than a measurement, the lesson says "simulation" and cites its sources.

## Run locally

Use **Bun 1.4**:

```sh
bun install && bun run build && bun run start
```

Open http://localhost:3000. SQLite is created at `data/inside-ai.db` and migrations run on startup. No environment variables are needed locally. To deploy, see [DEPLOY.md](DEPLOY.md).

## Check everything

```sh
bun test                                  # every model, page and server test
bun run build
bun tests/lesson-check.mjs <slug>         # headless Chrome walk of one lesson
bun tests/verify-platform.mjs             # landing, login, dashboards, educator insights
```

`lesson-check` plays each step with a wrong answer and then the right one, checks that Next stays locked until the task is solved, runs the Python step, reloads to test resume, checks 390 px on every step in both themes, and writes screenshots to `shots/lesson-<slug>/`. Add `--no-python` when the Pyodide CDN is not reachable. The Chrome checks use `/usr/bin/google-chrome`.

## Project map

| Path | Purpose |
| --- | --- |
| `lessons/<slug>/` | One guided-build lesson: content, model, tests, page script, walkthrough |
| `platform/shell/` | Lesson page template, step runtime (`guide-runtime.js`), progress SDK, Python cells |
| `platform/pages/` | Landing, About, login, learner and educator pages |
| `platform/public/` | Page controller and brand assets, copied to `dist/` |
| `server/` | Hono API: scrypt auth, events, progress, classes, insights, SQLite or Turso |
| `api/`, `vercel.json`, `Dockerfile` | Hosting adapters and container image |
| `tests/` | API and page tests, lesson and platform browser checks |
| `scripts/` | Build and verification |
| `machines/`, `kit/`, `vendor/` | The earlier isometric format, kept for reference. A lesson replaces the machine with the same slug. |

To add a lesson, read [AGENTS.md](AGENTS.md) and start from `lessons/deepstream/`, the reference implementation.

## Accounts and progress

Every lesson works without an account. Progress is kept in the browser (`localStorage`), and signing in imports it. Accounts use a 30-day httpOnly session cookie. Educators create a class code, and learners who join it show up in class insights: tasks solved, checkpoint answers, and the change from prediction to checkpoint. That change is a description, not a causal measure of learning.

## License

The code and lesson content are released under the [MIT License](LICENSE).

The Noetics name and logos (`platform/public/brand/`) are trademarks of Noetics and are not covered by the license. Use them only to refer to Noetics.

`vendor/anatomy/` and `kit/` are the Anatomy drawing kit, MIT License, copyright 2026 Ryan; see the `LICENSE` file in each folder. Python cells load [Pyodide](https://pyodide.org) (MPL-2.0) from its CDN at runtime.
