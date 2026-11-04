// Reference machine figure: static isometric geometry, built once at build time.
// Returns { svg, data, css, controls, readouts } for the platform shell (AGENTS.md, "figure.mjs").
import * as k from "../../kit/iso-kit.mjs";
import * as ink from "../../kit/ink.mjs";

export function figure() {
  const W = 720;
  const H = 440;
  const AZIMUTH = 60;
  const PLATE = { x: -72, y: -38, w: 144, d: 68, r: 4 };
  const STOPS = { intake: -48, cache: -16, origin: 16, exit: 48 };
  const CONCEPT = { intake: "REQUEST", cache: "CACHE", origin: "ORIGIN", exit: "RESPONSE" };
  const EXPLODE = { base: [0, 0, 0], rail: [0, 0, 0], intake: [-16, -8, 10], cache: [-2, -14, 20], origin: [12, -16, 28], exit: [16, 14, 6], carriage: [0, 0, 18] };

  const P = k.fitProjection([...k.boxCorners(PLATE, -5, 0), [16, -30, 36], [-16, -34, 30], [28, -46, 64], [-18, -50, 50], [-74, -46, 26]], W, H, { pad: 20, azimuth: AZIMUTH });
  const depth = (p) => k.depthOf(p, P);
  const S = (paths, style) => ink.inkSolid(paths, { tone: "mid", ...style });
  const box = (x0, y0, z0, x1, y1, z1, style = {}, r = 0.6) => S(k.slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r }, z0, z1 - z0, P, r ? 3 : 1), style);

  const items = [];
  function put(id, asm, ref, svg, bias = 0) {
    items.push({ id, asm, key: depth(ref) + bias, svg });
  }

  const LABELS = [
    { asm: "intake", at: [-48, -21, 16], dx: -10, dy: -70 },
    { asm: "cache", at: [-16, -33, 27], dx: 0, dy: -46 },
    { asm: "origin", at: [16, -27, 34], dx: 10, dy: -40 },
    { asm: "exit", at: [48, 20, 4], dx: 64, dy: -14 },
  ];
  const BODIES = [[-58, -28, 0, -38, -14, 16], [-26, -36, 0, -6, -12, 27], [6, -32, 0, 26, -12, 34]];
  const corners3 = ([x0, y0, z0, x1, y1, z1]) => [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  put("shadows", "base", [0, 0, -90], BODIES.map((b) => ink.castShadowSvg(corners3(b), P)).join(""), -900);

  put("base", "base", [0, 0, -100], S(k.slabOf(PLATE, -5, 5, P, 6, 1), { material: "board" }) + ink.silhouetteSvg(k.boxCorners(PLATE, -5, 0), P), -1000);
  put("rail", "rail", [0, 0, -50], box(-62, -2.5, 0, 62, 2.5, 1.5, { tone: "lo" }, 0) + Object.values(STOPS).map((x) => k.lineSvg(k.lineOnTop([x, -2.5], [x, 2.5], 1.5, P), { tone: "faint" })).join(""), -500);

  put("intake", "intake", [-48, -21, 8], box(-58, -28, 0, -38, -14, 16) + box(-51, -14, 6, -45, -2.5, 7, { tone: "lo" }, 0));

  put("cache", "cache", [-16, -21, 5], box(-26, -30, 0, -6, -12, 10) + box(-18, -36, 0, -14, -32, 27, {}, 0.4));
  put("cache-arm", "cache", [-16, -16, 25], box(-18, -36, 25, -14, 0, 28, { tone: "hi" }, 0.4), 4);
  put("probe", "cache", [-16, 0, 20], box(-19, -3, 18, -13, 3, 25, { tone: "hi" }), 6);
  for (let i = 0; i < 3; i++) {
    put(`bin${i}`, "cache", [-16, -27 + i * 4, 13], `<g data-live="bin${i}" style="display:none">${box(-21, -27 + i * 4, 10, -11, -26.2 + i * 4, 17, { tone: "hi" }, 0)}</g>`, 3 + 0.1 * i);
  }
  const dial = [-32, 19];
  const dialSvg = S(k.cylinder(dial[0], dial[1], 6, 0, 2, P, 40)) + k.lineSvg(k.ring(dial[0], dial[1], 4.6, 2, P, 40), { tone: "lo" });
  const ticks = [0, 1, 2, 3].map((n) => tickOf(n / 3)).join("");
  put("gauge", "cache", [dial[0], dial[1], 1], dialSvg + k.lineSvg(ticks, { tone: "mid" }) + `<path class="iso-line" data-tone="hi" data-live="needle" d=""/>` + S(k.cylinder(dial[0], dial[1], 0.8, 2, 0.4, P, 12), { tone: "hi" }));
  function tickOf(share) {
    const a = -0.75 * Math.PI + share * 1.5 * Math.PI;
    return k.lineOnTop([dial[0] + Math.sin(a) * 4.6, dial[1] - Math.cos(a) * 4.6], [dial[0] + Math.sin(a) * 6, dial[1] - Math.cos(a) * 6], 2, P);
  }

  put("origin", "origin", [16, -21, 10], box(6, -32, 0, 26, -12, 6) + box(12, -30, 6, 20, -24, 34, { tone: "mid" }, 0.4));
  put("origin-arm", "origin", [16, -12, 30], box(13, -24, 28, 19, 4, 32, { tone: "hi" }, 0.4) + `<path class="iso-line" data-tone="mid" data-live="rod" style="stroke-width:1.4" d=""/>`, 4);
  put("head", "origin", [16, 0, 22], box(13.5, -3, 19, 18.5, 3, 25, { tone: "hi" }), 6);

  put("exit", "exit", [48, 20, 1], box(40, 13, 0, 56, 27, 1.5, { tone: "lo" }) + box(40, 26, 1.5, 56, 27, 4, {}, 0));
  for (let i = 0; i < 3; i++) {
    put(`tray${i}`, "exit", [48, 19, 2 + i], `<g data-live="tray${i}" style="display:none">${box(43, 15, 1.5 + i * 0.8, 53, 23, 2.1 + i * 0.8, { tone: "hi" }, 0.2)}</g>`, 3 + 0.1 * i);
  }

  put("carriage", "carriage", [0, 0, 6], S(k.cylinder(0, 0, 6, 1.5, 3, P, 40)) + box(-4, -0.4, 4.5, 4, 0.4, 15, { tone: "hi" }, 0), 0);

  const V = [depth([1, 0, 0]), depth([0, 1, 0]), depth([0, 0, 1])];
  const data = { P, V, STOPS, EXPLODE, LABELS, CONCEPT, DIAL: [dial[0], dial[1], 2.4], ROD: [16, 0, 28, 25], items: items.map(({ id, asm, key }) => ({ id, asm, key })) };
  const LABEL = "A shuttle on a rail carries a request card past a cache bin with a probe, an origin press and a response tray. A dial counts cache hits.";
  const body = items.map((item) => `<g data-i="${item.id}" data-asm="${item.asm}">${item.svg}</g>`).join("");
  const svg = k.figureSvg({ width: W, height: H, label: LABEL, body: `${ink.wobbleFilter()}<g data-layer filter="url(#iso-hand)">${body}</g><g data-pills></g>` }).replace("<svg ", "<svg data-ie-svg ");
  const controls = `
    <button type="button" class="ia-btn" data-ie-run aria-pressed="false">Run</button>
    <button type="button" class="ia-btn" data-ie-step>Step</button>
    <button type="button" class="ia-btn" data-ie-explode aria-pressed="false">Explode</button>
    <button type="button" class="ia-btn" data-ie-reset>Reset</button>
    <label class="ia-toggle"><input type="checkbox" id="ie-cache" checked> Cache</label>
    <label class="ia-field">Requests <select class="ia-select" id="ie-pattern"><option value="mixed">7, 9, 7</option><option value="repeat">7, 7, 7</option><option value="unique">7, 9, 4</option></select></label>`;
  const readouts = [
    { key: "step", label: "Step" },
    { key: "hits", label: "Cache hits" },
    { key: "fetches", label: "Origin fetches" },
    { key: "clock", label: "Simulated time" },
  ];
  return { svg, data, css: "", controls, readouts };
}

