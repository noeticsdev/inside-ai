// Inside an attention head: runtime. Globals: K, Ink, M, D, IA (see AGENTS.md, "live.js").
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
const nodes = {};
const meta = {};
D.items.forEach((item) => {
  meta[item.id] = item;
  nodes[item.id] = layer.querySelector(`:scope > g[data-i="${item.id}"]`);
});

const freshPose = (config) => ({ shx: D.XS[config.focus], cur: -1, grow: 0, shown: 0, cup: 0, barT: 0, hot: [] });

function beatsFor(sim) {
  const beats = [];
  const b = (d, to, hot, start) => beats.push({ d, to, hot, start });
  sim.events.forEach((ev, index) => {
    const mark = beats.length;
    if (ev.type === "query") {
      const x = D.XS[ev.focus];
      beats.push({ d: 0, to: { shx: x }, hot: ["carriage", "mast", "spool", "tip"], travel: true });
      b(0.3, {}, ["carriage", "spool", "tip"]);
    } else if (ev.type === "score") {
      b(0.22, { grow: 1 }, [`post${ev.key}`, `card${ev.key}`, `thread${ev.key}`], (pose) => {
        pose.shown = ev.key;
        pose.cur = ev.key;
        pose.grow = 0;
      });
    } else if (ev.type === "weigh") {
      b(0.6, {}, ["funnel", "stem", "gateweight"], (pose) => {
        pose.shown = 10;
        pose.cur = -1;
      });
    } else if (ev.type === "mix") {
      b(0.7, { cup: 1, barT: 1 }, ["cup", "fill", "tablet", "bars"], (pose) => {
        pose.cup = 0;
        pose.barT = 0;
      });
    } else if (ev.type === "exit") {
      b(0.3, {}, ["cup", "tablet"]);
    }
    beats[mark].event = index;
  });
  return beats;
}

const state = { config: M.decode(location.search), sim: null, beats: [], bi: 0, bt: 0, pose: null, playing: false, stopAt: -1, shown: -1, done: false, weights: [], masked: [], output: [], topIndex: 0, explode: { target: 0, shares: {} } };
Object.keys(D.EXPLODE).forEach((asm) => (state.explode.shares[asm] = { x: 0, v: 0 }));

function writeUrl() {
  const params = new URLSearchParams(M.encode(state.config));
  if (document.documentElement.classList.contains("iso-nolabels")) params.set("labels", "0");
  const query = params.toString();
  history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
}

function threadPath(i, frac) {
  const w = state.weights[i] || 0;
  const ax = state.pose.shx;
  const a = [ax, D.RAIL_Y, D.SH_Z];
  const bb = [D.XS[i], D.POST_Y, D.CARD_Z];
  const masked = state.masked[i];
  const end = masked ? 0.3 : Math.max(0.02, frac);
  const sag = masked ? 0.6 : 2.5 * (0.4 + w);
  const N = 9;
  let d = "";
  for (let s = 0; s <= N; s++) {
    const t = (s / N) * end;
    const p = [lerp(a[0], bb[0], t), lerp(a[1], bb[1], t), lerp(a[2], bb[2], t) - Math.sin(Math.PI * Math.min(1, t)) * sag * end];
    const [sx, sy] = K.iso(p, D.P);
    d += `${s ? "L" : "M"}${sx.toFixed(1)} ${sy.toFixed(1)}`;
  }
  return d;
}

function buildStatic() {
  // Shutter blade for the causal mask.
  const sh = live("shutter");
  if (state.config.causal) {
    const x0 = D.XS[state.config.focus] + 7;
    sh.innerHTML = Ink.inkSolid(K.slabOf({ x: x0, y: -20.6, w: 70 - x0, d: 1.6, r: 0.2 }, 17.2, 2.8, D.P, 2), { tone: "hi" });
  } else sh.innerHTML = "";
  // Gate weight presses down when scaling is on.
  live("gateweight").setAttribute("transform", state.config.scale ? "" : K.translateAlong(D.P, [0, 0, 3.5]));
  // Temperature needle.
  const [cx, cy, cz] = D.DIAL;
  const a = -0.75 * Math.PI + ((state.config.temp - 0.2) / 1.8) * 1.5 * Math.PI;
  live("needle").setAttribute("d", K.lineOnTop([cx, cy], [cx + Math.sin(a) * 3.4, cy - Math.cos(a) * 3.4], cz, D.P));
  // Masked coils show from the start of a loaded run.
  for (let i = 0; i < 10; i++) live(`coil${i}`).style.display = state.masked[i] ? "" : "none";
}

function load(config, { autoplay = false } = {}) {
  state.config = M.configOf(config);
  state.sim = M.simulate(state.config);
  state.beats = beatsFor(state.sim);
  state.weights = state.sim.totals.weights;
  state.topIndex = state.sim.totals.topIndex;
  state.masked = state.sim.events.filter((e) => e.type === "score").map((e) => e.masked);
  state.output = state.sim.totals.output;
  Object.assign(state, { pose: freshPose(state.config), bi: 0, bt: 0, shown: -1, done: false, stopAt: -1 });
  $("#ie-focus").value = String(state.config.focus);
  $("#ie-head").value = state.config.head;
  $("#ie-scale").checked = state.config.scale;
  $("#ie-causal").checked = state.config.causal;
  $("#ie-temp").value = String(state.config.temp);
  $("#ie-tempv").textContent = state.config.temp.toFixed(1);
  writeUrl();
  buildStatic();
  readouts(null);
  draw();
  autoplay ? play() : pause();
}

function begin(beat) {
  if (beat.event !== undefined) onEvent(beat.event);
  if (beat.start) beat.start(state.pose);
  beat._from = {};
  for (const key of Object.keys(beat.to)) beat._from[key] = state.pose[key];
  beat._dur = beat.travel ? 0.3 + Math.abs(beat.to.shx - state.pose.shx) / 90 : beat.d;
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
    $("[data-ia-live]").textContent = `Run finished: top key ${t.top} at ${t.topWeight.toFixed(3)}, entropy ${t.entropyBits.toFixed(2)} bits, weights sum to ${t.sum.toFixed(3)}.`;
    IA.ran(state.sim);
    sync();
  }
}

function onEvent(index) {
  state.shown = index;
  readouts(state.sim.events[index]);
  IA.trace(state.sim.events[index].trace);
}
function readouts(ev) {
  const t = state.sim.totals;
  $('[data-ro="step"]').textContent = ev ? `${ev.index + 1} / ${state.sim.events.length}` : `0 / ${state.sim.events.length}`;
  $('[data-ro="top"]').textContent = t.top;
  $('[data-ro="weight"]').textContent = t.topWeight.toFixed(3);
  $('[data-ro="entropy"]').textContent = `${t.entropyBits.toFixed(2)} bits`;
  $('[data-ro="sum"]').textContent = t.sum.toFixed(3);
  $('[data-ro="maxscore"]').textContent = t.maxScore.toFixed(2);
}

let lastOrder = "";
let lastPills = "";
let lastThreadKey = "";
function draw() {
  const pose = state.pose;
  const T = {};
  for (const item of D.items) {
    const share = state.explode.shares[item.asm];
    T[item.id] = mul(D.EXPLODE[item.asm], share ? share.x : 0);
  }
  T.carriage = add(T.carriage, [pose.shx, 0, 0]);
  T.mast = add(T.mast, [pose.shx, 0, 0]);
  T.spool = add(T.spool, [pose.shx, 0, 0]);
  T.tip = add(T.tip, [pose.shx, 0, 0]);
  for (const id of ["bush--5", "bush-5"]) if (T[id]) T[id] = add(T[id], [pose.shx, 0, 0]);

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

  // Threads rebuild when the shuttle, the reveal or the weights change.
  const tkey = `${pose.shx.toFixed(2)}|${pose.shown}|${pose.cur}|${pose.grow.toFixed(3)}|${state.explode.target.toFixed(2)}|${state.config.head}|${state.config.scale}|${state.config.causal}|${state.config.temp}`;
  if (tkey !== lastThreadKey) {
    lastThreadKey = tkey;
    const fade = 1 - state.explode.target;
    for (let i = 0; i < 10; i++) {
      const frac = i < pose.shown ? 1 : i === pose.cur ? pose.grow : 0;
      const el = live(`thread${i}`);
      const wrap = live(`threadwrap${i}`);
      if (frac <= 0 || fade <= 0) {
        wrap.setAttribute("opacity", "0");
      } else {
        wrap.setAttribute("opacity", fade.toFixed(2));
        el.setAttribute("d", threadPath(i, frac));
        const w = state.weights[i] || 0;
        el.setAttribute("stroke-width", state.masked[i] ? "1.2" : (0.6 + w * 6.4).toFixed(2));
        el.setAttribute("stroke", state.masked[i] ? "var(--ink-soft)" : i === state.topIndex ? "var(--ia-accent)" : "var(--ink)");
        const cut = live(`cut${i}`);
        if (state.masked[i]) {
          const a = [pose.shx, D.RAIL_Y, D.SH_Z];
          const b = [D.XS[i], D.POST_Y, D.CARD_Z];
          const p = K.iso([lerp(a[0], b[0], 0.3), lerp(a[1], b[1], 0.3), lerp(a[2], b[2], 0.3) - Math.sin(Math.PI * 0.3) * 0.6 * 0.3], D.P);
          cut.setAttribute("d", `M${p[0]-2.5} ${p[1]-2.5}l5 5m-5 0l5 -5`);
        } else cut.setAttribute("d", "");
        if (state.masked[i]) el.setAttribute("stroke-dasharray", "3 2");
        else el.removeAttribute("stroke-dasharray");
      }
      live(`coil${i}`).style.display = state.masked[i] && (i < pose.shown || i === pose.cur) && fade > 0 ? "" : "none";
    }
    // Cup fill rises with the mix; bars plot the output vector.
    live("fill").setAttribute("transform", K.translateAlong(D.P, [0, 0, pose.cup * 2.2]));
    const bars = state.output.map((v, bIdx) => {
      const h = Math.max(0.3, v * 15 * pose.barT);
      return Ink.inkSolid(K.slabOf({ x: 41.6 + bIdx * 3.2, y: 26.4, w: 2, d: 3.2, r: 0.2 }, 7.6, h, D.P, 2), { tone: "hi" });
    }).join("");
    live("bars").innerHTML = bars;
  }

  const hot = new Set(pose.hot);
  for (const id of Array.from(hot)) if (meta[id]) hot.add(`tag-${meta[id].asm}`);
  const pills = D.LABELS.map((label) => {
    const anchor = label.follow === "x" ? [pose.shx, label.at[1], label.at[2]] : label.at;
    return Ink.pillSvg(K.iso(add(anchor, mul(D.EXPLODE[label.asm], state.explode.shares[label.asm].x)), D.P), label.dx, label.dy, D.CONCEPT[label.asm], pose.hot.some((id) => meta[id] && meta[id].asm === label.asm));
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
  if (moving) lastThreadKey = "";
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
function configFromForm() {
  return { focus: Number($("#ie-focus").value), head: $("#ie-head").value, scale: $("#ie-scale").checked, causal: $("#ie-causal").checked, temp: Number($("#ie-temp").value) };
}
function control(name) {
  IA.event("control", { name, value: configFromForm()[name] });
  load(configFromForm(), { autoplay: state.shown >= 0 });
}
$("#ie-focus").addEventListener("change", () => control("focus"));
$("#ie-head").addEventListener("change", () => control("head"));
$("#ie-scale").addEventListener("change", () => control("scale"));
$("#ie-causal").addEventListener("change", () => control("causal"));
$("#ie-temp").addEventListener("input", (event) => {
  $("#ie-tempv").textContent = Number(event.target.value).toFixed(1);
  control("temp");
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
