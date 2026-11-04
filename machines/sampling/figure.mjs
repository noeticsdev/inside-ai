// Inside next-token sampling: a Pachinko sampler on a bench.
// Balls fall from a hopper past a peg glass into bins as wide as each
// token's odds. Shutter plates park above the bins and slide down to close
// whatever top-k / top-p removed. A temperature knob, a logit bar tower, a
// top-3 scoreboard and a split-flap stamp board complete the machine.
import * as k from "../../kit/iso-kit.mjs";
import * as ink from "../../kit/ink.mjs";
import * as L from "../../kit/lathe.mjs";

export function figure() {
  const W = 760;
  const H = 470;
  const AZIMUTH = 60;
  const PLATE = { x: -84, y: -42, w: 168, d: 80, r: 4 };

  const TOWER = { x0: -80, bars: 12, pitch: 16 / 12, barW: 0.95, y: -33.5, d: 9, h: 22, base: 2 };
  const TROUGH = { x0: -40, w: 88, y0: 0, y1: 18 };
  const SHUT = { y: 7.2, d: 1.6, open: 12.5, h: 3 };
  const KNOB = { cx: -64, cy: 14, z: 6.4, r: 4.4 };
  const THROAT = { x: 4, y: -22, z: 23 };

  const EXPLODE = {
    base: [0, 0, 0], tower: [-13, -6, 9], funnel: [0, -4, 24], pegs: [0, -11, 13],
    bins: [0, 9, 3], rail: [0, 4, 15], knob: [-9, 9, 4], tape: [13, 5, 9],
    board: [-4, -9, 11], ball: [0, 0, 18],
    logits: [-13, -6, 9], heat: [-9, 9, 4], gate: [0, 4, 15], draw: [0, -4, 24],
  };
  const CONCEPT = { logits: "LOGITS", heat: "TEMPERATURE", gate: "FILTERS", draw: "DRAW", tape: "TAPE" };
  const LABELS = [
    { asm: "logits", at: [-71, -30, 27], dx: -46, dy: -58 },
    { asm: "heat", at: [-64, 14, 7], dx: -64, dy: 26 },
    { asm: "gate", at: [-30, 8, 15], dx: -72, dy: -34 },
    { asm: "draw", at: [4, -22, 36], dx: 66, dy: -52 },
    { asm: "tape", at: [64, -26, 17], dx: 62, dy: -30 },
  ];

  const P = k.fitProjection(
    [...k.boxCorners(PLATE, -8, 0), [-71, -30, 40], [4, -26, 62], [64, -26, 28], [-64, 14, 14], [48, 18, 12], [-40, -38, 16], [77, 20, 8]],
    W, H, { pad: 26, azimuth: AZIMUTH },
  );
  const depth = (p) => k.depthOf(p, P);
  const S = (paths, style) => ink.inkSolid(paths, { tone: "mid", ...style });
  const box = (x0, y0, z0, x1, y1, z1, style = {}, r = 0.6) => S(k.slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r }, z0, z1 - z0, P, r ? 3 : 1), style);
  const items = [];
  function put(id, asm, ref, svg, bias = 0) {
    items.push({ id, asm, key: depth(ref) + bias, svg });
  }
  const corners3 = ([x0, y0, z0, x1, y1, z1]) => [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];

  // ---- base ----
  const benchSolids = [[-80, -38, -8, 80, 34, 0], [-80, -36, 0, -62, -24, 26], [-8, -28, 0, 16, -18, 36], [53, -33, 0, 75, -7, 16]];
  put("shadows", "base", [0, 0, -90], benchSolids.map((b) => ink.castShadowSvg(corners3(b), P)).join(""), -900);
  put("base", "base", [0, 0, -100], S(k.slabOf(PLATE, -5, 5, P, 6, 1), { material: "board" }) + ink.silhouetteSvg(k.boxCorners(PLATE, -5, 0), P), -1000);
  const feet = [[-80, -38], [76, -38], [-80, 30], [76, 30]].map(([fx, fy]) => box(fx, fy, -8, fx + 4, fy + 4, -5, { tone: "lo" }, 0.4)).join("");
  put("feet", "base", [0, 0, -60], feet, -600);
  const screws = [[-78, -36], [74, -36], [-78, 28], [74, 28]]
    .map(([sx, sy]) => S(k.cylinder(sx, sy, 0.55, 0, 0.5, P, 16), { tone: "hi" }) + k.lineSvg(k.ring(sx, sy, 0.55, 0.5, P, 16), { tone: "lo" })).join("");
  put("screws", "base", [0, 0, -40], screws, -400);
  const plateWords = k.faceTextSvg(k.topMatrix([-16, 30.5], 0.65, P, "x"), "NEXT-TOKEN SAMPLER", { size: 2.6, tone: "lo" });
  const plateRules = [1.6, 2.6, 3.6].map((dz) => k.lineOnTop([-14, 30.5 + dz], [14, 30.5 + dz], 0.6, P)).join("");
  put("plate", "base", [0, 32, 0], box(-18, 29.5, 0, 18, 35.5, 0.6, { tone: "hi" }, 0.3) + plateWords + k.lineSvg(plateRules, { tone: "faint" }), -300);
  let rulerTicks = "";
  for (let rx = 26; rx <= 78; rx += 2) rulerTicks += k.lineOnTop([rx, 33.5], [rx, 33.5 + (rx % 10 === 0 ? 2.4 : 1.2)], 0.1, P);
  put("ruler", "base", [52, 34, 0], box(24, 32.5, 0, 80, 36, 0.25, { tone: "lo" }, 0.2) + k.lineSvg(rulerTicks, { tone: "mid" }), -300);

  // ---- logits tower ----
  put("tower-back", "tower", [-71, -35, 12], box(-80, -36, 0, -62, -34.4, 24, { tone: "mid" }, 0.4), -20);
  put("tower-base", "tower", [-71, -30, 1], box(-80, -36, 0, -62, -24, 2, {}, 0.4) + ink.silhouetteSvg(corners3([-80, -36, 0, -62, -24, 2]), P), -19);
  put("tower-posts", "tower", [-71, -30, 13], box(-80, -25.6, 0, -78.4, -24, 26, { tone: "lo" }, 0.3) + box(-63.6, -25.6, 0, -62, -24, 26, { tone: "lo" }, 0.3), -18);
  put("tower-comb", "tower", [-71, -29, 21], box(-80, -34, 20, -62, -25, 21.4, { tone: "lo" }, 0.2), 2);
  let grooves = "";
  for (let i = 0; i < 12; i++) {
    const bx = TOWER.x0 + 1 + i * TOWER.pitch;
    grooves += k.lineOnTop([bx, -33], [bx, -25], 2, P);
  }
  put("tower-slots", "tower", [-71, -29, 2], k.lineSvg(grooves, { tone: "faint" }), -17);
  for (let i = 0; i < 12; i++) {
    const bx = TOWER.x0 + 1 + i * TOWER.pitch;
    put(`bar${i}`, "tower", [bx, -29, 12], `<g data-live="bar${i}">${box(bx, TOWER.y, 0, bx + TOWER.barW, TOWER.y + TOWER.d, TOWER.h, i === 0 ? { tone: "hi" } : {}, 0.25)}</g>`, 1 + 0.05 * i);
  }
  put("tower-lamp", "logits", [-79.2, -24.8, 26.5],
    S(k.cylinder(-79.2, -24.8, 0.9, 26, 1.2, P, 16), { tone: "lo" }) + `<g data-live="lamp-logits">${k.lineSvg(k.ring(-79.2, -24.8, 0.55, 27.2, P, 16), { tone: "hi" })}</g>`, 8);

  // ---- funnel (draw feed) ----
  const FX = 4, FY = -22;
  put("hopper", "funnel", [FX, FY, 32],
    box(FX - 9, FY - 6, 34, FX + 9, FY + 6, 35.5, {}, 0.5) +
    box(FX - 7, FY - 4.6, 31, FX + 7, FY + 4.6, 32.5, { tone: "mid" }, 0.5) +
    box(FX - 5, FY - 3.2, 28, FX + 5, FY + 3.2, 29.5, { tone: "mid" }, 0.4) +
    ink.silhouetteSvg(corners3([FX - 9, FY - 6, 34, FX + 9, FY + 6, 35.5]), P), 10);
  const throat =
    box(FX - 2.4, FY - 2.4, 24, FX + 2.4, FY - 2, 28, { tone: "lo" }, 0.2) +
    box(FX - 2.4, FY + 2, 24, FX + 2.4, FY + 2.4, 28, { tone: "lo" }, 0.2) +
    box(FX - 2.4, FY - 2, 24, FX - 2, FY + 2, 28, { tone: "lo" }, 0.2) +
    box(FX + 2, FY - 2, 24, FX + 2.4, FY + 2, 28, { tone: "lo" }, 0.2);
  put("throat", "funnel", [FX, FY, 26], throat, 9);
  put("gate-plate", "funnel", [FX, FY, 24], `<g data-live="plunger">${box(FX - 2.2, FY - 1.8, 23.2, FX + 2.2, FY + 1.8, 24, { tone: "hi" }, 0.2)}</g>`, 9.5);
  put("funnel-posts", "funnel", [FX, -23, 15],
    box(-8.5, -24, 0, -6.9, -22.4, 31, { tone: "lo" }, 0.3) + box(-8.5, -24, 0, -5.5, -21, 0.8, {}, 0.2) +
    box(13, -24, 0, 14.6, -22.4, 31, { tone: "lo" }, 0.3) + box(11.6, -24, 0, 14.6, -21, 0.8, {}, 0.2) +
    box(-8.5, -24, 29, 14.6, -22.8, 30.4, {}, 0.3), -5);
  put("funnel-lamp", "draw", [13.8, -23.2, 31.5],
    S(k.cylinder(13.8, -23.2, 0.9, 30.4, 1.2, P, 16), { tone: "lo" }) + `<g data-live="lamp-draw">${k.lineSvg(k.ring(13.8, -23.2, 0.55, 31.6, P, 16), { tone: "hi" })}</g>`, 12);

  // ---- peg glass ----
  put("peg-glass", "pegs", [4, -26, 14], ink.glassSvg(-30, -26.5, 2, 38, -25.5, 26, P), -30);
  put("peg-frame", "pegs", [4, -26, 14],
    box(-31.6, -27, 0, -30, -25, 27.5, { tone: "lo" }, 0.3) + box(38, -27, 0, 39.6, -25, 27.5, { tone: "lo" }, 0.3) +
    box(-31.6, -27, 26, 39.6, -25.5, 27.5, {}, 0.3) + box(-31.6, -27, 0, 39.6, -25.5, 1.2, { tone: "lo" }, 0.2), -31);
  const pegRows = [[21, [-24, -12, 0, 12, 24]], [16, [-18, -6, 6, 18]], [11, [-24, -12, 0, 12, 24]]];
  let pegCount = 0;
  for (const [pz, xs] of pegRows) {
    for (const px of xs) {
      put(`peg${pegCount}`, "pegs", [px, -25, pz], k.solidSvg(L.sphereOf([px, -24.9, pz], 0.8, P), { tone: "hi" }), -29 + pegCount * 0.01);
      pegCount += 1;
    }
  }

  // ---- bins ----
  put("trough-floor", "bins", [4, 9, 0.5], box(TROUGH.x0, 0, 0, TROUGH.x0 + TROUGH.w, 18, 1, { tone: "mid" }, 0.3), -10);
  put("trough-back", "bins", [4, 0.6, 5], box(TROUGH.x0, 0, 1, TROUGH.x0 + TROUGH.w, 1.2, 9, {}, 0.3) + ink.silhouetteSvg(corners3([TROUGH.x0, 0, 0, TROUGH.x0 + TROUGH.w, 18, 1]), P), -9);
  put("trough-caps", "bins", [4, 9, 4.5],
    box(TROUGH.x0 - 1.2, 0, 0, TROUGH.x0, 18, 9, { tone: "lo" }, 0.3) +
    box(TROUGH.x0 + TROUGH.w, 0, 0, TROUGH.x0 + TROUGH.w + 1.2, 18, 9, { tone: "lo" }, 0.3), -8);
  put("trough-glass", "bins", [4, 17.4, 2.5], ink.glassSvg(TROUGH.x0, 16.8, 1, TROUGH.x0 + TROUGH.w, 18, 4.5, P), 14);
  for (let i = 0; i < 13; i++) {
    put(`div${i}`, "bins", [0, 9, 4], `<g data-live="div${i}">${box(0, 1.2, 1, 0.6, 16.8, 8, i === 0 || i === 12 ? { tone: "lo" } : { tone: "hi" }, 0.15)}</g>`, 1 + 0.03 * i);
  }

  // ---- shutter rail + shutters (rebuilt live) ----
  put("rail-beam", "rail", [4, 8.5, 13.5],
    box(-42, 7.4, SHUT.open, 50, 9.6, 14.5, {}, 0.3) +
    box(-42, 7.4, SHUT.open, -40.6, 9.6, 0, { tone: "lo" }, 0.2) +
    box(48.6, 7.4, SHUT.open, 50, 9.6, 0, { tone: "lo" }, 0.2) +
    ink.silhouetteSvg(corners3([-42, 7.4, SHUT.open, 50, 9.6, 14.5]), P), 16);
  put("rail-lamp", "gate", [-41, 8.5, 15],
    S(k.cylinder(-41, 8.5, 0.9, 14.5, 1.2, P, 16), { tone: "lo" }) + `<g data-live="lamp-gate">${k.lineSvg(k.ring(-41, 8.5, 0.55, 15.7, P, 16), { tone: "hi" })}</g>`, 17);
  put("shutters", "rail", [4, 8, 9], `<g data-live="shutters"></g>`, 15);

  // ---- ball (sphere at origin, translated live) ----
  put("ball", "ball", [4, -10, 18], `<g data-live="ball">${k.solidSvg(L.sphereOf([0, 0, 0], 1.7, P), { lit: true })}</g>`, 20);

  // ---- temperature knob ----
  put("knob-base", "knob", [-64, 14, 2], box(-72, 6, 0, -56, 22, 3.5, {}, 0.4) + ink.silhouetteSvg(corners3([-72, 6, 0, -56, 22, 3.5]), P), -12);
  put("knob-dial", "knob", [-64, 14, 4.5],
    S(k.cylinder(KNOB.cx, KNOB.cy, 5.5, 3.5, 1.6, P, 48), { tone: "mid" }) +
    S(k.cylinder(KNOB.cx, KNOB.cy, 4.2, 5.1, 1.1, P, 48), { tone: "hi" }) +
    S(k.cylinder(KNOB.cx, KNOB.cy, 1, 6.2, 0.7, P, 20), { tone: "lo" }), -11);
  let knobTicks = "";
  for (let i = 0; i <= 8; i++) {
    const a = (-120 + i * 30) * (Math.PI / 180);
    const r0 = i % 2 === 0 ? 6.1 : 6.6, r1 = 7.3;
    knobTicks += k.lineOnTop([KNOB.cx + Math.sin(a) * r0, KNOB.cy - Math.cos(a) * r0], [KNOB.cx + Math.sin(a) * r1, KNOB.cy - Math.cos(a) * r1], 5.1, P);
  }
  let knurlDots = "";
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    knurlDots += k.lineOnTop([KNOB.cx + Math.cos(a) * 5.5, KNOB.cy + Math.sin(a) * 5.5], [KNOB.cx + Math.cos(a) * 5.5, KNOB.cy + Math.sin(a) * 5.5], 4.3, P);
  }
  put("knob-marks", "knob", [-64, 14, 5], k.lineSvg(knobTicks, { tone: "mid" }) + k.lineSvg(knurlDots, { tone: "faint" }), -10);
  put("knob-pointer", "knob", [-64, 14, 6.4], `<path class="iso-line" data-tone="hi" data-live="needle" style="stroke-width:2" d=""/>`, -9);
  put("knob-lamp", "heat", [-70.5, 7.5, 4],
    S(k.cylinder(-70.5, 7.5, 0.9, 3.5, 1.2, P, 16), { tone: "lo" }) + `<g data-live="lamp-heat">${k.lineSvg(k.ring(-70.5, 7.5, 0.55, 4.7, P, 16), { tone: "hi" })}</g>`, -8);
  put("knob-bolts", "knob", [-64, 20, 3.5],
    S(k.cylinder(-69, 20, 0.5, 3.5, 0.4, P, 12), { tone: "lo" }) + S(k.cylinder(-59, 20, 0.5, 3.5, 0.4, P, 12), { tone: "lo" }), -11);

  // ---- scoreboard (top-3) ----
  put("board", "board", [-38, -37, 7],
    box(-52, -38, 8, -50.8, -36.5, 0, { tone: "lo" }, 0.2) + box(-25.2, -38, 8, -24, -36.5, 0, { tone: "lo" }, 0.2) +
    box(-52, -38, 0, -24, -36.8, 15, { tone: "mid" }, 0.4) +
    box(-51, -37.6, 1, -25, -37.2, 14, { tone: "lo" }, 0.2) +
    ink.silhouetteSvg(corners3([-52, -38, 0, -24, -36.8, 15]), P), -25);
  put("board-lines", "board", [-38, -37, 8], `<g data-live="board"></g>`, -24);

  // ---- tape machine + split-flap ----
  put("tape-body", "tape", [64, -24, 5], box(54, -32, 0, 74, -16, 9, {}, 0.5) + ink.silhouetteSvg(corners3([54, -32, 0, 74, -16, 9]), P), -6);
  put("tape-top", "tape", [64, -24, 9.5], box(53, -33, 9, 75, -15, 10, { tone: "hi" }, 0.3), -5);
  const spool = (sx) =>
    S(k.cylinder(sx, -28, 2.6, 10, 4.5, P, 32), { tone: "mid" }) +
    S(k.cylinder(sx, -28, 1.6, 14.5, 0.6, P, 24), { tone: "hi" }) +
    S(k.cylinder(sx, -28, 0.5, 15.1, 0.9, P, 12), { tone: "lo" });
  put("tape-spools", "tape", [64, -28, 12], spool(59) + spool(69), -4);
  put("tape-strip", "tape", [64, 0, 6],
    box(60.5, -16, 5.6, 67.5, 18, 6.2, { tone: "hi" }, 0.15) +
    box(60.5, 17, 4.4, 67.5, 18.6, 6.2, { tone: "lo" }, 0.1) +
    `<g data-live="stripes">${[0, 1, 2, 3, 4, 5].map((i) => k.lineSvg(k.lineOnTop([61.5, -14 + i * 5], [66.5, -14 + i * 5], 6.2, P), { tone: "faint" })).join("")}</g>`, -3);
  put("tape-crank", "tape", [64, -20, 12], S(k.cylinder(64, -20, 0.6, 15, 2.4, P, 12), { tone: "lo" }) + `<path class="iso-line" data-tone="hi" data-live="crank" style="stroke-width:2" d=""/>`, -2);
  put("tape-lamp", "tape", [55.5, -17.5, 10.5],
    S(k.cylinder(55.5, -17.5, 0.9, 10, 1.2, P, 16), { tone: "lo" }) + `<g data-live="lamp-tape">${k.lineSvg(k.ring(55.5, -17.5, 0.55, 11.2, P, 16), { tone: "hi" })}</g>`, -1);
  put("flap", "tape", [38, -37, 8],
    box(24, -38, 7, 25.2, -36.6, 0, { tone: "lo" }, 0.2) + box(50.8, -38, 7, 52, -36.6, 0, { tone: "lo" }, 0.2) +
    box(24, -38, 0, 52, -36.8, 13, {}, 0.4) +
    box(25.5, -37.7, 2, 50.5, -37.3, 11.5, { tone: "lo" }, 0.2) +
    k.lineSvg(k.lineOnTop([25.5, -37.5], [50.5, -37.5], 6.7, P), { tone: "faint" }) +
    ink.silhouetteSvg(corners3([24, -38, 0, 52, -36.8, 13]), P), -25);
  put("flap-text", "tape", [38, -37, 7], `<g data-live="flap"></g>`, -24);

  // ---- overlay: bin labels live here (always on top) ----
  put("binlabels", "rail", [4, 9, 12], `<g data-live="binlabels"></g>`, 100);

  const V = [depth([1, 0, 0]), depth([0, 1, 0]), depth([0, 0, 1])];
  const data = {
    P, V, EXPLODE, LABELS, CONCEPT, TOWER, TROUGH, SHUT, KNOB, THROAT,
    items: items.map(({ id, asm, key }) => ({ id, asm, key })),
  };
  const LABEL = "A Pachinko sampler: a logit bar tower, a temperature knob, a hopper dropping balls past pegs into probability-wide bins with filter shutters, and a tape machine with a stamp board.";
  const body = items.map((item) => `<g data-i="${item.id}" data-asm="${item.asm}">${item.svg}</g>`).join("");
  const svg = k.figureSvg({ width: W, height: H, label: LABEL, body: `${ink.wobbleFilter()}<g data-layer filter="url(#iso-hand)">${body}</g><g data-pills></g>` }).replace("<svg ", "<svg data-ie-svg ");
  const css = `
[data-ia-stage] .bin-label { font-size: 10px; fill: currentColor; paint-order: stroke; stroke-width: 3px; stroke: transparent; }
[data-ia-stage] .board-text { font-size: 10.5px; fill: currentColor; font-variant-numeric: tabular-nums; }
[data-ia-stage] .flap-char { font-size: 15px; font-weight: 700; fill: currentColor; }
[data-ia-stage] .shut-hatch { stroke-width: 1; opacity: 0.55; }`;
  const topkOptions = [`<option value="0">off</option>`, ...Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`)].join("");
  const controls = `
    <button type="button" class="ia-btn" data-ie-gen1>Generate 1</button>
    <button type="button" class="ia-btn" data-ie-gen8>Generate 8</button>
    <button type="button" class="ia-btn" data-ie-step>Step</button>
    <button type="button" class="ia-btn" data-ie-explode aria-pressed="false">Explode</button>
    <button type="button" class="ia-btn" data-ie-reset>Reset</button>
    <label class="ia-field">Prompt <select class="ia-select" id="ie-prompt"><option value="capital">The capital of France is</option><option value="story">Once upon a time…</option></select></label>
    <label class="ia-field">Temperature <input type="range" class="ia-range" id="ie-temp" min="0" max="2" step="0.1" value="1"><span data-ie-tempval>1.0</span></label>
    <label class="ia-field">Top-k <select class="ia-select" id="ie-topk">${topkOptions}</select></label>
    <label class="ia-field">Top-p <input type="range" class="ia-range" id="ie-topp" min="0.1" max="1" step="0.05" value="1"><span data-ie-toppval>1.00</span></label>
    <label class="ia-field">Seed <input type="number" class="ia-select" id="ie-seed" min="0" max="999" value="7"></label>`;
  const readouts = [
    { key: "token", label: "Picked token" },
    { key: "prob", label: "Its odds" },
    { key: "inplay", label: "Tokens in play" },
    { key: "entropy", label: "Entropy" },
    { key: "text", label: "Tape" },
  ];
  return { svg, data, css, controls, readouts };
}
