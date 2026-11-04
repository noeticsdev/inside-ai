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
  const answer = async (v) => { await ev(`(() => { const i = document.querySelector('.gd-task input'); i.value = '${v}'; document.querySelector('.gd-task .ia-btn').click(); })()`); await Bun.sleep(120); };
  const choose = async (text) => { await ev(`[...document.querySelectorAll('.gd-task .gd-choice')].find(b => b.textContent.includes(${JSON.stringify(text)})).click()`); await Bun.sleep(120); };
  const solvedNow = () => ev("document.querySelector('.gd-task')?.dataset.done === 'true'");
  const shot = async (name) => { const { data } = await s("Page.captureScreenshot", { format: "png" }); writeFileSync(join(out, name), Buffer.from(data, "base64")); };

  // kit
  ok((await step()) === 0, "starts on the kit step");
  await ev("[...document.querySelectorAll('.gd-part')].find(r => r.textContent.includes('NIC')).click()");
  ok(await ev("document.querySelector('[data-hw=nic]').classList.contains('is-on')"), "tapping NIC in the kit list lights it on the server");
  await ev("document.querySelector('[data-ia-predict] .ia-option').click()");
  await shot("00-kit.png");
  await next();
  // 1 timestamp
  ok((await step()) === 1, "Everything's here moves to step 1");
  ok((await ready()) === "false", "step 1: Next is locked before the task");
  await next();
  ok((await step()) === 1, "step 1: a locked Next does not advance");
  await answer(1800033);
  ok((await fb()).includes("milliseconds"), "step 1: adding 33 ms gets the milliseconds hint");
  await answer(1803000);
  ok(await solvedNow(), "step 1: 1,803,000 solves it");
  ok((await ready()) === "true", "step 1: Next unlocks");
  await shot("01-receive.png");
  await next();
  // 2 NAL order
  await ev("[...document.querySelectorAll('.gd-chip')].find(b => b.textContent.startsWith('IDR')).click()");
  ok((await fb()).includes("PPS"), "step 2: tapping the slice first explains the PPS dependency");
  for (const n of ["SPS", "PPS", "IDR"]) await ev(`[...document.querySelectorAll('.gd-chip')].find(b => b.textContent.startsWith('${n}')).click()`);
  await Bun.sleep(150);
  ok(await solvedNow(), "step 2: SPS, PPS, IDR solves it");
  await next();
  // 3 NV12 bytes
  await answer(6220800);
  ok((await fb()).includes("RGB"), "step 3: the RGB size gets a targeted hint");
  await answer(3110400);
  ok(await solvedNow(), "step 3: 3,110,400 solves it");
  ok(await ev("document.querySelector('.gd-board svg').textContent.includes('3,110,400 B')"), "step 3: the readout on the server fills in the NV12 size");
  await shot("03-decode.png");
  await next();
  // 4 mux
  await choose("40 seconds");
  ok((await fb()).includes("microseconds"), "step 4: the 40-seconds answer gets the microseconds hint");
  await choose("Pushes the 7 frames");
  ok(await solvedNow(), "step 4: the partial batch solves it");
  await next();
  // 5 tensor
  await answer(12533760);
  ok((await fb()).includes("2 bytes"), "step 5: counting elements gets the FP16 hint");
  await answer(25067520);
  ok(await solvedNow(), "step 5: 25,067,520 solves it");
  await next();
  // 6 NMS
  const slide = (label, v) => ev(`(() => { const el = document.querySelector('.gd-task input[aria-label="${label}"]'); el.value = '${v}'; el.dispatchEvent(new Event('input', {bubbles: true})); })()`);
  ok(!(await solvedNow()), "step 6: the default thresholds are wrong");
  await slide("pre-cluster-threshold", 0.5);
  await slide("nms-iou-threshold", 0.3);
  ok((await ev("document.querySelector('.gd-bench .fg-verdict').textContent")).includes("walkers"), "step 6: NMS 0.3 explains the walkers merging");
  await slide("nms-iou-threshold", 0.5);
  ok(await solvedNow(), "step 6: 0.5 / 0.5 solves it");
  await shot("06-detect.png");
  await next();
  // 7 interval
  await answer(4);
  ok(!(await solvedNow()), "step 7: interval 4 is rejected");
  ok((await ev("document.querySelector('.gd-bench .fg-verdict').textContent")).includes("ID switches"), "step 7: the tracker bench shows the ID switches at interval 4");
  await answer(3);
  ok(await solvedNow(), "step 7: interval 3 solves it");
  await next();
  // 8 the counting rule
  if (PY) {
    await until(() => ev("Boolean(document.querySelector('.pc-cell textarea'))"), 20000);
    await ev(`(() => { const c = document.querySelector('.pc-cell'); const ta = c.querySelector('textarea'); ta.value = "def crossed(p, c, x):\\n    if p < x <= c:\\n        return 'entry'\\n    if c < x <= p:\\n        return 'exit'\\n    return None\\n"; ta.dispatchEvent(new Event('input', {bubbles: true})); [...c.querySelectorAll('button')].find(b => /run/i.test(b.textContent)).click(); })()`);
    const passed = await until(() => ev("document.querySelector('.gd-task')?.dataset.done === 'true'"), 90000).catch(() => false);
    ok(Boolean(passed), "step 8: the Python cell runs in the browser, passes 5/5 and solves the step");
  } else {
    await ev("document.querySelector('.gd-fallback').open = true");
    await ev("[...document.querySelectorAll('.gd-fallback .gd-choice')][1].click()");
    ok((await fb()).includes("970"), "step 8: the off-by-one rule is explained with car-a");
    await ev("[...document.querySelectorAll('.gd-fallback .gd-choice')][0].click()");
    await Bun.sleep(120);
    ok(await solvedNow(), "step 8: the no-Python fallback solves it");
  }
  await shot("08-count.png");
  await next();
  // 9 event time
  await answer(25);
  ok((await fb()).includes("frame number"), "step 9: the frame number gets a hint");
  await answer(833);
  ok(await solvedNow(), "step 9: 833 solves it");
  ok(await ev("document.querySelector('.cu-json').textContent.includes('18:00:00.833Z')"), "step 9: the JSON fills in the timestamp");
  await shot("09-publish.png");
  await next();
  // 10 bottleneck
  await choose("NVDEC");
  ok((await fb()).includes("53.3%"), "step 10: NVDEC is rejected with its real load");
  await choose("GPU SMs");
  ok(await solvedNow(), "step 10: the SMs solve it");
  ok(await ev("document.querySelector('[data-hw=sm]').classList.contains('is-over')"), "step 10: the SMs turn red on the server");
  await shot("10-scale.png");
  await next();
  // 11 keep up
  const pick = (label, v) => ev(`(() => { const el = document.querySelector('.gd-task select[aria-label="${label}"]'); el.value = '${v}'; el.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  await pick("batch-size", 4);
  await pick("interval", 4);
  ok((await fb()).includes("breaks the tracker"), "step 11: interval 4 is under budget but breaks the tracker");
  await pick("interval", 0);
  await pick("batch-size", 16);
  ok(await solvedNow(), "step 11: batch 16, interval 0 solves it");
  await shot("11-keepup.png");
  await next();
  // done
  ok((await ev("window.__lesson.steps[window.__lesson.state.step]")) === "done", "reaches the done step");
  ok((await ev("Object.keys(window.IA.progress().missions).length")) === 11, "all 11 step tasks recorded in progress");
  ok((await ev("document.querySelector('[data-ia-count]').textContent")) === "11/11", "the top bar counts 11/11 tasks");
  ok(await ev("document.querySelector('.gd-config pre').textContent.includes('batch-size=16')"), "the config carries the reader's batch-size");
  await shot("12-done.png");
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
    for (let i = 0; i < 13; i++) {
      await goto(`?theme=${t}&step=${i}`, 390, 844);
      const over = await ev("document.documentElement.scrollWidth - document.documentElement.clientWidth");
      if (over > 1) ok(false, `390px ${t} step ${i}: horizontal scroll (${over}px)`);
    }
    ok(true, `390px ${t}: checked all 13 steps for horizontal scroll`);
  }
  await goto("?theme=dark&step=3", 1440, 900);
  await shot("03-decode-dark.png");
  await goto("?theme=light&step=6", 390, 844);
  await full("phone-06.png", 390);
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
