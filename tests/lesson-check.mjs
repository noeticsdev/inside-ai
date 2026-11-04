// Headless check of a built lesson page: zero console errors, every anatomy stage renders, every mission
// can be solved through the UI, a Python cell passes, and full-page screenshots (light/dark, desktop/390).
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
  // anatomy: visit every stage
  const stages = await ev("document.querySelectorAll('.st-stage').length");
  for (let i = 0; i < stages; i++) {
    await ev(`document.querySelectorAll('.st-stage')[${i}].dispatchEvent(new MouseEvent('click', {bubbles: true}))`);
    const txt = await ev("document.querySelector('.in').innerText.length");
    ok(txt > 120, `stage ${i + 1}/${stages} inspector has content (${txt} chars)`);
  }
  await full("desktop-light-start.png", 1440);
  // export the first figure as a standalone light-theme SVG for the catalog card (computed styles inlined)
  const thumb = await ev(`(() => {
    const src = document.querySelector('.fg svg');
    const clone = src.cloneNode(true);
    const a = [...src.querySelectorAll('*')], b = [...clone.querySelectorAll('*')];
    const props = ['fill','stroke','stroke-width','stroke-dasharray','opacity','font-size','font-weight','font-family','letter-spacing'];
    a.forEach((el, i) => { const cs = getComputedStyle(el); const st = props.map(p => p + ':' + cs.getPropertyValue(p)).join(';'); b[i].setAttribute('style', st); b[i].removeAttribute('class'); });
    b.filter(el => el.tagName === 'circle' && el.getAttribute('r') === '6').forEach(el => el.remove());
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('style', 'background:' + getComputedStyle(document.querySelector('.fg')).backgroundColor);
    return new XMLSerializer().serializeToString(clone);
  })()`);
  writeFileSync(join(ROOT, "lessons", slug, "figure.svg"), thumb);
  ok(thumb.length > 5000, `exported lessons/${slug}/figure.svg (${Math.round(thumb.length / 1024)} KB)`);
  await s("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  // mission 1: bytes
  await ev(`(() => { const ins = document.querySelectorAll('.mi input[type=number]'); ins[0].value = '6220800'; ins[1].value = '25067520'; [...document.querySelectorAll('.mi .ia-btn')][0].click(); })()`);
  ok((await ev("document.querySelectorAll('.mi')[0].dataset.done")) === "false", "a wrong NV12 answer (RGB size) is rejected");
  ok((await ev("document.querySelectorAll('.mi .mi-fb')[0].innerText")).includes("RGB"), "the RGB mistake gets a targeted hint");
  await ev(`(() => { const ins = document.querySelectorAll('.mi input[type=number]'); ins[0].value = '3110400'; [...document.querySelectorAll('.mi .ia-btn')][0].click(); })()`);
  ok((await ev("document.querySelectorAll('.mi')[0].dataset.done")) === "true", "mission 1 solves with 3,110,400 and 25,067,520");
  ok((await ev("[...document.querySelectorAll('.st-box-data')].some(t => t.textContent.includes('3,110,400'))")) === true, "the anatomy reveals the NV12 size after mission 1");
  // mission 2: bottleneck, wrong then right
  await ev(`[...document.querySelectorAll('.mi')[1].querySelectorAll('button')].find(b => b.textContent === 'NVDEC').click()`);
  ok((await ev("document.querySelectorAll('.mi')[1].dataset.done")) === "false", "choosing NVDEC is rejected");
  await ev(`[...document.querySelectorAll('.mi')[1].querySelectorAll('button')].find(b => b.textContent === 'GPU SMs').click()`);
  ok((await ev("document.querySelectorAll('.mi')[1].dataset.done")) === "true", "choosing the SMs solves mission 2");
  ok((await ev("document.querySelector('.formula').innerText")).includes("1,044 of 1,000 ms"), "the SM arithmetic shows 1,044 of 1,000 ms");
  // mission 3: detector sliders
  const set = (label, v) => ev(`(() => { const el = document.querySelector('input[aria-label="${label}"]'); el.value = '${v}'; el.dispatchEvent(new Event('input', {bubbles: true})); })()`);
  ok((await ev("document.querySelectorAll('.mi')[2].dataset.done")) === "false", "the detector starts wrong (defaults are not exact)");
  await set("nms-iou-threshold", 0.3);
  await set("pre-cluster-threshold", 0.5);
  ok((await ev("document.querySelectorAll('.fg-verdict')[1].innerText")).includes("walkers"), "NMS 0.3 explains that the walkers merged");
  await set("nms-iou-threshold", 0.5);
  ok((await ev("document.querySelectorAll('.mi')[2].dataset.done")) === "true", "confidence 0.5 + NMS 0.5 solves mission 3");
  // mission 4: interval
  await ev(`(() => { const m = document.querySelectorAll('.mi')[3]; m.querySelector('input').value = '4'; m.querySelector('.ia-btn').click(); })()`);
  ok((await ev("document.querySelectorAll('.mi')[3].dataset.done")) === "false", "interval 4 is rejected");
  ok((await ev("document.querySelectorAll('.fg-verdict')[2].innerText")).includes("ID switches"), "interval 4 shows ID switches in the tracker figure");
  await ev(`(() => { const m = document.querySelectorAll('.mi')[3]; m.querySelector('input').value = '3'; m.querySelector('.ia-btn').click(); })()`);
  ok((await ev("document.querySelectorAll('.mi')[3].dataset.done")) === "true", "interval 3 solves mission 4");
  ok((await ev("window.IA.progress().missions && Object.keys(window.IA.progress().missions).length")) === 4, "all 4 missions recorded in progress");
  if (PY) {
    // python cell: write the crossing solution and run
    await ev(`(() => { const cells = document.querySelectorAll('.pc-cell'); const c = cells[cells.length - 1]; const ta = c.querySelector('textarea'); ta.value = "def crossed(p, c, x):\\n    if p < x <= c:\\n        return 'entry'\\n    if c < x <= p:\\n        return 'exit'\\n    return None\\n"; ta.dispatchEvent(new Event('input', {bubbles: true})); [...c.querySelectorAll('button')].find(b => /run/i.test(b.textContent)).click(); })()`);
    const summary = await until(async () => { const t = await ev("(() => { const c = [...document.querySelectorAll('.pc-cell')].pop(); return c.innerText; })()"); return /5\/5 checks pass/.test(t) ? t : null; }, 90000).catch(() => null);
    ok(Boolean(summary), "the line-crossing Python cell runs in the browser and passes 5/5");
  }
  await full("desktop-light-solved.png", 1440);
  await goto("?theme=dark", 1440, 900);
  await full("desktop-dark.png", 1440);
  for (const t of ["light", "dark"]) {
    await goto(`?theme=${t}`, 390, 844);
    const over = await ev("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    ok(over <= 1, `390px ${t}: no horizontal scroll (${over})`);
    await full(`phone-${t}.png`, 390);
  }
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
