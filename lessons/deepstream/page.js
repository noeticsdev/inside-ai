// Guided build: "Build a video-analytics pipeline". One step per screen, like an assembly guide.
// The stage shows the server you are building on (NIC, CPU, RAM, PCIe, GPU with NVDEC, SMs, VRAM);
// each step adds a real DeepStream element where it runs, and the Next button waits for the step's task.
// Every number comes from model.mjs.
import * as M from "./model.mjs";
import { createIA, theme } from "../../platform/shell/sdk.js";
import { mountPyCell } from "../../platform/shell/pycell.js";

const L = window.__LESSON__;
L.missionChecks = Object.fromEntries(M.MISSIONS.map((m) => [m.id, m.check]));
L.words = { right: "You were right.", shows: "The build showed", later: "You will find out as you build.", skip: "Skip the prediction" };
const T = theme();
document.querySelector("[data-ia-theme]")?.addEventListener("click", () => T.toggle());
const IA = createIA({ M: { MISSIONS: [] }, data: L });
window.IA = IA;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- DOM helpers ----------
const NS = "http://www.w3.org/2000/svg";
function put(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k.nodeType ? k : String(k));
  return el;
}
const h = (tag, attrs, ...kids) => add(put(document.createElement(tag), attrs), kids);
const s = (tag, attrs, ...kids) => add(put(document.createElementNS(NS, tag), attrs), kids);
const fmt = (n) => Number(n).toLocaleString("en-US");
const r3 = (v) => Math.round(v * 1000) / 1000;
const svgBox = (w, hh, label) => s("svg", { viewBox: `0 0 ${w} ${hh}`, role: "img", "aria-label": label, style: `max-width:${w}px` });
const T_ = (x, y, text, cls = "cu-t", anchor) => s("text", { x, y, class: cls, "text-anchor": anchor, text });

// ---------- facts used across steps ----------
const IDR = M.framePackets(0);
const PF = M.framePackets(1);
const raw30 = M.rawDetections(30);
const def30 = M.clusterDetections(raw30, { preClusterThreshold: 0.5, nmsIouThreshold: 0.5 });
const T0 = M.track(0);
const FIRST = M.FIRST_CROSSING;
const eventJson = (ms) => {
  const m = M.eventMessage(FIRST);
  const one = (o) => JSON.stringify(o).replace(/":/g, '": ').replace(/,"/g, ', "');
  return `{\n  "version": "${m.version}",\n  "id": "${m.id}",\n  "@timestamp": "${m["@timestamp"].replace(/\.\d{3}Z/, `.${ms}Z`)}",\n  "sensor": ${one(m.sensor)},\n  "analyticsModule": ${one(m.analyticsModule)},\n  "object": {\n    "id": "${m.object.id}", "vehicle": ${one(m.object.vehicle)},\n    "bbox": ${one(m.object.bbox)}\n  },\n  "event": ${one(m.event)}\n}`;
};
const MSG_BYTES = new TextEncoder().encode(JSON.stringify(M.eventMessage(FIRST))).length;
const FU = IDR.packets.filter((p) => p.kind.startsWith("FU-A")).length;
const solved = (id) => IA.isDone(id) || Boolean(state.revealed[id]);

// =====================================================================
// The hardware board (viewBox 1000 x 600)
// =====================================================================
const HW = {
  nic: { label: "NIC", sub: "1 Gbit/s" },
  cpu: { label: "CPU", sub: "8 cores" },
  ram: { label: "System RAM", sub: "" },
  pcie: { label: "PCIe ×16", sub: "16 GB/s" },
  nvdec: { label: "NVDEC", sub: "video engine" },
  sm: { label: "SMs", sub: "CUDA + Tensor cores" },
  vram: { label: "VRAM", sub: "16 GB" },
};
// element tags: where they sit, which hardware they run on, and the step that adds them
const TAGS = [
  { id: "rtspsrc", step: 1, x: 170, y: 52, w: 150, lead: [320, 68, 344, 68] },
  { id: "rtph264depay", step: 2, x: 170, y: 92, w: 150, lead: [320, 108, 344, 108] },
  { id: "h264parse", step: 2, x: 170, y: 132, w: 150, lead: [320, 148, 344, 148] },
  { id: "nvdsanalytics", step: 8, x: 170, y: 172, w: 150, lead: [320, 188, 344, 188] },
  { id: "nvmsgbroker", step: 9, x: 170, y: 212, w: 150, lead: [320, 228, 344, 228] },
  { id: "nvv4l2decoder", step: 3, x: 362, y: 524, w: 140, lead: [432, 524, 432, 452] },
  { id: "nvinfer", step: 5, x: 522, y: 524, w: 136, lead: [590, 524, 590, 508] },
  { id: "nvtracker", step: 7, x: 670, y: 524, w: 136, lead: [738, 524, 738, 508] },
  { id: "nvstreammux", step: 4, x: 822, y: 524, w: 128, lead: [886, 524, 886, 508] },
];
// the frame's path for each build step, and what the frame is at the end of it
const ROUTES = {
  1: { d: "M104 327H230V280H372V246", token: () => `${IDR.packets.length} packets`, at: [-1, 18] },
  2: { d: "M372 246V150H476", token: () => `AU ${fmt(IDR.accessUnitBytes)} B`, at: [0, -20] },
  3: { d: "M430 246V368", token: () => (solved("bytes") ? "NV12 3,110,400 B" : "NV12 ? B"), at: [1, -16] },
  4: { d: "M470 368V361H886V368", token: () => "8 pointers", at: [-1, -16] },
  5: { d: "M886 508V516H664V508", token: () => (solved("tensor") ? "tensor 25 MB" : "tensor ? B"), at: [0, -26] },
  6: { d: "M560 450H700", token: () => (solved("nms") ? "7 boxes" : "27 boxes"), at: [0, -20] },
  7: { d: "M700 450H780", token: () => "7 track IDs", at: [0, -20] },
  8: { d: "M780 368V280H500V246", token: () => "metadata only", at: [-1, 16], meta: true },
  9: { d: "M352 246V310H276V436H140V489H114", token: () => `JSON ${MSG_BYTES} B`, at: [-1, -40] },
};
// a label sits beside the moving dot: at[0] = -1 left, 0 centred, 1 right; at[1] = vertical offset
function readoutRows() {
  return [
    ["on the wire", `${IDR.packets.length} RTP packets`, `${fmt(IDR.wireBytes)} B`],
    ["access unit", "SPS + PPS + IDR", `${fmt(IDR.accessUnitBytes)} B`],
    ["NV12 surface", "in VRAM", solved("bytes") ? `${fmt(M.ANSWERS.nv12Frame)} B` : "? B"],
    ["batch", "8 cameras", "8 pointers"],
    ["input tensor", "8×3×544×960", solved("tensor") ? `${fmt(M.ANSWERS.batchTensor)} B` : "? B"],
    ["detections", "frame 30", solved("nms") ? `${def30.kept.length} boxes` : `${raw30.length} raw`],
    ["tracks", "IOU tracker", `${def30.kept.length} IDs`],
    ["crossings", "2-second clip", `${T0.crossings.length} cars`],
    ["Kafka message", "JSON", `${MSG_BYTES} B`],
  ];
}

function board({ built, on = [], fresh = null, enter = false, meters = null, cameras = 1, hit = null }) {
  const svg = s("svg", { viewBox: "0 0 1000 600", role: "img", "aria-label": "A server: network card, CPU with system RAM, a PCIe x16 slot and a GPU with its NVDEC video engine, SMs and VRAM. Pipeline elements are tagged on the hardware they run on." });
  const grp = (id, ...kids) => {
    const g = s("g", { class: `hw-grp ${on.includes(id) ? "is-on" : ""}`, "data-hw": id }, kids);
    if (hit) {
      g.setAttribute("data-hit", "");
      g.addEventListener("click", () => hit(id));
    }
    return g;
  };
  // camera(s) and Kafka, outside the server
  const cam = s("g", { class: "hw-grp" });
  for (let k = Math.min(cameras, 4) - 1; k >= 0; k--) {
    const o = k * 6;
    cam.append(s("rect", { class: "cam-body", x: 30 + o, y: 304 - o, width: 74, height: 46, rx: 6 }), s("circle", { class: "cam-body", cx: 30 + o, cy: 327 - o, r: 15 }), s("circle", { class: "hw-detail", cx: 30 + o, cy: 327 - o, r: 8 }));
  }
  cam.append(s("line", { class: "hw-detail", x1: 67, y1: 350, x2: 67, y2: 368 }), s("rect", { class: "hw-detail-fill", x: 47, y: 368, width: 40, height: 6, rx: 2 }), T_(67, 290 - Math.min(cameras - 1, 3) * 6, cameras > 1 ? `${cameras} cameras` : "cam-03", "hw-label", "middle"), T_(67, 394, "1080p30 H.264", "hw-sub", "middle"));
  svg.append(cam);
  svg.append(s("g", { class: "hw-grp" }, s("rect", { class: "hw-part", x: 14, y: 462, width: 100, height: 54, rx: 6 }), T_(64, 485, "Kafka", "hw-label", "middle"), T_(64, 503, "broker", "hw-sub", "middle")));
  svg.append(s("path", { class: "hw-trace", d: "M104 327H162" }), s("path", { class: "hw-trace", d: "M114 489H140V436H162" }));
  // chassis
  svg.append(s("rect", { class: "hw-chassis", x: 150, y: 14, width: 836, height: 572, rx: 12 }), T_(166, 36, "SERVER", "hw-chassis-label"));
  // NIC
  svg.append(
    grp(
      "nic",
      s("rect", { class: "hw-part", x: 170, y: 290, width: 120, height: 166, rx: 6 }),
      s("rect", { class: "hw-fill", x: 160, y: 314, width: 16, height: 24, rx: 2 }),
      s("rect", { class: "hw-fill", x: 160, y: 424, width: 16, height: 24, rx: 2 }),
      s("rect", { class: "hw-detail-fill", x: 200, y: 330, width: 60, height: 44, rx: 3 }),
      ...Array.from({ length: 5 }, (_, i) => s("line", { class: "hw-detail", x1: 206 + i * 12, y1: 330, x2: 206 + i * 12, y2: 324 })),
      T_(230, 398, "NIC", "hw-label", "middle"),
      T_(230, 416, "1 Gbit/s", "hw-sub", "middle"),
    ),
  );
  // CPU with pins, die and 8 cores
  const pins = [];
  for (let i = 0; i < 14; i++) {
    const p = 356 + i * 12;
    pins.push(s("line", { class: "hw-detail", x1: p, y1: 56, x2: p, y2: 50 }), s("line", { class: "hw-detail", x1: p, y1: 240, x2: p, y2: 246 }));
    const q = 68 + i * 12;
    pins.push(s("line", { class: "hw-detail", x1: 528, y1: q, x2: 534, y2: q }));
  }
  const cores = [];
  for (let c = 0; c < 2; c++) for (let r = 0; r < 4; r++) cores.push(s("rect", { class: "hw-detail-fill", x: 370 + c * 70, y: 82 + r * 30, width: 62, height: 24, rx: 2 }));
  svg.append(grp("cpu", ...pins, s("rect", { class: "hw-part", x: 344, y: 56, width: 184, height: 184, rx: 8 }), s("rect", { class: "hw-fill", x: 362, y: 74, width: 148, height: 148, rx: 4 }), ...cores, T_(436, 213, "CPU · 8 cores", "hw-label", "middle")));
  // RAM: four DIMMs
  const dimms = [];
  for (let i = 0; i < 4; i++) {
    const x = 552 + i * 22;
    dimms.push(s("rect", { class: "hw-part", x, y: 52, width: 12, height: 192, rx: 2 }));
    for (let j = 0; j < 6; j++) dimms.push(s("rect", { class: "hw-detail-fill", x: x + 2, y: 62 + j * 30, width: 8, height: 20 }));
  }
  svg.append(grp("ram", ...dimms, T_(586, 266, "System RAM", "hw-sub", "middle")));
  // CPU to slot traces, the PCIe slot
  svg.append(...[420, 430, 440].map((x) => s("line", { class: "hw-trace", x1: x, y1: 246, x2: x, y2: 300 })));
  const contacts = Array.from({ length: 74 }, (_, i) => s("line", { class: "hw-detail", x1: 352 + i * 8, y1: 304, x2: 352 + i * 8, y2: 312 }));
  svg.append(grp("pcie", s("rect", { class: "hw-part", x: 344, y: 300, width: 620, height: 16, rx: 3 }), ...contacts, T_(964, 293, "PCIe ×16 · 16 GB/s each way", "hw-sub", "end")));
  // GPU card
  svg.append(s("g", { class: "hw-grp" }, s("rect", { class: "hw-part", x: 344, y: 330, width: 620, height: 240, rx: 10 }), T_(362, 352, "GPU", "hw-label")));
  svg.append(grp("nvdec", s("rect", { class: "hw-part", x: 362, y: 368, width: 140, height: 84, rx: 6 }), s("rect", { class: "hw-detail-fill", x: 376, y: 380, width: 30, height: 20, rx: 2 }), s("rect", { class: "hw-detail-fill", x: 412, y: 380, width: 30, height: 20, rx: 2 }), T_(432, 424, "NVDEC", "hw-label", "middle"), T_(432, 442, "video engine", "hw-sub", "middle")));
  const tiles = [];
  for (let c = 0; c < 8; c++) for (let r = 0; r < 4; r++) tiles.push(s("rect", { class: "hw-detail-fill", x: 530 + c * 34, y: 398 + r * 26, width: 30, height: 22, rx: 2 }));
  svg.append(grp("sm", s("rect", { class: "hw-part", x: 522, y: 368, width: 284, height: 140, rx: 6 }), T_(532, 388, "SMs · CUDA + Tensor cores", "hw-label"), ...tiles));
  const chips = [];
  for (let c = 0; c < 2; c++) for (let r = 0; r < 3; r++) chips.push(s("rect", { class: "hw-detail-fill", x: 832 + c * 58, y: 398 + r * 36, width: 50, height: 28, rx: 2 }));
  svg.append(grp("vram", s("rect", { class: "hw-part", x: 822, y: 368, width: 128, height: 140, rx: 6 }), T_(832, 388, "VRAM · 16 GB", "hw-label"), ...chips));

  // routes the frame has travelled so far
  for (const [k, r] of Object.entries(ROUTES)) {
    if (Number(k) > built) continue;
    svg.append(s("path", { class: `route ${r.meta ? "is-meta" : ""}`, d: r.d }));
  }
  // element tags
  for (const t of TAGS) {
    if (t.step > built) continue;
    const isNew = t.step === fresh;
    const [x1, y1, x2, y2] = t.lead;
    svg.append(s("g", { class: `tag ${isNew ? "is-new" : ""} ${isNew && enter ? "is-in" : ""}` }, s("line", { class: "tag-lead", x1, y1, x2, y2 }), s("rect", { x: t.x, y: t.y, width: t.w, height: 32, rx: 7 }), T_(t.x + t.w / 2, t.y + 21, t.id, "", "middle")));
  }
  // readout: the frame, as it is now
  if (built >= 1 && !meters) {
    const rows = readoutRows().slice(0, Math.min(built, 9));
    const g = s("g", {}, s("rect", { class: "hw-fill", x: 652, y: 34, width: 316, height: 40 + rows.length * 21, rx: 10 }), T_(668, 55, "ONE FRAME, STAGE BY STAGE", "hw-chassis-label"));
    rows.forEach(([a, b, c], i) => {
      const y = 78 + i * 21;
      const cur = i === Math.min(built, 9) - 1;
      g.append(T_(668, y, a, cur ? "ro-a" : "ro-t"), T_(952, y, c, cur ? "ro-a" : "ro-v", "end"));
    });
    svg.append(g);
  }
  // load panel (scale steps): one bar per part, and the overloaded part outlined in red
  if (meters) {
    const g = s("g", {}, s("rect", { class: "hw-fill", x: 652, y: 34, width: 316, height: 228, rx: 10 }), T_(668, 55, `LOAD AT ${meters.config.cameras} CAMERAS`, "hw-chassis-label"));
    const bw = 150;
    meters.resources.forEach((r, i) => {
      const y = 82 + i * 30;
      const over = r.load > 100;
      g.append(
        s(
          "g",
          { class: `meter ${over ? "is-over" : ""}` },
          T_(668, y + 5, r.name),
          s("rect", { class: "meter-track", x: 748, y: y - 5, width: bw, height: 12, rx: 3 }),
          s("rect", { class: "meter-fill", x: 748, y: y - 5, width: Math.min(1, r.load / 140) * bw, height: 12, rx: 3 }),
          s("line", { class: "meter-100", x1: 748 + (100 / 140) * bw, y1: y - 9, x2: 748 + (100 / 140) * bw, y2: y + 11 }),
          T_(952, y + 5, `${r.load}%`, "", "end"),
        ),
      );
      if (over) svg.querySelector(`[data-hw="${r.id}"]`)?.classList.add("is-over");
    });
    svg.append(g);
  }
  return svg;
}

// the frame token travelling the newest route
function playToken(svg, step) {
  const r = ROUTES[step];
  if (!r) return;
  const path = s("path", { class: "route-new", d: r.d });
  const label = r.token();
  const w = label.length * 8.4 + 24;
  const [side, dy] = r.at;
  const cx = side === 0 ? 0 : side * (w / 2 + 12);
  const tok = s("g", { class: "token" }, s("rect", { x: cx - w / 2, y: dy - 11, width: w, height: 22, rx: 11 }), s("text", { x: cx, y: dy + 4.5, "text-anchor": "middle", text: label }), s("circle", { r: 4.5 }));
  svg.append(path, tok);
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  const place = (t) => {
    const p = path.getPointAtLength(len * t);
    tok.setAttribute("transform", `translate(${p.x} ${p.y})`);
    path.style.strokeDashoffset = `${len * (1 - t)}`;
  };
  if (still) return place(1);
  const dur = Math.max(900, Math.min(2200, len * 5));
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const tick = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    place(ease(t));
    if (t < 1 && tok.isConnected) requestAnimationFrame(tick);
  };
  place(0);
  requestAnimationFrame(tick);
}

// small fine-line glyphs for the parts list
function glyph(kind) {
  const g = s("svg", { viewBox: "0 0 40 32", "aria-hidden": "true" });
  const st = { fill: "none", stroke: "currentColor", "stroke-width": 1.2 };
  if (kind === "cpu") g.append(s("rect", { ...st, x: 10, y: 6, width: 20, height: 20, rx: 2 }), s("rect", { ...st, x: 15, y: 11, width: 10, height: 10 }), ...[13, 20, 27].flatMap((p) => [s("line", { ...st, x1: p, y1: 2, x2: p, y2: 6 }), s("line", { ...st, x1: p, y1: 26, x2: p, y2: 30 })]));
  else if (kind === "gpu") g.append(s("rect", { ...st, x: 3, y: 7, width: 34, height: 18, rx: 2 }), ...[0, 1, 2, 3].map((i) => s("rect", { ...st, x: 7 + i * 7, y: 11, width: 5, height: 5 })), s("line", { ...st, x1: 6, y1: 25, x2: 6, y2: 29 }), s("line", { ...st, x1: 34, y1: 25, x2: 34, y2: 29 }));
  else if (kind === "nic") g.append(s("rect", { ...st, x: 4, y: 8, width: 32, height: 16, rx: 2 }), s("rect", { ...st, x: 8, y: 12, width: 8, height: 8 }), s("path", { ...st, d: "M20 16h12M28 12l4 4-4 4" }));
  else if (kind === "cam") g.append(s("rect", { ...st, x: 12, y: 9, width: 24, height: 15, rx: 3 }), s("circle", { ...st, cx: 11, cy: 16.5, r: 6 }), s("line", { ...st, x1: 24, y1: 24, x2: 24, y2: 30 }));
  else if (kind === "model") g.append(s("rect", { ...st, x: 6, y: 6, width: 28, height: 20, rx: 2 }), s("rect", { ...st, x: 11, y: 10, width: 9, height: 9 }), s("rect", { ...st, x: 19, y: 14, width: 10, height: 8 }));
  else g.append(s("rect", { ...st, x: 6, y: 9, width: 28, height: 14, rx: 7 }), s("line", { ...st, x1: 12, y1: 16, x2: 28, y2: 16 }));
  return g;
}

// =====================================================================
// The street scene (1920 x 1080 world units), reused by the detector and tracker steps
// =====================================================================
function sceneSvg(f, label) {
  const g = s("svg", { viewBox: "0 0 1920 1080", role: "img", "aria-label": `Camera cam-03, frame ${f}: a street with cars, a truck, two walkers and a cyclist, and a counting line at x = 1000.` });
  g.append(s("rect", { class: "sc-bg", x: 0, y: 0, width: 1920, height: 1080 }), s("rect", { class: "sc-bld", x: 40, y: 30, width: 1840, height: 230 }));
  for (let c = 0; c < 14; c++) for (let r = 0; r < 2; r++) g.append(s("rect", { class: "sc-win", x: 80 + c * 130, y: 70 + r * 95, width: 70, height: 55 }));
  g.append(s("rect", { class: "sc-walk", x: 0, y: 270, width: 1920, height: 240 }), s("rect", { class: "sc-road", x: 0, y: 510, width: 1920, height: 390 }), s("line", { class: "sc-mark", x1: 0, y1: 705, x2: 1920, y2: 705 }), s("rect", { class: "sc-walk", x: 0, y: 900, width: 1920, height: 180 }));
  for (const o of M.OBJECTS) {
    const [x, y, w, hh] = M.boxAt(o, f);
    if (x + w < 0 || x > 1920) continue;
    if (o.cls === "car") {
      g.append(s("rect", { class: "sc-obj", x: x + w * 0.2, y: y + hh * 0.06, width: w * 0.55, height: hh * 0.4, rx: 14 }), s("rect", { class: "sc-obj", x: x + 4, y: y + hh * 0.36, width: w - 8, height: hh * 0.46, rx: 18 }), s("circle", { class: "sc-obj-dark", cx: x + w * 0.24, cy: y + hh * 0.84, r: hh * 0.13 }), s("circle", { class: "sc-obj-dark", cx: x + w * 0.76, cy: y + hh * 0.84, r: hh * 0.13 }));
    } else {
      const cx = x + w / 2;
      g.append(s("circle", { class: "sc-obj", cx, cy: y + hh * 0.12, r: w * 0.2 }), s("rect", { class: "sc-obj", x: x + w * 0.24, y: y + hh * 0.26, width: w * 0.52, height: hh * 0.4, rx: 10 }), s("line", { class: "sc-obj", x1: cx - w * 0.12, y1: y + hh * 0.66, x2: cx - w * 0.16, y2: y + hh * 0.98 }), s("line", { class: "sc-obj", x1: cx + w * 0.12, y1: y + hh * 0.66, x2: cx + w * 0.16, y2: y + hh * 0.98 }));
    }
  }
  g.append(s("line", { class: "sc-line", x1: M.SCENE.line.x, y1: M.SCENE.line.y0, x2: M.SCENE.line.x, y2: M.SCENE.line.y1 }), s("text", { class: "sc-line-text", x: M.SCENE.line.x + 14, y: M.SCENE.line.y0 + 34, text: "count line" }), s("text", { class: "sc-line-text", x: 60, y: 1050, text: label || `cam-03 · frame ${f}` }));
  return g;
}
function boxEl(box, cls, label, labelCls) {
  const [x, y, w, hh] = box;
  const g = s("g", {}, s("rect", { class: cls, x, y, width: w, height: hh }));
  if (label) {
    const tw = label.length * 23 + 20;
    const ly = y - 52 < 0 ? y + hh + 4 : y - 52;
    const lx = Math.max(0, Math.min(1920 - tw, x));
    g.append(s("g", { class: `bx-label ${labelCls || ""}` }, s("rect", { x: lx, y: ly, width: tw, height: 48, rx: 5 }), s("text", { x: lx + 10, y: ly + 35, text: label })));
  }
  return g;
}
const metricsRow = (items) => h("div", { class: "metrics" }, items.map(([a, b, c]) => h("div", {}, h("span", { text: a }), h("strong", { class: c, text: String(b) }))));

// =====================================================================
// Close-up figures (one per board step)
// =====================================================================
function cuGoal() {
  return h(
    "div",
    { class: "cu-chain" },
    [
      ["in, per camera", `${M.cameraBitrateMbps().toFixed(2)} Mbit/s`],
      ["cameras", "16 × 1080p30"],
      ["hardware", "1 server, 1 GPU"],
      ["out", "1 JSON per car", true],
    ].map(([a, b, big]) => h("div", { class: big ? "is-big" : "" }, h("span", { text: a }), h("strong", { text: b }))),
  );
}

function cuRtp() {
  const svg = svgBox(700, 250, "RTP header of the first packet, and the packets of frame 0 and frame 1");
  const bit = 19;
  const x0 = 24;
  for (let b = 0; b <= 32; b += 8) svg.append(T_(x0 + b * bit, 14, String(b), "cu-t-m", "middle"));
  const row = (y, fields) => {
    let b = 0;
    for (const [name, bits, val, on] of fields) {
      svg.append(s("rect", { class: on ? "cu-bits-on" : "cu-bits", x: x0 + b * bit, y, width: bits * bit, height: 34 }));
      if (bits * bit > 30) svg.append(T_(x0 + (b + bits / 2) * bit, y + 14, name, "cu-t-m", "middle"));
      svg.append(T_(x0 + (b + bits / 2) * bit, y + 29, val, on ? "cu-t-a" : "cu-t-b", "middle"));
      b += bits;
    }
  };
  row(22, [["V", 2, "2"], ["P", 1, "0"], ["X", 1, "0"], ["CC", 4, "0"], ["M", 1, "0"], ["PT", 7, "96"], ["sequence number", 16, fmt(IDR.packets[0].seq)]]);
  row(56, [["timestamp (90 kHz clock)", 32, fmt(IDR.timestamp), true]]);
  row(90, [["SSRC (stream id)", 32, "0x1F3A9C02"]]);
  svg.append(T_(x0 + 32 * bit + 10, 44, "12-byte", "cu-t-m"), T_(x0 + 32 * bit + 10, 60, "header", "cu-t-m"));
  // packet strips
  const strip = (y, f, cls, label) => {
    f.packets.forEach((p, i) => svg.append(s("rect", { class: p.marker ? "cu-pk-m" : cls, x: x0 + i * 7, y, width: 5.5, height: 22 })));
    svg.append(T_(x0, y + 40, label, "cu-t"));
  };
  strip(146, IDR, "cu-pk", `frame 0 · key frame · ${IDR.packets.length} packets · all stamped ${fmt(IDR.timestamp)} · last has M = 1`);
  if (solved("timestamp")) strip(196, PF, "cu-pk-new", `frame 1 · P frame · ${PF.packets.length} packets · all stamped ${fmt(PF.timestamp)}`);
  else svg.append(T_(x0, 226, "frame 1 · P frame · 11 packets · stamped ?", "cu-t-m"));
  return svg;
}

function cuNal() {
  const svg = svgBox(660, 230, "The FU-A fragments of the key frame join into one IDR NAL unit");
  const x0 = 24;
  svg.append(T_(x0, 18, `${IDR.packets.length} packets in, from rtspsrc`, "cu-t-m"));
  IDR.packets.forEach((p, i) => svg.append(s("rect", { class: i < 2 ? "cu-pk-new" : "cu-pk", x: x0 + i * 7, y: 28, width: 5.5, height: 20 })));
  svg.append(s("path", { class: "cu-axis", d: `M${x0 + 14} 54v8h${FU * 7 - 2}v-8` }), s("path", { class: "cu-axis", d: `M${x0 + 14 + (FU * 7) / 2} 62v12` }));
  svg.append(T_(x0 + 14 + (FU * 7) / 2, 92, `${FU} FU-A fragments → 1 NAL unit`, "cu-t-m", "middle"));
  const units = [
    [7, "SPS", "22 B", "picture size 1920×1080, profile, level"],
    [8, "PPS", "6 B", "entropy coding and slice settings; points to the SPS"],
    [5, "IDR slice", `${fmt(IDR.nals[2].bytes)} B`, "the picture itself; points to the PPS"],
  ];
  const order = solved("nal-order") ? units : null;
  units.forEach(([type, name, bytes, what], i) => {
    const y = 110 + i * 38;
    svg.append(s("rect", { class: order ? "cu-slot-on" : "cu-slot", x: x0, y, width: 150, height: 30, rx: 4 }), T_(x0 + 10, y + 20, `${name} · type ${type}`, "cu-t-b"), T_(x0 + 166, y + 13, bytes, "cu-t-b"), T_(x0 + 166, y + 27, what, "cu-t-m"));
  });
  if (order) svg.append(T_(x0, 226, `access unit = ${fmt(IDR.accessUnitBytes)} B, in decode order → PCIe → NVDEC`, "cu-t-a"));
  return svg;
}

function cuNv12() {
  const svg = svgBox(660, 230, "NV12 layout: a full-size Y plane and a half-height interleaved UV plane");
  const k = 0.12;
  const W = 1920 * k;
  const x0 = 24;
  svg.append(s("rect", { class: "cu-plane-y", x: x0, y: 20, width: W, height: 1080 * k }), T_(x0 + W / 2, 20 + (1080 * k) / 2 - 4, "Y (brightness)", "cu-t-b", "middle"), T_(x0 + W / 2, 20 + (1080 * k) / 2 + 14, "1920 × 1080 × 1 byte", "cu-t-m", "middle"));
  const uy = 20 + 1080 * k + 6;
  svg.append(s("rect", { class: "cu-plane-uv", x: x0, y: uy, width: W, height: 540 * k }));
  for (let i = 1; i < 24; i++) svg.append(s("line", { class: "cu-hatch", x1: x0 + i * (W / 24), y1: uy, x2: x0 + i * (W / 24), y2: uy + 540 * k }));
  svg.append(T_(x0 + W / 2, uy + (540 * k) / 2 - 3, "UV (colour) · 1920 × 540", "cu-t-b", "middle"), T_(x0 + W / 2, uy + (540 * k) / 2 + 14, "one U,V pair per 2×2 pixels", "cu-t-m", "middle"));
  // sizes: compressed vs decoded, to scale
  const bx = 300;
  const scale = 330 / M.ANSWERS.nv12Frame;
  svg.append(T_(bx, 34, "compressed access unit", "cu-t-m"), s("rect", { class: "cu-slot-on", x: bx, y: 42, width: Math.max(3, IDR.accessUnitBytes * scale), height: 18 }), T_(bx + 20, 56, `${fmt(IDR.accessUnitBytes)} B`, "cu-t-b"));
  svg.append(T_(bx, 92, "decoded NV12 surface, same scale", "cu-t-m"), s("rect", { class: "cu-plane-y", x: bx, y: 100, width: 1920 * 1080 * scale, height: 18 }), s("rect", { class: "cu-plane-uv", x: bx + 1920 * 1080 * scale, y: 100, width: 1920 * 540 * scale, height: 18 }));
  svg.append(solved("bytes") ? T_(bx, 140, `${fmt(M.ANSWERS.nv12Frame)} B · ${(M.ANSWERS.nv12Frame / IDR.accessUnitBytes).toFixed(0)}× the compressed frame`, "cu-t-a") : T_(bx, 140, "? B", "cu-t-a"));
  svg.append(T_(bx, 176, "This surface stays in VRAM. The next", "cu-t-m"), T_(bx, 194, "elements get a pointer to it (NVMM).", "cu-t-m"));
  return svg;
}

const ARRIVE = [6, 9, 12, 15, M.MUX.lateMs, 18, 21, 24];
function cuMux() {
  const svg = svgBox(660, 236, "Frame arrival times for 8 cameras, the 40 ms batched-push-timeout, and the batch that leaves");
  const x0 = 70;
  const px = 5.4;
  const y0 = 24;
  svg.append(s("line", { class: "cu-axis", x1: x0, y1: y0 + 8 * 22, x2: x0 + 70 * px, y2: y0 + 8 * 22 }));
  for (let t = 0; t <= 70; t += 10) svg.append(s("line", { class: "cu-grid", x1: x0 + t * px, y1: y0 - 6, x2: x0 + t * px, y2: y0 + 8 * 22 }), T_(x0 + t * px, y0 + 8 * 22 + 18, `${t} ms`, "cu-t-m", "middle"));
  const tx = x0 + (M.MUX.batchedPushTimeoutUs / 1000) * px;
  svg.append(s("line", { class: "cu-mark", x1: tx, y1: y0 - 10, x2: tx, y2: y0 + 8 * 22 + 4 }), T_(tx + 6, y0 - 2, "timeout 40,000 µs", "cu-t-bad"));
  const done = solved("mux");
  ARRIVE.forEach((ms, i) => {
    const y = y0 + i * 22 + 11;
    const late = ms > 40;
    svg.append(T_(x0 - 10, y + 5, `cam-0${i + 1}`, late ? "cu-t-bad" : "cu-t", "end"), s("line", { class: "cu-grid", x1: x0, y1: y, x2: x0 + ms * px, y2: y }), s("circle", { class: late ? "cu-slot-empty" : "cu-slot-on", cx: x0 + ms * px, cy: y, r: 5 }));
  });
  // the batch
  const bx = 480;
  svg.append(T_(bx, 18, done ? "batch pushed at 40 ms" : "batch (batch-size=8)", "cu-t-b"));
  ARRIVE.forEach((ms, i) => {
    const y = 28 + i * 22;
    const empty = done && ms > 40;
    svg.append(s("rect", { class: empty ? "cu-slot-empty" : done ? "cu-slot-on" : "cu-slot", x: bx, y, width: 150, height: 18, rx: 3 }), T_(bx + 8, y + 13, empty ? "empty → next batch" : done ? `cam-0${i + 1} · source_id ${i}` : "?", empty ? "cu-t-bad" : "cu-t-m"));
  });
  return svg;
}

function cuTensor() {
  const svg = svgBox(660, 230, "Eight NV12 frames become one FP16 tensor of shape 8 x 3 x 544 x 960");
  const x0 = 30;
  for (let n = 7; n >= 0; n--) {
    for (let c = 2; c >= 0; c--) {
      const x = x0 + n * 22 + c * 6;
      const y = 30 + n * 8 - c * 6;
      svg.append(s("rect", { class: c === 0 ? "cu-plane-y" : "cu-slot", x, y, width: 120, height: 68 }));
    }
  }
  svg.append(T_(x0, 20, "N = 8 frames", "cu-t-b"), T_(x0 + 300, 60, "C = 3  (R, G, B planes)", "cu-t"), T_(x0 + 300, 80, "H = 544, W = 960", "cu-t"), T_(x0 + 300, 100, "FP16 = 2 bytes each", "cu-t"));
  svg.append(T_(x0 + 300, 132, "each pixel: y = (1/255) × x", "cu-t-m"), T_(x0 + 300, 150, `200 → ${(200 * M.NET_SCALE_FACTOR).toFixed(4)}`, "cu-t-m"));
  svg.append(T_(x0, 200, `[8, 3, 544, 960] FP16 = ${solved("tensor") ? `${fmt(M.ANSWERS.batchTensor)} B, built in VRAM` : "? B"}`, "cu-t-a"));
  return svg;
}

function cuJson() {
  const ms = solved("event-time") ? String(M.ANSWERS.eventMs) : "???";
  const text = eventJson(ms).replace(/"@timestamp": "([^"]+)"/, (m0, v) => `"@timestamp": "<mark>${v}</mark>"`);
  return h("div", {}, h("pre", { class: "cu-json", html: text.replace(/&(?!lt;|gt;)/g, "&amp;") }), h("p", { class: "cu-cap", text: `${MSG_BYTES} bytes on the wire to Kafka. The frame it describes was ${fmt(M.ANSWERS.nv12Frame)} bytes in VRAM and never left the GPU.` }));
}

function smFormula(load) {
  const c = load.config;
  const fps = c.cameras * 30;
  const inf = fps / (c.interval + 1);
  const nb = inf / c.batch;
  const infer = nb * (M.COST.inferBaseMs + M.COST.inferPerFrameMs * c.batch);
  const sm = load.resources.find((x) => x.id === "sm");
  return [
    `SMs, per second of video (${c.cameras} cameras, batch ${c.batch}, interval ${c.interval}):`,
    `  inferred frames = ${c.cameras} × 30 / (${c.interval} + 1) = ${fmt(Math.round(inf))}`,
    `  batches         = ${fmt(Math.round(inf))} / ${c.batch} = ${r3(nb)}`,
    `  detector        = ${r3(nb)} × (5 + 1.2 × ${c.batch}) ms = ${fmt(Math.round(infer))} ms`,
    `  pre-process     = ${fmt(Math.round(inf))} × 0.1 ms = ${fmt(Math.round(inf * 0.1))} ms`,
    `  tracker         = ${fmt(fps)} × 0.25 ms = ${fmt(fps * 0.25)} ms   (every frame)`,
    `  total           = ${fmt(sm.used)} of 1,000 ms → ${sm.load}%`,
    `NVDEC: ${fmt(fps)} of ${fmt(M.GPU.nvdecFps)} frames/s → ${load.resources.find((x) => x.id === "nvdec").load}%   (it decodes every frame, whatever the interval)`,
  ].join("\n");
}

function pyCell(host, spec) {
  try {
    return mountPyCell(host, spec);
  } catch (error) {
    host.append(h("p", { class: "cu-cap", text: "The Python cell could not load here." }));
    console.warn(error);
    return null;
  }
}

// =====================================================================
// Steps
// =====================================================================
const scale = { batch: 8, interval: 0 };
const nmsP = { preClusterThreshold: 0.25, nmsIouThreshold: 0.85, touched: false };
const keepSettings = () => {
  state.scale = { ...scale };
  state.nms = { preClusterThreshold: nmsP.preClusterThreshold, nmsIouThreshold: nmsP.nmsIouThreshold };
  saveState();
};
let trackK = 0;
let trackF = 24;

const STEPS = [
  {
    id: "kit",
    phase: "kit",
    kicker: "Before you start",
    title: "Check your kit",
    lead: "You will build a pipeline that counts cars crossing a line on a street camera, then scale it to <b>16 cameras on one GPU</b>. Tap a part to find it on the server.",
    minutes: 1,
    view: "board",
    closeLabel: "THE GOAL",
    closeHint: "what goes in, what comes out",
    close: cuGoal,
    parts: () => [
      { title: "Hardware", n: 5 },
      { glyph: "cam", name: "cam-03", runs: `1920 × 1080 · 30 fps · H.264 · ${M.cameraBitrateMbps().toFixed(2)} Mbit/s`, hw: null },
      { glyph: "nic", name: "NIC", runs: "network card · 1 Gbit/s", hw: "nic" },
      { glyph: "cpu", name: "CPU + system RAM", runs: "8 cores · runs the control and the small stages", hw: "cpu" },
      { glyph: "gpu", name: "PCIe ×16", runs: "the bus between CPU and GPU · 16 GB/s each way", hw: "pcie" },
      { glyph: "gpu", name: "GPU", runs: "NVDEC video engine · SMs · 16 GB VRAM", hw: "sm" },
      { title: "Software", n: 2 },
      { glyph: "tag", name: "9 GStreamer elements", runs: "DeepStream's building blocks; you add them one per step", hw: null },
      { glyph: "model", name: "detector", runs: "TensorRT engine · input 960 × 544 · FP16 · classes: car, person", hw: null },
    ],
    task: "predict",
    nextLabel: "Everything's here",
  },
  {
    id: "receive",
    phase: "build",
    kicker: "Network → CPU",
    title: "Receive the camera stream",
    lead: "Add <code>rtspsrc</code>. It opens an RTSP session with cam-03, and the camera starts sending H.264 inside RTP packets over UDP. A packet carries at most 1,400 bytes, so one 120,000-byte key frame arrives as <b>88 packets</b>.",
    minutes: 2,
    view: "board",
    on: ["nic", "cpu"],
    adds: [{ glyph: "nic", name: "rtspsrc", runs: "runs on the CPU · packets arrive through the NIC", conf: "location=rtsp://cam-03.local/stream1\nprotocols=udp\nlatency=200      # jitter buffer, ms" }],
    closeLabel: "CLOSE-UP · RTP PACKET",
    closeHint: "the 12-byte header in front of every packet",
    close: cuRtp,
    mission: "timestamp",
    task: (ui) =>
      ui.number({
        prompt: `Every packet of a frame carries the same timestamp. Video RTP uses a 90 kHz clock, and the camera sends 30 frames per second. Frame 0 is stamped ${fmt(IDR.timestamp)}. What is frame 1 stamped?`,
        placeholder: "timestamp",
        check: (v) => L.missionChecks.timestamp({ timestamp: v }),
        hint: (v, n) => (v === 1800033 || v === 1800034 ? "That adds milliseconds. The clock ticks 90,000 times a second, not 1,000." : v === 1800001 ? "That adds one frame. The timestamp counts clock ticks, not frames." : n > 1 ? "Ticks per frame = 90,000 / 30. Add that to frame 0's stamp." : "Not quite. How many 90 kHz ticks pass in one frame at 30 fps?"),
        answer: M.ANSWERS.frame1Timestamp,
      }),
    after: () => `90,000 / 30 = <b>3,000 ticks per frame</b>, so frame 1 is stamped ${fmt(M.ANSWERS.frame1Timestamp)}. The next element groups packets by timestamp to rebuild frames, and uses the sequence numbers to spot lost packets.`,
  },
  {
    id: "reassemble",
    phase: "build",
    kicker: "CPU",
    title: "Put the frame back together",
    lead: `Add <code>rtph264depay</code> and <code>h264parse</code>. The depayloader joins the ${FU} FU-A fragments back into one NAL unit. The parser collects the NAL units with the same timestamp into an <b>access unit</b>: one compressed frame.`,
    minutes: 2,
    view: "board",
    on: ["cpu"],
    adds: [
      { glyph: "cpu", name: "rtph264depay", runs: "runs on the CPU · RTP payload → H.264 NAL units" },
      { glyph: "cpu", name: "h264parse", runs: "runs on the CPU · NAL units → access units", conf: "config-interval=-1   # repeat SPS/PPS before every key frame" },
    ],
    closeLabel: "CLOSE-UP · NAL UNITS",
    closeHint: "what the key frame is made of",
    close: cuNal,
    mission: "nal-order",
    task: (ui) => ui.order(),
    after: () => `SPS, then PPS, then the slice: each one refers to the one before it. The parser now sends this ${fmt(IDR.accessUnitBytes)}-byte access unit over PCIe to the GPU. It is still compressed.`,
  },
  {
    id: "decode",
    phase: "build",
    kicker: "PCIe → GPU · NVDEC",
    title: "Decode it on the GPU's video engine",
    lead: "Add <code>nvv4l2decoder</code>. The compressed frame crosses PCIe once. <b>NVDEC</b>, a fixed-function engine on the GPU, separate from the SMs, decodes it into an NV12 surface in VRAM.",
    minutes: 2,
    view: "board",
    on: ["pcie", "nvdec", "vram"],
    adds: [{ glyph: "gpu", name: "nvv4l2decoder", runs: "runs on NVDEC · writes NV12 into VRAM (NVMM)", conf: "cudadec-memtype=0   # decode into device memory" }],
    closeLabel: "CLOSE-UP · NV12 SURFACE",
    closeHint: "the decoded frame in VRAM, to scale",
    close: cuNv12,
    code: {
      id: "ds-bytes",
      title: "Python · size the buffers",
      prompt: "Return the bytes of one NV12 frame, and of an N×C×H×W tensor with the given bytes per element.",
      starter: "def nv12_bytes(width, height):\n    # Y: 1 byte per pixel. UV: full width, half height, 1 byte each.\n    return 0\n\ndef tensor_bytes(n, c, h, w, bytes_per_element):\n    return 0\n\nprint(nv12_bytes(1920, 1080), tensor_bytes(8, 3, 544, 960, 2))\n",
      tests: [
        "check('1080p NV12 frame', nv12_bytes(1920, 1080) == 3110400, f'got {nv12_bytes(1920, 1080)}, want 3110400')",
        "check('4K NV12 frame', nv12_bytes(3840, 2160) == 12441600, f'got {nv12_bytes(3840, 2160)}, want 12441600')",
        "check('batch tensor, FP16', tensor_bytes(8, 3, 544, 960, 2) == 25067520, f'got {tensor_bytes(8, 3, 544, 960, 2)}')",
        "check('batch tensor, INT8', tensor_bytes(16, 3, 544, 960, 1) == 25067520, 'INT8 halves the bytes, batch 16 doubles them')",
      ].join("\n"),
      solution: "def nv12_bytes(width, height):\n    return width * height + width * (height // 2)\n\ndef tensor_bytes(n, c, h, w, bytes_per_element):\n    return n * c * h * w * bytes_per_element\n",
    },
    mission: "bytes",
    task: (ui) =>
      ui.number({
        prompt: "How many bytes does this decoded 1920 × 1080 frame take in VRAM? Read the layout in the close-up.",
        placeholder: "bytes",
        check: (v) => L.missionChecks.bytes({ frame: v }),
        hint: (v, n) => (v === 1920 * 1080 * 3 ? "That is RGB at 3 bytes per pixel. NV12 stores colour at a quarter of the resolution." : v === 1920 * 1080 ? "That is only the Y plane. Add the UV plane below it." : v === 1920 * 1080 * 2 ? "The UV plane is half the height of Y, not the same size." : n > 1 ? "Y = 1920 × 1080 × 1. UV = 1920 × 540 × 1. Add them." : "Not quite. Add the Y plane and the UV plane."),
        answer: M.ANSWERS.nv12Frame,
      }),
    after: () => `Y 2,073,600 + UV 1,036,800 = <b>${fmt(M.ANSWERS.nv12Frame)} bytes</b>, 26× the compressed frame. Copying that back to the CPU for every frame would cost 93 MB/s per camera, so DeepStream keeps it in VRAM and passes pointers.`,
  },
  {
    id: "batch",
    phase: "build",
    kicker: "GPU · VRAM",
    title: "Batch 8 cameras together",
    lead: "Add <code>nvstreammux</code>. It takes one frame from each camera and forms a batch, so the detector runs once for 8 frames. It batches <b>pointers</b> to the NV12 surfaces; no pixels move.",
    minutes: 2,
    view: "board",
    on: ["vram"],
    cameras: 8,
    adds: [{ glyph: "gpu", name: "nvstreammux", runs: "batches NVMM surfaces · one source_id per camera", conf: "batch-size=8\nwidth=1920\nheight=1080\nbatched-push-timeout=40000" }],
    closeLabel: "CLOSE-UP · ONE BATCH",
    closeHint: "when each camera's frame arrives",
    close: cuMux,
    mission: "mux",
    task: (ui) =>
      ui.choice({
        prompt: "cam-05's frame arrives 60 ms late. batched-push-timeout is 40000. What does nvstreammux do?",
        options: [
          ["wait", "Waits for cam-05, then pushes all 8 frames at 60 ms", "Waiting for the slowest camera would stall the other 7 every time. The timeout exists to stop that."],
          ["partial", "Pushes the 7 frames it has at 40 ms; cam-05's frame joins a later batch", null],
          ["seconds", "Waits up to 40 seconds, so it waits for cam-05", "The value is in microseconds: 40,000 µs = 40 ms."],
          ["drop", "Drops cam-05's stream from the pipeline", "It does not drop the stream. The late frame goes into a later batch."],
        ],
        check: (id) => L.missionChecks.mux({ choice: id }),
      }),
    after: () => "At 40 ms the batch leaves with 7 frames and one empty slot. A partial batch keeps the other cameras on time. Set the timeout near one frame interval (33 ms at 30 fps) for live sources.",
  },
  {
    id: "tensor",
    phase: "build",
    kicker: "GPU · SMs",
    title: "Turn the batch into a tensor",
    lead: "Add <code>nvinfer</code>. Before the network runs, CUDA kernels on the <b>SMs</b> convert each NV12 frame to planar RGB, scale it from 1920 × 1080 to the model's 960 × 544, and multiply by 1/255.",
    minutes: 2,
    view: "board",
    on: ["sm", "vram"],
    adds: [{ glyph: "gpu", name: "nvinfer", runs: "runs on the SMs · pre-process + TensorRT", conf: "net-scale-factor=0.00392156862745098\nmodel-color-format=0   # RGB\nnetwork-mode=2         # FP16\ninfer-dims=3;544;960\nbatch-size=8" }],
    closeLabel: "CLOSE-UP · INPUT TENSOR",
    closeHint: "N × C × H × W",
    close: cuTensor,
    mission: "tensor",
    task: (ui) =>
      ui.number({
        prompt: "How many bytes is this input tensor: 8 frames × 3 colour planes × 544 × 960, in FP16?",
        placeholder: "bytes",
        check: (v) => L.missionChecks.tensor({ tensor: v }),
        hint: (v, n) => (v === 12533760 ? "That counts elements. FP16 takes 2 bytes per element." : v === 8 * 3 * 1080 * 1920 * 2 ? "That is at camera resolution. nvinfer scales to 960 × 544 first." : n > 1 ? "8 × 3 × 544 × 960 × 2." : "Not quite. Multiply all four dimensions, then by the bytes per element."),
        answer: M.ANSWERS.batchTensor,
      }),
    after: () => `8 × 3 × 544 × 960 × 2 = <b>${fmt(M.ANSWERS.batchTensor)} bytes</b>, built in VRAM from the NV12 surfaces. Still no copy to the CPU.`,
  },
  {
    id: "detect",
    phase: "build",
    kicker: "GPU · SMs",
    title: "Clean up the detector's boxes",
    lead: `TensorRT runs the detector once on the batch. It fires several overlapping boxes per object: <b>${raw30.length} candidates for 7 objects</b> on frame 30. nvinfer drops boxes under <code>pre-cluster-threshold</code>, then NMS keeps the best of each overlapping group.`,
    minutes: 3,
    view: "bench",
    on: ["sm"],
    adds: [{ glyph: "gpu", name: "nvinfer · [class-attrs-all]", runs: "clustering, on the SMs", conf: () => `pre-cluster-threshold=${nmsP.preClusterThreshold.toFixed(2)}\nnms-iou-threshold=${nmsP.nmsIouThreshold.toFixed(2)}\ncluster-mode=2   # NMS` }],
    bench: benchDetect,
    mission: "nms",
    task: (ui) => ui.nms(),
    after: () => "Exact. The working window is confidence 0.40 to 0.85 and NMS above 0.412 up to 0.75. Below 0.412, the two walkers side by side merge into one box: their boxes overlap at IoU 0.412.",
  },
  {
    id: "track",
    phase: "build",
    kicker: "GPU · SMs",
    title: "Give each object an ID, then skip frames",
    lead: "Add <code>nvtracker</code>. With <code>interval=k</code>, nvinfer runs on 1 frame in k + 1 and the IOU tracker holds each box in between. A new detection joins a track only if it overlaps the held box by <b>IoU ≥ 0.3</b>.",
    minutes: 3,
    view: "bench",
    on: ["sm"],
    adds: [{ glyph: "gpu", name: "nvtracker", runs: "IOU tracker · matches boxes across frames", conf: () => `ll-lib-file=libnvds_nvmultiobjecttracker.so\nll-config-file=config_tracker_IOU.yml\n# nvinfer: interval=${trackK}` }],
    bench: benchTrack,
    mission: "interval",
    task: (ui) =>
      ui.number({
        prompt: "A box w px wide that moves d px overlaps its held box by IoU = (w − d) / (w + d). The table on the left lists each object's width and speed. What is the largest interval with no ID switches?",
        placeholder: "0 to 4",
        check: (v) => L.missionChecks.interval({ interval: v }),
        hint: (v) => (v > M.ANSWERS.maxSafeInterval ? `Interval ${v} breaks a track. Set it on the left and watch car-a.` : `Interval ${v} is safe, but you can skip more. Find the object that sets the limit.`),
        answer: M.ANSWERS.maxSafeInterval,
        onTry: (v) => Number.isInteger(v) && v >= 0 && v <= 4 && ((trackK = v), renderStage()),
      }),
    after: () => {
      const k = M.ANSWERS.maxSafeInterval;
      return `car-a moves 30 px a frame with a 260 px box.<pre>interval ${k}: d = ${30 * (k + 1)} px → IoU = ${260 - 30 * (k + 1)}/${260 + 30 * (k + 1)} = ${r3(M.shiftedIou(260, 30 * (k + 1)))}  ✓\ninterval ${k + 1}: d = ${30 * (k + 2)} px → IoU = ${260 - 30 * (k + 2)}/${260 + 30 * (k + 2)} = ${r3(M.shiftedIou(260, 30 * (k + 2)))}  ✗</pre>The fastest object for its width sets the limit.`;
    },
  },
  {
    id: "count",
    phase: "build",
    kicker: "GPU → CPU",
    title: "Count cars crossing the line",
    lead: "Add <code>nvdsanalytics</code>. Only the metadata (boxes and IDs) goes back to the CPU; the pixels stay on the GPU. On every frame it checks each track's centre against the line at <b>x = 1000</b>. Write that check.",
    minutes: 3,
    view: "bench",
    on: ["cpu"],
    adds: [{ glyph: "cpu", name: "nvdsanalytics", runs: "runs on the CPU · reads metadata only", conf: "[line-crossing-stream-0]\nenable=1\nline-crossing-Entry=900;650;1100;650;1000;300;1000;1000\nclass-id=0" }],
    bench: benchCount,
    mission: "crossing",
    task: (ui) => ui.code(),
    after: () => `Your rule finds ${T0.crossings.length} crossings in the clip: car-a at frame 25 (its centre lands exactly on x = 1000), car-b at 39 and the truck at 45. Landing on the line counts; staying put never does.`,
  },
  {
    id: "publish",
    phase: "build",
    kicker: "CPU → Network",
    title: "Send each crossing to Kafka",
    lead: `Add <code>nvmsgconv</code> and <code>nvmsgbroker</code>. They turn a crossing into a JSON message and publish it to the <code>traffic-events</code> topic. The frame was 3.1 MB on the GPU; the message is <b>${MSG_BYTES} bytes</b>.`,
    minutes: 2,
    view: "board",
    on: ["cpu", "nic"],
    adds: [
      { glyph: "cpu", name: "nvmsgconv", runs: "runs on the CPU · metadata → JSON" },
      { glyph: "nic", name: "nvmsgbroker", runs: "runs on the CPU · leaves through the NIC", conf: "proto-lib=libnvds_kafka_proto.so\nconn-str=kafka.local;9092\ntopic=traffic-events" },
    ],
    closeLabel: "CLOSE-UP · THE MESSAGE",
    closeHint: "what Kafka receives",
    close: cuJson,
    mission: "event-time",
    task: (ui) =>
      ui.number({
        prompt: `The stream started at 18:00:00.000. car-a crossed on frame ${FIRST.frame}, at 30 fps. What goes in the milliseconds of @timestamp?`,
        placeholder: "milliseconds",
        check: (v) => L.missionChecks["event-time"]({ ms: v }),
        hint: (v, n) => (v === FIRST.frame ? "That is the frame number. Turn it into time: frames / fps." : v === 830 || v === 834 ? "Close. 25 / 30 s = 0.8333… s. Round to whole milliseconds." : n > 1 ? "25 / 30 × 1000, rounded." : "Not quite. How long after the start is frame 25 at 30 fps?"),
        answer: M.ANSWERS.eventMs,
      }),
    after: () => `25 / 30 s = <b>0.833 s</b>, so @timestamp is 18:00:00.833Z. Downstream services join events from many cameras by this time, so it must come from the frame, not from when the message happened to be sent.`,
  },
  {
    id: "scale",
    phase: "scale",
    kicker: "Load test",
    title: "Add 15 more cameras",
    lead: "Your pipeline works for one camera. Now feed it 16, still at batch 8 and inference on every frame. Every part of the server has a budget. The meters show the load for 8 cameras.",
    minutes: 2,
    view: "board",
    meters: () => M.pipeLoad(solved("bottleneck") ? { cameras: 16, batch: 8, interval: 0 } : { cameras: 8, batch: 8, interval: 0 }),
    cameras: 16,
    adds: [{ glyph: "cam", name: "15 more cameras", runs: "cam-01 … cam-16 · 30 fps each" }],
    closeLabel: "CLOSE-UP · THE ARITHMETIC",
    closeHint: "per second of video",
    close: () => {
      const load = M.pipeLoad(solved("bottleneck") ? { cameras: 16, batch: 8, interval: 0 } : { cameras: 8, batch: 8, interval: 0 });
      return h("div", {}, h("pre", { class: "cu-json", text: smFormula(load) }), h("p", { class: "cu-cap", text: `${load.verdict} Load bars are drawn to 140%; the dashed mark is 100%.` }));
    },
    mission: "bottleneck",
    task: (ui) =>
      ui.choice({
        prompt: "At 16 cameras, which part runs out first?",
        options: M.pipeLoad({}).resources.map((r) => [r.id, r.name, null]),
        check: (id) => L.missionChecks.bottleneck({ choice: id }),
        why: (id) => {
          const load = M.pipeLoad({ cameras: 16, batch: 8, interval: 0 });
          const mine = load.resources.find((x) => x.id === id);
          return `${mine.name} reaches ${mine.load}% at 16 cameras, so it still has room.`;
        },
      }),
    after: () => {
      const load = M.pipeLoad({ cameras: 16, batch: 8, interval: 0 });
      const sm = load.resources.find((x) => x.id === "sm");
      return `The SMs need ${fmt(sm.used)} ms of work per 1,000 ms: <b>${sm.load}%</b>. The pipeline falls behind and drops about ${load.droppedPerSec} of 480 frames every second. NVDEC is fine at ${load.resources.find((x) => x.id === "nvdec").load}%: decoding runs on its own engine.`;
    },
  },
  {
    id: "keepup",
    phase: "scale",
    kicker: "Load test",
    title: "Make 16 cameras keep up",
    lead: "Change <code>batch-size</code> or <code>interval</code> until every meter is under 100%. Bigger batches pay the detector's fixed 5 ms less often. Skipping frames is cheaper still, but <b>your tracker breaks above interval 3</b>.",
    minutes: 2,
    view: "board",
    meters: () => M.pipeLoad({ cameras: 16, batch: scale.batch, interval: scale.interval }),
    cameras: 16,
    adds: [{ glyph: "gpu", name: "nvstreammux + nvinfer", runs: "the two settings you can change", conf: () => `batch-size=${scale.batch}\ninterval=${scale.interval}` }],
    closeLabel: "CLOSE-UP · THE ARITHMETIC",
    closeHint: "updates as you change the settings",
    close: () => {
      const load = M.pipeLoad({ cameras: 16, batch: scale.batch, interval: scale.interval });
      return h("div", {}, h("pre", { class: "cu-json", text: smFormula(load) }), h("p", { class: "cu-cap", text: load.verdict }));
    },
    mission: "keep-up",
    task: (ui) => ui.keepUp(),
    after: () => {
      const sm = M.pipeLoad({ cameras: 16, batch: scale.batch, interval: scale.interval }).resources.find((x) => x.id === "sm");
      return `Batch ${scale.batch}, interval ${scale.interval}: the SMs are at <b>${sm.load}%</b> and the tracker keeps every ID. One more thing: at 32 cameras NVDEC hits 106.7% whatever the interval, because every frame still has to be decoded.`;
    },
  },
  {
    id: "done",
    phase: "done",
    kicker: "Done",
    title: "You built a 16-camera car counter",
    lead: "Every frame came in as packets, was decoded and batched on the GPU, detected, tracked and counted, and left as a few hundred bytes of JSON. Here is the config you built.",
    minutes: 0,
    view: "board",
    closeLabel: "ONE FRAME'S JOURNEY",
    closeHint: "the data at each stage",
    close: () =>
      h(
        "div",
        { class: "cu-chain" },
        readoutRows().map(([a, b, c], i) => h("div", { class: i === 2 || i === 8 ? "is-big" : "" }, h("span", { text: `${a} · ${b}` }), h("strong", { text: c }))),
      ),
    task: "done",
  },
];
const BUILD = STEPS.filter((x) => x.phase === "build");

// ---------- benches (steps that need the whole stage) ----------
function benchDetect(host) {
  const p = { preClusterThreshold: nmsP.preClusterThreshold, nmsIouThreshold: nmsP.nmsIouThreshold };
  const { kept, suppressed, belowThreshold } = M.clusterDetections(raw30, p);
  const sc = M.scoreDetections(30, p);
  const svg = sceneSvg(30);
  for (const d of raw30.filter((x) => x.conf < p.preClusterThreshold)) svg.append(boxEl(d.box, "bx-raw"));
  for (const d of suppressed) svg.append(boxEl(d.box, "bx-sup"));
  const seen = new Set();
  for (const d of kept) {
    let kind = "ok";
    if (!d.truth) kind = "fp";
    else if (seen.has(d.truth)) kind = "dup";
    if (d.truth) seen.add(d.truth);
    svg.append(boxEl(d.box, kind === "ok" ? "bx-keep" : kind === "dup" ? "bx-dup" : "bx-fp", `${d.cls} ${d.conf.toFixed(2)}`, kind === "ok" ? "" : kind === "dup" ? "is-warn" : "is-bad"));
  }
  for (const g of M.groundTruth(30)) if (!seen.has(g.id)) svg.append(boxEl(g.box, "bx-fp", "missed", "is-bad"));
  const why = sc.exact
    ? `Exact: ${sc.objects} boxes for ${sc.objects} objects.`
    : [sc.falsePositives && `${sc.falsePositives} false positive${sc.falsePositives > 1 ? "s" : ""}: raise the confidence threshold`, sc.duplicates && `${sc.duplicates} duplicate${sc.duplicates > 1 ? "s" : ""}: NMS lets overlapping boxes through, lower its threshold`, sc.missed && `${sc.missed} missed: ${p.nmsIouThreshold < 0.42 ? "NMS merged the two walkers (their boxes overlap at IoU 0.412)" : "the threshold dropped a real object"}`].filter(Boolean).join(" · ");
  host.append(
    h("div", { class: "fg" }, h("div", { class: "fg-head" }, h("span", { class: "fg-label", text: "CAM-03 · FRAME 30 · NVINFER OUTPUT" }), h("span", { class: "fg-hint", text: "move the two sliders on the right" })), h("div", { class: "fg-controls gd-ledger", text: `${raw30.length} raw  −  ${belowThreshold} under ${p.preClusterThreshold.toFixed(2)}  −  ${suppressed.length} removed by NMS  =  ${kept.length} kept   ·   ${sc.objects} real objects` }), h("div", { class: "fg-body gd-scene-wide" }, h("div", { class: "fg-scroll fg-scene" }, svg)), metricsRow([["kept boxes", sc.detections, sc.detections === sc.objects ? "ok" : "bad"], ["duplicates", sc.duplicates, sc.duplicates ? "bad" : "ok"], ["false positives", sc.falsePositives, sc.falsePositives ? "bad" : "ok"], ["missed", sc.missed, sc.missed ? "bad" : "ok"]]), h("p", { class: "fg-verdict", "data-state": sc.exact ? "ok" : "bad", text: why })),
    h("p", { class: "cu-cap", text: "Purple: kept and correct. Amber: a duplicate of an object already kept. Red: a false positive or a missed object. Dashed grey: under the confidence threshold. Dotted grey: removed by NMS." }),
  );
  codeToggle(host, {
    id: "ds-nms",
    title: "Python · IoU and NMS",
    prompt: "iou(a, b) returns the overlap of two [x, y, w, h] boxes. nms(dets, conf, iou_thr) drops boxes under conf, then keeps boxes greedily by confidence, dropping same-class boxes that overlap a kept box by more than iou_thr. DATA['raw'] holds this frame's 27 boxes.",
    starter: "def iou(a, b):\n    # intersection rectangle, then intersection / union\n    return 0.0\n\ndef nms(dets, conf, iou_thr):\n    kept = []\n    return kept\n\nout = nms(DATA['raw'], 0.5, 0.5)\nprint(len(out), 'boxes kept')\n",
    data: { raw: raw30.map(({ cls, box, conf }) => ({ cls, box, conf })) },
    tests: [
      "check('iou identical', abs(iou([0,0,10,10],[0,0,10,10]) - 1) < 1e-9, f'got {iou([0,0,10,10],[0,0,10,10])}')",
      "check('iou disjoint', iou([0,0,10,10],[20,20,5,5]) == 0, f'got {iou([0,0,10,10],[20,20,5,5])}')",
      "check('iou half shift', abs(iou([0,0,10,10],[5,0,10,10]) - 1/3) < 1e-9, f'got {iou([0,0,10,10],[5,0,10,10])}, want 1/3')",
      "out = nms(DATA['raw'], 0.5, 0.5)",
      "check('7 boxes at 0.5 / 0.5', len(out) == 7, f'got {len(out)}')",
      `want = sorted(${JSON.stringify(def30.kept.map((d) => d.box))})`,
      "check('same boxes as nvinfer', sorted([d['box'] for d in out]) == want, 'compare your kept boxes with the figure at 0.50 / 0.50')",
      "check('walkers merge at 0.3', len(nms(DATA['raw'], 0.5, 0.3)) == 6, 'at NMS 0.3 the two walkers should merge')",
    ].join("\n"),
    solution: "def iou(a, b):\n    x1, y1 = max(a[0], b[0]), max(a[1], b[1])\n    x2, y2 = min(a[0]+a[2], b[0]+b[2]), min(a[1]+a[3], b[1]+b[3])\n    inter = max(0, x2-x1) * max(0, y2-y1)\n    union = a[2]*a[3] + b[2]*b[3] - inter\n    return inter / union if union else 0.0\n\ndef nms(dets, conf, iou_thr):\n    cand = sorted([d for d in dets if d['conf'] >= conf], key=lambda d: (-d['conf'], d['box'][0]))\n    kept = []\n    for d in cand:\n        if all(k['cls'] != d['cls'] or iou(k['box'], d['box']) <= iou_thr for k in kept):\n            kept.append(d)\n    return kept\n",
  });
}

let playTimer = 0;
function benchTrack(host) {
  const run = M.track(trackK);
  const k = trackK;
  const f = trackF;
  const fr = run.frames[f];
  const lastInf = f - (f % (k + 1));
  const svg = sceneSvg(f, `cam-03 · frame ${f} · ${fr.inferred ? "detector ran" : `box held since frame ${lastInf}`}`);
  const firstTrack = new Map();
  for (const x of run.frames.slice(0, f + 1)) for (const t of x.tracks) if (t.truth && !firstTrack.has(t.truth)) firstTrack.set(t.truth, t.id);
  for (const t of fr.tracks) {
    const sw = t.truth && firstTrack.get(t.truth) !== t.id;
    svg.append(boxEl(t.box, fr.inferred ? "bx-keep" : "bx-held", `#${t.id}${sw ? " new ID" : ""}`, sw ? "is-bad" : ""));
  }
  const counted = run.crossings.filter((c) => c.frame <= f).length;
  const truth = M.trueCrossings().filter((c) => c.frame <= f).length;
  const sel = h("select", { class: "gd-select", "aria-label": "interval" }, [0, 1, 2, 3, 4].map((v) => h("option", { value: v, text: `interval=${v}`, selected: v === k })));
  sel.onchange = () => ((trackK = Number(sel.value)), renderStage(), IA.event("control", { name: "interval", value: sel.value }));
  const scrub = h("input", { type: "range", min: 0, max: M.SCENE.frames - 1, step: 1, value: f, "aria-label": "frame" });
  scrub.oninput = () => ((trackF = Number(scrub.value)), renderStage());
  const play = h("button", { class: "gd-tool", type: "button", text: playTimer ? "Pause" : "Play" });
  play.onclick = () => {
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = 0;
      return renderStage();
    }
    if (trackF >= M.SCENE.frames - 1) trackF = 0;
    const tick = () => {
      trackF += 1;
      if (trackF >= M.SCENE.frames - 1) playTimer = 0;
      else playTimer = setTimeout(tick, still ? 0 : 1000 / 15);
      renderStage();
    };
    playTimer = setTimeout(tick, 0);
  };
  const gap = k + 1;
  const rows = M.OBJECTS.map((o) => {
    const sp = Math.hypot(o.vx, o.vy);
    const d = sp * gap;
    const v = M.shiftedIou(o.w, d);
    return h("tr", { class: v < M.TRACKER.minIou ? "is-bad" : "" }, [o.id, String(o.w), sp.toFixed(1), d.toFixed(0), v.toFixed(3)].map((t, i) => h("td", { class: i > 0 ? "num" : "", text: t })));
  });
  host.append(
    h(
      "div",
      { class: "fg" },
      h("div", { class: "fg-head" }, h("span", { class: "fg-label", text: "CAM-03 · 60 FRAMES · IOU TRACKER" }), h("span", { class: "fg-hint", text: "pick an interval, then play" }), h("div", { class: "fg-tools" }, sel, play)),
      h("div", { class: "fg-controls" }, h("label", { class: "fg-ctrl" }, "frame", scrub, h("output", { text: String(f) }))),
      h(
        "div",
        { class: "fg-body fg-split" },
        h("div", { class: "fg-scroll fg-scene" }, svg),
        h("div", {}, h("p", { class: "cu-cap", style: "margin:0 0 6px", text: `interval=${k}: a held box can be ${gap} frame${gap > 1 ? "s" : ""} old when the next detection arrives.` }), h("div", { class: "dt-wrap" }, h("table", { class: "dt" }, h("thead", {}, h("tr", {}, ["object", "w px", "px/frame", "shift d", "IoU"].map((t, i) => h("th", { class: i ? "num" : "", text: t })))), h("tbody", {}, rows)))),
      ),
      metricsRow([["ID switches", run.idSwitches, run.idSwitches ? "bad" : "ok"], ["tracks made", run.tracksCreated, run.tracksCreated > 7 ? "bad" : "ok"], ["cars counted", `${counted} / ${truth}`, counted < truth ? "bad" : "ok"], ["detector runs", `1 in ${gap}`, ""]]),
      h("p", { class: "fg-verdict", "data-state": run.idSwitches ? "bad" : "ok", text: run.idSwitches ? `interval=${k}: ${run.idSwitches} ID switches and ${run.crossings.length} of 3 crossings counted. Cheaper, but the counts are wrong.` : `interval=${k}: every object keeps its ID and all 3 crossings are counted.` }),
    ),
    h("p", { class: "cu-cap", text: "Solid purple: the detector ran on this frame. Dashed: a box held from the last detection while the real object moved on. Red: a track that restarted with a new ID." }),
  );
}

let pyCross = null;
function benchCount(host) {
  const o = M.OBJECTS[0];
  const rows = [22, 23, 24, 25, 26].map((f) => {
    const [x, , w] = M.boxAt(o, f);
    return [String(f), String(x + w / 2)];
  });
  host.append(
    h(
      "div",
      { class: "fg" },
      h("div", { class: "fg-head" }, h("span", { class: "fg-label", text: "TRACK #1 · CAR-A · CENTRE X" }), h("span", { class: "fg-hint", text: "the numbers nvdsanalytics sees" })),
      h("div", { class: "fg-body" }, h("div", { class: "dt-wrap" }, h("table", { class: "dt" }, h("thead", {}, h("tr", {}, ["frame", "centre x", "line x"].map((t, i) => h("th", { class: i ? "num" : "", text: t })))), h("tbody", {}, rows.map(([a, b]) => h("tr", { class: b === "1000" ? "is-key" : "" }, [a, b, "1000"].map((t, i) => h("td", { class: i ? "num" : "", text: t })))))))),
    ),
  );
  const cellHost = h("div");
  host.append(cellHost);
  pyCross = pyCell(cellHost, {
    id: "ds-cross",
    title: "Python · the counting rule",
    prompt: "crossed(prev_cx, cur_cx, line_x) returns 'entry' when a track's centre moves from left of the line to on or past it, 'exit' for the opposite move, and None otherwise. Press Run.",
    starter: "def crossed(prev_cx, cur_cx, line_x):\n    return None\n\nprint(crossed(970, 1000, 1000))\n",
    tests: [
      "check('left to right', crossed(980, 1010, 1000) == 'entry', f'got {crossed(980, 1010, 1000)!r}')",
      "check('right to left', crossed(1010, 980, 1000) == 'exit', f'got {crossed(1010, 980, 1000)!r}')",
      "check('landing on the line counts', crossed(970, 1000, 1000) == 'entry', 'car-a goes 970 → 1000 at frame 25: that is a crossing')",
      "check('no crossing', crossed(900, 950, 1000) is None and crossed(1050, 1100, 1000) is None, 'both on one side: no event')",
      "check('a parked car never crosses', crossed(1620, 1620, 1000) is None, 'no movement: no event')",
    ].join("\n"),
    solution: "def crossed(prev_cx, cur_cx, line_x):\n    if prev_cx < line_x <= cur_cx:\n        return 'entry'\n    if cur_cx < line_x <= prev_cx:\n        return 'exit'\n    return None\n",
    onPass: () => passStep("crossing", { passed: true }),
  });
}

function codeToggle(host, spec) {
  const box = h("div");
  const btn = h("button", { class: "gd-tool", type: "button", text: "Code it in Python" });
  btn.onclick = () => {
    btn.remove();
    pyCell(box, { ...spec, onPass: () => IA.event("control", { name: "pycell", value: `${spec.id}:pass` }) });
  };
  host.append(h("div", {}, btn), box);
}

// =====================================================================
// State, navigation and rendering
// =====================================================================
const KEY = "ia:guide:deepstream";
const state = (() => {
  try {
    return { step: 0, revealed: {}, max: 0, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { step: 0, revealed: {}, max: 0 };
  }
})();
if (state.scale) Object.assign(scale, state.scale);
if (state.nms) Object.assign(nmsP, state.nms);
const saveState = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
};
const stage = document.querySelector("[data-gd-stage]");
const panel = document.querySelector("[data-gd-panel]");
const nextBtn = document.querySelector("[data-gd-next]");
const nextLabel = document.querySelector("[data-gd-next-label]");
const backBtn = document.querySelector("[data-gd-back]");
const phases = document.querySelector("[data-gd-phases]");
const parking = document.querySelector("[data-gd-parking]");
nextLabel.before(h("span", { class: "gd-tick", "aria-hidden": "true", text: "✓" }));
let kitHw = null;

const stepReady = (st) => !st.mission || solved(st.mission);
const builtAt = (i) => Math.min(9, i);

function renderPhases() {
  const cur = STEPS[state.step];
  const firstOf = (p) => STEPS.findIndex((x) => x.phase === p);
  const items = [
    ["kit", "Kit"],
    ["build", "Build", cur.phase === "build" ? `${BUILD.indexOf(cur) + 1}/${BUILD.length}` : ""],
    ["scale", "Scale"],
    ["done", "Done"],
  ];
  phases.replaceChildren(
    ...items.map(([p, label, small]) => {
      const i = firstOf(p);
      const b = h("button", { type: "button", disabled: i > state.max, "aria-current": cur.phase === p ? "step" : null }, label, small ? h("small", { text: small }) : null);
      if (cur.phase === p && p === "build") b.append(h("i", { style: `width:calc(${(BUILD.indexOf(cur) + 1) / BUILD.length} * (100% - 20px))` }));
      b.onclick = () => go(i);
      return b;
    }),
  );
}

function renderStage({ animate = false } = {}) {
  const i = state.step;
  const st = STEPS[i];
  stage.replaceChildren();
  if (st.phase === "build" || st.phase === "scale") stage.append(h("div", { class: "gd-num", text: String(i) }));
  const onHw = st.id === "kit" ? (kitHw ? [kitHw] : []) : st.on || [];
  const where = st.on ? st.on.map((x) => HW[x].label).join(" · ") : "";
  if (st.view === "bench") {
    if (where) stage.append(h("div", { class: "gd-where" }, "runs on", h("b", { text: where })));
    const bench = h("div", { class: "gd-bench" });
    stage.append(bench);
    st.bench(bench);
    return;
  }
  const built = st.phase === "done" || st.phase === "scale" ? 9 : builtAt(i);
  const svg = board({ built, on: onHw, fresh: st.phase === "build" ? i : null, enter: animate, meters: st.meters ? st.meters() : null, cameras: st.cameras || 1, hit: st.id === "kit" ? (id) => ((kitHw = id), renderStage(), renderPanel()) : null });
  stage.append(h("div", { class: "gd-board" }, svg));
  if (st.phase === "build" && ROUTES[i]) {
    if (animate) requestAnimationFrame(() => playToken(svg, i));
    else playToken(svg, i);
  }
  if (st.close) {
    const tools = h("div", { class: "gd-tools" });
    const body = h("div", { class: "gd-close-body" }, st.close());
    const card = h("div", { class: "gd-close" }, h("div", { class: "gd-close-head" }, h("b", { text: st.closeLabel }), h("span", { text: st.closeHint }), tools), body);
    if (st.code) {
      const codeBox = h("div", { class: "gd-close-code" });
      tools.append(h("button", { class: "gd-tool", type: "button", text: "Code it in Python", onclick: (e) => (e.currentTarget.remove(), pyCell(codeBox, { ...st.code, onPass: () => IA.event("control", { name: "pycell", value: `${st.code.id}:pass` }) }), codeBox.scrollIntoView({ block: "nearest" })) }));
      card.append(codeBox);
    }
    if (ROUTES[i] && st.phase === "build") tools.append(h("button", { class: "gd-tool", type: "button", text: "Replay", onclick: () => renderStage({ animate: true }) }));
    stage.append(card);
  }
  fitBoard();
}

// give the board whatever height the close-up leaves, but never below a readable size
function fitBoard() {
  const svg = stage.querySelector(".gd-board svg");
  if (!svg || matchMedia("(max-width: 900px)").matches) return;
  const card = stage.querySelector(".gd-close");
  const room = stage.clientHeight - (card ? card.offsetHeight + 26 : 0) - 14;
  svg.style.maxHeight = `${Math.max(400, room)}px`;
}
addEventListener("resize", () => fitBoard());

// task widgets
function taskUi(st, box, fb, onSolved) {
  let tries = 0;
  const fail = (msg) => {
    tries += 1;
    fb.dataset.ok = "false";
    fb.textContent = msg;
    if (tries >= 2 && !box.querySelector(".gd-reveal") && st.mission) {
      const rv = h("button", { class: "gd-reveal", type: "button", text: "Show me the answer" });
      rv.onclick = () => {
        state.revealed[st.mission] = true;
        if (st.mission === "keep-up") Object.assign(scale, { batch: 16, interval: 0 }), keepSettings();
        saveState();
        IA.event("control", { name: "reveal", value: st.mission });
        onSolved(true);
      };
      box.append(rv);
    }
  };
  const ok = (detail) => passStep(st.mission, detail);
  return {
    tries: () => tries,
    number({ prompt, placeholder, check, hint, onTry }) {
      const inp = h("input", { type: "number", inputmode: "numeric", placeholder, "aria-label": placeholder });
      const btn = h("button", { class: "ia-btn ia-primary", type: "button", text: "Check" });
      const go_ = () => {
        const v = Number(String(inp.value).replace(/[, _]/g, ""));
        if (!inp.value.trim()) return;
        onTry?.(v);
        IA.event("answer", { index: -1, stage: "mission", answer: v, correct: check(v) });
        if (check(v)) ok({ value: v });
        else fail(hint(v, tries + 1));
      };
      btn.onclick = go_;
      inp.onkeydown = (e) => e.key === "Enter" && go_();
      return [h("p", { text: prompt }), h("div", { class: "gd-row" }, inp, btn)];
    },
    choice({ prompt, options, check, why }) {
      const wrap = h("div", { class: "gd-choices" });
      for (const [id, label, wrong] of options) {
        const b = h("button", { class: "gd-choice", type: "button", text: label });
        b.onclick = () => {
          const good = check(id);
          IA.event("answer", { index: -1, stage: "mission", answer: id, correct: good });
          b.dataset.state = good ? "yes" : "no";
          if (good) ok({ choice: id });
          else fail(wrong || (why ? why(id) : "Not this one."));
        };
        wrap.append(b);
      }
      return [h("p", { text: prompt }), wrap];
    },
    order() {
      const units = [
        [5, "IDR slice · 5"],
        [8, "PPS · 8"],
        [1, "non-IDR slice · 1"],
        [7, "SPS · 7"],
      ];
      const why = {
        5: "Not yet: the slice header points to a PPS, so the decoder needs the PPS first.",
        8: "Not yet: the PPS points to an SPS. The SPS holds the picture size, so it goes first.",
        1: "A non-IDR slice belongs to a P frame, which needs an earlier frame. Frame 0 is a key frame, so it has none.",
      };
      const seq = h("div", { class: "gd-seq" });
      const picked = [];
      const wrap = h("div", { class: "gd-chips" });
      for (const [type, label] of units) {
        const b = h("button", { class: "gd-chip", type: "button", text: label });
        b.onclick = () => {
          const want = M.NAL_ORDER[picked.length];
          if (type === want) {
            picked.push(type);
            b.disabled = true;
            seq.append(h("span", { text: label }));
            fb.textContent = "";
            if (picked.length === M.NAL_ORDER.length && L.missionChecks["nal-order"]({ order: picked })) ok({ order: picked });
          } else {
            b.dataset.state = "no";
            setTimeout(() => delete b.dataset.state, 400);
            IA.event("answer", { index: -1, stage: "mission", answer: type, correct: false });
            fail(why[type] || "Not that one yet.");
          }
        };
        wrap.append(b);
      }
      return [h("p", { text: "The decoder must get this key frame's NAL units in the order it can read them. Tap them in that order. One of them does not belong in a key frame." }), wrap, seq];
    },
    nms() {
      const mk = (key, label) => {
        const out = h("output", { text: nmsP[key].toFixed(2) });
        const r = h("input", { type: "range", min: 0.1, max: 0.95, step: 0.05, value: nmsP[key], "aria-label": label });
        r.oninput = () => {
          nmsP[key] = Number(r.value);
          nmsP.touched = true;
          keepSettings();
          out.textContent = nmsP[key].toFixed(2);
          renderStage();
          renderParts();
          IA.event("control", { name: label, value: r.value });
          const p = { preClusterThreshold: nmsP.preClusterThreshold, nmsIouThreshold: nmsP.nmsIouThreshold };
          if (L.missionChecks.nms(p)) ok(p);
        };
        return h("div", { class: "gd-slider" }, h("label", {}, label, out), r);
      };
      return [h("p", { text: "Set both thresholds so frame 30 has exactly one box per object: no duplicates, no false positives, nothing missed. The frame on the left updates as you move them." }), mk("preClusterThreshold", "pre-cluster-threshold"), mk("nmsIouThreshold", "nms-iou-threshold")];
    },
    code() {
      const details = h("details", { class: "gd-fallback" }, h("summary", { text: "Python won't load here? Pick the rule instead" }));
      const opts = [
        ["a", "prev < x <= cur → entry · cur < x <= prev → exit", true],
        ["b", "prev <= x < cur → entry · cur <= x < prev → exit", false],
        ["c", "abs(cur − x) < 5 → crossing", false],
        ["d", "cur >= x → entry", false],
      ];
      const why = { b: "This misses car-a: it goes 970 → 1000 and lands exactly on the line.", c: "A fast car can jump past the band between two frames, and a car parked near the line fires on every frame.", d: "This fires on every frame once the car is past the line, not once." };
      const wrap = h("div", { class: "gd-choices" });
      for (const [id, label, good] of opts) {
        const b = h("button", { class: "gd-choice", type: "button", html: `<code>${label}</code>` });
        b.onclick = () => {
          b.dataset.state = good ? "yes" : "no";
          if (good) ok({ passed: true });
          else fail(why[id]);
        };
        wrap.append(b);
      }
      details.append(wrap);
      return [h("p", { text: "Write crossed() in the cell on the left and press Run. The step is done when all 5 checks pass." }), details];
    },
    keepUp() {
      const bSel = h("select", { class: "gd-select", "aria-label": "batch-size" }, [1, 2, 4, 8, 16, 32].map((v) => h("option", { value: v, text: `batch-size=${v}`, selected: v === scale.batch })));
      const iSel = h("select", { class: "gd-select", "aria-label": "interval" }, [0, 1, 2, 3, 4].map((v) => h("option", { value: v, text: `interval=${v}`, selected: v === scale.interval })));
      const onChange = () => {
        scale.batch = Number(bSel.value);
        scale.interval = Number(iSel.value);
        keepSettings();
        IA.event("control", { name: "keep-up", value: `${scale.batch}/${scale.interval}` });
        renderStage();
        renderParts();
        const load = M.pipeLoad({ cameras: 16, ...scale });
        if (L.missionChecks["keep-up"](scale)) ok({ ...scale });
        else if (scale.interval > M.ANSWERS.maxSafeInterval) fail(`Under budget, but interval=${scale.interval} breaks the tracker: you showed in step 7 that IDs switch above ${M.ANSWERS.maxSafeInterval}.`);
        else {
          fb.dataset.ok = "false";
          fb.textContent = load.verdict;
        }
      };
      bSel.onchange = onChange;
      iSel.onchange = onChange;
      return [h("p", { text: "16 cameras. Keep every meter under 100% and the interval at 3 or lower." }), h("div", { class: "gd-row" }, bSel, iSel)];
    },
  };
}

let partsHost = null;
function renderParts() {
  const st = STEPS[state.step];
  if (!partsHost) return;
  const rows = [];
  if (st.parts) {
    for (const p of st.parts()) {
      if (p.title) {
        rows.push(h("h3", { class: "gd-h" }, p.title, h("span", { text: String(p.n) })));
        continue;
      }
      const row = h("div", { class: `gd-part ${p.hw && p.hw === kitHw ? "is-on" : ""}` }, glyph(p.glyph), h("div", {}, h("div", { class: "gd-part-name", text: p.name }), h("div", { class: "gd-part-runs", text: p.runs })));
      if (p.hw) {
        row.style.cursor = "pointer";
        row.onclick = () => ((kitHw = p.hw), renderStage(), renderParts());
      }
      rows.push(row);
    }
    // group rows under their titles
    const out = [];
    let list = null;
    for (const r of rows) {
      if (r.tagName === "H3") {
        out.push(r);
        list = h("div", { class: "gd-parts" });
        out.push(list);
      } else list.append(r);
    }
    partsHost.replaceChildren(...out);
    return;
  }
  if (!st.adds) return partsHost.replaceChildren();
  const label = st.id === "detect" || st.id === "keepup" ? "You configure" : "You add";
  partsHost.replaceChildren(
    h("h3", { class: "gd-h" }, label, h("span", { text: String(st.adds.length) })),
    h(
      "div",
      { class: "gd-parts" },
      st.adds.map((a) => h("div", { class: "gd-part" }, glyph(a.glyph), h("div", {}, h("div", { class: "gd-part-name", text: a.name }), h("div", { class: "gd-part-runs", text: a.runs })), a.conf ? h("pre", { text: typeof a.conf === "function" ? a.conf() : a.conf }) : null)),
    ),
  );
}

function configText() {
  return `# deepstream_app.txt (built in this lesson; check keys against your DeepStream version)
[source0]
enable=1
type=4                      # RTSP
uri=rtsp://cam-03.local/stream1
cudadec-memtype=0
# [source1] … [source15]: one per camera

[streammux]
batch-size=${scale.batch}
width=1920
height=1080
batched-push-timeout=40000
live-source=1

[primary-gie]
enable=1
batch-size=${scale.batch}
interval=${scale.interval}
config-file=config_infer_primary.txt

[tracker]
enable=1
ll-lib-file=/opt/nvidia/deepstream/deepstream/lib/libnvds_nvmultiobjecttracker.so
ll-config-file=config_tracker_IOU.yml

[nvds-analytics]
enable=1
config-file=config_nvdsanalytics.txt

[sink1]
enable=1
type=6                      # message converter + broker
msg-broker-proto-lib=/opt/nvidia/deepstream/deepstream/lib/libnvds_kafka_proto.so
msg-broker-conn-str=kafka.local;9092
topic=traffic-events

# config_infer_primary.txt
[property]
net-scale-factor=0.00392156862745098
model-color-format=0
network-mode=2
batch-size=${scale.batch}
infer-dims=3;544;960
cluster-mode=2

[class-attrs-all]
pre-cluster-threshold=${Math.max(0.4, Math.min(0.85, nmsP.preClusterThreshold)).toFixed(2)}
nms-iou-threshold=${Math.max(0.45, Math.min(0.75, nmsP.nmsIouThreshold)).toFixed(2)}
`;
}

function renderPanel() {
  const i = state.step;
  const st = STEPS[i];
  const total = STEPS.length - 1;
  const left = STEPS.slice(i).reduce((a, x) => a + x.minutes, 0);
  const kicker = st.phase === "build" || st.phase === "scale" ? `Step ${i} of ${total - 1} · ${st.kicker}` : st.kicker;
  panel.replaceChildren(h("div", { class: "gd-meta" }, h("span", { class: "gd-kicker", text: kicker }), left ? h("span", { class: "gd-left", text: `${left} min left` }) : null), h("h2", { class: "gd-title", text: st.title }), h("p", { class: "gd-lead", html: st.lead }));
  partsHost = h("div");
  panel.append(partsHost);
  renderParts();

  if (st.task === "predict") {
    const pred = parking.querySelector("[data-ia-predict]") || document.querySelector("[data-ia-predict]");
    if (pred) {
      pred.hidden = false;
      panel.append(pred);
    }
  } else if (st.task === "done") {
    if (!M.keepsUp(scale)) Object.assign(scale, { batch: 16, interval: 0 });
    const sm = M.pipeLoad({ cameras: 16, ...scale }).resources.find((x) => x.id === "sm");
    panel.append(
      h("div", { class: "gd-stats" }, h("div", {}, h("span", { text: "cameras" }), h("strong", { text: "16" })), h("div", {}, h("span", { text: "SM load" }), h("strong", { text: `${sm.load}%` })), h("div", {}, h("span", { text: "elements" }), h("strong", { text: "9" }))),
    );
    const copy = h("button", { class: "gd-tool", type: "button", text: "Copy" });
    copy.onclick = () => navigator.clipboard?.writeText(configText()).then(() => (copy.textContent = "Copied"));
    panel.append(h("h3", { class: "gd-h gd-h-row" }, "Your config", copy), h("div", { class: "gd-config" }, h("pre", { text: configText() })));
    const check = parking.querySelector("[data-gd-check]") || document.querySelector("[data-gd-check]");
    if (check) panel.append(check);
  } else if (typeof st.task === "function") {
    const box = h("div", { class: "gd-task" });
    const fb = h("div", { class: "gd-fb", "aria-live": "polite" });
    const tag = h("span", { class: "gd-task-tag" });
    const afterBox = h("div");
    const showSolved = () => {
      box.dataset.done = "true";
      tag.textContent = state.revealed[st.mission] && !IA.isDone(st.mission) ? "✓ Answer shown" : "✓ Solved";
      fb.textContent = "";
      box.querySelector(".gd-reveal")?.remove();
      afterBox.replaceChildren(h("div", { class: "gd-after" }, h("h4", { text: "What just happened" }), h("div", { html: st.after() })));
      renderPanelNextCard();
    };
    const ui = taskUi(st, box, fb, () => {
      renderStage();
      showSolved();
    });
    currentSolved = showSolved;
    tag.textContent = "Your move";
    box.append(tag, ...[].concat(st.task(ui)), fb);
    panel.append(box, afterBox);
    if (solved(st.mission)) showSolved();
  }
  const nx = STEPS[i + 1];
  if (nx) {
    const card = h("button", { class: "gd-next-card", type: "button", disabled: !stepReady(st) }, h("b", { text: nx.phase === "done" ? "✓" : String(i + 1) }), h("span", { text: nx.title }), h("span", { "aria-hidden": "true", text: "→" }));
    card.onclick = () => stepReady(st) && go(i + 1);
    panel.append(h("h3", { class: "gd-h", text: "Up next" }), card);
  }
  panel.scrollTop = 0;
}

let currentSolved = null;
function passStep(mission, detail) {
  if (!mission) return;
  const fresh = IA.complete(mission, { quiet: true });
  if (fresh) IA.event("control", { name: "step-solved", value: mission, detail });
  renderStage();
  if (STEPS[state.step].mission === mission) currentSolved?.();
  renderPanelNextCard();
}
function renderPanelNextCard() {
  const card = panel.querySelector(".gd-next-card");
  if (card) card.disabled = !stepReady(STEPS[state.step]);
  syncNext();
}

function syncNext() {
  const st = STEPS[state.step];
  const ready = stepReady(st);
  nextBtn.dataset.ready = String(ready);
  nextBtn.setAttribute("aria-disabled", String(!ready));
  backBtn.disabled = state.step === 0;
  if (st.phase === "done") {
    nextLabel.textContent = "Take the checkpoint";
    return;
  }
  nextLabel.textContent = !ready ? "Solve the task to continue" : st.nextLabel || (STEPS[state.step + 1].phase === "done" ? "Done, finish up" : "Done, next step");
}

function go(i, { animate = true } = {}) {
  clearTimeout(playTimer);
  playTimer = 0;
  state.step = Math.max(0, Math.min(STEPS.length - 1, i));
  state.max = Math.max(state.max, state.step);
  saveState();
  IA.event("control", { name: "step", value: STEPS[state.step].id });
  if (STEPS[state.step].phase === "done") IA.event("control", { name: "guide-finished", value: true });
  currentSolved = null;
  // park the reusable nodes before the panel is cleared
  for (const sel of ["[data-ia-predict]", "[data-gd-check]"]) {
    const n = document.querySelector(sel);
    if (n && !parking.contains(n)) parking.append(n);
  }
  renderPhases();
  renderPanel();
  renderStage({ animate });
  syncNext();
  stage.scrollTop = 0;
  if (matchMedia("(max-width: 900px)").matches) scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
}

nextBtn.addEventListener("click", () => {
  if (STEPS[state.step].phase === "done") return document.querySelector("[data-ia-check-open]")?.click();
  if (!stepReady(STEPS[state.step])) {
    panel.querySelector(".gd-task")?.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    panel.querySelector(".gd-task input, .gd-task button, .gd-task select")?.focus({ preventScroll: true });
    return;
  }
  go(state.step + 1);
});
backBtn.addEventListener("click", () => go(state.step - 1));
addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, select")) return;
  if (e.key === "ArrowRight" && stepReady(STEPS[state.step])) go(state.step + 1);
  if (e.key === "ArrowLeft") go(state.step - 1);
});

const fromUrl = /[?&]step=(\d+)/.exec(location.search);
go(fromUrl ? Number(fromUrl[1]) : state.step, { animate: true });
window.__lesson = { ready: true, M, go, state, steps: STEPS.map((x) => x.id) };
