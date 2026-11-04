// Inside embeddings: a brass compass table (orientation bench).
// A ring of 12 sentence-card holders on a turntable; each card carries a needle
// pointing along its vector through a FIXED honest 6D->2D projection (see PROJ in
// model.mjs). The query needle sits on the centre pivot, a protractor arm swings
// to each candidate, a sorting rack lifts the top-k, and a stamp arm works in
// keyword mode. Hero tier: ~115 parts.
import * as k from "../../kit/iso-kit.mjs";
import * as ink from "../../kit/ink.mjs";
import { DOCS, project2 } from "./model.mjs";

const TAU = Math.PI * 2;
const docAngle = (v) => {
  const [a, b] = project2(v);
  return Math.atan2(b, a) * 180 / Math.PI;
};

export function figure() {
  const W = 760;
  const H = 430;
  const AZIMUTH = 60;
  const PLATE = { x: -80, y: -46, w: 160, d: 92, r: 5 };
  const CX = 0;
  const CY = -6;
  const RING_R = 27;
  const CARD_TOP = 10.2;
  const CONCEPT = { query: "QUERY", ring: "VECTORS", angle: "ANGLE", rack: "RANK" };
  const EXPLODE = {
    base: [0, 0, 0], table: [0, 0, 0], ring: [0, 0, 14], pivot: [0, 0, 30],
    query: [-10, 6, 22], angle: [0, 0, 24], rack: [18, -6, 10], stamp: [-18, -4, 16], dial: [-8, 12, 8],
  };

  const P = k.fitProjection(
    [...k.boxCorners(PLATE, -9, 0), [CX, CY, 14 + 30], [96, -36, 30], [-80, -28, 38], [RING_R + 8, CY, 25], [-RING_R - 8, CY, 25]],
    W, H, { pad: 14, azimuth: AZIMUTH },
  );
  const depth = (p) => k.depthOf(p, P);
  const S = (paths, style) => ink.inkSolid(paths, { tone: "mid", ...style });
  const box = (x0, y0, z0, x1, y1, z1, style = {}, r = 0.6) =>
    S(k.slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r }, z0, z1 - z0, P, r ? 3 : 1), style);

  const items = [];
  function put(id, asm, ref, svg, bias = 0) {
    items.push({ id, asm, key: depth(ref) + bias, svg });
  }

  // ---- base plate on feet ----
  const feet = k.corners(PLATE, 13);
  const shadowBodies = [PLATE];
  put("shadows", "base", [0, 0, -90],
    feet.map(([x, y]) => ink.castShadowSvg([[x - 5, y - 5, -9], [x + 5, y - 5, -9], [x + 5, y + 5, -9], [x - 5, y + 5, -9]], P)).join("") +
    ink.castShadowSvg([[PLATE.x, PLATE.y, -5], [PLATE.x + PLATE.w, PLATE.y, -5], [PLATE.x + PLATE.w, PLATE.y + PLATE.d, -5], [PLATE.x, PLATE.y + PLATE.d, -5]], P), -900);
  put("base", "base", [0, 0, -100],
    S(k.slabOf(PLATE, -5, 5, P, 8, 1.2), { material: "board" }) + ink.silhouetteSvg(k.boxCorners(PLATE, -5, 0), P), -1000);
  feet.forEach(([x, y], i) => {
    put(`foot${i}`, "base", [x, y, -8],
      S(k.cylinder(x, y, 4.6, -9, 1.6, P, 24), { tone: "lo" }) + S(k.cylinder(x, y, 3.4, -7.4, 2.4, P, 24), { tone: "mid" }), -800 + i * 0.1);
  });
  put("groove", "base", [0, 40, 0], k.lineSvg(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "faint" }), -700);
  k.corners(PLATE, 10).forEach(([x, y], i) => {
    put(`screw${i}`, "base", [x, y, 0],
      k.lineSvg(k.ring(x, y, 1.6, 0, P, 16), { tone: "lo" }) + k.dotsSvg(k.pointsAt([[x, y, 0]], P), { size: 0.5, tone: "mid" }), -690 + i * 0.1);
  });
  const strip = { x: -70, y: 38.6, w: 140, d: 3.2, r: 1 };
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.6, 0.6, [1.2, 2.2], P);
  put("ruler", "base", [0, 40, 0.6],
    S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }) +
    k.lineSvg(ticks.minor, { tone: "lo" }) + k.lineSvg(ticks.major, { tone: "mid" }), -680);
  const plate2 = { x: -30, y: 28, w: 60, d: 7, r: 1 };
  put("labelplate", "base", [0, 31, 0.8],
    S(k.slabOf(plate2, 0, 0.8, P, 4), { tone: "lo" }) +
    k.lineSvg(k.planOutline(k.insetPlan(plate2, 1.4), 0.8, P), { tone: "faint" }) +
    k.lineSvg(k.lineOnTop([-26, 30.4], [6, 30.4], 0.8, P), { tone: "lo", free: true }) +
    k.lineSvg(k.lineOnTop([-26, 32.2], [-2, 32.2], 0.8, P), { tone: "lo", free: true }) +
    k.lineSvg(k.lineOnTop([-26, 34], [14, 34], 0.8, P), { tone: "lo", free: true }) +
    k.dotsSvg(k.pointsAt([[26, 29.6, 0.8], [26, 33.4, 0.8]], P), { size: 0.45, tone: "mid" }), -670);
  shadowBodies.push(plate2);

  // ---- turntable drum (brass) ----
  put("table", "table", [CX, CY, 2],
    S(k.cylinder(CX, CY, 35, 0, 4, P, 72, 0.8), { material: "ride" }) +
    k.lineSvg(k.ring(CX, CY, 33.2, 4, P, 72), { tone: "lo" }) +
    k.lineSvg(k.knurl(CX, CY, 35, 0.4, 3.6, 72, P), { tone: "lo" }) +
    k.lineSvg(k.sideArc(CX, CY, 35, 0.6, P, 40), { tone: "faint" }), -400);
  const dTicks = k.radialTicks(CX, CY, 31, 72, 6, 4, [1.2, 2.6], P);
  put("table-ticks", "table", [CX, CY, 4],
    k.lineSvg(dTicks.minor, { tone: "lo" }) + k.lineSvg(dTicks.major, { tone: "mid" }), -390);
  put("table-shadow", "table", [CX, CY, 0], ink.castShadowSvg([[CX - 35, CY - 35, 4], [CX + 35, CY - 35, 4], [CX + 35, CY + 35, 4], [CX - 35, CY + 35, 4]], P), -410);
  // fixed degree ring the arm reads against
  put("degree-ring", "angle", [CX, CY, 4.4],
    k.lineSvg(k.ring(CX, CY, 30.5, 4.3, P, 72), { tone: "mid" }), -380);

  // ---- ring of 12 card holders ----
  const HOLDERS = DOCS.map((d, i) => {
    const a = (-90 + i * 30) * Math.PI / 180;
    return { ...d, gx: CX + RING_R * Math.cos(a), gy: CY + RING_R * Math.sin(a), needle: docAngle(d.v) };
  });
  HOLDERS.forEach((h, i) => {
    const { gx, gy } = h;
    put(`holder${i}`, "ring", [gx, gy, 5],
      box(gx - 3.2, gy - 2.4, 4, gx + 3.2, gy + 2.4, 5, { tone: "lo" }, 1) +
      box(gx - 2.7, gy - 2.2, 5, gx + 2.7, gy - 1.4, 11, { tone: "mid" }, 0.5) +
      k.dotsSvg(k.pointsAt([[gx - 2.2, gy - 0.6, 5], [gx + 2.2, gy - 0.6, 5]], P), { size: 0.4, tone: "mid" }), 1 + i * 0.01);
    const na = h.needle * Math.PI / 180;
    const nx = Math.cos(na) * 8.5;
    const ny = Math.sin(na) * 8.5;
    const tx = gx - Math.cos(na) * 2.5;
    const ty = gy - Math.sin(na) * 2.5;
    put(`card${i}`, "ring", [gx, gy, 8],
      `<g data-live="cardwrap${i}">` +
      box(gx - 2.5, gy - 0.5, 5, gx + 2.5, gy + 0.5, CARD_TOP, { tone: "hi" }, 0.3) +
      k.lineSvg(k.lineOnTop([tx, ty], [gx + nx, gy + ny], CARD_TOP + 0.15, P), { tone: "lit", free: "end", className: "needle" }) +
      k.lineSvg(k.ring(gx, gy, 0.8, CARD_TOP + 0.15, P, 12), { tone: "mid" }) +
      `</g>`, 3 + i * 0.01);
    put(`cardshadow${i}`, "ring", [gx, gy, 4], ink.castShadowSvg([[gx - 2.6, gy - 1.8, 5], [gx + 2.6, gy - 1.8, 5], [gx + 2.6, gy + 1.8, 5], [gx - 2.6, gy + 1.8, 5]], P), 0.5);
  });

  // ---- centre pivot + query needle (live) + query card (live drop) ----
  put("pivot", "pivot", [CX, CY, 6],
    S(k.cylinder(CX, CY, 6, 4, 1.5, P, 40), { material: "ride" }) +
    S(k.cylinder(CX, CY, 4.4, 5.5, 1.6, P, 36), { tone: "lo" }) +
    S(k.cylinder(CX, CY, 2.6, 7.1, 5.6, P, 28), { material: "ride", crease: "none" }) +
    k.lineSvg(k.sideArc(CX, CY, 2.6, 9, P, 20), { tone: "faint" }) +
    k.lineSvg(k.knurl(CX, CY, 4.4, 5.6, 6.9, 36, P), { tone: "lo" }), 8);
  put("qcard", "query", [CX + 9, CY + 3, 5],
    `<g data-live="qcard">${box(CX + 5.5, CY + 0.5, 4.6, CX + 12.5, CY + 5.5, 5.4, { tone: "hi" }, 0.5) +
    k.lineSvg(k.lineOnTop([CX + 6.6, CY + 1.8], [CX + 9.6, CY + 1.8], 5.4, P), { tone: "lo", free: true }) +
    k.lineSvg(k.lineOnTop([CX + 6.6, CY + 3.2], [CX + 11.4, CY + 3.2], 5.4, P), { tone: "lo", free: true })}</g>`, 9);
  put("qneedle", "query", [CX, CY, 13.4],
    `<path class="iso-line needle-q" data-tone="lit" data-free="end" data-live="qneedle" style="stroke-width:2.2" d=""/>` +
    S(k.cylinder(CX, CY, 1.3, 13, 1.2, P, 16), { tone: "hi" }), 10);

  // ---- protractor arm (live swing) ----
  put("arm", "angle", [CX, CY, 12.4],
    `<path class="iso-line needle-a" data-tone="lit" data-free="end" data-live="arm" style="stroke-width:1.8" d=""/>` +
    `<g data-live="armtip"></g>` +
    S(k.cylinder(CX, CY, 2.1, 11.4, 1.4, P, 24), { material: "ride" }), 11);

  // ---- sorting rack: lifts the top-k cards into numbered slots ----
  const RX = 58;
  const RY = -30;
  put("rack-board", "rack", [RX, RY + 12, 8],
    box(RX, RY, 0, RX + 3, RY + 24, 16, { tone: "mid" }, 1) +
    box(RX, RY + 22.6, 16, RX + 13, RY + 25.4, 17.5, { tone: "mid" }, 1) +
    k.dotsSvg(k.pointsAt([[RX + 1.5, RY + 1, 17.5], [RX + 1.5, RY + 23, 17.5]], P), { size: 0.45, tone: "mid" }), 12);
  const SLOTS = [];
  for (let r = 0; r < 5; r++) {
    const sz = 1.5 + r * 2.7;
    SLOTS.push({ x: RX + 4, y: RY + 1 + r * 0.4, z: sz });
    put(`shelf${r}`, "rack", [RX + 9, RY + 3, sz],
      box(RX + 3, RY, sz, RX + 16, RY + 4.6, sz + 0.5, { tone: "lo" }, 0.5) +
      k.faceTextSvg(k.topMatrix([RX + 13.8, RY + 2.3], sz + 0.5, P), String(r + 1), { size: 2.6, tone: "mid" }), 13 + r * 0.05);
    put(`slot${r}`, "rack", [RX + 8, RY + 2, sz + 1],
      `<g data-live="slot${r}" style="display:none">${box(RX + 4, RY + 0.6, sz + 0.5, RX + 13, RY + 4, sz + 1.9, { tone: "hi" }, 0.3) +
      k.lineSvg(k.lineOnTop([RX + 5, RY + 2.3], [RX + 9.5, RY + 2.3], sz + 1.9, P), { tone: "lit", free: "end", className: "needle" })}</g>`, 14 + r * 0.05);
  }

  // ---- stamp arm: presses in keyword mode ----
  put("stamp-post", "stamp", [-60, -24, 10],
    S(k.cylinder(-60, -24, 4, 0, 1.5, P, 28), { tone: "lo" }) +
    S(k.cylinder(-60, -24, 2.4, 1.5, 18.5, P, 24), { tone: "mid", crease: "none" }) +
    k.lineSvg(k.sideArc(-60, -24, 2.4, 12, P, 16), { tone: "faint" }) +
    box(-63.5, -27.5, 14, -56.5, -20.5, 15.5, { tone: "mid" }, 1), 5);
  put("stamp-head", "stamp", [-51, -24, 19],
    box(-62, -26, 20, -48, -22, 21.5, { material: "ride" }, 1) +
    S(k.cylinder(-50, -24, 3.2, 17.5, 2.5, P, 28), { tone: "hi" }) +
    k.lineSvg(k.sideArc(-50, -24, 3.2, 18.2, P, 20), { tone: "faint" }) +
    box(-52.5, -26.5, 16.6, -47.5, -21.5, 17.5, { tone: "lo" }, 0.5), 6);

  // ---- angle dial: mirrors the protractor reading ----
  const DX = -62;
  const DY = 26;
  put("dial", "dial", [DX, DY, 2],
    S(k.cylinder(DX, DY, 7, 0, 3, P, 48, 0.6), { tone: "hi" }) +
    k.lineSvg(k.knurl(DX, DY, 7, 0.4, 2.6, 48, P, 0.3), { tone: "lo" }) +
    k.lineSvg(k.ring(DX, DY, 5.4, 3, P, 48), { tone: "lo" }), 4);
  const gTicks = k.radialTicks(DX, DY, 4.6, 36, 3, 3, [0.7, 1.5], P);
  put("dial-face", "dial", [DX, DY, 3],
    k.lineSvg(gTicks.minor, { tone: "lo" }) + k.lineSvg(gTicks.major, { tone: "mid" }) +
    `<path class="iso-line" data-tone="lit" data-free="end" data-live="dialneedle" style="stroke-width:1.4" d=""/>` +
    k.lineSvg(k.ring(DX, DY, 0.9, 3, P, 12), { tone: "mid" }), 4.2);

  // ---- extra crafted detail (brackets, screws, rails) ----
  [[PLATE.x + 8, PLATE.y + 8], [PLATE.x + PLATE.w - 14, PLATE.y + 8], [PLATE.x + 8, PLATE.y + PLATE.d - 14], [PLATE.x + PLATE.w - 14, PLATE.y + PLATE.d - 14]].forEach(([bx, by], i) => {
    put(`bracket${i}`, "base", [bx + 3, by + 3, 0.6],
      box(bx, by, 0, bx + 6, by + 6, 0.6, { tone: "mid" }, 0.5) +
      k.dotsSvg(k.pointsAt([[bx + 1.6, by + 1.6, 0.6]], P), { size: 0.45, tone: "mid" }), -660 + i * 0.1);
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const sx = CX + 33.2 * Math.cos(a);
    const sy = CY + 33.2 * Math.sin(a);
    put(`drumscrew${i}`, "table", [sx, sy, 4],
      k.dotsSvg(k.pointsAt([[sx, sy, 4]], P), { size: 0.5, tone: "mid" }), -385 + i * 0.01);
  }
  put("rack-rails", "rack", [RX + 9, RY + 24, 8],
    box(RX + 15, RY, 0, RX + 16.4, RY + 24, 15, { tone: "mid" }, 0.5) +
    box(RX + 6, RY + 23.4, 0, RX + 16.4, RY + 24.6, 15, { tone: "mid" }, 0.5), 12.5);
  put("rack-finial", "rack", [RX + 12, RY + 12, 18],
    S(k.cylinder(RX + 1.5, RY + 12, 1.4, 17.5, 2.2, P, 16), { material: "ride" }), 12.6);
  put("stamp-bolts", "stamp", [-60, -24, 1.5],
    k.dotsSvg(k.pointsAt([[-62.5, -26.5, 1.5], [-57.5, -21.5, 1.5]], P), { size: 0.5, tone: "mid" }), 5.1);
  put("pivot-seal", "pivot", [CX, CY, 7.1], k.lineSvg(k.ring(CX, CY, 2.9, 7.1, P, 24), { tone: "faint" }), 8.1);
  [[DX - 5, DY - 5], [DX + 5, DY - 5], [DX, DY + 5.6]].forEach(([sx, sy], i) => {
    put(`dialscrew${i}`, "dial", [sx, sy, 0.2],
      k.dotsSvg(k.pointsAt([[sx, sy, 0.2]], P), { size: 0.4, tone: "mid" }), 4.1 + i * 0.01);
  });

  // ---- pills ----
  const LABELS = [
    { asm: "query", at: [CX, CY, 14.5], dx: -96, dy: -64 },
    { asm: "ring", at: [HOLDERS[3].gx, HOLDERS[3].gy, CARD_TOP + 1], dx: -108, dy: -30 },
    { asm: "angle", at: [CX + 24, CY - 18, 13], dx: 92, dy: -58 },
    { asm: "rack", at: [RX + 12, RY + 12, 17.5], dx: 84, dy: -20 },
  ];

  const V = [depth([1, 0, 0]), depth([0, 1, 0]), depth([0, 0, 1])];
  const data = {
    P, V, EXPLODE, LABELS, CONCEPT,
    CX, CY, RING_R, CARD_TOP,
    holders: HOLDERS.map((h) => ({ id: h.id, gx: h.gx, gy: h.gy, needle: h.needle })),
    slots: SLOTS, dial: [DX, DY, 3.2],
    items: items.map(({ id, asm, key }) => ({ id, asm, key })),
  };
  const LABEL = "A brass compass table with a ring of twelve sentence cards, a query needle on a centre pivot, a protractor arm, a five-slot sorting rack, a stamp arm and an angle dial.";
  const body = items.map((item) => `<g data-i="${item.id}" data-asm="${item.asm}">${item.svg}</g>`).join("");
  const svg = k.figureSvg({ width: W, height: H, label: LABEL, body: `${ink.wobbleFilter()}<g data-layer filter="url(#iso-hand)">${body}</g><g data-pills></g>` }).replace("<svg ", "<svg data-ie-svg ");
  const queryOpts = Object.entries({ puppy: "puppy", trail: "meadow trail walk", server: "midnight server hum", bread: "warm bread cheese", beach: "quiet calm shore", loan: "house loan bank" })
    .map(([v, label]) => `<option value="${v}">${label}</option>`).join("");
  const controls = `
    <button type="button" class="ia-btn" data-ie-run aria-pressed="false">Run</button>
    <button type="button" class="ia-btn" data-ie-step>Step</button>
    <button type="button" class="ia-btn" data-ie-explode aria-pressed="false">Explode</button>
    <button type="button" class="ia-btn" data-ie-reset>Reset</button>
    <label class="ia-field">Query <select class="ia-select" id="ie-query">${queryOpts}</select></label>
    <label class="ia-field">Method <select class="ia-select" id="ie-method"><option value="cosine">cosine</option><option value="dot">dot product</option><option value="keyword">keyword</option></select></label>
    <label class="ia-field">Top-k <select class="ia-select" id="ie-k"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option><option value="4">4</option><option value="5">5</option></select></label>
    <label class="ia-toggle"><input type="checkbox" id="ie-norm"> Normalise</label>
    <label class="ia-field">Animal boost <input type="range" class="ia-range" id="ie-mixA" min="-5" max="5" step="1" value="0"></label>
    <label class="ia-field">Tech boost <input type="range" class="ia-range" id="ie-mixT" min="-5" max="5" step="1" value="0"></label>
    <p class="ia-note">Hand-set 6D vectors; the drawing projects 6D to 2D, the score uses all 6.</p>`;
  const readouts = [
    { key: "top", label: "Top card" },
    { key: "score", label: "Score" },
    { key: "angle", label: "Angle" },
    { key: "rightRank", label: "Right card rank" },
  ];
  const count = items.length;
  return { svg, data, css: "", controls, readouts, count };
}
