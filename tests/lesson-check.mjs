// Headless check of a guided-build lesson: walks every step like a learner (wrong answer first, then the
// right one), checks Next stays locked until the task is solved, runs a Python cell, and takes screenshots.
// Usage: bun scripts/build.mjs --only deepstream && bun tests/lesson-check.mjs deepstream [--no-python]
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const slug = process.argv[2] || "deepstream";
const PY = !process.argv.includes("--no-python");
const out = join(ROOT, "shots", `lesson-${slug}`);
mkdirSync(out, { recursive: true });
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return new Response("{}", { status: 404 });
    let p = join(ROOT, "dist", decodeURIComponent(url.pathname));
    if (p.endsWith("/")) p = join(p, "index.html");
    const f = Bun.file(p);
    return f.size ? new Response(f) : new Response("nf", { status: 404 });
  },
});
const profile = mkdtempSync(join(tmpdir(), "ia-lesson-"));
const port = 9500 + Math.floor(Math.random() * 200);
const chrome = Bun.spawn(["/usr/bin/google-chrome", "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdout: "ignore", stderr: "ignore" });
const until = async (fn, ms = 20000) => {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() > end) throw new Error("timeout");
    await Bun.sleep(100);
  }
};
const fail = [];
const ok = (c, m) => (c ? console.log(`✓ ${m}`) : (fail.push(m), console.log(`✗ ${m}`)));
let ws;
try {
  const v = await until(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).json());
  ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) {
      const p = pend.get(d.id);
      pend.delete(d.id);
      d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result);
    } else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const n = ++id; pend.set(n, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: n, method, params, sessionId })); });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Runtime.enable");
  await s("Page.enable");
  const ev = async (expression) => {
    const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const base = String(server.url).replace(/\/$/, "");
  const goto = async (q, w, hgt) => {
    await s("Emulation.setDeviceMetricsOverride", { width: w, height: hgt, deviceScaleFactor: 1, mobile: w < 600 });
    await s("Page.navigate", { url: `${base}/m/${slug}/${q}` });
    await until(() => ev("document.readyState === 'complete' && Boolean(window.__lesson && window.__lesson.ready)"));
    await Bun.sleep(300);
  };
  const full = async (file, w) => {
    const hgt = await ev("Math.ceil(document.documentElement.scrollHeight)");
    await s("Emulation.setDeviceMetricsOverride", { width: w, height: hgt, deviceScaleFactor: 1, mobile: w < 600 });
    await Bun.sleep(250);
    const { data } = await s("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(out, file), Buffer.from(data, "base64"));
  };

  await goto("?theme=light", 1440, 900);
  await ev("localStorage.clear()");
  await goto("?theme=light", 1440, 900);
  ok(errors.length === 0, `no errors on load${errors.length ? ": " + errors.join(" | ") : ""}`);
  const step = () => ev("window.__lesson.state.step");
  const ready = () => ev("document.querySelector('[data-gd-next]').dataset.ready");
  const fb = () => ev("document.querySelector('.gd-fb')?.textContent || ''");
  const next = async () => { await ev("document.querySelector('[data-gd-next]').click()"); await Bun.sleep(250); };
  const solvedNow = () => ev("document.querySelector('.gd-task')?.dataset.done === 'true'");
  const shot = async (name) => { const { data } = await s("Page.captureScreenshot", { format: "png" }); writeFileSync(join(out, name), Buffer.from(data, "base64")); };
  const J = JSON.stringify;
  const act = {
    answer: (a) => ev(`(() => { const i = document.querySelector('.gd-task input'); i.value = ${J(String(a.value))}; document.querySelector('.gd-task .ia-btn').click(); })()`),
    choose: (a) => ev(`[...document.querySelectorAll('.gd-task .gd-choice')].find(b => b.textContent.includes(${J(a.text)})).click()`),
    tap: (a) => ev(`[...document.querySelectorAll('.gd-task .gd-chip')].find(b => b.textContent.startsWith(${J(a.text)})).click()`),
    slide: (a) => ev(`(() => { const el = document.querySelector('.gd-task input[aria-label=${J(a.label)}]'); el.value = ${J(String(a.value))}; el.dispatchEvent(new Event('input', {bubbles: true})); })()`),
    select: (a) => ev(`(() => { const el = document.querySelector('.gd-task select[aria-label=${J(a.label)}]'); el.value = ${J(String(a.value))}; el.dispatchEvent(new Event('change', {bubbles: true})); })()`),
    fallback: (a) => ev(`(() => { document.querySelector('.gd-fallback').open = true; [...document.querySelectorAll('.gd-fallback .gd-choice')][${a.index}].click(); })()`),
    click: (a) => ev(`document.querySelector(${J(a.selector)}).click()`),
    python: async (a) => {
      await until(() => ev("Boolean(document.querySelector('.gd-stage .pc-cell textarea'))"), 20000);
      await ev(`(() => { const c = document.querySelector('.gd-stage .pc-cell'); const ta = c.querySelector('textarea'); ta.value = ${J(a.code)}; ta.dispatchEvent(new Event('input', {bubbles: true})); [...c.querySelectorAll('button')].find(b => /run/i.test(b.textContent)).click(); })()`);
      await until(() => ev("document.querySelector('.gd-task')?.dataset.done === 'true'"), 90000).catch(() => false);
    },
  };
  const walk = (await import(join(ROOT, "lessons", slug, "walk.mjs"))).default;
  const ids = await ev("window.__lesson.steps");
  const missions = await ev("window.__IA_DATA.missions.length");
  ok(walk.length === ids.length - 1, `walk.mjs covers every step before done (${walk.length} of ${ids.length - 1})`);
  for (const [n, w] of walk.entries()) {
    const id = ids[await step()];
    ok(id === w.step, `step ${n} is "${w.step}" (page shows "${id}")`);
    const gated = (await ev("Boolean(document.querySelector('.gd-task'))")) && !(await solvedNow());
    if (gated) ok((await ready()) === "false", `${w.step}: Next is locked before the task`);
    for (const a of w.actions || []) {
      if (a.do === "python" && !PY) { await act.fallback({ index: a.fallbackIndex ?? 0 }); await Bun.sleep(150); ok(await solvedNow(), `${w.step}: the no-Python fallback solves it`); continue; }
      await act[a.do](a);
      await Bun.sleep(a.do === "python" ? 0 : 150);
      if (a.expect) ok((await fb()).includes(a.expect), `${w.step}: ${a.do} ${a.value ?? a.text ?? a.label ?? ""} → hint mentions "${a.expect}"`);
      if (a.expectStage) ok((await ev("document.querySelector('[data-gd-stage]').textContent")).includes(a.expectStage), `${w.step}: the stage shows "${a.expectStage}"`);
      if (a.solves) ok(await solvedNow(), `${w.step}: ${a.do === "python" ? "the Python cell passes and solves it" : `${a.do} ${a.value ?? a.text ?? a.label ?? ""} solves it`}`);
      if (a.solves === false) ok(!(await solvedNow()), `${w.step}: ${a.do} ${a.value ?? a.text ?? ""} does not solve it`);
    }
    if (gated) ok((await ready()) === "true", `${w.step}: Next unlocks once solved`);
    await shot(`${String(n).padStart(2, "0")}-${w.step}.png`);
    await next();
  }
  ok((await ev("window.__lesson.steps[window.__lesson.state.step]")) === "done", "reaches the done step");
  ok((await ev("Object.keys(window.IA.progress().missions).length")) === missions, `all ${missions} step tasks recorded in progress`);
  ok((await ev("document.querySelector('[data-ia-count]').textContent")) === `${missions}/${missions}`, `the top bar counts ${missions}/${missions} tasks`);
  ok((await ev("document.querySelector('.gd-config pre')?.textContent.length || 0")) > 40, "the done step hands back an artifact");
  await shot("zz-done.png");
  // thumbnail: the finished server, computed styles inlined
  const thumb = await ev(`(() => {
    const src = document.querySelector('.gd-board svg');
    const clone = src.cloneNode(true);
    const a = [...src.querySelectorAll('*')], b = [...clone.querySelectorAll('*')];
    const props = ['fill','stroke','stroke-width','stroke-dasharray','opacity','font-size','font-weight','font-family','letter-spacing'];
    a.forEach((el, i) => { const cs = getComputedStyle(el); b[i].setAttribute('style', props.map(p => p + ':' + cs.getPropertyValue(p)).join(';')); b[i].removeAttribute('class'); });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.removeAttribute('style');
    clone.setAttribute('style', 'background:' + getComputedStyle(document.querySelector('.gd-stage')).backgroundColor);
    return new XMLSerializer().serializeToString(clone);
  })()`);
  writeFileSync(join(ROOT, "lessons", slug, "figure.svg"), thumb);
  ok(thumb.length > 5000, `exported lessons/${slug}/figure.svg (${Math.round(thumb.length / 1024)} KB)`);
  await ev("document.querySelector('[data-gd-next]').click()");
  await Bun.sleep(200);
  ok(await ev("document.querySelector('[data-ia-quiz]').open"), "the done footer opens the checkpoint");
  await ev("document.querySelector('[data-ia-quiz]').close()");
  await goto("?theme=light", 1440, 900);
  ok((await ev("window.__lesson.steps[window.__lesson.state.step]")) === "done", "a reload resumes where the reader left off");
  // every step at 390 px and in dark mode
  for (const t of ["light", "dark"]) {
    for (let i = 0; i < ids.length; i++) {
      await goto(`?theme=${t}&step=${i}`, 390, 844);
      const over = await ev("document.documentElement.scrollWidth - document.documentElement.clientWidth");
      if (over > 1) ok(false, `390px ${t} step ${i}: horizontal scroll (${over}px)`);
    }
    ok(true, `390px ${t}: checked all ${ids.length} steps for horizontal scroll`);
  }
  await goto("?theme=dark&step=1", 1440, 900);
  await shot("dark-01.png");
  await goto(`?theme=light&step=${Math.max(1, Math.floor(ids.length / 2))}`, 390, 844);
  await full("phone-mid.png", 390);
  ok(errors.length === 0, `no console errors overall${errors.length ? ": " + [...new Set(errors)].join(" | ") : ""}`);
} catch (e) {
  fail.push(String(e));
  console.log("✗ crashed", e);
} finally {
  ws?.close();
  chrome.kill();
  server.stop(true);
  rmSync(profile, { recursive: true, force: true });
}
console.log(fail.length ? `\n${fail.length} failed` : `\nall passed · shots/lesson-${slug}/`);
process.exit(fail.length ? 1 : 0);
