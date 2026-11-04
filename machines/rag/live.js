// Inside a RAG pipeline runtime. Globals: K, Ink, M, D, IA (see AGENTS.md, "live.js").
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

const freshPose = () => ({ blade: 0, press: 0, armX: 2, armZ: 0, cut: 0, stamped: 0, filed: 0, pulled: 0, carry: 0, tipped: 0, printed: 0, cited: 0, needle: 0, lamp: "", pressLamp: "", hot: [] });

function beatsFor(sim) {
  const beats = [];
  const b = (d, to, hot, start) => beats.push({ d, to, hot, start });
  const travelX = (x) => beats.push({ d: 0.22, to: { armX: x }, hot: ["arm-trolley", "arm-rod", "arm-magnet"], travel: true });
  sim.events.forEach((ev, index) => {
    const mark = beats.length;
    if (ev.type === "chunk") {
      b(0.1, { blade: ev.card % 2 ? 0 : -5 }, ["cut-blade", "cut-bed"], (pose) => (pose.cut = ev.card + 1));
    } else if (ev.type === "embed") {
      b(0.3, { press: -6 }, ["press-head", "press-die"]);
      b(0.25, { press: 0 }, ["press-head"], (pose) => (pose.stamped = 1));
    } else if (ev.type === "index") {
      b(0.35, {}, ["cab-body", "cab-rim-f"], (pose) => (pose.filed = 1));
    } else if (ev.type === "retrieve") {
      travelX(D.ARM.cabinet);
      b(0.22, { armZ: D.ARM.down }, ["arm-rod", "arm-magnet"]);
      b(0.22, { armZ: D.ARM.up }, ["arm-rod", "arm-magnet", "arm-card"], (pose) => (pose.carry = 1));
      travelX(D.ARM.tray);
      b(0.22, { armZ: D.ARM.down }, ["arm-rod", "arm-magnet", "arm-card"]);
      b(0.22, { armZ: D.ARM.up }, ["arm-rod", "tray-base"], (pose) => {
        pose.pulled = ev.rank;
        pose.carry = 0;
      });
    } else if (ev.type === "pack") {
      b(0.4, {}, ["tray-base", "gauge-face"], (pose) => {
        pose.needle = Math.min(1, ev.tokens / ev.budget);
        pose.tipped = ev.dropped > 0 ? 1 : 0;
      });
    } else if (ev.type === "answer") {
      b(0.5, {}, ["print-paper", "print-body"], (pose) => {
        pose.printed = 1;
        pose.cited = ev.status === "grounded" ? 1 : 0;
        pose.lamp = ev.status === "unsupported" ? "bad" : "ok";
      });
    } else if (ev.type === "done") {
      b(0.3, { blade: 0 }, ["print-body"]);
    }
    beats[mark].event = index;
  });
  return beats;
}

const state = { config: M.decode(location.search), sim: null, beats: [], bi: 0, bt: 0, pose: null, playing: false, stopAt: -1, shown: -1, done: false, explode: { target: 0, shares: {} } };
Object.keys(D.EXPLODE).forEach((asm) => (state.explode.shares[asm] = { x: 0, v: 0 }));

function writeUrl() {
  const params = new URLSearchParams(M.encode(state.config));
  if (document.documentElement.classList.contains("iso-nolabels")) params.set("labels", "0");
  const query = params.toString();
  history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
}

function configFromForm() {
  return {
    question: $("#ie-q").value,
    chunkSize: Number($("#ie-cs").value),
    overlap: Number($("#ie-ov").value),
    k: Number($("#ie-k").value),
    budget: Number($("#ie-b").value),
    guardrail: $("#ie-g").checked,
  };
}

function syncForm() {
  $("#ie-q").value = state.config.question;
  for (const [id, key] of [["ie-cs", "chunkSize"], ["ie-ov", "overlap"], ["ie-k", "k"], ["ie-b", "budget"]]) {
    $(`#${id}`).value = state.config[key];
    $(`[data-v="${id}"]`).textContent = String(state.config[key]);
  }
  $("#ie-g").checked = state.config.guardrail;
}

function load(config, { autoplay = false } = {}) {
  state.config = M.configOf(config);
  state.sim = M.simulate(state.config);
  state.beats = beatsFor(state.sim);
  Object.assign(state, { pose: freshPose(), bi: 0, bt: 0, shown: -1, done: false, stopAt: -1 });
  syncForm();
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
  beat._dur = beat.travel ? 0.22 : beat.d;
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
    $("[data-ia-live]").textContent =
      t.status === "grounded"
        ? `Run finished: grounded answer, “${t.answer}” cited: ${t.citation}.`
        : t.status === "not-found"
          ? "Run finished: no card held the answer, so the printer says “I don't know”."
          : "Run finished: guardrail off, the printer guessed with no citation.";
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
  $('[data-ro="chunks"]').textContent = ev ? (ev.type === "chunk" ? `${ev.card + 1} / ${t.chunks}` : String(t.chunks)) : `0 / ${t.chunks}`;
  const scored = ev && ["retrieve", "pack", "answer", "done"].includes(ev.type);
  $('[data-ro="score"]').textContent = scored ? t.topScore.toFixed(3) : "—";
  const packed = ev && ["pack", "answer", "done"].includes(ev.type);
  $('[data-ro="tokens"]').textContent = packed ? `${t.tokensPacked} / ${t.budget}` : "—";
  const answered = ev && ["answer", "done"].includes(ev.type);
  $('[data-ro="status"]').textContent = answered ? (t.status === "grounded" ? "grounded" : t.status === "not-found" ? "I don't know" : "unsupported") : "—";
  $('[data-ro="cite"]').textContent = answered ? t.citation : "—";
}

let lastOrder = "";
let lastPills = "";
function draw() {
  const pose = state.pose;
  const T = {};
  for (const item of D.items) {
    const share = item.id.startsWith("tag-") ? null : state.explode.shares[item.asm];
    T[item.id] = mul(D.EXPLODE[item.asm], share ? share.x : 0);
  }
  T["cut-blade"] = add(T["cut-blade"], [0, 0, pose.blade]);
  T["cut-lever"] = add(T["cut-lever"], [0, pose.blade * 0.4, pose.blade * 0.3]);
  T["cut-knob"] = add(T["cut-knob"], [0, pose.blade * 0.4, pose.blade * 0.3]);
  T["press-head"] = add(T["press-head"], [0, 0, pose.press]);
  for (const id of ["arm-trolley", "arm-rod", "arm-magnet", "arm-card"]) T[id] = add(T[id], [pose.armX - 2, 0, id === "arm-trolley" ? 0 : pose.armZ]);

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

  for (let i = 0; i < 3; i++) live(`cutcard${i}`).style.display = pose.cut > i ? "" : "none";
  live("pcard").style.display = pose.stamped && !pose.filed ? "" : "none";
  for (let i = 0; i < 6; i++) live(`cabcard${i}`).style.display = pose.filed ? "" : "none";
  live("armcard").style.display = pose.carry ? "" : "none";
  for (let i = 0; i < 4; i++) live(`traycard${i}`).style.display = pose.pulled > i ? "" : "none";
  live("tipped").style.display = pose.tipped ? "" : "none";
  live("paper").style.display = pose.printed ? "" : "none";
  live("plines").style.display = pose.printed ? "" : "none";
  live("ctab").style.display = pose.cited ? "" : "none";
  const [cx, cy, cz] = D.DIAL;
  const a = -0.75 * Math.PI + pose.needle * 1.5 * Math.PI;
  live("needle").setAttribute("d", K.lineOnTop([cx, cy], [cx + Math.sin(a) * 4.5, cy - Math.cos(a) * 4.5], cz, D.P));

  const setLamp = (id, value) => {
    const node = nodes[id];
    value ? node.setAttribute("data-state", value) : node.removeAttribute("data-state");
  };
  setLamp("press-lamp", pose.stamped ? "ok" : "");
  setLamp("print-lamp", pose.lamp);

  const hot = new Set(pose.hot);
  for (const id of Array.from(hot)) if (meta[id]) hot.add(`tag-${meta[id].asm}`);
  const pills = D.LABELS.map((label) => Ink.pillSvg(K.iso(add(label.at, mul(D.EXPLODE[label.asm], state.explode.shares[label.asm].x)), D.P), label.dx, label.dy, D.CONCEPT[label.asm], pose.hot.some((id) => meta[id] && meta[id].asm === label.asm))).join("");
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
function control(name, fn) {
  return (event) => {
    IA.event("control", { name, value: event.target.type === "checkbox" ? event.target.checked : event.target.value });
    const next = M.configOf({ ...state.config, ...fn(event) });
    const span = root.querySelector(`[data-v="${event.target.id}"]`);
    if (span) span.textContent = String(event.target.value);
    load(next, { autoplay: state.shown >= 0 });
  };
}
$("#ie-q").addEventListener("change", control("question", (e) => ({ question: e.target.value })));
$("#ie-cs").addEventListener("change", control("chunkSize", (e) => ({ chunkSize: Number(e.target.value) })));
$("#ie-ov").addEventListener("change", control("overlap", (e) => ({ overlap: Number(e.target.value) })));
$("#ie-k").addEventListener("change", control("k", (e) => ({ k: Number(e.target.value) })));
$("#ie-b").addEventListener("change", control("budget", (e) => ({ budget: Number(e.target.value) })));
$("#ie-g").addEventListener("change", control("guardrail", (e) => ({ guardrail: e.target.checked })));
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
