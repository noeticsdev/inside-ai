// Inside a RAG pipeline: a library card-catalog factory on a bench.
// Sheets ride a guillotine into cards, a press stamps each vector, cards pile
// on a drawer cabinet, a gantry magnet pulls top-k onto a prompt tray with a
// budget dial, and a printer types the cited answer. Static geometry, Hero tier.
import * as k from "../../kit/iso-kit.mjs";
import * as ink from "../../kit/ink.mjs";

export function figure() {
  const W = 760;
  const H = 470;
  const AZIMUTH = 60;
  const PLATE = { x: -80, y: -26, w: 150, d: 66, r: 4 };
  const STOPS = { cutter: -62, press: -38, index: -12, arm: 2, tray: 18, printer: 48 };
  const CONCEPT = { cutter: "CHUNK", press: "EMBED", index: "INDEX", arm: "RETRIEVE", tray: "BUDGET", printer: "ANSWER" };
  const EXPLODE = {
    base: [0, 0, 0],
    rail: [0, 0, 0],
    cutter: [-16, -8, 8],
    press: [-6, -10, 16],
    index: [0, -4, 24],
    arm: [0, -10, 34],
    tray: [10, 2, 14],
    printer: [18, 8, 8],
  };

  const P = k.fitProjection(
    [...k.boxCorners(PLATE, -8, 0), [-78, -50, 30], [-44, -52, 44], [-12, -46, 58], [2, -52, 64], [28, -40, 44], [66, -34, 34], [0, 30, 60]],
    W,
    H,
    { pad: 22, azimuth: AZIMUTH },
  );
  const depth = (p) => k.depthOf(p, P);
  const S = (paths, style) => ink.inkSolid(paths, { tone: "mid", ...style });
  const box = (x0, y0, z0, x1, y1, z1, style = {}, r = 0.6) =>
    S(k.slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r }, z0, z1 - z0, P, r ? 3 : 1), style);
  const cyl = (cx, cy, r, z, h, style = {}, steps = 24) => S(k.cylinder(cx, cy, r, z, h, P, steps), style);

  const items = [];
  function put(id, asm, ref, svg, bias = 0) {
    items.push({ id, asm, key: depth(ref) + bias, svg });
  }

  const LABELS = [
    { asm: "cutter", at: [-62, -14, 24], dx: -84, dy: -96 },
    { asm: "press", at: [-38, -12, 27], dx: -34, dy: -118 },
    { asm: "index", at: [-12, -4, 22], dx: 6, dy: -128 },
    { asm: "arm", at: [2, -16, 30], dx: 52, dy: -108 },
    { asm: "tray", at: [24, 2, 8], dx: 84, dy: -72 },
    { asm: "printer", at: [48, 0, 14], dx: 96, dy: -40 },
  ];

  const bodies = [
    [-72, -18, 0, -51, 4, 23],
    [-48, -14, 0, -27, 4, 24],
    [-23, -15, 0, -1, 7, 18],
    [-24, -17, 0, 30, -13, 27],
    [8, -8, 0, 28, 10, 5],
    [36, -10, 0, 60, 14, 10],
  ];
  const corners3 = ([x0, y0, z0, x1, y1, z1]) => [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  put("shadows", "base", [0, 0, -90], bodies.map((b) => ink.castShadowSvg(corners3(b), P)).join(""), -900);

  // ---- base: plate, feet, screws, ruler, label ----
  put("base", "base", [0, 0, -100], S(k.slabOf(PLATE, -5, 5, P, 6, 1), { material: "board" }) + ink.silhouetteSvg(k.boxCorners(PLATE, -5, 0), P), -1000);
  for (const [i, [fx, fy]] of [[-68, -18], [58, -18], [-68, 32], [58, 32]].entries()) {
    put(`foot${i}`, "base", [fx, fy, -7], cyl(fx, fy, 6, -9, 1.6, { tone: "lo" }) + cyl(fx, fy, 4.4, -7.4, 2.6, {}, 20), -950 + i * 0.1);
  }
  put("plate-screws", "base", [0, 30, 0], k.dotsSvg(k.dotGrid(-70, 35, 8, 1, 18, 0.2, P), { size: 0.55, tone: "lo" }), -940);
  const rule = k.topTicks(-68, 56, 4, 5, 37.5, 0.1, [1.6, 3], P);
  put("ruler", "base", [0, 38, 0], k.lineSvg(rule.minor, { tone: "lo" }) + k.lineSvg(rule.major, { tone: "mid" }), -930);
  put("plate-tag", "base", [-58, 30, 0], k.faceTextSvg(k.topMatrix([-72, 30.5], 0.15, P), "RAG-1  CARD CATALOG", { size: 3.4, tone: "mid" }), -920);

  // ---- cutter: guillotine ----
  put("cut-bed", "cutter", [-62, -6, 1], box(-72, -16, 0, -52, 4, 2, { tone: "hi" }, 0.5) + box(-52, -12, 0, -44, 0, 1, { tone: "lo" }, 0.3), -100);
  put("cut-fence", "cutter", [-62, -17, 4], box(-72, -18.5, 2, -52, -16, 6, {}, 0.3), -90);
  const fticks = k.topTicks(-70, -54, 2, 4, -17.8, 6.05, [0.8, 1.6], P);
  put("cut-scale", "cutter", [-62, -17, 6], k.lineSvg(fticks.minor, { tone: "lo" }) + k.lineSvg(fticks.major, { tone: "mid" }), -80);
  put("cut-post-l", "cutter", [-70, -13, 9], box(-71.5, -14.5, 2, -69, -12, 16, { tone: "lo" }, 0.3), -70);
  put("cut-post-r", "cutter", [-54, -13, 9], box(-55.5, -14.5, 2, -53, -12, 16, { tone: "lo" }, 0.3), -70);
  put("cut-beam", "cutter", [-62, -13, 17.5], box(-72.5, -15, 16, -51.5, -11.5, 19, { tone: "lo" }, 0.4), -60);
  put("cut-blade", "cutter", [-61, -12.8, 10], box(-70, -13.6, 8, -53, -12.4, 13, { tone: "hi" }, 0.2), 6);
  put("cut-blade-edge", "cutter", [-61, -13, 7.8], box(-70, -13.7, 7.2, -53, -12.9, 8, { tone: "lo" }, 0), 6.2);
  put("cut-edge", "cutter", [-62, 0, 2.3], box(-72, 1.2, 2, -52, 2.4, 2.7, { tone: "lo" }, 0), -50);
  put("cut-lever", "cutter", [-62, -6, 20], box(-62.9, -14, 19, -61.3, -2, 20.4, { tone: "hi" }, 0.2), 4);
  put("cut-knob", "cutter", [-62, -1, 22], cyl(-62.1, -1, 1.7, 20.4, 2.6, {}, 20) + k.lineSvg(k.knurl(-62.1, -1, 1.7, 20.6, 22.8, 12, P), { tone: "lo" }), 5);
  put("cut-sheet", "cutter", [-62, -6, 2.6], box(-70, -12, 2.7, -54, 0, 3.4, { tone: "hi" }, 0.2), 3);
  put("cut-sheet2", "cutter", [-62, -6, 3.4], box(-69, -11, 3.4, -55, -1, 3.9, { tone: "hi" }, 0.2), 3.2);
  for (let i = 0; i < 3; i++) {
    put(`cutcard${i}`, "cutter", [-48 + i * 0.4, -6, 1.4], `<g data-live="cutcard${i}" style="display:none">${box(-51, -11, 1 + i * 0.02, -45, -1, 1.55 + i * 0.02, { tone: "hi" }, 0.2)}</g>`, 3.4 + i * 0.1);
  }
  put("cut-screws", "cutter", [-62, 3, 2], k.dotsSvg(k.dotGrid(-70, 2.6, 5, 1, 4, 2.05, P), { size: 0.45, tone: "lo" }), -40);

  // ---- press: embossing stamp ----
  put("press-base", "press", [-38, -5, 1.2], box(-48, -14, 0, -28, 4, 2.5), -100);
  put("press-sub", "press", [-38, -5, 3], box(-45, -11, 2.5, -31, 1, 3.5, { tone: "lo" }, 0.3), -90);
  put("press-col-l", "press", [-46, -10, 11], box(-47.5, -11.5, 3.5, -45, -9, 18, {}, 0.3), -70);
  put("press-col-r", "press", [-30, -10, 11], box(-31, -11.5, 3.5, -28.5, -9, 18, {}, 0.3), -70);
  put("press-crown", "press", [-38, -10, 19.5], box(-48, -12.5, 18, -28, -7.5, 21, { tone: "lo" }, 0.4), -60);
  put("press-ped", "press", [-30, 8, 3], cyl(-30, 8, 1, 0, 6, { tone: "lo" }, 14) + cyl(-30, 8, 0.8, 7.2, 1.4, {}, 12), 5.2);
  put("press-wheel", "press", [-30, 8, 6.6], S(k.cylinder(-30, 8, 3.2, 6, 1.2, P, 32), {}) + k.lineSvg([0, 1, 2].map((s) => { const a = (s / 3) * Math.PI; return k.lineOnTop([-30 - Math.cos(a) * 3, 8 - Math.sin(a) * 3], [-30 + Math.cos(a) * 3, 8 + Math.sin(a) * 3], 7.25, P); }).join(""), { tone: "lo" }), 5.3);
  put("press-head", "press", [-38, -5, 14], box(-44, -10, 12, -32, 0, 16, { tone: "hi" }, 0.4), 6);
  put("press-die", "press", [-38, -5, 4.2], box(-43, -9, 3.5, -33, -1, 5, { tone: "hi" }, 0.2), 4);
  put("press-dots", "press", [-38, -5, 5], k.dotsSvg(k.dotGrid(-41.5, -7.5, 6, 4, 1.7, 5.05, P), { size: 0.4, tone: "mid" }), 4.5);
  put("press-crank", "press", [-26, -10, 19.5], cyl(-26, -10, 1.8, 18, 3, {}, 20) + k.lineSvg(k.knurl(-26, -10, 1.8, 18.2, 20.8, 12, P), { tone: "lo" }), 5);
  put("press-pcard", "press", [-38, -5, 5.3], `<g data-live="pcard" style="display:none">${box(-42, -8, 5, -34, -2, 5.55, { tone: "hi" }, 0.2)}</g>`, 5.2);
  put("press-lamp-post", "press", [-44, -10, 22], cyl(-44, -10, 0.7, 21, 2.4, { tone: "lo" }, 12), 5.4);
  put("press-lamp", "press", [-44, -10, 24], `<g data-live="presslamp">${cyl(-44, -10, 1.3, 23.4, 1.4, { material: "lamp" }, 16)}</g>`, 5.6);
  put("press-seam", "press", [-38, 4, 1.2], k.lineSvg(k.sideSeam({ x: -48, y: -14, w: 20, d: 18, r: 0.6 }, 1.4, P), { tone: "mid" }), -95);
  put("press-screws", "press", [-38, 3, 2.5], k.dotsSvg(k.dotGrid(-46, 2.4, 5, 1, 4, 2.55, P), { size: 0.45, tone: "lo" }), -40);

  // ---- index: drawer cabinet with an open card well on top ----
  put("cab-plinth", "index", [-12, -4, 0.7], box(-23, -15, 0, -1, 7, 1.5, { tone: "lo" }, 0.3), -100);
  put("cab-body", "index", [-12, -4, 8], box(-22, -14, 1.5, -2, 6, 15), -90);
  put("cab-rim", "index", [-12, -4, 15.6], box(-22.5, -14.5, 15, -1.5, 6.5, 16.2, { tone: "lo" }, 0.3), -80);
  put("cab-rim-f", "index", [-12, 5, 17], box(-20, 4, 16.2, -4, 5.4, 17.6, {}, 0.2), -70);
  put("cab-rim-b", "index", [-12, -13, 17], box(-20, -13.4, 16.2, -4, -12, 17.6, {}, 0.2), -70);
  put("cab-rim-l", "index", [-21, -4, 17], box(-21.4, -12, 16.2, -20, 4, 17.6, {}, 0.2), -70);
  put("cab-rim-r", "index", [-3, -4, 17], box(-4, -12, 16.2, -2.6, 4, 17.6, {}, 0.2), -70);
  for (let i = 0; i < 6; i++) {
    put(`cabcard${i}`, "index", [-12, -4, 16.4 + i * 0.5], `<g data-live="cabcard${i}" style="display:none">${box(-19, -11, 16.3 + i * 0.55, -5, 3, 16.85 + i * 0.55, { tone: "hi" }, 0.2)}</g>`, 3 + i * 0.15);
  }
  for (let i = 0; i < 4; i++) {
    const z0 = 2.6 + i * 3.1;
    put(`drawer${i}`, "index", [-12, 6, z0 + 1.2], box(-20, 5.6, z0, -4, 6.6, z0 + 2.6, { tone: "hi" }, 0.3), 8);
    put(`dhandle${i}`, "index", [-12, 6.6, z0 + 1.3], box(-17, 6.4, z0 + 0.9, -7, 7.4, z0 + 1.7, { tone: "lo" }, 0.3), 8.5);
    put(`dlabel${i}`, "index", [-12, 6.6, z0 + 2], box(-15, 6.5, z0 + 1.85, -9, 6.9, z0 + 2.35, { material: "board" }, 0), 8.6);
  }
  put("cab-seam", "index", [-22, -4, 8], k.lineSvg(k.sideSeam({ x: -22, y: -14, w: 20, d: 20, r: 0.6 }, 8, P), { tone: "mid" }), -95);
  put("cab-screws", "index", [-12, 6.6, 14], k.dotsSvg([k.iso([-20.5, 6.7, 13.6], P), k.iso([-3.5, 6.7, 13.6], P)].map(([x, y]) => [x, y]), { size: 0.45, tone: "lo" }), 8.7);

  // ---- arm: gantry with a magnet trolley ----
  put("arm-post-a", "arm", [-23, -15, 13], box(-24.5, -16.5, 0, -22, -14, 26, {}, 0.3), -60);
  put("arm-post-b", "arm", [29, -15, 13], box(27.5, -16.5, 0, 30, -14, 26, {}, 0.3), -60);
  put("arm-beam", "arm", [3, -15, 25.2], box(-25, -17, 24, 31, -13.5, 26.5, { tone: "lo" }, 0.4), -50);
  const bticks = k.topTicks(-22, 28, 2.5, 4, -14.2, 26.55, [0.8, 1.6], P);
  put("arm-ticks", "arm", [3, -14, 26.5], k.lineSvg(bticks.minor, { tone: "lo" }) + k.lineSvg(bticks.major, { tone: "mid" }), -40);
  put("arm-stop-a", "arm", [-22, -15, 24.5], box(-23, -16.5, 23, -21, -14, 24.5, { tone: "hi" }, 0.2), -45);
  put("arm-stop-b", "arm", [28, -15, 24.5], box(27, -16.5, 23, 29, -14, 24.5, { tone: "hi" }, 0.2), -45);
  put("arm-motor", "arm", [-23, -15, 27.5], box(-26, -17, 26.5, -20, -13, 29, {}, 0.3), -44);
  put("arm-knob", "arm", [-23, -12, 28], cyl(-23, -12.2, 1.4, 27, 2, {}, 16), -43);
  put("arm-trolley", "arm", [2, -15, 25], box(-1.5, -17, 23, 5.5, -13.5, 25, { tone: "hi" }, 0.3), 6);
  put("arm-rod", "arm", [2, -15, 21], box(1.4, -15.6, 17, 2.6, -14.4, 23.5, { tone: "lo" }, 0), 7);
  put("arm-magnet", "arm", [2, -15, 16.2], cyl(2, -15, 2.6, 15.2, 1.6, { material: "ride" }, 28), 8);
  put("arm-card", "arm", [2, -15, 14], `<g data-live="armcard" style="display:none">${box(-2, -19, 13.4, 6, -11, 13.95, { tone: "hi" }, 0.2)}</g>`, 8.5);

  // ---- tray: prompt tray with a budget dial ----
  put("tray-base", "tray", [18, 1, 0.7], box(8, -8, 0, 28, 10, 1.5), -100);
  put("tray-wall-b", "tray", [18, -7.4, 2.7], box(8, -8, 1.5, 28, -6.8, 4, { tone: "lo" }, 0.2), -90);
  put("tray-wall-f", "tray", [18, 9.4, 2.7], box(8, 8.8, 1.5, 28, 10, 4, { tone: "lo" }, 0.2), -80);
  put("tray-wall-l", "tray", [8.6, 1, 2.7], box(8, -6.8, 1.5, 9.2, 8.8, 4, { tone: "lo" }, 0.2), -85);
  put("tray-wall-r", "tray", [27.4, 1, 2.7], box(26.8, -6.8, 1.5, 28, 8.8, 4, { tone: "lo" }, 0.2), -85);
  for (let i = 0; i < 4; i++) {
    put(`traycard${i}`, "tray", [18, 1, 1.7 + i * 0.55], `<g data-live="traycard${i}" style="display:none">${box(11, -5, 1.6 + i * 0.6, 25, 7, 2.15 + i * 0.6, { tone: "hi" }, 0.2)}</g>`, 3 + i * 0.15);
  }
  put("tray-tipped", "tray", [33, 1, 0.4], `<g data-live="tipped" style="display:none">${box(28.5, -4, 0.1, 40.5, 6, 0.65, { tone: "hi" }, 0.2)}</g>`, 2.5);
  put("gauge-base", "tray", [33, -11, 1], cyl(33, -11, 6.4, 0, 1.6, { tone: "lo" }, 40), -70);
  put("gauge-face", "tray", [33, -11, 2.2], cyl(33, -11, 5.3, 1.6, 1.2, { tone: "hi" }, 40), -69);
  const gticks = k.radialTicks(33, -11, 4.7, 12, 3, 2.85, [0.7, 1.3], P);
  put("gauge-ticks", "tray", [33, -11, 2.8], k.lineSvg(gticks.minor, { tone: "lo" }) + k.lineSvg(gticks.major, { tone: "mid" }), -68);
  put("gauge-needle", "tray", [33, -11, 2.9], `<path class="iso-line" data-tone="hi" data-live="needle" d=""/>` + S(k.cylinder(33, -11, 0.7, 2.8, 0.4, P, 12), { tone: "hi" }), -67);

  // ---- printer: answer press with citation tab ----
  put("print-body", "printer", [48, 2, 3.5], box(36, -10, 0, 60, 14, 7, {}, 0.5), -100);
  put("print-cover", "printer", [48, 2, 8], box(37.5, -8.5, 7, 58.5, 12.5, 9, { tone: "hi" }, 0.4), -90);
  put("print-slot", "printer", [48, 0, 9.1], box(40, -0.8, 9, 56, 0.8, 9.5, { tone: "lo" }, 0), -80);
  put("print-roller", "printer", [48, 12, 5.7], box(37, 10.5, 5, 59, 12.5, 6.6, { tone: "lo" }, 0.3), -70);
  put("print-knob-l", "printer", [35, 11.5, 6.5], cyl(35, 11.5, 1.6, 5, 2.6, {}, 18), -69);
  put("print-knob-r", "printer", [61, 11.5, 6.5], cyl(61, 11.5, 1.6, 5, 2.6, {}, 18), -69);
  put("print-paper", "printer", [48, 0, 14], `<g data-live="paper" style="display:none">${box(41, -0.5, 9.5, 55, 0.5, 20, { tone: "hi" }, 0.1)}</g>`, 6);
  put("print-lines", "printer", [48, 0.6, 15], `<g data-live="plines" style="display:none">${[13, 15, 17].map((z) => k.lineSvg(k.lineOnTop([42.5, 0.62], [53.5, 0.62], z, P), { tone: "mid" })).join("")}</g>`, 6.5);
  put("print-ctab", "printer", [58, 0, 11], `<g data-live="ctab" style="display:none">${box(55.2, -0.5, 10.5, 60.5, 0.5, 12.5, { material: "ride" }, 0.1)}</g>`, 7);
  put("print-lamp", "printer", [56, -6, 9.6], `<g data-live="printlamp">${cyl(56, -6, 1.2, 9, 1.3, { material: "lamp" }, 16)}</g>`, 7.5);
  put("print-out", "printer", [48, 17, 0.5], box(38, 14, 0, 58, 20, 1, { tone: "lo" }, 0.3), -95);
  put("print-vents", "printer", [48, 14, 4], [2.5, 3.7, 4.9].map((z) => k.lineSvg(k.segment([39, 14.05, z], [57, 14.05, z], P), { tone: "mid" })).join(""), -60);
  put("print-feet", "printer", [48, 2, -0.5], box(38, -8, -1.6, 42, -4, 0, { tone: "lo" }, 0.2) + box(54, -8, -1.6, 58, -4, 0, { tone: "lo" }, 0.2), -98);
  put("print-screws", "printer", [48, 13, 7], k.dotsSvg(k.dotGrid(39, 12.6, 6, 1, 3.6, 6.2, P), { size: 0.45, tone: "lo" }), -65);

  const V = [depth([1, 0, 0]), depth([0, 1, 0]), depth([0, 0, 1])];
  const data = {
    P,
    V,
    STOPS,
    EXPLODE,
    LABELS,
    CONCEPT,
    DIAL: [33, -11, 3.1],
    ARM: { cabinet: -12, tray: 18, up: 0, down: -7 },
    items: items.map(({ id, asm, key }) => ({ id, asm, key })),
  };
  const LABEL =
    "A card-catalog factory: a guillotine cuts sheets into cards, a press stamps vectors, a cabinet files them, a gantry magnet pulls cards onto a tray with a budget dial, and a printer types the cited answer.";
  const body = items.map((item) => `<g data-i="${item.id}" data-asm="${item.asm}">${item.svg}</g>`).join("");
  const svg = k
    .figureSvg({ width: W, height: H, label: LABEL, body: `${ink.wobbleFilter()}<g data-layer filter="url(#iso-hand)">${body}</g><g data-pills></g>` })
    .replace("<svg ", "<svg data-ie-svg ");
  const controls = `
    <button type="button" class="ia-btn" data-ie-run aria-pressed="false">Run</button>
    <button type="button" class="ia-btn" data-ie-step>Step</button>
    <button type="button" class="ia-btn" data-ie-explode aria-pressed="false">Explode</button>
    <button type="button" class="ia-btn" data-ie-reset>Reset</button>
    <label class="ia-field">Question <select class="ia-select" id="ie-q"><option value="leave">Leave days?</option><option value="expenses">Dinner receipts?</option><option value="laptop">New laptop?</option><option value="twopart">Leave + dinner (two-part)</option><option value="unanswerable">Twins parental pay (unanswerable)</option></select></label>
    <label class="ia-field">Chunk size <input type="range" class="ia-range" id="ie-cs" min="6" max="40" step="2" value="24"><span data-v="ie-cs">24</span></label>
    <label class="ia-field">Overlap <input type="range" class="ia-range" id="ie-ov" min="0" max="12" step="2" value="6"><span data-v="ie-ov">6</span></label>
    <label class="ia-field">Top-k <input type="range" class="ia-range" id="ie-k" min="1" max="4" step="1" value="1"><span data-v="ie-k">1</span></label>
    <label class="ia-field">Budget <input type="range" class="ia-range" id="ie-b" min="40" max="320" step="20" value="160"><span data-v="ie-b">160</span></label>
    <label class="ia-toggle"><input type="checkbox" id="ie-g" checked> Guardrail</label>`;
  const readouts = [
    { key: "chunks", label: "Cards indexed" },
    { key: "score", label: "Top score" },
    { key: "tokens", label: "Tokens packed" },
    { key: "status", label: "Answer" },
    { key: "cite", label: "Citation" },
  ];
  return { svg, data, css: "", controls, readouts };
}
