// Inside a tokenizer runtime. Globals: K, Ink, M, D, IA (see AGENTS.md, "live.js").
// The row of type sorts shortens as the press fuses pairs; each fusion files
// a drawer and the dial counts the sorts that remain.
const root = document.querySelector("[data-ia-machine]");
const svg = root.querySelector("[data-ie-svg]");
const layer = svg.querySelector("[data-layer]");
const stage = root.querySelector("[data-ia-stage]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const $ = (selector) => root.querySelector(selector);
const live = (name) => svg.querySelector(`[data-live="${name}"]`);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nodes = {};
const meta = {};
D.items.forEach((item) => {
  meta[item.id] = item;
  nodes[item.id] = layer.querySelector(`:scope > g[data-i="${item.id}"]`);
});
const HOME = D.PRESS.home;

const freshPose = () => ({ pressX: HOME, pressZ: 0, count: 0, drawers: 0, hot: [] });

// World x-centres of the visible sorts of one row.
function layout(tokens) {
  const S = D.STICK;
  const out = [];
  const n = Math.min(tokens.length, S.max);
  let x = S.x0;
  for (let i = 0; i < n; i++) {
    const len = Math.min(Array.from(tokens[i]).length, 8);
    const w = S.w0 + S.wk * (tokens[i] === " " ? 1 : len);
    out.push({ x, w, cx: x + w / 2 });
    x += w + S.gap;
  }
  return { sorts: out, hidden: tokens.length - n };
}

function sortSvg(tok, g, fused) {
  const S = D.STICK;
  const label = tok === " " ? "␣" : (() => {
    const chars = Array.from(tok);
    return esc(chars.slice(0, 8).join("") + (chars.length > 8 ? "…" : ""));
  })();
  const paths = K.slabOf({ x: g.x, y: S.y0, w: g.w, d: S.d, r: 0.4 }, S.z0, S.h, D.P, 2);
  const text = K.faceTextSvg(K.sideMatrix([g.cx, S.y0 + S.d + 0.06], S.z0 + 2.4, D.P, "left"), label, { size: 2.2, tone: "mid", anchor: "middle" });
  return `<g data-sort>${K.solidSvg(paths, { tone: "hi", lit: Boolean(fused) })}${text}</g>`;
}

function renderRow(tokens, fusedIdx) {
  const S = D.STICK;
  const lay = layout(tokens);
  const cells = lay.sorts
    .map((g, i) => ({ g, svg: sortSvg(tokens[i], g, i === fusedIdx), key: K.depthOf([g.cx, S.y0, S.z0], D.P) }))
    .sort((a, b) => a.key - b.key);
  let html = cells.map((c) => c.svg).join("");
  if (lay.hidden > 0) {
    const x = lay.sorts.length ? lay.sorts[lay.sorts.length - 1].x + lay.sorts[lay.sorts.length - 1].w + S.gap : S.x0;
    const w = 9;
    const paths = K.slabOf({ x, y: S.y0, w, d: S.d, r: 0.4 }, S.z0, S.h, D.P, 2);
    html += `<g data-sort>${K.solidSvg(paths, { tone: "lo" })}${K.faceTextSvg(K.sideMatrix([x + w / 2, S.y0 + S.d + 0.06], S.z0 + 2.4, D.P, "left"), "+" + lay.hidden, { size: 2.2, tone: "mid", anchor: "middle" })}</g>`;
  }
  live("sortrow").innerHTML = html;
}

function siteXOf(tokens, at) {
  const lay = layout(tokens);
  if (!lay.sorts.length) return D.STICK.x0;
  const i = Math.max(0, Math.min(at, lay.sorts.length - 1));
  return lay.sorts[i].cx;
}

function beatsFor(sim) {
  const beats = [];
  const b = (d, to, hot, start) => beats.push({ d, to, hot, start });
  const travel = (x) => beats.push({ d: 0.3, to: { pressX: x }, hot: ["gantry"], travel: true, from: null });
  sim.events.forEach((ev) => {
    const mark = beats.length;
    if (ev.type === "intake") {
      b(0.4, { pressX: HOME }, ["sortrow"], (pose) => {
        pose.count = ev.tokenCount;
        pose.drawers = 0;
        renderRow(ev.tokens, -1);
        syncDrawers(0, -1);
      });
    } else if (ev.type === "merge") {
      const x = siteXOf(ev.tokens, ev.at);
      travel(x);
      b(0.28, { pressZ: -2.6 }, ["plunger"]);
      b(0.4, {}, ["sortrow", `drawer${ev.merge.rank}`], (pose) => {
        pose.count = ev.tokenCount;
        pose.drawers = ev.merge.rank + 1;
        renderRow(ev.tokens, ev.at);
        syncDrawers(pose.drawers, ev.merge.rank);
      });
      b(0.3, { pressZ: 0 }, ["plunger"]);
    } else if (ev.type === "exit") {
      b(0.4, { pressX: HOME }, ["dialpuck", "dialface"], (pose) => {
        pose.count = ev.tokenCount;
      });
    }
    beats[mark].event = ev.index;
  });
  return beats;
}

function syncDrawers(count, hotRank) {
  for (let i = 0; i < D.DRAWERS; i++) {
    const el = live(`drawer${i}`);
    if (el) el.style.display = i < count ? "" : "none";
  }
  state.pose.hotDrawer = hotRank;
}

const state = { config: M.decode(location.search), sim: null, beats: [], bi: 0, bt: 0, pose: null, playing: false, stopAt: -1, shown: -1, done: false, explode: { target: 0, shares: {} } };
Object.keys(D.EXPLODE).forEach((asm) => (state.explode.shares[asm] = { x: 0, v: 0 }));

function writeUrl() {
  const params = new URLSearchParams(M.encode(state.config));
  if (document.documentElement.classList.contains("iso-nolabels")) params.set("labels", "0");
  const query = params.toString();
  history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
}

function load(config, { autoplay = false } = {}) {
  state.config = M.configOf(config);
  state.sim = M.simulate(state.config);
  state.beats = beatsFor(state.sim);
  Object.assign(state, { pose: freshPose(), bi: 0, bt: 0, shown: -1, done: false, stopAt: -1 });
  const first = state.sim.events[0];
  state.pose.count = first.tokenCount;
  renderRow(first.tokens, -1);
  syncDrawers(0, -1);
  $("#ie-merges").value = String(state.config.merges);
  $("#ie-merges-val").value = String(state.config.merges);
  $("#ie-preset").value = state.config.preset;
  writeUrl();
  readouts(null);
  draw();
  autoplay ? play() : pause();
}

function begin(beat) {
  if (beat.event !== undefined) onEvent(beat.event);
  if (beat.start) beat.start(state.pose);
  beat._from = {};
  for (const key of Object.keys(beat.to)) beat._from[key] = state.pose[key];
  beat._dur = beat.travel ? 0.3 + Math.abs(beat.to.pressX - state.pose.pressX) / 90 : beat.d;
  state.pose.hot = beat.hot;
}
function apply(beat, t) {
  for (const [key, target] of Object.entries(beat.to)) state.pose[key] = lerp(beat._from[key], target, ease(t));
}

function advance(dt) {
  let left = dt;
  while (left > 0 && state.bi < state.beats.length) {
    const beat = state.beats[state.bi];
    if (state.bt === 0) {
      if (state.stopAt >= 0 && beat.event > state.stopAt) {
        state.playing = false;
        state.stopAt = -1;
        sync();
        return;
      }
      begin(beat);
    }
    const remaining = beat._dur - state.bt;
    if (left >= remaining) {
      apply(beat, 1);
      left -= remaining;
      state.bi += 1;
      state.bt = 0;
    } else {
      state.bt += left;
      apply(beat, state.bt / beat._dur);
      left = 0;
    }
  }
  if (state.bi >= state.beats.length && !state.done) {
    state.done = true;
    state.playing = false;
    const t = state.sim.totals;
    $("[data-ia-live]").textContent = `Run finished: ${t.tokens} tokens for ${t.chars} characters, ${t.cpt} chars per token, vocabulary ${t.vocabSize}.`;
    IA.ran(state.sim);
    sync();
  }
}

function onEvent(index) {
  state.shown = index;
  readouts(state.sim.events[index]);
  IA.trace(state.sim.events[index].trace);
}
function lastMergeText(ev) {
  if (!ev || !ev.lastMerge) return "—";
  const m = ev.lastMerge;
  return `"${m.a}"+"${m.b}" → "${m.into}"`;
}
function readouts(ev) {
  const chars = state.sim.totals.chars;
  const n = ev ? ev.tokenCount : state.sim.events[0].tokenCount;
  $('[data-ro="tokens"]').textContent = String(n);
  $('[data-ro="chars"]').textContent = String(chars);
  $('[data-ro="cpt"]').textContent = (chars / n).toFixed(2);
  $('[data-ro="vocab"]').textContent = String(ev ? ev.vocabSize : M.BASE_VOCAB_SIZE);
  $('[data-ro="last"]').textContent = lastMergeText(ev);
}

let lastOrder = "";
let lastPills = "";
function draw() {
  const pose = state.pose;
  const T = {};
  for (const item of D.items) {
    const share = state.explode.shares[item.asm];
    T[item.id] = mul(D.EXPLODE[item.asm], share ? share.x : 0);
  }
  T.gantry = add(T.gantry, [pose.pressX, 0, 0]);
  T.gantrytrim = add(T.gantrytrim, [pose.pressX, 0, 0]);
  T.plunger = add(T.plunger, [pose.pressX, 0, pose.pressZ]);

  const keyed = D.items.map((item) => [item.id, item.key + dot(T[item.id], D.V)]).sort((a, b) => a[1] - b[1]);
  for (const item of D.items) {
    const t = T[item.id];
    const text = t[0] || t[1] || t[2] ? K.translateAlong(D.P, t) : "";
    if (nodes[item.id]._t !== text) {
      text ? nodes[item.id].setAttribute("transform", text) : nodes[item.id].removeAttribute("transform");
      nodes[item.id]._t = text;
    }
  }
  const order = keyed.map((entry) => entry[0]).join(",");
  if (order !== lastOrder) {
    const fragment = document.createDocumentFragment();
    keyed.forEach(([id]) => fragment.appendChild(nodes[id]));
    layer.appendChild(fragment);
    lastOrder = order;
  }

  // carriage + plunger ride inside their (possibly exploded) press groups
  live("carriage").setAttribute("transform", K.translateAlong(D.P, [pose.pressX, 0, 0]));
  live("carriage2").setAttribute("transform", K.translateAlong(D.P, [pose.pressX, 0, 0]));
  live("plunger").setAttribute("transform", K.translateAlong(D.P, [pose.pressX, 0, pose.pressZ]));

  // dial needle follows the live token count
  const [cx, cy, cz, max] = D.DIAL;
  const share = Math.max(0, Math.min(1, pose.count / max));
  const a = -0.75 * Math.PI + share * 1.5 * Math.PI;
  live("needle").setAttribute("d", K.lineOnTop([cx, cy], [cx + Math.sin(a) * 7, cy - Math.cos(a) * 7], cz, D.P));

  const hot = new Set(pose.hot);
  if (pose.hotDrawer >= 0) hot.add(`drawer${pose.hotDrawer}`);
  for (const id of Array.from(hot)) if (meta[id]) hot.add(`tag-${meta[id].asm}`);
  const pills = D.LABELS.map((label) => {
    const at = label.asm === "press" ? [pose.pressX, label.at[1], label.at[2]] : label.at;
    return Ink.pillSvg(K.iso(add(at, mul(D.EXPLODE[label.asm], state.explode.shares[label.asm].x)), D.P), label.dx, label.dy, D.CONCEPT[label.asm], pose.hot.some((id) => meta[id] && meta[id].asm === label.asm));
  }).join("");
  if (pills !== lastPills) svg.querySelector("[data-pills]").innerHTML = lastPills = pills;
  for (const item of D.items) {
    const node = nodes[item.id];
    hot.has(item.id) ? node.setAttribute("data-hot", "") : node.removeAttribute("data-hot");
  }
}

const SPRING = { stiffness: 64, damping: 14.2, stagger: 0.04 };
function stepExplode(dt) {
  let moving = false;
  Object.values(state.explode.shares).forEach((share, index) => {
    const goal = state.explode.target;
    if (still.matches) return Object.assign(share, { x: goal, v: 0 });
    if (share.goal !== goal) Object.assign(share, { goal, wait: index * SPRING.stagger });
    if (share.wait > 0) return (share.wait -= dt), (moving = true);
    for (let i = 0; i < 4; i++) {
      share.v += (SPRING.stiffness * (goal - share.x) - SPRING.damping * share.v) * (dt / 4);
      share.x += share.v * (dt / 4);
    }
    if (Math.abs(goal - share.x) < 5e-4 && Math.abs(share.v) < 5e-4) Object.assign(share, { x: goal, v: 0 });
    else moving = true;
  });
  return moving;
}

let frame = 0;
let last = 0;
let visible = true;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  if (state.playing) advance(dt * (still.matches ? 40 : 1));
  const moving = stepExplode(dt);
  draw();
  frame = visible && (state.playing || moving) ? requestAnimationFrame(tick) : 0;
  if (!frame) last = 0;
}
function wake() {
  if (!frame && visible) frame = requestAnimationFrame(tick);
}
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) wake();
}, { rootMargin: "120px 0px" }).observe(stage);

function play() {
  if (state.done) load(state.config);
  state.stopAt = -1;
  state.playing = true;
  state.explode.target = 0;
  sync();
  wake();
}
function pause() {
  state.playing = false;
  sync();
  wake();
}
function step() {
  if (state.done) load(state.config);
  state.explode.target = 0;
  state.stopAt = state.shown + 1;
  state.playing = true;
  sync();
  wake();
}
function toggleExplode() {
  state.explode.target = state.explode.target ? 0 : 1;
  if (state.explode.target) state.playing = false;
  sync();
  wake();
}
function sync() {
  const run = $("[data-ie-run]");
  run.textContent = state.playing ? "Pause" : state.done ? "Run again" : state.shown >= 0 ? "Resume" : "Run";
  run.setAttribute("aria-pressed", String(state.playing));
  $("[data-ie-explode]").setAttribute("aria-pressed", String(Boolean(state.explode.target)));
}

$("[data-ie-run]").addEventListener("click", () => (state.playing ? pause() : (IA.event("run"), play())));
$("[data-ie-step]").addEventListener("click", () => (IA.event("step"), step()));
$("[data-ie-explode]").addEventListener("click", () => (IA.event("explode"), toggleExplode()));
$("[data-ie-reset]").addEventListener("click", () => {
  state.explode.target = 0;
  load(M.DEFAULTS);
  wake();
});
const configFromForm = () => ({ merges: Number($("#ie-merges").value), preset: $("#ie-preset").value });
$("#ie-merges").addEventListener("input", (event) => {
  $("#ie-merges-val").value = event.target.value;
  IA.event("control", { name: "merges", value: Number(event.target.value) });
  load(configFromForm(), { autoplay: state.shown >= 0 });
});
$("#ie-preset").addEventListener("change", (event) => {
  IA.event("control", { name: "preset", value: event.target.value });
  load(configFromForm(), { autoplay: state.shown >= 0 });
});
IA.onLoad((config) => {
  state.explode.target = 0;
  load(config, { autoplay: true });
});
stage.addEventListener("keydown", (event) => {
  if (event.target !== stage) return;
  const key = event.key.toLowerCase();
  if (key === " " || key === "enter") state.playing ? pause() : play();
  else if (key === "arrowright") step();
  else if (key === "e") toggleExplode();
  else return;
  event.preventDefault();
});

window.__machine = { state, load, play, pause, step, toggleExplode, seek: (n) => ((state.stopAt = n), (state.playing = true), advance(1e6), (state.playing = false), draw()), finish: () => ((state.playing = true), advance(1e6), draw()) };
load(state.config);
