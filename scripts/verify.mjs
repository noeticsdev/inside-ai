// Headless verification of built machine pages (run scripts/build.mjs first).
// For each machine: zero console errors, __machine.finish() completes, every mission's `try` config
// completes that mission through the real page, no horizontal scroll at 390 px, and screenshots in
// light + dark at desktop (1440x900) and phone (390x844) are written to shots/<slug>/.
// Usage: bun scripts/verify.mjs [--only <slug>] [--no-shots]
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const args = process.argv.slice(2);
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const SHOTS = !args.includes("--no-shots");
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";

const slugs = existsSync(join(DIST, "m")) ? readdirSync(join(DIST, "m")).filter((s) => (ONLY ? s === ONLY : !s.startsWith("_"))) : [];
if (!slugs.length) {
  console.error("nothing to verify: run `bun scripts/build.mjs" + (ONLY ? ` --only ${ONLY}` : "") + "` first");
  process.exit(1);
}

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return new Response("{}", { status: 404 });
    let path = join(DIST, decodeURIComponent(url.pathname));
    if (path.endsWith("/")) path = join(path, "index.html");
    const file = Bun.file(path);
    return file.size ? new Response(file) : new Response("not found", { status: 404 });
  },
});

const profile = mkdtempSync(join(tmpdir(), "ia-verify-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdout: "ignore", stderr: "ignore" });

async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() > end) throw new Error("timeout");
    await Bun.sleep(100);
  }
}

const version = await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).json());
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let nextId = 1;
const pending = new Map();
const listeners = new Set();
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  if (data.id && pending.has(data.id)) {
    const { resolve: ok, reject } = pending.get(data.id);
    pending.delete(data.id);
    data.error ? reject(new Error(data.error.message)) : ok(data.result);
  } else for (const fn of listeners) fn(data);
};
const send = (method, params = {}, sessionId) =>
  new Promise((ok, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: ok, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

async function openPage() {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  await s("Page.enable");
  await s("Runtime.enable");
  await s("Log.enable");
  const errors = [];
  const fn = (data) => {
    if (data.sessionId !== sessionId) return;
    if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") errors.push(data.params.args.map((a) => a.value ?? a.description).join(" "));
    if (data.method === "Log.entryAdded" && data.params.entry.level === "error" && !/\/api\/|favicon/.test(data.params.entry.url || "") && !/404/.test(data.params.entry.text)) errors.push(data.params.entry.text);
  };
  listeners.add(fn);
  return {
    s,
    errors,
    async eval(expression) {
      const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async goto(url, width, height) {
      await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      await s("Page.navigate", { url });
      await waitFor(async () => (await this.eval("document.readyState")) === "complete" && (await this.eval("Boolean(window.__machine)")), 15000);
      await Bun.sleep(400);
    },
    async shot(file) {
      const { data } = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(file, Buffer.from(data, "base64"));
    },
    async close() {
      listeners.delete(fn);
      await send("Target.closeTarget", { targetId });
    },
  };
}

let failed = 0;
const base = `http://127.0.0.1:${server.port}`;
for (const slug of slugs) {
  const problems = [];
  const outDir = join(ROOT, "shots", slug);
  if (SHOTS) mkdirSync(outDir, { recursive: true });
  const page = await openPage();
  try {
    await page.goto(`${base}/m/${slug}/?theme=light`, 1440, 900);
    await page.eval("localStorage.clear()");
    await page.goto(`${base}/m/${slug}/?theme=light`, 1440, 900);
    if (SHOTS) await page.shot(join(outDir, "desktop-light.png"));
    const data = await page.eval("window.__IA_DATA");
    await page.eval("window.__machine.finish()");
    await Bun.sleep(200);
    if (SHOTS) await page.shot(join(outDir, "desktop-light-finished.png"));
    for (const m of data.missions) {
      if (!m.try) {
        problems.push(`mission ${m.id} has no \`try\` config`);
        continue;
      }
      await page.eval(`(() => { window.__machine.load(${JSON.stringify(m.try)}); window.__machine.finish(); })()`);
      await Bun.sleep(60);
      const done = await page.eval(`Boolean(window.IA.progress().missions[${JSON.stringify(m.id)}])`);
      if (!done) problems.push(`mission ${m.id}: loading its \`try\` config and finishing did not complete it`);
    }
    if (SHOTS) await page.shot(join(outDir, "desktop-light-missions.png"));
    await page.goto(`${base}/m/${slug}/?theme=dark`, 1440, 900);
    if (SHOTS) await page.shot(join(outDir, "desktop-dark.png"));
    await page.eval("window.__machine.finish()");
    await Bun.sleep(200);
    if (SHOTS) await page.shot(join(outDir, "desktop-dark-finished.png"));
    for (const theme of ["light", "dark"]) {
      await page.goto(`${base}/m/${slug}/?theme=${theme}`, 390, 844);
      const overflow = await page.eval("document.documentElement.scrollWidth - document.documentElement.clientWidth");
      if (overflow > 1) problems.push(`phone ${theme}: horizontal scroll of ${overflow}px`);
      if (SHOTS) await page.shot(join(outDir, `phone-${theme}.png`));
      await page.eval("window.__machine.finish()");
      await Bun.sleep(200);
      if (SHOTS) await page.shot(join(outDir, `phone-${theme}-finished.png`));
    }
    problems.push(...page.errors.map((e) => `console: ${e}`));
  } catch (error) {
    problems.push(`crashed: ${error.message}`);
    problems.push(...page.errors.map((e) => `console: ${e}`));
  }
  await page.close();
  if (problems.length) {
    failed += 1;
    console.log(`✗ ${slug}`);
    for (const p of [...new Set(problems)]) console.log(`    ${p}`);
  } else console.log(`✓ ${slug}${SHOTS ? `  shots/${slug}/*.png` : ""}`);
}

ws.close();
chrome.kill();
server.stop(true);
rmSync(profile, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
