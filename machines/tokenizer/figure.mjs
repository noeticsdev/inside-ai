// Inside a tokenizer: a letterpress type-setting bench, built once at build time.
// Dynamic parts (the sort row, the press carriage pose, the needle) are owned
// by live.js; this module builds the bench, the stick, the gantry, the
// 40-drawer type case and the counter dial, plus empty hooks for live groups.
import * as k from "../../kit/iso-kit.mjs";
import * as ink from "../../kit/ink.mjs";


export function figure() {
  const W = 760;
  const H = 470;
  const AZIMUTH = 60;
  const PLATE = { x: -80, y: -42, w: 160, d: 84, r: 5 };
  const CONCEPT = { stick: "SORTS", press: "MERGE", case: "VOCAB", dial: "COUNT" };
  const EXPLODE = { base: [0, 0, 0], stick: [0, 20, 0], press: [0, 0, 24], case: [0, -18, 12], dial: [24, 8, 10] };

  const P = k.fitProjection(
    [...k.boxCorners(PLATE, -17, 0), [0, 0, 46], [-75, -56, 42], [72, 34, 14], [72, -30, 18]],
    W, H, { pad: 22, azimuth: AZIMUTH },
  );
  const depth = (p) => k.depthOf(p, P);
  const S = (paths, style) => ink.inkSolid(paths, { tone: "mid", ...style });
  const box = (x0, y0, z0, x1, y1, z1, style = {}, r = 0.6) =>
    S(k.slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r }, z0, z1 - z0, P, r ? 4 : 1), style);
  const Ln = (d, style = {}) => k.lineSvg(d, { tone: "lo", ...style });
  const Dots = (pts, style = {}) => k.dotsSvg(pts.map((p) => k.iso(p, P)), { size: 0.5, tone: "mid", ...style });

  const items = [];
  function put(id, asm, ref, svg, bias = 0) {
    items.push({ id, asm, key: depth(ref) + bias, svg });
  }

  // ---- base bench ----
  const corners3 = ([x0, y0, z0, x1, y1, z1]) => [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const BODIES = [[-68, 8, 0, 68, 18, 2.5], [-74, -38, 0, 6, -26, 26], [37, -31, 0, 59, -9, 4]];
  put("shadows", "base", [0, 0, -90], BODIES.map((b) => ink.castShadowSvg(corners3(b), P)).join(""), -900);
  put("halo", "base", [0, 0, -95], `<path class="iso-halo" d="${k.haloOf(PLATE, -17, 12, P)}"/>`, -950);
  put("base", "base", [0, 0, -100], S(k.slabOf(PLATE, -5, 5, P, 8, 1.2), { material: "board" }) + ink.silhouetteSvg(k.boxCorners(PLATE, -5, 0), P), -1000);
  put("groove", "base", [0, 0, -40], Ln(k.planOutline(k.insetPlan(PLATE, 6), 0, P), { tone: "faint" }), -500);
  const feetAt = k.corners(PLATE, 13).sort((a, b) => depth([a[0], a[1], 0]) - depth([b[0], b[1], 0]));
  feetAt.forEach(([fx, fy], i) => {
    put(`foot${i}`, "base", [fx, fy, -16], S(k.cylinder(fx, fy, 5.6, -17, 1.8, P, 24), { tone: "lo" }), -800 + i * 0.1);
    put(`pad${i}`, "base", [fx, fy, -14], S(k.cylinder(fx, fy, 4.2, -15.2, 3.4, P, 24), {}), -800 + i * 0.1 + 0.05);
  });
  k.corners(PLATE, 11).forEach(([sx, sy], i) => {
    put(`screw${i}`, "base", [sx, sy, 0], Ln(k.ring(sx, sy, 1.9, 0, P, 16)) + Dots([[sx, sy, 0.2]]), -500 + i * 0.1);
  });
  // gantry floor grooves the press legs slide in
  put("grooveA", "base", [0, 22.7, 0], Ln(k.lineOnTop([-66, 22.7], [66, 22.7], 0, P), { tone: "faint" }), -499);
  put("grooveB", "base", [0, 5.5, 0], Ln(k.lineOnTop([-66, 5.5], [66, 5.5], 0, P), { tone: "faint" }), -499);
  // ruler strip + label plate on the bench front
  const strip = { x: -70, y: 33.5, w: 122, d: 5.5, r: 1 };
  put("ruler", "base", [-9, 36, 0.6], S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }), -400);
  {
    const t = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.7, 0.6, [1.8, 3.2], P);
    put("ticks", "base", [-9, 36, 0.6], k.lineSvg(t.minor, { tone: "lo" }) + k.lineSvg(t.major, { tone: "mid" }), -399);
  }
  const plate2 = { x: -76, y: 22.5, w: 24, d: 9, r: 1 };
  put("plate", "base", [-64, 27, 0.8], S(k.slabOf(plate2, 0, 0.8, P, 3), { tone: "lo" }), -400);
  put("platerules", "base", [-64, 27, 0.8],
    Ln(k.lineOnTop([-73, 26], [-59, 26], 0.8, P), { free: true }) +
    Ln(k.lineOnTop([-73, 28.2], [-63, 28.2], 0.8, P), { free: true }) +
    Dots([[[-73.2, 24.4]], [[-58.8, 24.4]]].map(([p]) => [p[0], p[1], 0.8])), -399);

  // ---- composing stick (rail the sorts stand on) ----
  put("bed", "stick", [0, 13, 1], box(-68, 8, 0, 68, 18, 2.5, {}, 0.8));
  put("bedseam", "stick", [0, 13, 1.4], k.lineSvg(k.sideSeam({ x: -68, y: 8, w: 136, d: 10, r: 1 }, 1.4, P, 4), { tone: "faint" }), 0.2);
  put("fence", "stick", [0, 7, 4], box(-68, 6, 2.5, 68, 8.2, 6, {}, 0.6));
  {
    const t = k.topTicks(-64, 64, 4, 8, 6.5, 6, [1.2, 2.2], P);
    put("fencerule", "stick", [0, 7, 6], k.lineSvg(t.minor, { tone: "lo" }) + k.lineSvg(t.major, { tone: "mid" }), 0.4);
  }
  put("lip", "stick", [0, 18.8, 3], box(-68, 18, 2.5, 68, 19.6, 4.2, { tone: "lo" }, 0.4));
  put("stopL", "stick", [-69, 13, 3.5], box(-71, 6, 0, -67.6, 19.6, 7, {}, 0.6), 1);
  put("stopR", "stick", [69, 13, 3.5], box(67.6, 6, 0, 71, 19.6, 7, {}, 0.6), 1);
  put("stopdots", "stick", [0, 13, 7], Dots([[-69.3, 9.5, 7], [-69.3, 16.5, 7], [69.3, 9.5, 7], [69.3, 16.5, 7]]), 1.2);
  // empty hook the live script fills with the current row of sorts
  put("sortrow", "stick", [0, 11, 5], `<g data-live="sortrow"></g>`, 8);

  // ---- merge press gantry (carriage slides along x; live moves it) ----
  const pressBody =
    box(-2.4, 20.3, 0, 2.4, 24.7, 15, {}, 0.8) +
    box(-2.4, 3.3, 0, 2.4, 7.7, 15, {}, 0.8) +
    box(-2.4, 2.3, 15, 2.4, 25.7, 18, { tone: "lo" }, 0.8);
  put("gantry", "press", [0, 14, 9],
    `<g data-live="carriage">${pressBody}</g>`, 12);
  put("gantrytrim", "press", [0, 14, 16],
    `<g data-live="carriage2">${k.lineSvg(k.sideSeam({ x: -2.4, y: 2.3, w: 4.8, d: 23.4, r: 0.8 }, 16.6, P, 4), { tone: "faint" }) +
    Ln(k.ring(0, 22.5, 2.9, 0.2, P, 24)) + Ln(k.ring(0, 5.5, 2.9, 0.2, P, 24))}</g>`, 12.2);
  put("plunger", "press", [0, 11.5, 11],
    `<g data-live="plunger">${S(k.cylinder(0, 11.5, 1.8, 8, 7, P, 24), { tone: "hi" }) +
    box(-2.8, 8.7, 6.5, 2.8, 14.3, 8, { tone: "hi" }, 0.6) +
    S(k.cylinder(0, 11.5, 3, 18, 2.6, P, 28), {}) +
    k.lineSvg(k.knurl(0, 11.5, 3, 18, 20.6, 30, P), { tone: "lo" }) +
    Ln(k.lineOnTop([-1.5, 11.5], [2.2, 11.5], 20.6, P), { tone: "hi" })}</g>`, 14);

  // ---- type-case cabinet: one drawer per learned merge ----
  put("plinth", "case", [-34, -32, 1], box(-75, -38.6, 0, 7, -25.4, 2.5, { tone: "lo" }, 1));
  put("casebody", "case", [-34, -32, 14], S(k.slabOf({ x: -74, y: -38, w: 80, d: 12, r: 1.2 }, 2.5, 23.5, P, 5, 0.8), {}));
  put("cornice", "case", [-34, -32, 27], box(-75.5, -39, 26, 8.5, -25, 28.5, { tone: "lo" }, 1));
  put("stileL", "case", [-72, -26, 14], box(-74, -26.6, 2.5, -71.4, -25.4, 26, { tone: "lo" }, 0.4), 2);
  put("stileR", "case", [4, -26, 14], box(2.4, -26.6, 2.5, 5, -25.4, 26, { tone: "lo" }, 0.4), 2);
  put("caseplate", "case", [-34, -25.8, 24],
    S(k.slabOf({ x: -46, y: -26.4, w: 24, d: 0.8, r: 0.5 }, 22.6, 1.6, P, 3), { tone: "lo" }), 3);
  // drawer slots (always drawn) + drawer fronts (live reveals what training earned)
  const DX0 = -70.2, DZ0 = 4.2, CW = 9.3, CH = 3.9;
  {
    let slots = "";
    for (let i = 0; i < 40; i++) {
      const col = i % 8, row = Math.floor(i / 8);
      const x = DX0 + col * CW, z = DZ0 + (4 - row) * CH;
      slots += k.segment([x, -25.9, z], [x + 8.5, -25.9, z], P) + k.segment([x, -25.9, z + 3.1], [x + 8.5, -25.9, z + 3.1], P);
    }
    put("slots", "case", [-34, -26, 12], k.lineSvg(slots, { tone: "faint" }), 1);
  }
  for (let i = 0; i < 40; i++) {
    const col = i % 8, row = Math.floor(i / 8);
    const x = DX0 + col * CW, z = DZ0 + (4 - row) * CH;
    const front =
      S(k.slabOf({ x, y: -26.9, w: 8.5, d: 1, r: 0.35 }, z, 3.1, P, 2), { tone: "hi" }) +
      box(x + 2.6, -26.5, z + 2.2, x + 5.9, -25.9, z + 2.7, { tone: "lo" }, 0.25);
    put(`drawer${i}`, "case", [x + 4.25, -26, z + 1.5], `<g data-live="drawer${i}" style="display:none">${front}</g>`, 2.5 + (i % 8) * 0.01);
  }

  // ---- counter dial: token count ----
  const DCX = 46, DCY = -18, DCR = 10.5;
  put("dialpost", "dial", [DCX + 13.5, DCY, 3], box(DCX + 12, DCY - 1.6, 0, DCX + 15, DCY + 1.6, 6, {}, 0.5), 1);
  put("dialarm", "dial", [DCX + 7, DCY, 4.6], box(DCX + 1, DCY - 1.1, 4, DCX + 13.5, DCY + 1.1, 5.2, {}, 0.4), 1.2);
  put("dialpuck", "dial", [DCX, DCY, 2], S(k.cylinder(DCX, DCY, DCR, 0, 4, P, 56, 0.7), { tone: "hi" }), 0);
  put("dialknurl", "dial", [DCX, DCY, 1], k.lineSvg(k.knurl(DCX, DCY, DCR, 0.6, 4, 72, P, 0.3), { tone: "lo" }), 0.1);
  put("dialseam", "dial", [DCX, DCY, 1], k.lineSvg(k.sideArc(DCX, DCY, DCR, 0.6, P, 40), { tone: "faint" }), 0.15);
  put("dialface", "dial", [DCX, DCY, 4],
    Ln(k.ring(DCX, DCY, DCR - 2, 4, P, 56)) + `<path class="iso-line" data-tone="mid" data-live="needle" d=""/>` +
    S(k.cylinder(DCX, DCY, 1.3, 4, 0.7, P, 16), { tone: "hi" }), 0.3);
  {
    const t = k.radialTicks(DCX, DCY, DCR - 2.9, 36, 6, 4, [1.1, 2.2], P);
    put("dialticks", "dial", [DCX, DCY, 4], k.lineSvg(t.minor, { tone: "lo" }) + k.lineSvg(t.major, { tone: "mid" }), 0.25);
  }
  put("dialcrown", "dial", [DCX + 12.4, DCY, 6.8],
    box(DCX + 11.4, DCY - 2.6, 6, DCX + 13.4, DCY + 2.6, 7.6, {}, 0.4) +
    S(k.cylinder(DCX + 12.4, DCY, 2, 7.6, 2.4, P, 24), {}) +
    k.lineSvg(k.knurl(DCX + 12.4, DCY, 2, 7.6, 10, 20, P), { tone: "lo" }), 1.4);

  const LABELS = [
    { asm: "stick", at: [-46, 13, 8.5], dx: -84, dy: -58 },
    { asm: "press", at: [54, 14, 6], dx: 30, dy: -105 },
    { asm: "case", at: [-52, -32, 28.5], dx: -40, dy: -64 },
    { asm: "dial", at: [46, -18, 5], dx: 78, dy: -46 },
  ];
  const V = [depth([1, 0, 0]), depth([0, 1, 0]), depth([0, 0, 1])];
  const data = {
    P, V, EXPLODE, LABELS, CONCEPT,
    STICK: { x0: -65, x1: 53, y0: 9.2, d: 5.6, z0: 2.5, h: 7, w0: 1.5, wk: 4.0, gap: 0.5, max: 20, moreWidth: 17 },
    PRESS: { home: 62, y: 11.5 },
    DIAL: [DCX, DCY, 4.2, 60],
    DRAWERS: 40,
    items: items.map(({ id, asm, key }) => ({ id, asm, key })),
  };
  const LABEL = "A letterpress bench: a composing stick holding a row of type sorts, a merge press on a sliding gantry, a forty-drawer type case of learned pieces, and a counter dial.";
  const body = items.map((item) => `<g data-i="${item.id}" data-asm="${item.asm}">${item.svg}</g>`).join("");
  const svg = k.figureSvg({ width: W, height: H, label: LABEL, body: `${ink.wobbleFilter()}<g data-layer filter="url(#iso-hand)">${body}</g><g data-pills></g>` }).replace("<svg ", "<svg data-ie-svg ");
  const controls = `
    <button type="button" class="ia-btn" data-ie-run aria-pressed="false">Run</button>
    <button type="button" class="ia-btn" data-ie-step>Step</button>
    <button type="button" class="ia-btn" data-ie-explode aria-pressed="false">Explode</button>
    <button type="button" class="ia-btn" data-ie-reset>Reset</button>
    <label class="ia-field">Merges <input type="range" class="ia-range" id="ie-merges" min="0" max="40" step="1" value="10"> <output id="ie-merges-val" for="ie-merges">10</output></label>
    <label class="ia-field">Text <select class="ia-select" id="ie-preset"><option value="english">English (close to training)</option><option value="code">Python line</option><option value="hindi">Hindi sentence</option><option value="rare">Rare long word</option></select></label>`;
  const readouts = [
    { key: "tokens", label: "Tokens" },
    { key: "chars", label: "Characters" },
    { key: "cpt", label: "Chars / token" },
    { key: "vocab", label: "Vocabulary" },
    { key: "last", label: "Last merge" },
  ];
  const css = `.iso-face-text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
    [data-sort] .iso-top{fill:#faf7e9!important}
    [data-sort] .iso-shade{fill:#d9d3c0!important}
    [data-sort] .iso-edge{stroke:#26304a!important}
    [data-sort] .iso-face-text{fill:#141b2c!important;font-weight:800;letter-spacing:0}
    [data-sort][data-fused] .iso-top{fill:#c9bfff!important}
    [data-sort][data-fused] .iso-shade{fill:#a999f0!important}`;
  return { svg, data, css, controls, readouts };
}
