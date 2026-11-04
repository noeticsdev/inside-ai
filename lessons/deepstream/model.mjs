// Inside a video-analytics pipeline: the pure model behind every number on the lesson page.
// No DOM, no clock, no Math.random. Costs are fixed example values for one example GPU, said so on the page.
// Facts follow the DeepStream SDK developer guide (element names and config keys), RFC 3550 (RTP),
// RFC 6184 (H.264 RTP payload) and the NV12 layout (Y plane + interleaved half-height UV plane).

// ---------- byte math ----------
export const NV12_BYTES_PER_PIXEL = 1.5;
export const nv12Bytes = (w, h) => w * h + (w * h) / 2;
export const tensorBytes = (n, c, h, w, bytesPerElement) => n * c * h * w * bytesPerElement;

export const CAMERA = { width: 1920, height: 1080, fps: 30, gop: 30, idrBytes: 120000, pBytes: 14000 };
export const NETWORK_INPUT = { c: 3, h: 544, w: 960, dtype: "FP16", bytesPerElement: 2 };
export const RTP = { header: 12, udp: 8, ip: 20, maxPayload: 1400, clockHz: 90000, payloadType: 96 };
export const NET_SCALE_FACTOR = 1 / 255; // nvinfer: y = net-scale-factor * (x - offset)

export const cameraBitrateMbps = (cam = CAMERA) => ((cam.idrBytes + (cam.gop - 1) * cam.pBytes) * 8 * cam.fps) / cam.gop / 1e6;

// ---------- the example GPU and its fixed costs ----------
export const GPU = {
  name: "example GPU",
  nvdecFps: 900, // 1080p frames per second one NVDEC engine sustains in this model
  smMsPerSec: 1000, // the GPU has 1000 ms of compute per second
  vramGB: 16,
  pcieGBs: 16, // host <-> device bandwidth, one direction
  nicMbps: 1000,
  cpuCores: 8,
};
export const COST = {
  inferBaseMs: 5, // per nvinfer batch, fixed
  inferPerFrameMs: 1.2, // per frame in the batch
  preprocessMs: 0.1, // NV12 -> planar RGB, scale, normalize, per inferred frame (GPU)
  trackerMs: 0.25, // per frame, every frame (GPU)
  cpuDepayParseMs: 0.12, // rtph264depay + h264parse per frame (CPU)
  cpuAnalyticsMs: 0.05, // nvdsanalytics per frame (CPU)
  cpuCopyMsPerMB: 0.35, // memcpy cost when frames leave NVMM for system memory
  engineMB: 180, // TensorRT engine + workspace
  decodeSurfacesPerCamera: 8,
};

// ---------- pipeline load: the bottleneck question ----------
export const PIPE_DEFAULTS = { cameras: 8, batch: 8, interval: 0, nvmm: true };

export function pipeConfig(input = {}) {
  const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  return {
    cameras: int(input.cameras, 1, 32, PIPE_DEFAULTS.cameras),
    batch: int(input.batch, 1, 32, PIPE_DEFAULTS.batch),
    interval: int(input.interval, 0, 4, PIPE_DEFAULTS.interval),
    nvmm: typeof input.nvmm === "boolean" ? input.nvmm : PIPE_DEFAULTS.nvmm,
  };
}

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export function pipeLoad(input = {}) {
  const cfg = pipeConfig(input);
  const framesPerSec = cfg.cameras * CAMERA.fps;
  const inferredPerSec = framesPerSec / (cfg.interval + 1);
  const batchesPerSec = inferredPerSec / cfg.batch;
  const frameMB = nv12Bytes(CAMERA.width, CAMERA.height) / 1e6;

  const smMs =
    batchesPerSec * (COST.inferBaseMs + COST.inferPerFrameMs * cfg.batch) +
    inferredPerSec * COST.preprocessMs +
    framesPerSec * COST.trackerMs;
  const copyMBps = cfg.nvmm ? 0 : framesPerSec * frameMB; // each decoded frame copied to system memory
  const cpuMs = framesPerSec * (COST.cpuDepayParseMs + COST.cpuAnalyticsMs) + copyMBps * COST.cpuCopyMsPerMB;
  const bitstreamMBps = (cameraBitrateMbps() * cfg.cameras) / 8;
  const pcieGBs = (bitstreamMBps + copyMBps) / 1000;
  const tensorMB = tensorBytes(cfg.batch, NETWORK_INPUT.c, NETWORK_INPUT.h, NETWORK_INPUT.w, NETWORK_INPUT.bytesPerElement) / 1e6;
  const vramMB = COST.engineMB + cfg.cameras * COST.decodeSurfacesPerCamera * frameMB + 2 * tensorMB;

  const resources = [
    { id: "nic", name: "NIC", unit: "Mbit/s", used: round(cameraBitrateMbps() * cfg.cameras, 1), capacity: GPU.nicMbps },
    { id: "cpu", name: "CPU", unit: "core-ms/s", used: round(cpuMs, 0), capacity: GPU.cpuCores * 1000 },
    { id: "pcie", name: "PCIe", unit: "GB/s", used: round(pcieGBs, 3), capacity: GPU.pcieGBs },
    { id: "nvdec", name: "NVDEC", unit: "frames/s", used: framesPerSec, capacity: GPU.nvdecFps },
    { id: "sm", name: "GPU SMs", unit: "ms/s", used: round(smMs, 0), capacity: GPU.smMsPerSec },
    { id: "vram", name: "VRAM", unit: "MB", used: round(vramMB, 0), capacity: GPU.vramGB * 1000 },
  ].map((r) => ({ ...r, load: round((100 * r.used) / r.capacity, 1) }));

  const over = resources.filter((r) => r.load > 100).sort((a, b) => b.load - a.load);
  const busiest = [...resources].sort((a, b) => b.load - a.load)[0];
  const keepUp = Math.min(1, ...over.map((r) => r.capacity / r.used));
  return {
    config: cfg,
    framesPerSec,
    inferredPerSec: round(inferredPerSec, 1),
    batchesPerSec: round(batchesPerSec, 2),
    tensorMB: round(tensorMB, 2),
    resources,
    bottleneck: over.length ? over[0].id : null,
    busiest: busiest.id,
    droppedPerSec: round(framesPerSec * (1 - keepUp), 0),
    verdict: over.length
      ? `${over[0].name} is at ${over[0].load}% of capacity: the pipeline falls behind and drops about ${round(framesPerSec * (1 - keepUp), 0)} of ${framesPerSec} frames per second.`
      : `Every part keeps up. The busiest is ${busiest.name} at ${busiest.load}%.`,
  };
}

// ---------- RTP packets and H.264 NAL units for one camera frame ----------
export function framePackets(frameIndex, cam = CAMERA) {
  const idr = frameIndex % cam.gop === 0;
  const nals = idr
    ? [
        { type: 7, name: "SPS", bytes: 22 },
        { type: 8, name: "PPS", bytes: 6 },
        { type: 5, name: "IDR slice", bytes: cam.idrBytes - 28 },
      ]
    : [{ type: 1, name: "non-IDR slice", bytes: cam.pBytes }];
  const packets = [];
  const firstSeq = 4100 + framesBefore(frameIndex, cam);
  const timestamp = 1800000 + frameIndex * (RTP.clockHz / cam.fps);
  let seq = firstSeq;
  nals.forEach((nal, ni) => {
    if (nal.bytes <= RTP.maxPayload) {
      packets.push({ seq: seq++, timestamp, marker: false, payload: nal.bytes, kind: `single NAL ${nal.name}` });
    } else {
      // FU-A: 2 bytes of FU indicator + header per fragment
      let left = nal.bytes;
      let part = 0;
      while (left > 0) {
        const take = Math.min(left, RTP.maxPayload - 2);
        left -= take;
        packets.push({ seq: seq++, timestamp, marker: false, payload: take + 2, kind: `FU-A ${nal.name} ${part === 0 ? "start" : left === 0 ? "end" : "middle"}` });
        part += 1;
      }
    }
    if (ni === nals.length - 1) packets[packets.length - 1].marker = true; // marker bit: last packet of the access unit
  });
  const accessUnitBytes = nals.reduce((a, n) => a + n.bytes, 0);
  const wireBytes = packets.reduce((a, p) => a + p.payload + RTP.header + RTP.udp + RTP.ip, 0);
  return { frameIndex, idr, nals, packets, accessUnitBytes, wireBytes, timestamp };
}
function framesBefore(frameIndex, cam) {
  let n = 0;
  for (let f = 0; f < frameIndex; f++) n += framePacketCount(f, cam);
  return n;
}
function framePacketCount(f, cam) {
  const idr = f % cam.gop === 0;
  const fu = (b) => Math.ceil(b / (RTP.maxPayload - 2));
  return idr ? 2 + fu(cam.idrBytes - 28) : cam.pBytes <= RTP.maxPayload ? 1 : fu(cam.pBytes);
}

// ---------- the scene: one camera, 60 frames, scripted objects ----------
export const SCENE = { camera: "cam-03", frames: 60, line: { x: 1000, y0: 300, y1: 1000 } };
// Each object moves in a straight line at constant speed (px per frame). Boxes are [x, y, w, h] in 1920x1080.
export const OBJECTS = [
  { id: "car-a", cls: "car", x: 120, y: 560, w: 260, h: 150, vx: 30, vy: 0 },
  { id: "car-b", cls: "car", x: 1780, y: 720, w: 280, h: 160, vx: -24, vy: 0 },
  { id: "truck", cls: "car", x: 430, y: 380, w: 340, h: 190, vx: 9, vy: 0 },
  { id: "walker-1", cls: "person", x: 1240, y: 300, w: 70, h: 180, vx: 0, vy: 4 },
  { id: "walker-2", cls: "person", x: 1268, y: 305, w: 70, h: 180, vx: 0, vy: 4 },
  { id: "cyclist", cls: "person", x: 820, y: 860, w: 90, h: 170, vx: 7, vy: -2 },
  { id: "parked", cls: "car", x: 1500, y: 300, w: 240, h: 130, vx: 0, vy: 0 },
];
export const boxAt = (o, f) => [o.x + o.vx * f, o.y + o.vy * f, o.w, o.h];
export const groundTruth = (f) => OBJECTS.map((o) => ({ id: o.id, cls: o.cls, box: boxAt(o, f) })).filter((o) => o.box[0] + o.box[2] > 0 && o.box[0] < 1920);

export function iou(a, b) {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

// Seeded PRNG for the detector's raw candidates.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The raw detector output for one frame, before clustering: several overlapping candidates per real
// object (the way a dense detector fires on neighbouring anchors) plus a few low-confidence false positives.
export function rawDetections(f) {
  const rand = mulberry32(1000 + f);
  const out = [];
  for (const g of groundTruth(f)) {
    const [x, y, w, h] = g.box;
    const k = g.cls === "car" ? 4 : 3;
    for (let i = 0; i < k; i++) {
      const j = i === 0 ? 0.02 : 0.06 + 0.06 * rand();
      const box = [Math.round(x + (rand() - 0.5) * 2 * j * w), Math.round(y + (rand() - 0.5) * 2 * j * h), Math.round(w * (1 + (rand() - 0.5) * j)), Math.round(h * (1 + (rand() - 0.5) * j))];
      const conf = i === 0 ? 0.86 + 0.1 * rand() : 0.45 + 0.35 * rand();
      out.push({ cls: g.cls, box, conf: Math.round(conf * 100) / 100, truth: g.id });
    }
  }
  // false positives: a shadow under the truck and a road sign, both low confidence
  out.push({ cls: "car", box: [360, 575, 220, 40], conf: 0.31, truth: null });
  out.push({ cls: "person", box: [1660, 180, 40, 120], conf: 0.27, truth: null });
  return out;
}

// nvinfer post-processing: drop below pre-cluster-threshold, then greedy NMS per class.
export function clusterDetections(raw, { preClusterThreshold = 0.4, nmsIouThreshold = 0.5 } = {}) {
  const kept = raw.filter((d) => d.conf >= preClusterThreshold).sort((a, b) => b.conf - a.conf || a.box[0] - b.box[0]);
  const out = [];
  const suppressed = [];
  for (const d of kept) {
    const clash = out.find((o) => o.cls === d.cls && iou(o.box, d.box) > nmsIouThreshold);
    clash ? suppressed.push({ ...d, by: out.indexOf(clash) }) : out.push(d);
  }
  return { kept: out, suppressed, belowThreshold: raw.length - kept.length };
}

export function scoreDetections(f, params) {
  const { kept } = clusterDetections(rawDetections(f), params);
  const truth = groundTruth(f);
  const matched = new Set();
  let duplicates = 0;
  let falsePositives = 0;
  for (const d of kept) {
    if (!d.truth) falsePositives += 1;
    else if (matched.has(d.truth)) duplicates += 1;
    else matched.add(d.truth);
  }
  const missed = truth.filter((t) => !matched.has(t.id)).length;
  return { detections: kept.length, objects: truth.length, duplicates, falsePositives, missed, exact: duplicates === 0 && falsePositives === 0 && missed === 0 };
}

// ---------- the tracker: IOU tracker (nvtracker's simplest low-level tracker) ----------
// With interval k, nvinfer runs on every (k+1)-th frame. The IOU tracker has no motion model: on skipped
// frames a track keeps its last box. A detection joins the track whose last box overlaps it most, if IoU >= minIou.
export const TRACKER = { minIou: 0.3 };

export function track(interval, params = { preClusterThreshold: 0.5, nmsIouThreshold: 0.5 }) {
  let nextId = 1;
  let tracks = []; // { id, truth, box }
  const owner = new Map(); // truth object -> last track id
  let idSwitches = 0;
  const frames = [];
  const crossings = [];
  const lastCenter = new Map(); // track id -> center x at last inferred frame
  for (let f = 0; f < SCENE.frames; f++) {
    const inferred = f % (interval + 1) === 0;
    if (inferred) {
      const dets = clusterDetections(rawDetections(f), params).kept;
      const used = new Set();
      const next = [];
      // greedy association by best IoU
      const pairs = [];
      tracks.forEach((t, ti) => dets.forEach((d, di) => d.cls === t.cls && pairs.push({ ti, di, v: iou(t.box, d.box) })));
      pairs.sort((a, b) => b.v - a.v);
      const tUsed = new Set();
      for (const p of pairs) {
        if (p.v < TRACKER.minIou || tUsed.has(p.ti) || used.has(p.di)) continue;
        tUsed.add(p.ti);
        used.add(p.di);
        next.push({ ...tracks[p.ti], box: dets[p.di].box, truth: dets[p.di].truth, iou: Math.round(p.v * 1000) / 1000 });
      }
      dets.forEach((d, di) => {
        if (used.has(di)) return;
        const t = { id: nextId++, cls: d.cls, box: d.box, truth: d.truth, iou: null };
        if (d.truth && owner.has(d.truth)) idSwitches += 1;
        next.push(t);
      });
      for (const t of next) {
        if (t.truth) owner.set(t.truth, t.id);
        const cx = t.box[0] + t.box[2] / 2;
        const prev = lastCenter.get(t.id);
        const line = SCENE.line.x;
        if (prev !== undefined && t.cls === "car" && ((prev < line && cx >= line) || (prev >= line && cx < line))) {
          crossings.push({ frame: f, track: t.id, truth: t.truth, direction: cx >= line ? "left-to-right" : "right-to-left" });
        }
        lastCenter.set(t.id, cx);
      }
      tracks = next;
    }
    frames.push({ frame: f, inferred, tracks: tracks.map((t) => ({ id: t.id, cls: t.cls, box: t.box, truth: t.truth })) });
  }
  return { interval, idSwitches, tracksCreated: nextId - 1, crossings, frames };
}

// Ground-truth car crossings of the counting line in the 60 frames.
export function trueCrossings() {
  const out = [];
  for (const o of OBJECTS.filter((x) => x.cls === "car")) {
    for (let f = 1; f < SCENE.frames; f++) {
      const a = boxAt(o, f - 1);
      const b = boxAt(o, f);
      const ca = a[0] + a[2] / 2;
      const cb = b[0] + b[2] / 2;
      if ((ca < SCENE.line.x && cb >= SCENE.line.x) || (ca >= SCENE.line.x && cb < SCENE.line.x)) out.push({ frame: f, truth: o.id });
    }
  }
  return out;
}

// The largest per-frame displacement of any object, and the IoU of a box with itself shifted by d.
export const shiftedIou = (w, d) => (w - d > 0 ? (w - d) / (w + d) : 0);

// ---------- the message that leaves for Kafka ----------
export function eventMessage(crossing, f = crossing.frame) {
  const o = OBJECTS.find((x) => x.id === crossing.truth);
  const [x, y, w, h] = boxAt(o, f);
  return {
    version: "4.0",
    id: `cam-03-${f}-${crossing.track}`,
    "@timestamp": `2026-11-04T18:00:${String(Math.floor(f / CAMERA.fps)).padStart(2, "0")}.${String(Math.round(((f % CAMERA.fps) * 1000) / CAMERA.fps)).padStart(3, "0")}Z`,
    sensor: { id: "cam-03", type: "Camera" },
    analyticsModule: { id: "line-crossing", source: "nvdsanalytics" },
    object: { id: String(crossing.track), vehicle: { type: o.cls }, bbox: { topleftx: x, toplefty: y, bottomrightx: x + w, bottomrighty: y + h } },
    event: { type: crossing.direction === "left-to-right" ? "entry" : "exit" },
  };
}

// ---------- missions: each needs reasoning, and each has a checkable answer ----------
export const ANSWERS = {
  nv12Frame: nv12Bytes(1920, 1080), // 3,110,400
  batchTensor: tensorBytes(8, 3, 544, 960, 2), // 25,067,520
  bottleneck16: pipeLoad({ cameras: 16, batch: 8, interval: 0, nvmm: true }).bottleneck,
  maxSafeInterval: [0, 1, 2, 3, 4].filter((k) => track(k).idSwitches === 0).pop(),
};

export const MISSIONS = [
  {
    id: "bytes",
    title: "Size the data",
    goal: "Work out how many bytes one decoded 1080p NV12 frame takes in GPU memory, and how many bytes one batch tensor of 8 frames at 960x544 FP16 takes.",
    check: (a) => Math.abs(a.frame - ANSWERS.nv12Frame) <= ANSWERS.nv12Frame * 0.01 && Math.abs(a.tensor - ANSWERS.batchTensor) <= ANSWERS.batchTensor * 0.01,
  },
  {
    id: "bottleneck",
    title: "Find the bottleneck",
    goal: "16 cameras at 30 fps, batch 8, inference on every frame. Predict which part runs out first, then set it on the anatomy and check.",
    check: (a) => a.choice === ANSWERS.bottleneck16,
  },
  {
    id: "nms",
    title: "Tune the detector",
    goal: "On frame 30, set the confidence threshold and the NMS IoU threshold so the output has one box per real object: no duplicates, no false positives, no misses.",
    check: (a) => scoreDetections(30, a).exact,
  },
  {
    id: "interval",
    title: "Skip frames safely",
    goal: "The IOU tracker keeps a track's last box on skipped frames. Predict the largest inference interval that causes zero ID switches, then verify it.",
    check: (a) => a.interval === ANSWERS.maxSafeInterval,
  },
];
