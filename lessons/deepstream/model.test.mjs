import { test, expect } from "bun:test";
import * as M from "./model.mjs";

test("byte math: NV12 1080p frame and an 8-frame FP16 batch tensor", () => {
  expect(M.nv12Bytes(1920, 1080)).toBe(3110400);
  expect(M.tensorBytes(8, 3, 544, 960, 2)).toBe(25067520);
  expect(M.ANSWERS.nv12Frame).toBe(3110400);
  expect(M.ANSWERS.batchTensor).toBe(25067520);
});

test("a 30-frame GOP at these frame sizes is about 4.2 Mbit/s per camera", () => {
  expect(Math.round(M.cameraBitrateMbps() * 100) / 100).toBe(4.21);
});

test("RTP: an IDR frame is SPS + PPS + 86 FU-A fragments, a P frame is 11 fragments, marker on the last packet", () => {
  const idr = M.framePackets(0);
  expect(idr.idr).toBe(true);
  expect(idr.nals.map((n) => n.name)).toEqual(["SPS", "PPS", "IDR slice"]);
  expect(idr.packets.length).toBe(88);
  expect(idr.accessUnitBytes).toBe(120000);
  expect(idr.packets.filter((p) => p.marker).length).toBe(1);
  expect(idr.packets.at(-1).marker).toBe(true);
  expect(idr.packets.every((p) => p.payload <= M.RTP.maxPayload)).toBe(true);
  const p = M.framePackets(1);
  expect(p.idr).toBe(false);
  expect(p.packets.length).toBe(11);
  expect(p.packets[0].seq).toBe(idr.packets.at(-1).seq + 1);
  expect(p.timestamp - idr.timestamp).toBe(3000); // 90 kHz clock / 30 fps
});

test("pipeline load: 16 cameras with batch 8 overload the SMs; batch 16 or interval 1 fixes it", () => {
  const a = M.pipeLoad({ cameras: 16, batch: 8, interval: 0 });
  expect(a.bottleneck).toBe("sm");
  expect(a.resources.find((r) => r.id === "sm").load).toBe(104.4);
  expect(a.droppedPerSec).toBe(20);
  expect(M.pipeLoad({ cameras: 16, batch: 16 }).bottleneck).toBe(null);
  expect(M.pipeLoad({ cameras: 16, batch: 8, interval: 1 }).bottleneck).toBe(null);
  expect(M.ANSWERS.bottleneck16).toBe("sm");
});

test("skipping inference does not skip decode: 32 cameras overload NVDEC at any interval", () => {
  for (const interval of [0, 2, 4]) {
    const r = M.pipeLoad({ cameras: 32, batch: 16, interval });
    expect(r.resources.find((x) => x.id === "nvdec").load).toBeCloseTo(106.7, 1);
  }
  expect(M.pipeLoad({ cameras: 32, batch: 16, interval: 4 }).bottleneck).toBe("nvdec");
});

test("leaving NVMM copies every decoded frame over PCIe and costs CPU", () => {
  const on = M.pipeLoad({ cameras: 16, nvmm: true });
  const off = M.pipeLoad({ cameras: 16, nvmm: false });
  const g = (r, id) => r.resources.find((x) => x.id === id).used;
  expect(g(off, "pcie")).toBeGreaterThan(g(on, "pcie") + 1.4);
  expect(g(off, "cpu")).toBeGreaterThan(g(on, "cpu") * 5);
});

test("pipeConfig clamps garbage to defaults", () => {
  expect(M.pipeConfig({ cameras: 99, batch: -1, interval: "x", nvmm: 1 })).toEqual(M.PIPE_DEFAULTS);
});

test("IoU: identical, disjoint, half-shifted", () => {
  expect(M.iou([0, 0, 10, 10], [0, 0, 10, 10])).toBe(1);
  expect(M.iou([0, 0, 10, 10], [20, 20, 5, 5])).toBe(0);
  expect(M.iou([0, 0, 10, 10], [5, 0, 10, 10])).toBeCloseTo(1 / 3, 10);
  expect(M.shiftedIou(260, 120)).toBeCloseTo(140 / 380, 10);
});

test("NMS trade-off on frame 30: thresholds that are too low or too high both fail", () => {
  expect(M.rawDetections(30).length).toBe(27);
  expect(M.scoreDetections(30, { preClusterThreshold: 0.5, nmsIouThreshold: 0.5 })).toEqual({ detections: 7, objects: 7, duplicates: 0, falsePositives: 0, missed: 0, exact: true });
  expect(M.scoreDetections(30, { preClusterThreshold: 0.3, nmsIouThreshold: 0.5 }).falsePositives).toBe(1); // the truck's shadow
  expect(M.scoreDetections(30, { preClusterThreshold: 0.5, nmsIouThreshold: 0.8 }).duplicates).toBe(3);
  expect(M.scoreDetections(30, { preClusterThreshold: 0.5, nmsIouThreshold: 0.3 }).missed).toBe(1); // the two walkers merge
  expect(M.scoreDetections(30, { preClusterThreshold: 0.9, nmsIouThreshold: 0.5 }).missed).toBe(1);
});

test("the two walkers overlap at IoU 0.412, which is why NMS 0.3 merges them", () => {
  const [w1, w2] = ["walker-1", "walker-2"].map((id) => M.OBJECTS.find((o) => o.id === id));
  expect(Math.round(M.iou(M.boxAt(w1, 30), M.boxAt(w2, 30)) * 1000) / 1000).toBe(0.412);
});

test("tracker: interval 3 keeps every ID, interval 4 breaks the fastest car and the line count", () => {
  for (const k of [0, 1, 2, 3]) {
    const t = M.track(k);
    expect(t.idSwitches).toBe(0);
    expect(t.crossings.length).toBe(3);
  }
  const t4 = M.track(4);
  expect(t4.idSwitches).toBe(11);
  expect(t4.crossings.length).toBe(2);
  expect(M.ANSWERS.maxSafeInterval).toBe(3);
  // the reason the learner can compute: car-a moves 30 px/frame with a 260 px box
  expect(M.shiftedIou(260, 30 * 4)).toBeGreaterThanOrEqual(M.TRACKER.minIou);
  expect(M.shiftedIou(260, 30 * 5)).toBeLessThan(M.TRACKER.minIou);
});

test("ground truth: three cars cross the counting line in the clip", () => {
  expect(M.trueCrossings()).toEqual([
    { frame: 25, truth: "car-a" },
    { frame: 39, truth: "car-b" },
    { frame: 45, truth: "truck" },
  ]);
});

test("the Kafka message names the sensor, the object, its box and entry/exit", () => {
  const c = M.track(0).crossings[0];
  const msg = M.eventMessage(c);
  expect(msg.sensor.id).toBe("cam-03");
  expect(msg.event.type).toBe("entry");
  expect(msg.object.bbox.bottomrightx - msg.object.bbox.topleftx).toBe(260);
  expect(msg["@timestamp"]).toBe("2026-11-04T18:00:00.833Z");
});

test("every mission checks a real answer and rejects a wrong one", () => {
  const m = Object.fromEntries(M.MISSIONS.map((x) => [x.id, x.check]));
  expect(m.bytes({ frame: 3110400, tensor: 25067520 })).toBe(true);
  expect(m.bytes({ frame: 6220800, tensor: 25067520 })).toBe(false); // RGB-style 3 bytes/pixel guess
  expect(m.bottleneck({ choice: "sm" })).toBe(true);
  expect(m.bottleneck({ choice: "nvdec" })).toBe(false);
  expect(m.nms({ preClusterThreshold: 0.5, nmsIouThreshold: 0.5 })).toBe(true);
  expect(m.nms({ preClusterThreshold: 0.5, nmsIouThreshold: 0.3 })).toBe(false);
  expect(m.interval({ interval: 3 })).toBe(true);
  expect(m.interval({ interval: 4 })).toBe(false);
});

test("the model is deterministic", () => {
  expect(M.rawDetections(12)).toEqual(M.rawDetections(12));
  expect(M.track(2)).toEqual(M.track(2));
});
