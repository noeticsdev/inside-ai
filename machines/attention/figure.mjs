// Inside an attention head: a weaving loom on a bench.
// A query shuttle rides a front rail; ten key posts stand in a back row with
// token cards. Threads from the shuttle to every post carry the attention
// weights (thickness = weight); masked threads are cut and drop as coils.
// A mixing funnel and cup gather the blend; a tablet plots the output vector.
import * as k from "../../kit/iso-kit.mjs";
import * as ink from "../../kit/ink.mjs";
import { TOKENS } from "./model.mjs";

export function figure() {
  const W = 760;
  const H = 470;
  const AZIMUTH = 60;
  const PLATE = { x: -84, y: -36, w: 168, d: 78, r: 5 };
  const XS = TOKENS.map((_, i) => -63 + i * 14);
  const POST_Y = -14;
  const RAIL_Y = 16;
  const SH_Z = 21; // thread anchor height on the shuttle mast
  const CARD_Z = 17.2; // thread anchor at card tops
  const CONCEPT = { query: "QUERY", score: "SCORE", weigh: "WEIGH", mix: "MIX" };
  const EXPLODE = {
    base: [0, 0, 0], rail: [0, 14, 0], query: [0, 0, 18],
    score: [0, -12, 12], weigh: [-16, 10, 22], mix: [18, 12, 26],
  };

  const P = k.fitProjection(
    [...k.boxCorners(PLATE, -6, 0), [-63, POST_Y, 60], [63, POST_Y, 60], [0, RAIL_Y, 62], [2, 30, 58], [48, 28, 60], [-52, 28, 44], [0, 2, 62]],
    W, H, { pad: 22, azimuth: AZIMUTH },
  );
  const depth = (p) => k.depthOf(p, P);
  const S = (paths, style) => ink.inkSolid(paths, { tone: "mid", ...style });
  const box = (x0, y0, z0, x1, y1, z1, style = {}, r = 0.6) => S(k.slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r }, z0, z1 - z0, P, r ? 3 : 1), style);
  const cyl = (cx, cy, r, z, h, style = {}, steps = 24) => S(k.cylinder(cx, cy, r, z, h, P, steps), style);

  const items = [];
  function put(id, asm, ref, svg, bias = 0) {
    items.push({ id, asm, key: depth(ref) + bias, svg });
  }

  // ---- base plate, feet, screws, ruler, label plate ----
  const corners3 = ([x0, y0, z0, x1, y1, z1]) => [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const shadowBodies = [];
  for (let i = 0; i < 10; i++) shadowBodies.push([XS[i] - 2.6, POST_Y - 2.6, 0, XS[i] + 2.6, POST_Y + 2.6, 17]);
  shadowBodies.push([-6, 12, 0, 6, 20, 21], [-4, 24, 0, 8, 36, 13], [40, 24, 0, 56, 32, 8], [-58, 22, 0, -46, 34, 5], [-77, 0, 0, 77, 4, 28]);
  put("shadows", "base", [0, 0, -90], shadowBodies.map((b) => ink.castShadowSvg(corners3(b), P)).join(""), -900);
  put("base", "base", [0, 0, -100], S(k.slabOf(PLATE, -6, 6, P, 6, 1), { material: "board" }) + ink.silhouetteSvg(k.boxCorners(PLATE, -6, 0), P), -1000);
  for (const [fx, fy] of [[-76, -28], [76, -28], [-76, 34], [76, 34]]) {
    put(`foot-${fx}-${fy}`, "base", [fx, fy, -14], cyl(fx, fy, 5, -15, 1.6, { tone: "lo" }, 20) + cyl(fx, fy, 3.8, -13.4, 3, {}, 20), -800);
  }
  for (const [sx, sy] of [[-76, -28], [76, -28], [-76, 34], [76, 34]]) {
    put(`screw-${sx}-${sy}`, "base", [sx, sy, 6], k.lineSvg(k.ring(sx, sy, 1.6, 6, P, 16), { tone: "lo" }), 8);
  }
  put("plate-label", "base", [-60, 36, 6], box(-72, 33.5, 6, -48, 38.5, 6.9, { tone: "lo" }, 0.4) + k.lineSvg(k.lineOnTop([-69, 34.6], [-57, 34.6], 6.9, P), { tone: "faint" }) + k.lineSvg(k.lineOnTop([-69, 35.9], [-62, 35.9], 6.9, P), { tone: "faint" }), 9);
  let rulerTicks = "";
  for (let x = -66; x <= 66; x += 2) {
    const major = Math.round((x + 66) / 2) % 5 === 0;
    rulerTicks += k.lineSvg(k.lineOnTop([x, 27.5], [x, 27.5 + (major ? 2.2 : 1.2)], 0.9, P), { tone: major ? "mid" : "lo" });
  }
  put("ruler", "base", [0, 28, 0], box(-70, 26.5, 0, 70, 30.5, 0.9, { tone: "lo" }, 0.3) + rulerTicks, 2);

  // ---- front rail + sleepers + end stops ----
  for (let s = 0; s < 7; s++) {
    const sx = -66 + s * 22;
    put(`sleeper${s}`, "rail", [sx, RAIL_Y, 0], box(sx - 2, 12, 0, sx + 2, 20, 0.8, { tone: "lo" }, 0.2), -400);
  }
  put("railbar", "rail", [0, RAIL_Y, 1], box(-72, 14.6, 0.8, 72, 17.4, 2.2, { tone: "lo" }, 0.3), -399);
  for (const ex of [-72, 72]) {
    put(`stop-${ex}`, "rail", [ex, RAIL_Y, 2], box(ex - 2.5, 13, 0, ex + 2.5, 19, 6, {}, 0.5) + k.lineSvg(k.ring(ex, RAIL_Y, 1, 6, P, 12), { tone: "lo" }), 3);
  }

  // ---- ten key posts with token cards, clips and value ingots ----
  XS.forEach((xi, i) => {
    put(`foot${i}`, "score", [xi, POST_Y, 0], cyl(xi, POST_Y, 2.6, 0, 1, { tone: "lo" }, 20), 1);
    put(`collar${i}`, "score", [xi, POST_Y, 1.5], cyl(xi, POST_Y, 1.9, 1, 1.2, {}, 20), 2);
    put(`post${i}`, "score", [xi, POST_Y, 5], cyl(xi, POST_Y, 1.1, 2.2, 7, {}, 18), 2);
    put(`cap${i}`, "score", [xi, POST_Y, 9.5], cyl(xi, POST_Y, 1.5, 9.2, 1, { tone: "hi" }, 18), 3);
    put(`clip${i}`, "score", [xi, POST_Y - 0.6, 10], box(xi - 1, POST_Y - 1.4, 9, xi + 1, POST_Y + 0.2, 11, { tone: "lo" }, 0.2), 3);
    put(`card${i}`, "score", [xi, POST_Y + 0.6, 13.5],
      box(xi - 5, POST_Y + 0.4, 10.5, xi + 5, POST_Y + 1.6, CARD_Z, { tone: "hi" }, 0.3) +
      k.faceTextSvg(k.sideMatrix([xi - 4.4, POST_Y + 1.7], 12.4, P, "left"), TOKENS[i], { size: 2.6, tone: "hi" }), 4);
    put(`eye${i}`, "score", [xi, POST_Y + 1, CARD_Z], k.lineSvg(k.ring(xi, POST_Y + 1, 0.9, CARD_Z, P, 12), { tone: "lo" }), 5);
    put(`ingot${i}`, "score", [xi, POST_Y + 3.4, 1], box(xi - 3.4, POST_Y + 2.1, 0, xi + 3.4, POST_Y + 4.7, 1.6, { tone: "hi" }, 0.3), 5);
  });

  // ---- query shuttle (built at x=0, translated live) ----
  put("carriage", "query", [0, RAIL_Y, 3], box(-7, 12, 2.2, 7, 20, 4.4, {}, 0.8), 6);
  for (const bx of [-5, 5]) put(`bush-${bx}`, "query", [bx, RAIL_Y, 2], box(bx - 1.4, 14.2, 0.5, bx + 1.4, 17.8, 2.6, { tone: "lo" }, 0.2), 7);
  put("mast", "query", [0, RAIL_Y, 10], cyl(0, RAIL_Y, 1.2, 4.4, 11.8, {}, 18), 6);
  put("spool", "query", [0, RAIL_Y, 17], cyl(0, RAIL_Y, 3, 16.2, 2.4, { tone: "hi" }, 32) + k.lineSvg(k.ring(0, RAIL_Y, 3, 17.8, P, 32), { tone: "lo" }), 7);
  put("tip", "query", [0, RAIL_Y, 20], cyl(0, RAIL_Y, 1, 18.6, 2.6, { tone: "hi" }, 14), 8);

  // ---- scaling gantry over the thread fan ----
  for (const gx of [-76, 76]) put(`gatepost-${gx}`, "score", [gx, 2, 13], cyl(gx, 2, 1.6, 0, 26, {}, 18), 1);
  put("gatebeam", "score", [0, 2, 27], box(-77.5, 1.2, 26.2, 77.5, 2.8, 27.6, { tone: "lo" }, 0.4), 2);
  put("gateweight", "score", [0, 2, 24], `<g data-live="gateweight">${box(-4, 0.8, 21.5, 4, 3.2, 25.5, { tone: "hi" }, 0.4)}</g>`, 3);

  // ---- causal shutter rail + live blade ----
  put("shutterrail", "score", [0, -20, 16], box(-70, -21, 15.5, 70, -19.5, 16.5, { tone: "lo" }, 0.2), 1);
  put("shutter", "score", [0, -20, 19], `<g data-live="shutter"></g>`, 6);

  // ---- mixing funnel + cup ----
  for (const [lx, ly] of [[-4, 25], [8, 25], [2, 35.5]]) put(`leg-${lx}-${ly}`, "weigh", [lx, ly, 4], cyl(lx, ly, 0.9, 0, 9, {}, 14), 2);
  put("funnel", "weigh", [2, 30, 11],
    cyl(2, 30, 6, 11, 1.6, { tone: "hi" }, 36) + cyl(2, 30, 4.6, 9.4, 1.8, { tone: "hi" }, 32) +
    cyl(2, 30, 3.2, 7.8, 1.8, { tone: "hi" }, 28) + k.lineSvg(k.ring(2, 30, 6, 12.6, P, 36), { tone: "lo" }), 4);
  put("stem", "weigh", [2, 30, 6], cyl(2, 30, 1.2, 4, 4, {}, 16), 3);
  put("cup", "mix", [2, 30, 2], cyl(2, 30, 4.5, 0, 4, {}, 32) + k.lineSvg(k.ring(2, 30, 4.5, 4, P, 32), { tone: "lo" }), 5);
  put("fill", "mix", [2, 30, 2.5], `<g data-live="fill">${S(k.cylinder(2, 30, 3.8, 1, 1.4, P, 28), { tone: "hi" })}</g>`, 6);

  // ---- output tablet with four live bars ----
  put("tablet", "mix", [48, 28, 3], box(40, 24, 0, 56, 32, 1.2, { tone: "lo" }, 0.3) + box(40, 24, 1.2, 56, 32, 6.5, {}, 0.4), 4);
  put("tabletface", "mix", [48, 28, 6.5], box(41, 25, 6.5, 55, 31, 7.1, { tone: "hi" }, 0.2), 5);
  for (let b = 0; b < 4; b++) put(`barpost${b}`, "mix", [42.6 + b * 3.2, 28, 7], box(41.6 + b * 3.2, 26.4, 7.1, 43.6 + b * 3.2, 29.6, 7.6, { tone: "lo" }, 0.1), 6);
  put("bars", "mix", [48, 28, 10], `<g data-live="bars"></g>`, 9);

  // ---- temperature dial + knob ----
  put("dial", "weigh", [-52, 28, 1], cyl(-52, 28, 6, 0, 3, { tone: "hi" }, 48) + k.lineSvg(k.ring(-52, 28, 4.9, 3, P, 48), { tone: "lo" }), 4);
  let ticks = "";
  for (let n = 0; n <= 8; n++) {
    const a = -0.75 * Math.PI + (n / 8) * 1.5 * Math.PI;
    ticks += k.lineSvg(k.lineOnTop([-52 + Math.sin(a) * 3.6, 28 - Math.cos(a) * 3.6], [-52 + Math.sin(a) * 4.9, 28 - Math.cos(a) * 4.9], 3, P), { tone: n % 4 === 0 ? "mid" : "lo" });
  }
  put("dialticks", "weigh", [-52, 28, 3], ticks + `<path class="iso-line" data-tone="hi" data-live="needle" d=""/>` + k.lineSvg(k.ring(-52, 28, 0.9, 3, P, 12), { tone: "hi" }), 5);
  put("knob", "weigh", [-52, 20.5, 1], cyl(-52, 20.5, 2.5, 0, 2.6, {}, 24) + k.lineSvg(k.lineOnTop([-52, 20.5], [-52, 23], 2.6, P), { tone: "hi" }), 4);

  // ---- threads (live paths) + dropped coils for masked keys ----
  XS.forEach((xi, i) => {
    put(`thread${i}`, "score", [(xi) / 2, 1, 19], `<g data-live="threadwrap${i}" opacity="1"><path data-live="thread${i}" fill="none" stroke-width="2" stroke-linecap="round" d=""/></g>`, 10);
    const coilPts = [];
    for (let s = 0; s <= 40; s++) {
      const a = (s / 40) * Math.PI * 4;
      coilPts.push([xi + 4.6 + Math.cos(a) * 1.1, -7 + (s / 40) * 3.4, 0.6 + Math.sin(a) * 1.1]);
    }
    const coilD = coilPts.map((p, n) => `${n ? "L" : "M"}${k.iso(p, P).map((v) => v.toFixed(1)).join(" ")}`).join("");
    put(`coil${i}`, "score", [xi + 4.6, -5, 1], `<g data-live="coil${i}" style="display:none">${k.lineSvg(coilD, { tone: "faint" })}</g>`, 7);
  });

  const V = [depth([1, 0, 0]), depth([0, 1, 0]), depth([0, 0, 1])];
  const LABELS = [
    { asm: "query", at: [0, RAIL_Y, 24], dx: -88, dy: -34, follow: "x" },
    { asm: "score", at: [20, POST_Y, 20], dx: 6, dy: -96 },
    { asm: "weigh", at: [2, 30, 14], dx: 66, dy: -76 },
    { asm: "mix", at: [48, 28, 12], dx: 72, dy: -30 },
  ];
  const data = { P, V, XS, POST_Y, RAIL_Y, SH_Z, CARD_Z, EXPLODE, LABELS, CONCEPT, DIAL: [-52, 28, 3.2], items: items.map(({ id, asm, key }) => ({ id, asm, key })) };
  const LABEL = "A loom where a query shuttle sends threads to ten token posts. Thread thickness is the attention weight; cut threads are masked; the funnel and cup mix the values.";
  const body = items.map((item) => `<g data-i="${item.id}" data-asm="${item.asm}">${item.svg}</g>`).join("");
  const svg = k.figureSvg({ width: W, height: H, label: LABEL, body: `${ink.wobbleFilter()}<g data-layer filter="url(#iso-hand)">${body}</g><g data-pills></g>` }).replace("<svg ", "<svg data-ie-svg ");
  const focusOptions = TOKENS.map((t, i) => `<option value="${i}"${i === 2 ? " selected" : ""}>${i}: ${t}</option>`).join("");
  const controls = `
    <button type="button" class="ia-btn" data-ie-run aria-pressed="false">Run</button>
    <button type="button" class="ia-btn" data-ie-step>Step</button>
    <button type="button" class="ia-btn" data-ie-explode aria-pressed="false">Explode</button>
    <button type="button" class="ia-btn" data-ie-reset>Reset</button>
    <label class="ia-field">Focus <select class="ia-select" id="ie-focus">${focusOptions}</select></label>
    <label class="ia-field">Head <select class="ia-select" id="ie-head"><option value="A">A · names</option><option value="B">B · previous</option></select></label>
    <label class="ia-toggle"><input type="checkbox" id="ie-scale" checked> ÷√d</label>
    <label class="ia-toggle"><input type="checkbox" id="ie-causal"> Mask</label>
    <label class="ia-field">Temp <input type="range" class="ia-range" id="ie-temp" min="0.2" max="2" step="0.1" value="1"><span id="ie-tempv">1.0</span></label>`;
  const readouts = [
    { key: "step", label: "Step" },
    { key: "top", label: "Top key" },
    { key: "weight", label: "Top weight" },
    { key: "entropy", label: "Entropy" },
    { key: "sum", label: "Weight sum" },
    { key: "maxscore", label: "Max score" },
  ];
  return { svg, data, css: "", controls, readouts };
}
