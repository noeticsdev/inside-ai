# Deploy Inside AI

Merge the real machine folders before a production build. This worktree has only `_template`; `bun scripts/build.mjs` correctly fails until a non-template machine exists. The nine-entry preview in `tests/preview-platform.mjs` is for local design only.

## Environment

| Variable | Default / purpose |
| --- | --- |
| `PORT` | `3000` (Bun server only) |
| `DATABASE_URL` | `file:./data/inside-ai.db`; use `file:/data/inside-ai.db` with a volume, or a remote `libsql://…` Turso URL |
| `DATABASE_AUTH_TOKEN` | Optional locally; set the Turso database token for remote access |
| `NODE_ENV` | Set to `production` behind HTTPS to enable Secure cookies |
| `DIST_DIR` | `dist` (Bun server only) |

Migrations are idempotent and run when opening the database. Back up the database before releases. Keep requests on the public origin: writes require JSON and a matching `Origin`; no cross-origin API configuration is needed. Behind a proxy, preserve the public host and scheme in the request URL. Never use `allowMissingOrigin` in deployment.

## Docker and persistent SQLite

```sh
docker build -t inside-ai .
docker volume create inside-ai-data
docker run --rm -p 3000:3000 -v inside-ai-data:/data inside-ai
```

The image uses Bun 1.4.4, builds `dist/`, runs as the `bun` user and stores SQLite under `/data`. The production image expects HTTPS at the reverse proxy; cookies are Secure. For a plain HTTP local image check, add `-e NODE_ENV=development` to `docker run`. `/api/stats` is a read-only health check. Avoid copying a live SQLite file for backups: stop the app or use SQLite's backup API so journal files remain consistent.

For **Fly**, create a persistent volume mounted at `/data`, set `DATABASE_URL=file:/data/inside-ai.db`, and configure the service's internal port to `3000` with HTTPS enforced. Start with one machine using that volume. See [Fly volumes](https://fly.io/docs/volumes/overview/).

For **Railway**, use this Dockerfile, attach a volume at `/data`, set `DATABASE_URL=file:/data/inside-ai.db` and `NODE_ENV=production`, and expose the assigned `PORT`. Ensure the mounted directory is writable by the container's `bun` user. See [Railway volumes](https://docs.railway.com/volumes).

A local SQLite volume belongs to one application instance. Use a remote database when running multiple instances. In-memory auth rate limits apply per process; configure the host's rate limiting if traffic is distributed. Guest data and raw events currently have no automatic retention policy.

## Vercel + Turso

1. Create a Turso database and database auth token. Set `DATABASE_URL=libsql://…`, `DATABASE_AUTH_TOKEN=…`, and `NODE_ENV=production` in Vercel for the relevant environments. The API adapter rejects local SQLite URLs because function filesystems do not provide persistent storage.
2. Select the **Other** framework preset. The checked-in `vercel.json` uses `bun install --frozen-lockfile`, `bun scripts/build.mjs`, `dist`, and `bunVersion: "1.4.x"`. This selects [Vercel's Bun 1.4 runtime](https://vercel.com/docs/functions/runtimes/bun); it is currently documented as beta. The `/api/*` rewrite targets `api/[[...route]].ts`, which uses the installed Hono 4 `hono/vercel` adapter. Static pages and thumbnails are served by the CDN.
3. `functions.includeFiles` includes `dist/catalog.json` so scoring uses the same catalog as the pages. Each warm function reuses its database client and app; cold starts run idempotent migrations. Use a separate Turso database for preview environments.
4. After a reviewed deployment, check `/`, `/login/`, `/me/`, `/teach/`, `/api/stats`, guest → signup progress retention, class joining, owner-only insights and CSV. Confirm the session cookie has HttpOnly, SameSite=Lax and Secure, and foreign-origin writes return 403.

The adapter and schema are checked locally; this repository has **not** been deployed, and no hosted Turso round-trip or container image build has been run here. Hono's bundled `hono/vercel` adapter is deprecated for a future Hono 5; keep the current Hono 4 dependency until a dependency migration is approved. [libSQL client reference](https://tursodatabase.github.io/libsql-client-ts/).

## Shell integration follow-up

The CTO-owned shell currently reads browser progress when a machine opens. To resume account progress on a different device, fetch `/api/progress` and reconcile the machine's saved state before rendering missions and prediction. Dashboard pages already read server and browser progress together. The shell also stops its event sender after a network failure; add retry/reconciliation for reliable synchronization after a transient outage. Keep local progress as the offline fallback.
