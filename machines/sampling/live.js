// Inside next-token sampling: runtime. Globals: K, Ink, M, D, IA.
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

const barX = (i) => D.TOWER.x0 + 1 + i * D.TOWER.pitch;
const barH = (logit, lo, hi) => 3 + ((logit - lo) / Math.max(1e-9, hi - lo)) * 15;

function stepSnaps(sim) {
  const heats = sim.events.filter((e) => e.type === "heat");
  const gates = sim.events.filter((e) => e.type === "gate");
  const draws = sim.events.filter((e) => e.type === "draw");
  return heats.map((h, s) => {
    const g = gates[s];
    const d = draws[s];
    const logits = h.bars.map((b) => b.logit);
    const lo = Math.min(...logits), hi = Math.max(...logits);
    const barV = h.bars.map((b) => barH(b.logit, lo, hi));
    const edges = [D.TROUGH.x0];
    for (const slot of g.slots) edges.push(edges[edges.length - 1] + Math.max(0, slot.prob) * D.TROUGH.w);
    edges[edges.length - 1] = D.TROUGH.x0 + D.TROUGH.w;
    const mask = g.slots.map((slot) => (slot.prob <= 0 ? 1 : 0));
    const tx = (edges[d.chosen] + edges[d.chosen + 1]) / 2;
    const W0 = [D.THROAT.x, D.THROAT.y, D.THROAT.z];
    const path = [W0, [4, -16, 18], [lerp(4, tx, 0.5), -6, 13], [lerp(4, tx, 0.85), 2, 8.5], [tx, 9, 3.2]];
    return { heat: h, gate: g, draw: d, barV, barN: h.bars.length, edges, divN: g.slots.length, mask, path, tx };
  });
}

function samplePath(path, t) {
  const segs = path.length - 1;
  const te = Math.pow(t, 1.4);
  const pos = Math.min(segs - 1e-6, te * segs);
  const i = Math.floor(pos);
  const f = pos - i;
  const a = path[i], b = path[i + 1];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

const freshPose = () => ({
  barV: Array(12).fill(3), barN: 12,
  divX: Array(13).fill(D.TROUGH.x0), divN: 12,
  shutT: 0, shutMask: Array(12).fill(0),
  ball: [D.THROAT.x, D.THROAT.y, D.THROAT.z], ballShow: 0,
  stripes: 0, crank: 0, plunger: 0, hot: [],
});

function beatsFor(sim, snaps) {
  const beats = [];
  const b = (d, patch, hot, event) => beats.push({ d, ...patch, hot, event });
  const first = snaps[0];
  b(0.4, { arr: { barV: [null, first.barV], divX: [null, first.edges] }, num: {}, ball: null, ballShow: 0,
    snap: { barN: first.barN, divN: first.divN, shutMask: first.mask, shutT: 0 } }, ["tower-base", "tower-lamp", "trough-floor"], 0);
  snaps.forEach((snap, s) => {
    const base = s * 4 + 1;
    b(0.55, { arr: { barV: [null, snap.barV], divX: [null, snap.edges] }, num: {}, ball: null, ballShow: 0,
      snap: { barN: snap.barN, divN: snap.divN, shutMask: snap.mask, shutT: 0 } }, ["tower-comb", "knob-dial", "knob-lamp"], base);
    b(0.5, { arr: {}, num: { shutT: [0, 1] }, ball: null, ballShow: 0, snap: null }, ["rail-beam", "rail-lamp", "shutters"], base + 1);
    b(0.9, { arr: {}, num: { plunger: [1, 0] }, ball: { path: snap.path }, ballShow: 1, snap: null }, ["ball", "throat", "funnel-lamp"], base + 2);
    b(0.45, { arr: {}, num: {}, ball: { hold: snap.path[snap.path.length - 1] }, ballShow: 1, snap: null }, ["tape-body", "tape-lamp", "flap"], base + 3);
  });
  return beats;
}

const state = { config: M.decode(location.search), sim: null, snaps: [], beats: [], bi: 0, bt: 0, pose: null,
  playing: false, stopAt: -1, shown: -1, done: false, ro: {}, boardKey: "", flapKey: "",
  explode: { target: 0, shares: {} } };
Object.keys(D.EXPLODE).forEach((asm) => (state.explode.shares[asm] = { x: 0, v: 0 }));

function writeUrl() {
  const params = new URLSearchParams(M.encode(state.config));
  if (document.documentElement.classList.contains("iso-nolabels")) params.set("labels", "0");
  const query = params.toString();
  history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
}

function setNeedle(temp) {
  const a = (-120 + temp * 120) * (Math.PI / 180);
  const { cx, cy, z, r } = D.KNOB;
  live("needle").setAttribute("d", K.lineOnTop([cx, cy], [cx + Math.sin(a) * r, cy - Math.cos(a) * r], z, D.P));
}

function setCrank(angle) {
  const ax = 64, ay = -20, az = 17.4;
  live("crank").setAttribute("d", K.segment([ax, ay, az], [ax + Math.cos(angle) * 3, ay + Math.sin(angle) * 3, az], D.P));
}

function load(config, { autoplay = false } = {}) {
  state.config = M.configOf(config);
  state.sim = M.simulate(state.config);
  state.snaps = stepSnaps(state.sim);
  state.beats = beatsFor(state.sim, state.snaps);
  const first = state.snaps[0];
  Object.assign(state, { pose: freshPose(), bi: 0, bt: 0, shown: -1, done: false, stopAt: -1,
    ro: {}, boardKey: "", flapKey: "" });
  state.pose.barV = first.barV.slice();
  state.pose.barN = first.barN;
  state.pose.divX = first.edges.slice();
  state.pose.divN = first.divN;
  state.pose.shutMask = first.mask.slice();
  $("#ie-prompt").value = state.config.prompt;
  $("#ie-temp").value = state.config.temperature;
  root.querySelector("[data-ie-tempval]").textContent = Number(state.config.temperature).toFixed(1);
  $("#ie-topk").value = String(state.config.topK);
  $("#ie-topp").value = state.config.topP;
  root.querySelector("[data-ie-toppval]").textContent = Number(state.config.topP).toFixed(2);
  $("#ie-seed").value = state.config.seed;
  setNeedle(state.config.temperature);
  setCrank(0);
  writeUrl();
  readouts(null);
  draw();
  autoplay ? play() : pause();
}

function begin(beat) {
  if (beat.event !== undefined && beat.event !== null && beat.event >= 0) onEvent(beat.event);
  if (beat.start) beat.start(state.pose);
  beat._arr = {};
  for (const [key, [, to]] of Object.entries(beat.arr || {})) beat._arr[key] = { from: state.pose[key].slice(), to };
  beat._num = {};
  for (const [key, [from, to]] of Object.entries(beat.num || {})) {
    beat._num[key] = { from: from === null ? state.pose[key] : from, to };
  }
  if (beat.snap) {
    if (beat.snap.barN !== undefined) state.pose.barN = beat.snap.barN;
    if (beat.snap.divN !== undefined) state.pose.divN = beat.snap.divN;
    if (beat.snap.shutMask) state.pose.shutMask = beat.snap.shutMask.slice();
    if (beat.snap.shutT !== undefined) state.pose.shutT = beat.snap.shutT;
  }
  if (beat.ballShow !== undefined) state.pose.ballShow = beat.ball && !beat.ball.hold ? 1 : beat.ballShow;
  beat._dur = beat.d;
  state.pose.hot = beat.hot;
}

function apply(beat, t) {
  const e = ease(t);
  for (const [key, { from, to }] of Object.entries(beat._arr)) {
    state.pose[key] = from.map((v, i) => lerp(v, to[i] === undefined ? v : to[i], e));
  }
  for (const [key, { from, to }] of Object.entries(beat._num)) state.pose[key] = lerp(from, to, e);
  if (beat.ball && beat.ball.path) state.pose.ball = samplePath(beat.ball.path, Math.min(1, t * 1.02));
  else if (beat.ball && beat.ball.hold) state.pose.ball = beat.ball.hold;
}

function advance(dt) {
  let left = dt;
  while (left > 0 && state.bi < state.beats.length) {
    const beat = state.beats[state.bi];
    if (state.bt === 0) {
      if (state.stopAt >= 0 && (beat.event ?? 99) > state.stopAt) {
        state.playing = false;
        state.stopAt = -1;
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
    $("[data-ia-live]").textContent = `Run finished: ${t.text}`;
    IA.ran(state.sim);
  }
}

function onEvent(index) {
  state.shown = index;
  const ev = state.sim.events[index];
  readouts(ev);
  if (ev.type === "stamp") {
    state.pose.crank += Math.PI / 4;
    state.pose.stripes = (state.pose.stripes + 1.5) % 5;
    setCrank(state.pose.crank);
  }
  IA.trace(ev.trace);
}

function readouts(ev) {
  if (ev) {
    if (ev.type === "heat") state.ro.entropy = `${ev.entropy.toFixed(2)} bits`;
    if (ev.type === "gate") state.ro.inplay = `${ev.keptCount} / ${ev.ofCount}`;
    if (ev.type === "draw") {
      state.ro.token = ev.token.trim();
      state.ro.prob = `${ev.probPct}% (base ${(ev.baseProb * 100).toFixed(1)}%)`;
    }
    if (ev.type === "stamp") state.ro.text = ev.text;
  }
  $('[data-ro="token"]').textContent = state.ro.token ?? "—";
  $('[data-ro="prob"]').textContent = state.ro.prob ?? "—";
  $('[data-ro="inplay"]').textContent = state.ro.inplay ?? "—";
  $('[data-ro="entropy"]').textContent = state.ro.entropy ?? "—";
  $('[data-ro="text"]').textContent = state.ro.text ?? "—";
}

function shutterSvg(pose, ex) {
  const edges = pose.divX;
  const n = pose.divN;
  let out = "";
  for (let i = 0; i < n; i++) {
    const xa = edges[i] + ex[0], xb = edges[i + 1] + ex[0];
    if (xb - xa < 0.4) continue;
    const slide = (pose.shutMask[i] || 0) * pose.shutT;
    const z = D.SHUT.open - slide * (D.SHUT.open - 3.2) + ex[2];
    const y0 = D.SHUT.y + ex[1], y1 = D.SHUT.y + D.SHUT.d + ex[1];
    out += ink2slab(xa + 0.3, y0, z, xb - 0.3, y1, z + D.SHUT.h);
    if (xb - xa > 1.6) out += `<path class="iso-line shut-hatch" data-tone="mid" d="${K.lineOnTop([xa + 0.5 + ex[0] * 0, y0], [xb - 0.5, y1], z + D.SHUT.h, D.P)}"/>`;
  }
  return out;
}
function ink2slab(x0, y0, z0, x1, y1, z1) {
  return Ink.inkSolid(K.slabOf({ x: x0, y: y0, w: Math.max(0.2, x1 - x0), d: y1 - y0, r: 0 }, z0, z1 - z0, D.P, 1), { tone: "mid" });
}

let lastOrder = "";
let lastPills = "";
function draw() {
  const pose = state.pose;
  const T = {};
  for (const item of D.items) {
    const share = state.explode.shares[item.asm];
    T[item.id] = mul(D.EXPLODE[item.asm] || [0, 0, 0], share ? share.x : 0);
  }
  for (let i = 0; i < 12; i++) {
    const on = i < pose.barN;
    live(`bar${i}`).style.display = on ? "" : "none";
    if (on) T[`bar${i}`] = add(T[`bar${i}`], [0, 0, pose.barV[i] - 20]);
  }
  for (let i = 0; i < 13; i++) {
    const on = i <= pose.divN;
    live(`div${i}`).style.display = on ? "" : "none";
    if (on) T[`div${i}`] = add(T[`div${i}`], [pose.divX[i], 0, 0]);
  }
  live("ball").style.display = pose.ballShow ? "" : "none";
  T.ball = add(T.ball, pose.ball);
  live("stripes").setAttribute("transform", K.translateAlong(D.P, [0, pose.stripes, 0]));
  live("plunger").setAttribute("transform", K.translateAlong(D.P, T["gate-plate"]));

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

  const railEx = T["rail-beam"] || [0, 0, 0];
  const shutters = shutterSvg(pose, railEx);
  if (live("shutters")._s !== shutters) {
    live("shutters").innerHTML = shutters;
    live("shutters")._s = shutters;
  }

  drawTexts(railEx, T);

  const hot = new Set(pose.hot);
  for (const id of Array.from(hot)) if (meta[id]) hot.add(meta[id].asm);
  const pills = D.LABELS.map((label) => Ink.pillSvg(K.iso(add(label.at, mul(D.EXPLODE[label.asm] || [0, 0, 0], state.explode.shares[label.asm].x)), D.P), label.dx, label.dy, D.CONCEPT[label.asm], pose.hot.some((id) => meta[id] && meta[id].asm === label.asm))).join("");
  if (pills !== lastPills) svg.querySelector("[data-pills]").innerHTML = lastPills = pills;
  for (const item of D.items) {
    const node = nodes[item.id];
    hot.has(item.id) || hot.has(item.asm) ? node.setAttribute("data-hot", "") : node.removeAttribute("data-hot");
  }
  const lamps = { logits: "lamp-logits", heat: "lamp-heat", gate: "lamp-gate", draw: "lamp-draw", tape: "lamp-tape" };
  for (const [asm, name] of Object.entries(lamps)) {
    live(name).style.display = hot.has(asm) ? "" : "none";
  }
}

function currentStep() {
  const ev = state.shown >= 0 ? state.sim.events[state.shown] : null;
  if (ev && ev.step !== undefined) return Math.min(ev.step, state.snaps.length - 1);
  return 0;
}

function drawTexts(railEx, T) {
  const pose = state.pose;
  const g = state.snaps.length ? state.snaps[currentStep()].gate : null;
  // bin labels: widest bins first, keep 30px clear
  let html = "";
  if (g) {
    const order = g.slots.map((s, i) => i).sort((a, b2) => g.slots[b2].prob - g.slots[a].prob);
    const placed = [];
    for (const i of order) {
      const w = pose.divX[i + 1] - pose.divX[i];
      if (w < 8 || g.slots[i].prob <= 0) continue;
      const cx = (pose.divX[i] + pose.divX[i + 1]) / 2 + railEx[0];
      const [sx, sy] = K.iso([cx, 12 + railEx[1], 2.4 + railEx[2]], D.P);
      if (placed.some((p) => Math.abs(p - sx) < 34)) continue;
      placed.push(sx);
      const name = g.slots[i].token.trim().slice(0, 10);
      const pct = (g.slots[i].prob * 100).toFixed(1);
      html += `<text class="bin-label" x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" text-anchor="middle">${name}</text>`;
      html += `<text class="bin-label" x="${sx.toFixed(1)}" y="${(sy + 11).toFixed(1)}" text-anchor="middle">${pct}%</text>`;
    }
  }
  if (live("binlabels")._h !== html) {
    live("binlabels").innerHTML = html;
    live("binlabels")._h = html;
  }
  // scoreboard top-3
  const h = state.shown >= 0 ? state.sim.events[state.shown] : null;
  const heat = state.sim.events.filter((e) => e.type === "heat")[currentStep()];
  const bkey = heat ? heat.top.map((t) => t.token + t.prob).join("|") : "";
  if (bkey !== state.boardKey) {
    state.boardKey = bkey;
    const sh = state.explode.shares.board.x;
    const off = mul(D.EXPLODE.board, sh);
    let bh = "";
    heat.top.forEach((t, i) => {
      const [sx, sy] = K.iso([-38 + off[0], -37.4 + off[1], 11 - i * 3 + off[2]], D.P);
      bh += `<text class="board-text" x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" text-anchor="middle">${i + 1} ${t.token.trim().slice(0, 9)} ${(t.prob * 100).toFixed(1)}%</text>`;
    });
    live("board").innerHTML = bh;
  }
  // flap: last stamped token
  const stamps = state.sim.events.filter((e) => e.type === "stamp");
  const shown = stamps.filter((e) => e.index <= state.shown).at(-1);
  const fkey = shown ? shown.token : "—";
  if (fkey !== state.flapKey) {
    state.flapKey = fkey;
    const sh = state.explode.shares.tape.x;
    const off = mul(D.EXPLODE.tape, sh);
    const [sx, sy] = K.iso([38 + off[0], -37.5 + off[1], 6 + off[2]], D.P);
    live("flap").innerHTML = `<text class="flap-char" x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" text-anchor="middle">${fkey.trim().slice(0, 10) || "…"}</text>`;
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
  wake();
}
function pause() {
  state.playing = false;
  wake();
}
function runWith(count) {
  IA.event("run", { count });
  load({ ...state.config, count }, { autoplay: true });
}
function step() {
  if (state.done) load(state.config);
  state.explode.target = 0;
  state.stopAt = state.shown + 1;
  state.playing = true;
  wake();
}
function toggleExplode() {
  state.explode.target = state.explode.target ? 0 : 1;
  if (state.explode.target) state.playing = false;
  wake();
}

$("[data-ie-gen1]").addEventListener("click", () => runWith(1));
$("[data-ie-gen8]").addEventListener("click", () => runWith(8));
$("[data-ie-step]").addEventListener("click", () => (IA.event("step"), step()));
$("[data-ie-explode]").addEventListener("click", () => (IA.event("explode"), toggleExplode()));
$("[data-ie-reset]").addEventListener("click", () => {
  state.explode.target = 0;
  load(M.DEFAULTS);
  wake();
});
const changed = (name) => (event) => {
  IA.event("control", { name, value: event.target.value });
  load({ ...state.config, [name]: name === "prompt" ? event.target.value : Number(event.target.value) }, { autoplay: state.shown >= 0 });
};
$("#ie-prompt").addEventListener("change", changed("prompt"));
$("#ie-temp").addEventListener("change", changed("temperature"));
$("#ie-topk").addEventListener("change", changed("topK"));
$("#ie-topp").addEventListener("change", changed("topP"));
$("#ie-seed").addEventListener("change", changed("seed"));
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
