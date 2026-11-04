// End-to-end: a guest learner on a real server. Predict, finish every mission, take the checkpoint,
// leave the page, and check that /api/progress recorded all of it through the shell SDK's events.
// Usage: start the server (PORT=3917 bun server/server.ts), then: bun tests/e2e-machine.mjs [base] [slug]
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] || "http://127.0.0.1:3917";
const slug = process.argv[3] || "tokenizer";
const profile = mkdtempSync(join(tmpdir(), "ia-e2e-"));
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = Bun.spawn(["/usr/bin/google-chrome", "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdout: "ignore", stderr: "ignore" });
const until = async (fn, ms = 15000) => {
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
const check = (ok, message) => (ok ? console.log(`✓ ${message}`) : (fail.push(message), console.log(`✗ ${message}`)));
let ws;
try {
  const version = await until(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).json());
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result);
    } else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params, sessionId }));
    });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Runtime.enable");
  const evaluate = async (expression) => {
    const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const goto = async (path, ready) => {
    await s("Page.navigate", { url: base + path });
    await until(() => evaluate(`document.readyState === "complete" && ${ready || "true"}`));
  };

  await goto(`/m/${slug}/`, "Boolean(window.__machine)");
  // Predict: click the first option in the Predict card.
  await evaluate(`document.querySelector("[data-ia-predict] .ia-option").click()`);
  // Play: every mission through its own try config.
  const missions = await evaluate("window.__IA_DATA.missions");
  for (const m of missions) await evaluate(`window.__machine.load(${JSON.stringify(m.try)}); window.__machine.finish(); true`);
  const local = await evaluate("window.IA.progress()");
  check(Object.keys(local.missions).length === missions.length, `local progress has ${missions.length} missions`);
  // Prove: answer all five checkpoint questions with the correct option.
  await evaluate(`document.querySelector("[data-ia-check-open]").click()`);
  const quiz = await evaluate("window.__IA_DATA.quiz.filter(q => q.stage !== 'pre').map(q => q.correct)");
  for (const correct of quiz) {
    await evaluate(`document.querySelectorAll("[data-ia-quiz-body] .ia-option")[${correct}].click()`);
    await evaluate(`[...document.querySelectorAll("[data-ia-quiz-body] .ia-btn")].find(b => /Next|See score/.test(b.textContent)).click()`);
  }
  const score = await evaluate(`document.querySelector("[data-ia-quiz-body] h2").textContent`);
  check(score.trim() === `${quiz.length} / ${quiz.length}`, `checkpoint shows ${score.trim()}`);
  // Leave the page: pagehide flushes the event queue with keepalive.
  await goto("/me/");
  await Bun.sleep(1500);
  const progress = await evaluate(`fetch("/api/progress", { credentials: "include" }).then(r => r.json())`);
  const row = progress?.progress?.[slug];
  check(Boolean(row), `server has a progress row for ${slug}`);
  const missionsDone = row ? (Array.isArray(row.missions) ? row.missions.length : Object.keys(row.missions || {}).length) : 0;
  check(missionsDone === missions.length, `server recorded ${missionsDone}/${missions.length} missions`);
  check(row && row.predict != null, "server recorded the prediction");
  check(row && Number(row.quiz_best ?? row.quizBest ?? row.quiz?.best ?? -1) === quiz.length, `server recorded checkpoint best = ${JSON.stringify(row?.quiz_best ?? row?.quizBest ?? row?.quiz)}`);
  const me = await evaluate(`fetch("/api/me", { credentials: "include" }).then(r => r.json())`);
  check(me?.user?.guest === true, "the learner is a guest user with a session");
  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  if (fail.length) console.log(JSON.stringify(row, null, 1).slice(0, 1200));
} catch (error) {
  fail.push(String(error));
  console.log("✗ crashed:", error);
} finally {
  ws?.close();
  chrome.kill();
  rmSync(profile, { recursive: true, force: true });
}
process.exit(fail.length ? 1 : 0);
