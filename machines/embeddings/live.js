// Inside embeddings runtime. Globals: K, Ink, M, D, IA (see AGENTS.md, "live.js").
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

const qAngleOf = (config) => {
  const [a, b] = M.project2(M.queryVector(M.configOf(config)));
  return (Math.atan2(b, a) * 180) / Math.PI;
};
const holderAngle = (id) => D.holders.find((h) => h.id === id).needle;
const ANGULAR = new Set(["qAngle", "arm"]);

const freshPose = (config) => ({ qAngle: qAngleOf(config), arm: -90, stamp: 0, qdrop: 0, slots: 0, hot: [] });

function beatsFor(sim) {
  const beats = [];
  const b = (d, to, hot, start) => beats.push({ d, to, hot, start });
  const keyword = sim.config.method === "keyword";
  sim.events.forEach((ev) => {
    const mark = beats.length;
    if (ev.type === "intake") {
      b(0.5, { qdrop: 1, qAngle: qAngleOf(sim.config) }, ["qcard", "qneedle"]);
    } else if (ev.type === "score") {
      const a = holderAngle(ev.doc);
      b(0.4, { arm: a }, [`card${ev.docIndex ?? 0}`, "arm", "dial"]);
      if (keyword) {
        b(0.22, { stamp: 1 }, ["stamp-head"]);
        b(0.22, { stamp: 0 }, ["stamp-head"]);
      } else {
        b(0.18, {}, ["arm", "dial"]);
      }
    } else if (ev.type === "rank") {
      b(0.5, { arm: holderAngle(ev.top) }, ["arm", "dial", "rack-board"]);
    } else if (ev.type === "slot") {
      b(0.4, {}, [`slot${ev.rank - 1}`, "rack-board"], (pose) => (pose.slots = ev.rank));
    }
    beats[mark].event = ev.index;
  });
  return beats;
}

const state = { config: M.decode(location.search), sim: null, beats: [], bi: 0, bt: 0, pose: null, playing: false, stopAt: -1, shown: -1, done: false, explode: { target: 0, shares: {} } };
Object.keys(D.EXPLODE).forEach((asm) => (state.explode.shares[asm] = { x: 0, v: 0 }));

// stamp the doc index onto score events for the hot-card lookup
function indexSim(sim) {
  const byId = new Map(D.holders.map((h, i) => [h.id, i]));
  for (const ev of sim.events) if (ev.type === "score") ev.docIndex = byId.get(ev.doc);
  return sim;
}

function writeUrl() {
  const params = new URLSearchParams(M.encode(state.config));
  if (document.documentElement.classList.contains("iso-nolabels")) params.set("labels", "0");
  const query = params.toString();
  history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
}

function load(config, { autoplay = false } = {}) {
  state.config = M.configOf(config);
  state.sim = indexSim(M.simulate(state.config));
  state.beats = beatsFor(state.sim);
  Object.assign(state, { pose: freshPose(state.config), bi: 0, bt: 0, shown: -1, done: false, stopAt: -1 });
  $("#ie-query").value = state.config.query;
  $("#ie-method").value = state.config.method;
  $("#ie-k").value = String(state.config.k);
  $("#ie-norm").checked = state.config.normalise;
  $("#ie-mixA").value = String(state.config.mixA);
  $("#ie-mixT").value = String(state.config.mixT);
  writeUrl();
  readouts(null);
  draw();
  autoplay ? play() : pause();
}

function begin(beat) {
  if (beat.event !== undefined) onEvent(beat.event);
  if (beat.start) beat.start(state.pose);
  beat._from = {};
  beat._delta = {};
  for (const key of Object.keys(beat.to)) {
    beat._from[key] = state.pose[key];
    const raw = beat.to[key] - state.pose[key];
    beat._delta[key] = ANGULAR.has(key) ? ((raw % 360) + 540) % 360 - 180 : raw;
  }
  beat._dur = Math.max(0.1, beat.d);
  state.pose.hot = beat.hot;
}
function apply(beat, t) {
  const e = ease(t);
  for (const key of Object.keys(beat.to)) state.pose[key] = beat._from[key] + beat._delta[key] * e;
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
    $("[data-ia-live]").textContent = `Run finished: top card ${t.topText} at ${t.angle.toFixed(1)} degrees, right card rank ${t.rightRank}.`;
    IA.ran(state.sim);
    sync();
  }
}

function fmtScore(t) {
  return t.method === "keyword" ? String(t.topScore) : Number(t.topScore).toFixed(4);
}
function onEvent(index) {
  state.shown = index;
  readouts(state.sim.events[index]);
  IA.trace(state.sim.events[index].trace);
}
function readouts(ev) {
  const t = state.sim.totals;
  const live2 = ev && ev.index >= state.sim.events.findIndex((e) => e.type === "rank");
  $('[data-ro="top"]').textContent = live2 ? t.topText : "press Run";
  $('[data-ro="score"]').textContent = live2 ? `${fmtScore(t)} (${t.method})` : "—";
  $('[data-ro="angle"]').textContent = live2 ? `${Number(t.angle).toFixed(1)}°` : "—";
  $('[data-ro="rightRank"]').textContent = live2 ? `#${t.rightRank} of 12` : "—";
}

let lastOrder = "";
let lastPills = "";
function needlePath(cx, cy, z, len, deg) {
  const a = (deg * Math.PI) / 180;
  return K.lineOnTop([cx, cy], [cx + Math.cos(a) * len, cy + Math.sin(a) * len], z, D.P);
}
function draw() {
  const pose = state.pose;
  const T = {};
  for (const item of D.items) {
    const share = state.explode.shares[item.asm];
    T[item.id] = mul(D.EXPLODE[item.asm], share ? share.x : 0);
  }
  T["stamp-head"] = add(T["stamp-head"], [0, 0, -3 * pose.stamp]);
  T.qcard = add(T.qcard, [0, 0, (1 - pose.qdrop) * 14]);

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

  for (let r = 0; r < 5; r++) live(`slot${r}`).style.display = r < pose.slots ? "" : "none";
  live("qneedle").setAttribute("d", needlePath(D.CX, D.CY, 13.4, 21, pose.qAngle));
  live("arm").setAttribute("d", needlePath(D.CX, D.CY, 12.4, 31, pose.arm));
  const tipA = (pose.arm * Math.PI) / 180;
  const tip = K.iso([D.CX + Math.cos(tipA) * 31, D.CY + Math.sin(tipA) * 31, 12.4], D.P);
  live("armtip").innerHTML = `<circle cx="${tip[0].toFixed(1)}" cy="${tip[1].toFixed(1)}" r="3" class="iso-wire-end"/>`;
  live("dialneedle").setAttribute("d", needlePath(D.dial[0], D.dial[1], D.dial[2], 4.2, pose.arm));

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
function configFromForm() {
  return {
    ...state.config,
    query: $("#ie-query").value,
    method: $("#ie-method").value,
    k: $("#ie-k").value,
    normalise: $("#ie-norm").checked,
    mixA: $("#ie-mixA").value,
    mixT: $("#ie-mixT").value,
  };
}
for (const [id, name] of [["ie-query", "query"], ["ie-method", "method"], ["ie-k", "k"], ["ie-norm", "normalise"], ["ie-mixA", "mixA"], ["ie-mixT", "mixT"]]) {
  $(`#${id}`).addEventListener("change", (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    IA.event("control", { name, value });
    load(configFromForm(), { autoplay: state.shown >= 0 });
  });
}
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
