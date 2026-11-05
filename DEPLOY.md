# Deploy Inside AI

The recommended setup is **Vercel + Turso** at `edu.noetics.dev`, with DNS on Cloudflare (see "Vercel + Turso" and "Custom domain" below). The Docker image suits any host with a persistent volume.

Before a release, run `bun test`, `bun run build`, `bun tests/lesson-check.mjs <slug>` for each changed lesson, and `bun tests/verify-platform.mjs`.

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

The adapter and schema are checked locally, but no hosted Turso round-trip or container image build has been run yet, so treat the first deployment as the real test. Hono's bundled `hono/vercel` adapter is deprecated for a future Hono 5; keep the current Hono 4 dependency until that migration is planned. [libSQL client reference](https://tursodatabase.github.io/libsql-client-ts/).

Vercel's Hobby plan cannot deploy a private repository owned by an organization, and it is for non-commercial use. Use the Pro plan for a company deployment.

## Custom domain: edu.noetics.dev

The noetics.dev zone is on Cloudflare DNS.

1. In the Vercel project, open **Settings → Domains** and add `edu.noetics.dev`.
2. In Cloudflare DNS for noetics.dev, add a `CNAME` record: name `edu`, target `cname.vercel-dns.com`, proxy status **DNS only** (grey cloud). Vercel issues and renews the HTTPS certificate. Proxying through Cloudflare in front of Vercel can block certificate renewal and caches pages twice.
3. Wait for Vercel to show the domain as valid, then run the checks in step 4 above on `https://edu.noetics.dev`.

## Known follow-ups

- Lesson pages read progress from the browser when they open. To resume an account's progress on a different device, fetch `/api/progress` and merge it before rendering the steps. Dashboard pages already read server and browser progress together.
- The event sender stops after a network failure. Add retry and reconciliation so progress syncs after a short outage. Keep local progress as the offline fallback.
