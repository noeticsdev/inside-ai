// Lesson runtime for "Inside a video-analytics pipeline". Every number comes from model.mjs.
import * as M from "./model.mjs";
import { createIA, theme } from "../../platform/shell/sdk.js";
import { mountPyCell } from "../../platform/shell/pycell.js";

const L = window.__LESSON__;
L.missionChecks = Object.fromEntries(M.MISSIONS.map((m) => [m.id, m.check]));
const T = theme();
document.querySelector("[data-ia-theme]")?.addEventListener("click", () => T.toggle());
const IA = createIA({ M: { MISSIONS: [] }, data: L });
window.IA = IA;
const body = document.querySelector("[data-lesson-body]");
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- tiny DOM helpers ----------
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

function section(step, title, prose) {
  const sec = h("section", { class: "ls-section" }, h("span", { class: "ls-step", text: step }), h("h2", { text: title }), h("div", { class: "ls-prose", html: prose }));
  body.append(sec);
  return sec;
}
function card(label, hint) {
  const tools = h("div", { class: "fg-tools" });
  const fg = h("div", { class: "fg" }, h("div", { class: "fg-head" }, h("span", { class: "fg-label", text: label }), h("span", { class: "fg-hint", text: hint }), tools));
  return { fg, tools };
}
function mission(id, ...content) {
  const meta = L.missions.find((m) => m.id === id);
  const tag = h("span", { class: "mi-tag" });
  const fb = h("div", { class: "mi-fb", "aria-live": "polite" });
  const el = h("div", { class: "mi" }, h("div", { class: "mi-head" }, tag), h("h3", { text: meta.title }), h("p", { text: meta.goal }), content, fb);
  const sync = () => {
    const done = IA.isDone(id);
    el.dataset.done = String(done);
    tag.textContent = done ? "Mission · done" : "Mission";
  };
  sync();
  return {
    el,
    fb,
    say(ok, text, why) {
      fb.dataset.ok = String(ok);
      fb.textContent = text;
      if (why) fb.append(h("span", { class: "why", text: why }));
    },
    pass() {
      IA.complete(id);
      sync();
      onSolved(id);
    },
    done: () => IA.isDone(id),
  };
}
const solvedHooks = [];
function onSolved(id) {
  for (const f of solvedHooks) f(id);
}
function pyCell(host, spec) {
  try {
    mountPyCell(host, spec);
  } catch (error) {
    host.append(h("p", { class: "fg-cap", text: "The Python cell could not load here." }));
    console.warn(error);
  }
}

// ---------- the camera scene (1920 x 1080 world units) ----------
function sceneSvg(f, label) {
  const g = s("svg", { viewBox: "0 0 1920 1080", role: "img", "aria-label": `Camera cam-03, frame ${f}: a street with cars, a truck, two walkers and a cyclist, and a vertical counting line at x = 1000.` });
  g.append(
    s("rect", { class: "sc-bg", x: 0, y: 0, width: 1920, height: 1080 }),
    s("rect", { class: "sc-bld", x: 40, y: 30, width: 1840, height: 230 }),
  );
  for (let c = 0; c < 14; c++) for (let r = 0; r < 2; r++) g.append(s("rect", { class: "sc-win", x: 80 + c * 130, y: 70 + r * 95, width: 70, height: 55 }));
  g.append(
    s("rect", { class: "sc-walk", x: 0, y: 270, width: 1920, height: 240 }),
    s("rect", { class: "sc-road", x: 0, y: 510, width: 1920, height: 390 }),
    s("line", { class: "sc-mark", x1: 0, y1: 705, x2: 1920, y2: 705 }),
    s("rect", { class: "sc-walk", x: 0, y: 900, width: 1920, height: 180 }),
  );
  for (const o of M.OBJECTS) {
    const [x, y, w, hh] = M.boxAt(o, f);
    if (x + w < 0 || x > 1920) continue;
    if (o.cls === "car") {
      g.append(
        s("rect", { class: "sc-obj", x: x + w * 0.2, y: y + hh * 0.06, width: w * 0.55, height: hh * 0.4, rx: 14 }),
        s("rect", { class: "sc-obj", x: x + 4, y: y + hh * 0.36, width: w - 8, height: hh * 0.46, rx: 18 }),
        s("circle", { class: "sc-obj-dark", cx: x + w * 0.24, cy: y + hh * 0.84, r: hh * 0.13 }),
        s("circle", { class: "sc-obj-dark", cx: x + w * 0.76, cy: y + hh * 0.84, r: hh * 0.13 }),
      );
    } else {
      const cx = x + w / 2;
      g.append(
        s("circle", { class: "sc-obj", cx, cy: y + hh * 0.12, r: w * 0.2 }),
        s("rect", { class: "sc-obj", x: x + w * 0.24, y: y + hh * 0.26, width: w * 0.52, height: hh * 0.4, rx: 10 }),
        s("line", { class: "sc-obj", x1: cx - w * 0.12, y1: y + hh * 0.66, x2: cx - w * 0.16, y2: y + hh * 0.98 }),
        s("line", { class: "sc-obj", x1: cx + w * 0.12, y1: y + hh * 0.66, x2: cx + w * 0.16, y2: y + hh * 0.98 }),
      );
    }
  }
  g.append(
    s("line", { class: "sc-line", x1: M.SCENE.line.x, y1: M.SCENE.line.y0, x2: M.SCENE.line.x, y2: M.SCENE.line.y1 }),
    s("text", { class: "sc-line-text", x: M.SCENE.line.x + 14, y: M.SCENE.line.y0 + 34, text: "count line" }),
    s("text", { class: "sc-line-text", x: 60, y: 1050, text: label || `cam-03 · frame ${f}` }),
  );
  return g;
}
function boxEl(box, cls, label, labelCls) {
  const [x, y, w, hh] = box;
  const g = s("g", {}, s("rect", { class: cls, x, y, width: w, height: hh }));
  if (label) {
    const tw = label.length * 23 + 20;
    const ly = y - 52 < 0 ? y + hh + 4 : y - 52;
    g.append(s("g", { class: `bx-label ${labelCls || ""}` }, s("rect", { x, y: ly, width: tw, height: 48, rx: 5 }), s("text", { x: x + 10, y: ly + 35, text: label })));
  }
  return g;
}

// =====================================================================
// STEP 1: the anatomy, one frame at a time
// =====================================================================
const LANES = [
  { id: "net", label: "NETWORK · NIC", y: 8, h: 92 },
  { id: "cpu", label: "CPU · SYSTEM RAM", y: 106, h: 92 },
  { id: "pcie", label: "PCIe BUS", y: 204, h: 34 },
  { id: "nvdec", label: "GPU · NVDEC (video engine)", y: 244, h: 92 },
  { id: "vram", label: "GPU · MEMORY (NVMM)", y: 342, h: 92 },
  { id: "sm", label: "GPU · SMs (CUDA cores, Tensor Cores)", y: 440, h: 92 },
];
// boxes sit below each lane's label row
const laneY = (id) => {
  const l = LANES.find((x) => x.id === id);
  return id === "pcie" ? l.y + l.h / 2 : l.y + 22 + (l.h - 22) / 2;
};
const bytesSolved = () => IA.isDone("bytes");
const IDR = M.framePackets(0);
const PF = M.framePackets(1);
const T0 = M.track(0);
const firstCrossing = T0.crossings[0];
const eventJson = JSON.stringify(M.eventMessage(firstCrossing), null, 2);
const tensorShape = `[8, 3, ${M.NETWORK_INPUT.h}, ${M.NETWORK_INPUT.w}]`;
const raw30 = M.rawDetections(30);
const def30 = M.clusterDetections(raw30, { preClusterThreshold: 0.5, nmsIouThreshold: 0.5 });

const STAGES = [
  { id: "src", name: "rtspsrc", sub: "RTSP · RTP/UDP", data: () => `${IDR.packets.length} packets`, lane: "net", x: 100 },
  { id: "parse", name: "rtph264depay", sub: "+ h264parse", data: () => `AU ${fmt(IDR.accessUnitBytes)} B`, lane: "cpu", x: 250 },
  { id: "decode", name: "nvv4l2decoder", sub: "NVDEC engine", data: () => (bytesSolved() ? `NV12 ${fmt(M.ANSWERS.nv12Frame)} B` : "NV12 ? B"), lane: "nvdec", x: 400 },
  { id: "mux", name: "nvstreammux", sub: "batch-size=8", data: () => "8 pointers", lane: "vram", x: 550 },
  { id: "pre", name: "nvinfer", sub: "pre-process", data: () => (bytesSolved() ? `${fmt(M.ANSWERS.batchTensor)} B` : "FP16 tensor ? B"), lane: "sm", x: 700 },
  { id: "trt", name: "nvinfer", sub: "TensorRT + NMS", data: () => `${raw30.length} → ${def30.kept.length} boxes`, lane: "sm", x: 850 },
  { id: "track", name: "nvtracker", sub: "IOU tracker", data: () => `${def30.kept.length} track IDs`, lane: "sm", x: 1000 },
  { id: "analytics", name: "nvdsanalytics", sub: "line crossing", data: () => `${T0.crossings.length} crossings`, lane: "cpu", x: 1150 },
  { id: "msg", name: "nvmsgbroker", sub: "→ Kafka", data: () => `JSON ${fmt(new TextEncoder().encode(JSON.stringify(M.eventMessage(firstCrossing))).length)} B`, lane: "net", x: 1300 },
];
const BOX = { w: 136, h: 60 };

function inspector(i) {
  const st = STAGES[i];
  const left = h("div");
  const right = h("div");
  const runs = (t) => h("p", { class: "in-runs", text: t });
  const pre = (t) => h("pre", { text: t });
  const table = (head, rows, keyRow) =>
    h("div", { class: "dt-wrap" }, h("table", { class: "dt" }, h("thead", {}, h("tr", {}, head.map((c) => h("th", { class: c.num ? "num" : "", text: c.t })))), h("tbody", {}, rows.map((r, ri) => h("tr", { class: keyRow && keyRow(r, ri) ? "is-key" : "" }, r.map((c, ci) => h("td", { class: head[ci].num ? "num" : "", text: c })))))));
  if (st.id === "src") {
    left.append(h("h3", { text: "rtspsrc" }), runs("Runs on the CPU · data arrives through the NIC"), h("p", { text: "Each camera streams H.264 over RTP/UDP after an RTSP handshake. A frame is cut into packets with at most 1,400 bytes of payload. The 12-byte RTP header carries a sequence number, to spot lost packets, and a 90 kHz timestamp, to put packets back into frames." }), pre("location=rtsp://cam-03.local/stream1\nprotocols=udp\nlatency=200          # jitter buffer, ms"));
    const pk = (f) => {
      const rows = f.packets.map((p) => [fmt(p.seq), fmt(p.timestamp), p.marker ? "1" : "0", fmt(p.payload), p.kind]);
      const view = rows.length > 7 ? [...rows.slice(0, 4), ["…", "", "", "", `${rows.length - 6} more FU-A fragments`], ...rows.slice(-2)] : rows;
      return h("div", {}, h("p", { text: `${f.idr ? "IDR (key) frame" : "P frame"}: ${f.packets.length} packets, ${fmt(f.accessUnitBytes)} bytes of H.264, ${fmt(f.wireBytes)} bytes on the wire with RTP, UDP and IP headers. All share timestamp ${fmt(f.timestamp)}; the marker bit M = 1 ends the frame.` }), table([{ t: "seq", num: true }, { t: "timestamp", num: true }, { t: "M" }, { t: "payload B", num: true }, { t: "kind" }], view, (r) => r[2] === "1"));
    };
    const holder = h("div", {}, pk(IDR));
    const bI = h("button", { class: "btn-sm on", type: "button", text: "Frame 0 · IDR" });
    const bP = h("button", { class: "btn-sm", type: "button", text: "Frame 1 · P" });
    bI.onclick = () => (holder.replaceChildren(pk(IDR)), bI.classList.add("on"), bP.classList.remove("on"));
    bP.onclick = () => (holder.replaceChildren(pk(PF)), bP.classList.add("on"), bI.classList.remove("on"));
    right.append(h("div", { class: "mi-row" }, bI, bP), holder, h("p", { text: `Over a 30-frame group (1 IDR + 29 P frames) that is ${M.cameraBitrateMbps().toFixed(2)} Mbit/s per camera. Timestamps step by 90,000 / 30 = 3,000 per frame.` }));
  } else if (st.id === "parse") {
    left.append(h("h3", { text: "rtph264depay → h264parse" }), runs("Runs on the CPU · then the bitstream crosses PCIe"), h("p", { text: "The depayloader joins FU-A fragments back into NAL units. The parser groups the NAL units of one timestamp into an access unit: one compressed frame. Only this compressed access unit crosses PCIe to the GPU." }), pre("NAL type 7  SPS   sequence parameters\nNAL type 8  PPS   picture parameters\nNAL type 5  IDR   decodable on its own\nNAL type 1  slice needs earlier frames"));
    const rows = (f) => f.nals.map((n) => [String(n.type), n.name, fmt(n.bytes)]);
    right.append(h("p", { text: "Frame 0 (IDR) access unit:" }), table([{ t: "type" }, { t: "NAL unit" }, { t: "bytes", num: true }], rows(IDR)), h("p", { text: "Frame 1 (P) access unit:" }), table([{ t: "type" }, { t: "NAL unit" }, { t: "bytes", num: true }], rows(PF)), h("p", { text: `The IDR frame is ${fmt(IDR.accessUnitBytes)} bytes, ${(IDR.accessUnitBytes / PF.accessUnitBytes).toFixed(1)}× a P frame, because it cannot borrow from earlier frames.` }));
  } else if (st.id === "decode") {
    left.append(h("h3", { text: "nvv4l2decoder" }), runs("Runs on NVDEC · a fixed-function video engine, not the SMs"), h("p", { text: "NVDEC turns the access unit into raw pixels in NV12 format and writes them into GPU memory (an NVMM surface). It must decode every frame: a P frame is built from the frame before it." }), pre("cudadec-memtype=0    # decode into device memory"));
    const y = 1920 * 1080;
    const uv = 1920 * 540;
    right.append(
      h("p", { text: "NV12 = one luma (Y) byte per pixel, then one interleaved chroma (U, V) plane at half height:" }),
      h("div", { class: "mem" }, h("div", { class: "mem-row" }, h("span", { text: "Y plane" }), h("div", { class: "mem-bar", style: "width:100%" }), h("span", { text: bytesSolved() ? `${fmt(y)} B` : "1920 × 1080 × 1 B" })), h("div", { class: "mem-row" }, h("span", { text: "UV plane" }), h("div", { class: "mem-bar uv", style: "width:50%" }), h("span", { text: bytesSolved() ? `${fmt(uv)} B` : "1920 × 540 × 1 B" }))),
      h("p", { text: bytesSolved() ? `Total ${fmt(M.ANSWERS.nv12Frame)} bytes per frame: 1.5 bytes per pixel, half of RGB's 3. This surface never leaves GPU memory.` : "Total bytes per frame: work it out in Mission 1 below." }),
    );
  } else if (st.id === "mux") {
    left.append(h("h3", { text: "nvstreammux" }), runs("GPU memory · it batches pointers, it does not copy pixels"), h("p", { text: "nvstreammux takes one frame from each camera and forms a batch, so the detector runs once for 8 frames instead of 8 times. If a camera is late, batched-push-timeout pushes a partial batch instead of stalling the others." }), pre("batch-size=8\nwidth=1920\nheight=1080\nbatched-push-timeout=40000   # µs"));
    right.append(h("p", { text: "Batch at frame 30: one NVMM surface per source, with source_id in the batch metadata." }), h("div", { class: "batch-grid" }, Array.from({ length: 8 }, (_, k) => h("div", { class: "batch-cell" }, h("b", { text: `cam-0${k + 1}` }), `source_id ${k}`, h("br"), "frame 30"))));
  } else if (st.id === "pre") {
    left.append(h("h3", { text: "nvinfer · pre-process" }), runs("Runs on the SMs (CUDA kernels)"), h("p", { text: "Each frame is converted from NV12 to planar RGB, scaled from 1920 × 1080 to the network's 960 × 544 input, and normalised. The 8 frames become one input tensor in batch, channel, height, width order." }), pre(`net-scale-factor=0.00392156862745098   # 1/255\nmodel-color-format=0     # RGB\nnetwork-mode=2           # FP16\nbatch-size=8\ninfer-dims=3;544;960`));
    right.append(h("div", { class: "formula", text: `y = net-scale-factor × (x − offset)\n  a pixel of 200 → 200 / 255 = ${(200 * M.NET_SCALE_FACTOR).toFixed(4)}\n\ntensor shape  N × C × H × W = ${tensorShape}\nelement size  FP16 = 2 bytes\ntensor bytes  = ${bytesSolved() ? fmt(M.ANSWERS.batchTensor) : "? (Mission 1)"}` }));
  } else if (st.id === "trt") {
    left.append(h("h3", { text: "nvinfer · TensorRT + clustering" }), runs("Runs on the SMs (Tensor Cores for FP16)"), h("p", { text: "TensorRT runs the detector once on the whole batch. A dense detector fires several overlapping boxes per object. Clustering drops boxes under the confidence threshold, then non-maximum suppression keeps the best box among overlapping boxes of the same class." }), pre("[class-attrs-all]\npre-cluster-threshold=0.5\nnms-iou-threshold=0.5\ncluster-mode=2           # 2 = NMS"));
    right.append(h("p", { text: `Frame 30 from cam-03: ${raw30.length} raw candidates → ${raw30.filter((d) => d.conf >= 0.5).length} at or above 0.5 confidence → ${def30.kept.length} boxes after NMS, one per object.` }), h("p", { text: "You tune both thresholds yourself in Step 3." }));
  } else if (st.id === "track") {
    left.append(h("h3", { text: "nvtracker" }), runs("Runs on the SMs or CPU, depending on the low-level tracker"), h("p", { text: "The tracker gives each object an ID that stays the same across frames, by matching new boxes to existing tracks. The IOU tracker matches on box overlap alone, with no motion model." }), pre("ll-lib-file=libnvds_nvmultiobjecttracker.so\nll-config-file=config_tracker_IOU.yml\n# minimum IoU to keep a match: 0.3"));
    const f30 = T0.frames[30].tracks;
    right.append(h("p", { text: "Tracks on frame 30:" }), table([{ t: "id" }, { t: "class" }, { t: "x", num: true }, { t: "y", num: true }, { t: "w", num: true }, { t: "h", num: true }], f30.map((t) => [`#${t.id}`, t.cls, ...t.box.map(String)])), h("p", { text: "You break this tracker on purpose in Step 4." }));
  } else if (st.id === "analytics") {
    left.append(h("h3", { text: "nvdsanalytics" }), runs("Runs on the CPU · it reads metadata, not pixels"), h("p", { text: "Analytics use boxes and IDs only. When a car's track centre crosses the counting line, the element writes a crossing into the frame's metadata." }), pre("[line-crossing-stream-0]\nenable=1\n# direction (x1;y1;x2;y2) then the line (x3;y3;x4;y4)\nline-crossing-Entry=900;650;1100;650;1000;300;1000;1000\nclass-id=0"));
    right.append(h("p", { text: "Crossings in the 2-second clip:" }), table([{ t: "frame", num: true }, { t: "track" }, { t: "object" }, { t: "direction" }], T0.crossings.map((c) => [String(c.frame), `#${c.track}`, c.truth, c.direction])));
  } else {
    left.append(h("h3", { text: "nvmsgconv → nvmsgbroker" }), runs("Runs on the CPU · leaves through the NIC"), h("p", { text: "nvmsgconv turns the event metadata into a JSON payload and nvmsgbroker publishes it to Kafka. The 3 MB frame has become a message of a few hundred bytes." }), pre("proto-lib=libnvds_kafka_proto.so\nconn-str=kafka.local;9092\ntopic=traffic-events"));
    right.append(h("p", { text: `First crossing event, as sent (trimmed schema, ${STAGES[8].data().replace("JSON ", "")}):` }), h("pre", { class: "in-json", text: eventJson }));
  }
  return [left, right];
}

function anatomy() {
  const sec = section(
    "Step 1",
    "Follow one frame through the hardware",
    "<p>A DeepStream app is a GStreamer pipeline. Each box below is a real element, drawn in the lane of the hardware it runs on. Step through it and watch two things: the size of the data, and the lane it sits in. The pixels stay in GPU memory from decode to inference. Only metadata climbs back to the CPU.</p>",
  );
  const { fg, tools } = card("FIG 1 · ANATOMY", "click a box or use the arrows");
  const W = 1380;
  const H = 590;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "DeepStream pipeline drawn across hardware lanes: NIC, CPU, PCIe, NVDEC, GPU memory and GPU SMs." });
  LANES.forEach((l, k) => svg.append(s("rect", { class: k % 2 ? "st-lane-alt" : "st-lane", x: 0, y: l.y, width: W, height: l.h }), s("text", { class: "st-lane-label", x: 10, y: l.id === "pcie" ? l.y + l.h / 2 + 5 : l.y + 17, text: l.label })));
  // PCIe crossings: the bitstream goes down, metadata comes back up
  const pcie = laneY("pcie");
  const xs1 = (i) => STAGES[i].x;
  svg.append(s("text", { class: "st-pcie-text", x: (xs1(1) + xs1(2)) / 2 + 8, y: pcie + 5, text: "compressed bitstream ↓" }), s("text", { class: "st-pcie-text", x: (xs1(6) + xs1(7)) / 2 + 8, y: pcie + 5, text: "metadata only ↑" }));
  const pts = STAGES.map((st) => [st.x, laneY(st.lane)]);
  const segs = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [x1, y1] = pts[k];
    const [x2, y2] = pts[k + 1];
    const mx = (x1 + x2) / 2;
    const d = y1 === y2 ? `M${x1} ${y1}H${x2}` : `M${x1} ${y1}H${mx}V${y2}H${x2}`;
    const p = s("path", { class: "st-path", d });
    segs.push(p);
    svg.append(p);
  }
  // pixels-stay bracket under the GPU lanes
  const bx1 = STAGES[2].x - BOX.w / 2;
  const bx2 = STAGES[6].x + BOX.w / 2;
  svg.append(s("path", { class: "st-bracket", d: `M${bx1} 542V552H${bx2}V542` }), s("text", { class: "st-bracket-text", x: (bx1 + bx2) / 2, y: 574, "text-anchor": "middle", text: "pixels stay in GPU memory from decode to tracking: NVMM pointers, no copies" }));
  const boxes = STAGES.map((st, i) => {
    const y = laneY(st.lane) - BOX.h / 2;
    const dataText = s("text", { class: "st-box-data", x: st.x, y: y + 52, "text-anchor": "middle", "data-data": "" });
    const g = s(
      "g",
      { class: "st-stage", tabindex: 0, role: "button", "aria-label": `${st.name} ${st.sub}` },
      s("rect", { class: "st-box", x: st.x - BOX.w / 2, y, width: BOX.w, height: BOX.h, rx: 5 }),
      s("text", { class: "st-box-name", x: st.x, y: y + 20, "text-anchor": "middle", text: st.name }),
      s("text", { class: "st-box-sub", x: st.x, y: y + 36, "text-anchor": "middle", text: st.sub }),
      dataText,
    );
    g.addEventListener("click", () => go(i));
    g.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go(i)));
    svg.append(g);
    return { g, dataText };
  });
  const marker = s("circle", { class: "st-marker", r: 6, cx: 0, cy: 0 });
  svg.append(marker);
  const insp = h("div", { class: "in" });
  const counter = h("span", { class: "fg-hint" });
  const prev = h("button", { class: "btn-sm", type: "button", "aria-label": "Previous element", text: "←" });
  const next = h("button", { class: "btn-sm", type: "button", "aria-label": "Next element", text: "→" });
  tools.append(counter, prev, next);
  let cur = 0;
  function paintData() {
    STAGES.forEach((st, i) => (boxes[i].dataText.textContent = st.data()));
  }
  function go(i) {
    cur = Math.max(0, Math.min(STAGES.length - 1, i));
    boxes.forEach((b, k) => b.g.classList.toggle("is-active", k === cur));
    segs.forEach((p, k) => p.setAttribute("class", k < cur ? "st-path-done" : "st-path"));
    marker.style.transform = `translate(${pts[cur][0]}px, ${pts[cur][1] - BOX.h / 2 - 9}px)`;
    counter.textContent = `${cur + 1} / ${STAGES.length}`;
    prev.disabled = cur === 0;
    next.disabled = cur === STAGES.length - 1;
    insp.replaceChildren(...inspector(cur));
    IA.event("control", { name: "anatomy-stage", value: STAGES[cur].id });
    IA.trace?.(`stage ${cur + 1}: ${STAGES[cur].name}`);
  }
  prev.onclick = () => go(cur - 1);
  next.onclick = () => go(cur + 1);
  fg.append(h("div", { class: "fg-body fg-scroll fg-wide" }, svg), insp);
  sec.append(fg);
  paintData();
  go(0);
  solvedHooks.push((id) => id === "bytes" && (paintData(), go(cur)));

  // Mission 1: the bytes
  const fIn = h("input", { type: "number", inputmode: "numeric", "aria-label": "Bytes in one NV12 1080p frame", placeholder: "frame bytes" });
  const tIn = h("input", { type: "number", inputmode: "numeric", "aria-label": "Bytes in one 8 x 3 x 544 x 960 FP16 tensor", placeholder: "tensor bytes" });
  const btn = h("button", { class: "ia-btn ia-primary", type: "button", text: "Check" });
  const mi = mission("bytes", h("div", { class: "mi-row" }, h("label", {}, "NV12 frame", fIn), h("label", {}, `${tensorShape} FP16`, tIn), btn));
  let tries = 0;
  btn.onclick = () => {
    const frame = Number(fIn.value);
    const tensor = Number(tIn.value);
    IA.event("answer", { index: -1, stage: "mission", answer: `${frame}/${tensor}`, correct: false });
    if (L.missionChecks.bytes({ frame, tensor })) {
      mi.say(true, "Both right.", `Y: 1920 × 1080 × 1 = 2,073,600\nUV: 1920 × 540 × 1 = 1,036,800\nframe = 3,110,400 bytes (1.5 B per pixel)\n\ntensor = 8 × 3 × 544 × 960 × 2 = 25,067,520 bytes\nThe numbers now appear on the anatomy.`);
      mi.pass();
    } else {
      tries += 1;
      const fOk = Math.abs(frame - M.ANSWERS.nv12Frame) <= M.ANSWERS.nv12Frame * 0.01;
      const tOk = Math.abs(tensor - M.ANSWERS.batchTensor) <= M.ANSWERS.batchTensor * 0.01;
      const hint = [
        fOk ? "The frame is right." : frame === 1920 * 1080 * 3 ? "The frame: that is RGB at 3 bytes per pixel. NV12 stores less." : tries > 1 ? "Frame hint: Y is 1 byte per pixel; the UV plane is full width but half height." : "The frame is not right yet. Look at the decoder's memory layout in the inspector.",
        tOk ? "The tensor is right." : tries > 1 ? "Tensor hint: multiply all four dimensions, then by 2 bytes for FP16." : "The tensor is not right yet.",
      ].join(" ");
      mi.say(false, hint);
    }
  };
  if (mi.done()) mi.say(true, "Solved: 3,110,400 bytes per frame and 25,067,520 bytes per batch tensor.");
  sec.append(mi.el);

  const cellHost = h("div");
  sec.append(h("p", { class: "ls-prose", html: "<p>Now write it as code. These two functions are what you would use to size GPU memory for a deployment.</p>" }), cellHost);
  pyCell(cellHost, {
    id: "ds-bytes",
    title: "Python · size the buffers",
    prompt: "Return the bytes of one NV12 frame, and of an N×C×H×W tensor with the given bytes per element.",
    starter: "def nv12_bytes(width, height):\n    # Y plane: 1 byte per pixel. UV plane: full width, half height, 1 byte each.\n    return 0\n\ndef tensor_bytes(n, c, h, w, bytes_per_element):\n    return 0\n\nprint(nv12_bytes(1920, 1080), tensor_bytes(8, 3, 544, 960, 2))\n",
    tests: [
      "check('1080p NV12 frame', nv12_bytes(1920, 1080) == 3110400, f'got {nv12_bytes(1920, 1080)}, want 3110400')",
      "check('4K NV12 frame', nv12_bytes(3840, 2160) == 12441600, f'got {nv12_bytes(3840, 2160)}, want 12441600')",
      "check('batch tensor, FP16', tensor_bytes(8, 3, 544, 960, 2) == 25067520, f'got {tensor_bytes(8, 3, 544, 960, 2)}')",
      "check('batch tensor, INT8', tensor_bytes(16, 3, 544, 960, 1) == 25067520, 'INT8 halves the bytes, batch 16 doubles them')",
    ].join("\n"),
    solution: "def nv12_bytes(width, height):\n    return width * height + width * (height // 2)\n\ndef tensor_bytes(n, c, h, w, bytes_per_element):\n    return n * c * h * w * bytes_per_element\n",
    onPass: () => IA.event("control", { name: "pycell", value: "ds-bytes:pass" }),
  });
}

// =====================================================================
// STEP 2: the budget
// =====================================================================
function budget() {
  const sec = section(
    "Step 2",
    "Every stage has a budget",
    "<p>Each element costs time on one piece of hardware. NVDEC decodes every frame. The SMs run pre-processing, the detector and the tracker. Add cameras and one of them runs out first. The model below uses fixed example costs, so you can do the arithmetic yourself. Real numbers depend on the GPU and the model.</p>",
  );
  const choices = h("div", { class: "mi-choices" });
  const mi = mission("bottleneck", choices);
  const res0 = M.pipeLoad({}).resources;
  for (const r of res0) {
    const b = h("button", { class: "btn-sm", type: "button", text: r.name });
    b.onclick = () => {
      set({ cameras: 16, batch: 8, interval: 0, nvmm: true });
      const load = M.pipeLoad({ cameras: 16, batch: 8, interval: 0, nvmm: true });
      const ok = L.missionChecks.bottleneck({ choice: r.id });
      const sm = load.resources.find((x) => x.id === "sm");
      IA.event("answer", { index: -2, stage: "mission", answer: r.id, correct: ok });
      if (ok) {
        mi.say(true, `Right: the SMs reach ${sm.load}%.`, smFormula(load));
        mi.pass();
      } else {
        const mine = load.resources.find((x) => x.id === r.id);
        mi.say(false, `${r.name} is at ${mine.load}%, so it still has room. The figure is now set to 16 cameras: find the red bar and read its arithmetic.`);
      }
    };
    choices.append(b);
  }
  if (mi.done()) mi.say(true, "Solved: the SMs run out first, at 104.4%.");
  sec.append(mi.el);

  const { fg } = card("FIG 2 · PIPELINE BUDGET", "change the load and read the bars");
  const cam = h("input", { type: "range", min: 1, max: 32, step: 1, value: 8, "aria-label": "cameras" });
  const camOut = h("output");
  const batch = h("select", { class: "ia-select", "aria-label": "nvstreammux batch-size" }, [1, 2, 4, 8, 16, 32].map((v) => h("option", { value: v, text: String(v) })));
  const interval = h("select", { class: "ia-select", "aria-label": "nvinfer interval" }, [0, 1, 2, 3, 4].map((v) => h("option", { value: v, text: String(v) })));
  const nvmm = h("input", { type: "checkbox", checked: true, "aria-label": "keep frames in NVMM" });
  const bars = h("div", { class: "bars" });
  const formula = h("div", { class: "formula" });
  const verdict = h("p", { class: "fg-verdict" });
  fg.append(
    h("div", { class: "fg-controls" }, h("label", { class: "fg-ctrl" }, "cameras @30 fps", cam, camOut), h("label", { class: "fg-ctrl" }, "batch-size", batch), h("label", { class: "fg-ctrl" }, "interval", interval), h("label", { class: "fg-ctrl" }, nvmm, "frames stay in NVMM")),
    h("div", { class: "fg-body" }, bars, formula),
    verdict,
  );
  batch.value = "8";
  function smFormula(load) {
    const c = load.config;
    const fps = c.cameras * 30;
    const inf = fps / (c.interval + 1);
    const nb = inf / c.batch;
    const infer = nb * (M.COST.inferBaseMs + M.COST.inferPerFrameMs * c.batch);
    const sm = load.resources.find((x) => x.id === "sm");
    return [
      `SMs, per second of video:`,
      `  inferred frames = ${c.cameras} × 30 / (${c.interval} + 1) = ${fmt(Math.round(inf))}`,
      `  batches         = ${fmt(Math.round(inf))} / ${c.batch} = ${r3(nb)}`,
      `  detector        = ${r3(nb)} × (5 + 1.2 × ${c.batch}) ms = ${fmt(Math.round(infer))} ms`,
      `  pre-process     = ${fmt(Math.round(inf))} × 0.1 ms = ${fmt(Math.round(inf * 0.1))} ms`,
      `  tracker         = ${fmt(fps)} × 0.25 ms = ${fmt(fps * 0.25)} ms   (every frame)`,
      `  total           = ${fmt(sm.used)} of 1,000 ms → ${sm.load}%`,
      `NVDEC: ${fmt(fps)} frames/s to decode of ${fmt(M.GPU.nvdecFps)} → ${load.resources.find((x) => x.id === "nvdec").load}%   (interval does not reduce decoding)`,
    ].join("\n");
  }
  function render() {
    const load = M.pipeLoad({ cameras: Number(cam.value), batch: Number(batch.value), interval: Number(interval.value), nvmm: nvmm.checked });
    camOut.textContent = cam.value;
    bars.replaceChildren(
      ...load.resources.map((r) =>
        h(
          "div",
          { class: `bar-row ${r.load > 100 ? "is-over" : ""}` },
          h("span", { class: "bar-name", text: r.name }),
          h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: `width:${Math.min(100, (r.load / 140) * 100)}%` }), h("div", { class: "bar-100", style: `left:${(100 / 140) * 100}%` })),
          h("span", { class: "bar-val", text: `${fmt(r.used)} / ${fmt(r.capacity)} ${r.unit} · ${r.load}%` }),
        ),
      ),
    );
    formula.textContent = smFormula(load);
    verdict.textContent = load.verdict;
    verdict.dataset.state = load.bottleneck ? "bad" : "ok";
  }
  function set(c) {
    cam.value = String(c.cameras);
    batch.value = String(c.batch);
    interval.value = String(c.interval);
    nvmm.checked = c.nvmm;
    render();
  }
  for (const el of [cam, batch, interval, nvmm]) el.addEventListener("input", () => (render(), IA.event("control", { name: el.getAttribute("aria-label"), value: el.type === "checkbox" ? el.checked : el.value })));
  render();
  sec.append(fg, h("p", { class: "fg-cap", text: "Bars are drawn on a scale to 140%; the dashed mark is 100%. Red means that part cannot keep up and frames queue, then drop. Try: 16 cameras with batch 16, or interval 1. Then 32 cameras at interval 4: why does skipping inference not save NVDEC? Untick NVMM to see what copying every frame to system RAM costs." }));
}

// =====================================================================
// STEP 3: the detector and NMS
// =====================================================================
function detector() {
  const sec = section(
    "Step 3",
    "From 27 raw boxes to one box per object",
    "<p>The detector's raw output for frame 30 has 27 candidate boxes for 7 real objects. nvinfer cleans it in two passes:</p><ol><li><b>Confidence threshold</b> (<code>pre-cluster-threshold</code>): drop every box below it. Too low keeps a shadow under the truck; too high drops a real object.</li><li><b>NMS</b> (<code>nms-iou-threshold</code>): sort by confidence, keep the best box, and drop every other box of the same class that overlaps it by more than the threshold. Repeat. Too high keeps duplicates; too low merges two people walking side by side.</li></ol>",
  );
  const mi = mission("nms");
  sec.append(mi.el);
  const { fg } = card("FIG 3 · DETECTOR OUTPUT · FRAME 30", "move both sliders");
  const conf = h("input", { type: "range", min: 0.1, max: 0.95, step: 0.05, value: 0.25, "aria-label": "pre-cluster-threshold" });
  const nms = h("input", { type: "range", min: 0.1, max: 0.95, step: 0.05, value: 0.85, "aria-label": "nms-iou-threshold" });
  const cOut = h("output");
  const nOut = h("output");
  const showRaw = h("input", { type: "checkbox", checked: true, "aria-label": "show dropped boxes" });
  const stage = h("div");
  const side = h("div");
  const metrics = h("div", { class: "metrics" });
  const verdict = h("p", { class: "fg-verdict" });
  fg.append(
    h("div", { class: "fg-controls" }, h("label", { class: "fg-ctrl" }, "pre-cluster-threshold", conf, cOut), h("label", { class: "fg-ctrl" }, "nms-iou-threshold", nms, nOut), h("label", { class: "fg-ctrl" }, showRaw, "show dropped boxes")),
    h("div", { class: "fg-body fg-split" }, stage, side),
    metrics,
    verdict,
  );
  let touched = false;
  function render() {
    const p = { preClusterThreshold: Number(conf.value), nmsIouThreshold: Number(nms.value) };
    cOut.textContent = p.preClusterThreshold.toFixed(2);
    nOut.textContent = p.nmsIouThreshold.toFixed(2);
    const { kept, suppressed, belowThreshold } = M.clusterDetections(raw30, p);
    const sc = M.scoreDetections(30, p);
    const svg = sceneSvg(30);
    if (showRaw.checked) {
      for (const d of raw30.filter((x) => x.conf < p.preClusterThreshold)) svg.append(boxEl(d.box, "bx-raw"));
      for (const d of suppressed) svg.append(boxEl(d.box, "bx-sup"));
    }
    const seen = new Set();
    const rows = [];
    for (const d of kept) {
      let kind = "ok";
      if (!d.truth) kind = "false positive";
      else if (seen.has(d.truth)) kind = "duplicate";
      if (d.truth) seen.add(d.truth);
      svg.append(boxEl(d.box, kind === "ok" ? "bx-keep" : kind === "duplicate" ? "bx-dup" : "bx-fp", `${d.cls} ${d.conf.toFixed(2)}`, kind === "ok" ? "" : kind === "duplicate" ? "is-warn" : "is-bad"));
      rows.push({ d, kind });
    }
    for (const g of M.groundTruth(30)) if (!seen.has(g.id)) svg.append(boxEl(g.box, "bx-fp", "missed", "is-bad"));
    stage.replaceChildren(h("div", { class: "fg-scroll fg-scene" }, svg));
    side.replaceChildren(
      h("div", { class: "formula", text: `raw candidates      ${raw30.length}\nbelow ${p.preClusterThreshold.toFixed(2)}          −${belowThreshold}\nsuppressed by NMS   −${suppressed.length}\nkept                ${kept.length}   (real objects: ${sc.objects})` }),
      h("div", { class: "dt-wrap" }, h("table", { class: "dt" }, h("thead", {}, h("tr", {}, ["class", "conf", "x", "y", "w", "h", ""].map((t, i) => h("th", { class: i > 0 && i < 6 ? "num" : "", text: t })))), h("tbody", {}, rows.map(({ d, kind }) => h("tr", { class: kind === "ok" ? "" : "is-bad" }, [d.cls, d.conf.toFixed(2), ...d.box.map(String), kind].map((t, i) => h("td", { class: i > 0 && i < 6 ? "num" : "", text: t }))))))),
    );
    metrics.replaceChildren(
      ...[
        ["kept boxes", sc.detections, sc.detections === sc.objects ? "ok" : "bad"],
        ["duplicates", sc.duplicates, sc.duplicates ? "bad" : "ok"],
        ["false positives", sc.falsePositives, sc.falsePositives ? "bad" : "ok"],
        ["missed objects", sc.missed, sc.missed ? "bad" : "ok"],
      ].map(([k, v, c]) => h("div", {}, h("span", { text: k }), h("strong", { class: c, text: String(v) }))),
    );
    const why = sc.exact
      ? `Exact: ${sc.objects} boxes for ${sc.objects} objects.`
      : [sc.falsePositives && `${sc.falsePositives} false positive${sc.falsePositives > 1 ? "s" : ""}: raise the confidence threshold`, sc.duplicates && `${sc.duplicates} duplicate${sc.duplicates > 1 ? "s" : ""}: NMS lets overlapping boxes through, lower its IoU threshold`, sc.missed && `${sc.missed} missed: ${p.nmsIouThreshold < 0.42 ? "NMS merged the two walkers (their boxes overlap at IoU 0.412)" : "the threshold dropped a real object"}`].filter(Boolean).join(" · ");
    verdict.textContent = why;
    verdict.dataset.state = sc.exact ? "ok" : "bad";
    if (touched && sc.exact && !mi.done()) {
      mi.say(true, `Exact at confidence ${p.preClusterThreshold.toFixed(2)} and NMS ${p.nmsIouThreshold.toFixed(2)}.`, "The working window: confidence from 0.40 to 0.85, NMS from above 0.412 (the walkers' overlap) to 0.75.\nOutside it you either keep junk or lose a person.");
      mi.pass();
    }
  }
  for (const el of [conf, nms, showRaw])
    el.addEventListener("input", () => {
      touched = el !== showRaw || touched;
      render();
      IA.event("control", { name: el.getAttribute("aria-label"), value: el.type === "checkbox" ? el.checked : el.value });
    });
  render();
  if (mi.done()) mi.say(true, "Solved. Try 0.30 NMS to watch the two walkers merge into one box.");
  sec.append(fg, h("p", { class: "fg-cap", text: "Purple: kept and correct. Amber: a duplicate of an object already kept. Red: a false positive or a missed object. Dashed grey: dropped by the threshold; dotted grey: suppressed by NMS." }));

  const cellHost = h("div");
  sec.append(h("div", { class: "ls-prose", html: "<p>Write the two functions nvinfer runs here. <code>DATA['raw']</code> holds the 27 raw boxes from this frame as <code>{'cls', 'box': [x, y, w, h], 'conf'}</code>.</p>" }), cellHost);
  const expected = def30.kept.map((d) => d.box);
  pyCell(cellHost, {
    id: "ds-nms",
    title: "Python · IoU and NMS",
    prompt: "iou(a, b) returns the overlap of two [x, y, w, h] boxes. nms(dets, conf, iou_thr) drops boxes below conf, then keeps boxes greedily by confidence, dropping same-class boxes that overlap a kept box by more than iou_thr.",
    starter: "def iou(a, b):\n    # intersection rectangle, then intersection / union\n    return 0.0\n\ndef nms(dets, conf, iou_thr):\n    kept = []\n    return kept\n\nout = nms(DATA['raw'], 0.5, 0.5)\nprint(len(out), 'boxes kept')\n",
    data: { raw: raw30.map(({ cls, box, conf }) => ({ cls, box, conf })) },
    tests: [
      "check('iou identical', abs(iou([0,0,10,10],[0,0,10,10]) - 1) < 1e-9, f'got {iou([0,0,10,10],[0,0,10,10])}')",
      "check('iou disjoint', iou([0,0,10,10],[20,20,5,5]) == 0, f'got {iou([0,0,10,10],[20,20,5,5])}')",
      "check('iou half shift', abs(iou([0,0,10,10],[5,0,10,10]) - 1/3) < 1e-9, f'got {iou([0,0,10,10],[5,0,10,10])}, want 1/3')",
      "out = nms(DATA['raw'], 0.5, 0.5)",
      "check('7 boxes at 0.5 / 0.5', len(out) == 7, f'got {len(out)}')",
      `want = sorted(${JSON.stringify(expected)})`,
      "check('same boxes as nvinfer', sorted([d['box'] for d in out]) == want, 'compare your kept boxes with the figure at 0.50 / 0.50')",
      "check('walkers merge at 0.3', len(nms(DATA['raw'], 0.5, 0.3)) == 6, 'at NMS 0.3 the two walkers should merge')",
    ].join("\n"),
    solution: "def iou(a, b):\n    x1, y1 = max(a[0], b[0]), max(a[1], b[1])\n    x2, y2 = min(a[0]+a[2], b[0]+b[2]), min(a[1]+a[3], b[1]+b[3])\n    inter = max(0, x2-x1) * max(0, y2-y1)\n    union = a[2]*a[3] + b[2]*b[3] - inter\n    return inter / union if union else 0.0\n\ndef nms(dets, conf, iou_thr):\n    cand = sorted([d for d in dets if d['conf'] >= conf], key=lambda d: (-d['conf'], d['box'][0]))\n    kept = []\n    for d in cand:\n        if all(k['cls'] != d['cls'] or iou(k['box'], d['box']) <= iou_thr for k in kept):\n            kept.append(d)\n    return kept\n",
    onPass: () => IA.event("control", { name: "pycell", value: "ds-nms:pass" }),
  });
}

// =====================================================================
// STEP 4: the tracker and the inference interval
// =====================================================================
function tracker() {
  const sec = section(
    "Step 4",
    "Skip inference frames, keep the IDs",
    "<p>Setting <code>interval=k</code> makes nvinfer run on one frame in every k + 1. That cuts SM load, but the tracker must bridge the gap. The IOU tracker keeps each track's last box on skipped frames. When the next detection arrives, it joins the track it overlaps most, but only at IoU ≥ 0.3. An object moving d pixels sideways with a box w wide overlaps its old box by IoU = (w − d) / (w + d). Below 0.3 the tracker starts a new ID, and the line counter can miss a car.</p>",
  );
  const guess = h("input", { type: "number", min: 0, max: 4, step: 1, "aria-label": "your predicted interval", placeholder: "0 to 4" });
  const btn = h("button", { class: "ia-btn ia-primary", type: "button", text: "Check" });
  const mi = mission("interval", h("p", { text: "Each object's width and speed are in the table beside the figure. Work it out before you scrub." }), h("div", { class: "mi-row" }, h("label", {}, "largest safe interval", guess), btn));
  btn.onclick = () => {
    const v = Number(guess.value);
    const ok = L.missionChecks.interval({ interval: v });
    IA.event("answer", { index: -3, stage: "mission", answer: v, correct: ok });
    const k = M.ANSWERS.maxSafeInterval;
    const why = `car-a: 30 px/frame, box 260 px wide.\n  interval ${k}:     d = 30 × ${k + 1} = ${30 * (k + 1)} px → IoU = ${260 - 30 * (k + 1)}/${260 + 30 * (k + 1)} = ${r3(M.shiftedIou(260, 30 * (k + 1)))} ≥ 0.3 ✓\n  interval ${k + 1}:     d = 30 × ${k + 2} = ${30 * (k + 2)} px → IoU = ${260 - 30 * (k + 2)}/${260 + 30 * (k + 2)} = ${r3(M.shiftedIou(260, 30 * (k + 2)))} < 0.3 ✗\nThe fastest object relative to its width sets the limit.`;
    if (ok) {
      mi.say(true, `Right: interval ${k}.`, why);
      mi.pass();
    } else mi.say(false, v > k ? `Interval ${v} breaks a track. Set it in the figure and watch car-a.` : `Interval ${v} is safe, but you can skip more. Find the object that limits it.`);
    setInterval_(Number.isFinite(v) && v >= 0 && v <= 4 ? v : 0);
  };
  if (mi.done()) mi.say(true, `Solved: interval ${M.ANSWERS.maxSafeInterval}. Set ${M.ANSWERS.maxSafeInterval + 1} to watch it fail.`);
  sec.append(mi.el);

  const { fg, tools } = card("FIG 4 · IOU TRACKER OVER 60 FRAMES", "pick an interval, then scrub or play");
  const intervalSel = h("select", { class: "ia-select", "aria-label": "interval" }, [0, 1, 2, 3, 4].map((v) => h("option", { value: v, text: String(v) })));
  const scrub = h("input", { type: "range", min: 0, max: M.SCENE.frames - 1, step: 1, value: 24, "aria-label": "frame" });
  const fOut = h("output");
  const play = h("button", { class: "btn-sm", type: "button", text: "Play" });
  tools.append(play);
  const stage = h("div");
  const side = h("div");
  const metrics = h("div", { class: "metrics" });
  const verdict = h("p", { class: "fg-verdict" });
  fg.append(h("div", { class: "fg-controls" }, h("label", { class: "fg-ctrl" }, "interval", intervalSel), h("label", { class: "fg-ctrl" }, "frame", scrub, fOut)), h("div", { class: "fg-body fg-split" }, stage, side), metrics, verdict);
  let run = M.track(0);
  function setInterval_(k) {
    intervalSel.value = String(k);
    run = M.track(k);
    render();
  }
  function render() {
    const k = Number(intervalSel.value);
    const f = Number(scrub.value);
    fOut.textContent = String(f);
    const fr = run.frames[f];
    const lastInf = f - (f % (k + 1));
    const svg = sceneSvg(f, `cam-03 · frame ${f} · ${fr.inferred ? "detector ran" : `held since frame ${lastInf}`}`);
    const switchedIds = new Set();
    // a track is "new" for an object if the object had an older track before
    const firstTrack = new Map();
    for (const x of run.frames.slice(0, f + 1)) for (const t of x.tracks) if (t.truth && !firstTrack.has(t.truth)) firstTrack.set(t.truth, t.id);
    for (const t of fr.tracks) if (t.truth && firstTrack.get(t.truth) !== t.id) switchedIds.add(t.id);
    for (const t of fr.tracks) svg.append(boxEl(t.box, fr.inferred ? "bx-keep" : "bx-held", `#${t.id}${switchedIds.has(t.id) ? " new ID" : ""}`, switchedIds.has(t.id) ? "is-bad" : ""));
    const counted = run.crossings.filter((c) => c.frame <= f).length;
    stage.replaceChildren(h("div", { class: "fg-scroll fg-scene" }, svg));
    const gap = k + 1;
    const rows = M.OBJECTS.map((o) => {
      const sp = Math.hypot(o.vx, o.vy);
      const d = sp * gap;
      const v = M.shiftedIou(o.w, d);
      return h("tr", { class: v < M.TRACKER.minIou ? "is-bad" : "" }, [o.id, String(o.w), sp.toFixed(1), d.toFixed(0), v.toFixed(3)].map((t, i) => h("td", { class: i > 0 ? "num" : "", text: t })));
    });
    side.replaceChildren(
      h("p", { text: `With interval ${k}, a box can be ${gap} frame${gap > 1 ? "s" : ""} old when the next detection arrives. Overlap of each object's new box with its held box:` }),
      h("div", { class: "dt-wrap" }, h("table", { class: "dt" }, h("thead", {}, h("tr", {}, ["object", "w px", "px/frame", "shift d", "IoU"].map((t, i) => h("th", { class: i ? "num" : "", text: t })))), h("tbody", {}, rows))),
      h("p", { class: "fg-cap", style: "padding:6px 0 0", text: "IoU = (w − d) / (w + d) for a sideways shift; the tracker needs ≥ 0.300." }),
    );
    metrics.replaceChildren(
      ...[
        ["ID switches (clip)", run.idSwitches, run.idSwitches ? "bad" : "ok"],
        ["tracks created", run.tracksCreated, run.tracksCreated > 7 ? "bad" : "ok"],
        ["cars counted", `${counted} / ${M.trueCrossings().filter((c) => c.frame <= f).length}`, counted < M.trueCrossings().filter((c) => c.frame <= f).length ? "bad" : "ok"],
        ["SM load, 16 cams", `${M.pipeLoad({ cameras: 16, batch: 8, interval: k }).resources.find((r) => r.id === "sm").load}%`, ""],
      ].map(([a, b, c]) => h("div", {}, h("span", { text: a }), h("strong", { class: c, text: String(b) }))),
    );
    verdict.textContent = run.idSwitches
      ? `Interval ${k}: ${run.idSwitches} ID switches and ${run.crossings.length} of 3 crossings counted. The detector is cheaper, but the counts are wrong.`
      : `Interval ${k}: every object keeps its ID and all 3 crossings are counted, with the detector running on 1 frame in ${k + 1}.`;
    verdict.dataset.state = run.idSwitches ? "bad" : "ok";
  }
  intervalSel.addEventListener("input", () => (setInterval_(Number(intervalSel.value)), IA.event("control", { name: "interval", value: intervalSel.value })));
  scrub.addEventListener("input", () => render());
  let timer = 0;
  play.onclick = () => {
    if (timer) return stop();
    if (Number(scrub.value) >= M.SCENE.frames - 1) scrub.value = "0";
    play.textContent = "Pause";
    play.setAttribute("aria-pressed", "true");
    const stepMs = still ? 0 : 1000 / 15;
    const tick = () => {
      const f = Number(scrub.value) + 1;
      if (f >= M.SCENE.frames) return stop();
      scrub.value = String(f);
      render();
      timer = setTimeout(tick, stepMs);
    };
    timer = setTimeout(tick, stepMs);
  };
  function stop() {
    clearTimeout(timer);
    timer = 0;
    play.textContent = "Play";
    play.setAttribute("aria-pressed", "false");
  }
  render();
  sec.append(fg, h("p", { class: "fg-cap", text: "Solid purple: the detector ran on this frame. Dashed purple: a held box from the last inferred frame, while the real car has moved on. Red: a track that started over with a new ID." }));

  const cellHost = h("div");
  sec.append(h("div", { class: "ls-prose", html: "<p>Last piece: the counting rule nvdsanalytics applies to each track, frame by frame.</p>" }), cellHost);
  pyCell(cellHost, {
    id: "ds-cross",
    title: "Python · count line crossings",
    prompt: "crossed(prev_cx, cur_cx, line_x) returns 'entry' when a track's centre moves from left of the line to on or past it, 'exit' for the opposite move, and None otherwise.",
    starter: "def crossed(prev_cx, cur_cx, line_x):\n    return None\n\nprint(crossed(980, 1010, 1000))\n",
    tests: [
      "check('left to right', crossed(980, 1010, 1000) == 'entry', f'got {crossed(980, 1010, 1000)!r}')",
      "check('right to left', crossed(1010, 980, 1000) == 'exit', f'got {crossed(1010, 980, 1000)!r}')",
      "check('landing on the line counts', crossed(990, 1000, 1000) == 'entry', 'a centre that reaches the line has crossed')",
      "check('no crossing', crossed(900, 950, 1000) is None and crossed(1050, 1100, 1000) is None, 'both sides of the line: no event')",
      "check('a parked car never crosses', crossed(1620, 1620, 1000) is None, 'no movement: no event')",
    ].join("\n"),
    solution: "def crossed(prev_cx, cur_cx, line_x):\n    if prev_cx < line_x <= cur_cx:\n        return 'entry'\n    if cur_cx < line_x <= prev_cx:\n        return 'exit'\n    return None\n",
    onPass: () => IA.event("control", { name: "pycell", value: "ds-cross:pass" }),
  });
}

anatomy();
budget();
detector();
tracker();
window.__lesson = { ready: true, M };
