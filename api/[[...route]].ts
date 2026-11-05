// Vercel Functions on Bun; the CDN serves dist/ separately.
import { handle } from 'hono/vercel';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from '../server/app';
import { openDatabase } from '../server/db';

let application: Promise<ReturnType<typeof createApp>> | undefined;
function getApplication() {
  return application ||= (async () => {
    if (!/^(libsql|https):\/\//.test(process.env.DATABASE_URL || '')) {
      throw new Error('Vercel needs a remote DATABASE_URL (Turso); local SQLite is not persistent.');
    }
    const distDir = resolve(process.cwd(), 'dist');
    const catalog = JSON.parse(await readFile(resolve(distDir, 'catalog.json'), 'utf8'));
    const db = await openDatabase();
    return createApp({ db, distDir, catalog,
      // Vercel supplies this header. The direct Bun entry uses requestIP instead.
      getClientIp: request => request.headers.get('x-real-ip') || 'unknown',
    });
  })().catch(error => { application = undefined; throw error; });
}
async function handler(request: Request) {
  try { return await handle(await getApplication())(request); }
  catch (error) {
    console.error('Inside AI API initialization failed:', error);
    return Response.json({ error: 'The account service is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
// Vercel treats a bare default function as a Node (req, res) handler and waits for res.end(),
// which never comes, so every request timed out. The fetch export is the web-standard form.
export default { fetch: handler };
