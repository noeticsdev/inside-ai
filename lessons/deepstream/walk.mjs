// What a learner does on each step, for tests/lesson-check.mjs: a wrong answer first (with the hint it
// must trigger), then the right one. One entry per step before "done", in order.
export default [
  { step: "kit", actions: [{ do: "click", selector: "[data-ia-predict] .ia-option" }] },
  { step: "receive", actions: [{ do: "answer", value: 1800033, expect: "milliseconds" }, { do: "answer", value: 1803000, solves: true }] },
  { step: "reassemble", actions: [{ do: "tap", text: "IDR", expect: "PPS" }, { do: "tap", text: "SPS" }, { do: "tap", text: "PPS" }, { do: "tap", text: "IDR", solves: true }] },
  { step: "decode", actions: [{ do: "answer", value: 6220800, expect: "RGB" }, { do: "answer", value: 3110400, solves: true, expectStage: "3,110,400 B" }] },
  { step: "batch", actions: [{ do: "choose", text: "40 seconds", expect: "microseconds" }, { do: "choose", text: "Pushes the 7 frames", solves: true }] },
  { step: "tensor", actions: [{ do: "answer", value: 12533760, expect: "2 bytes" }, { do: "answer", value: 25067520, solves: true }] },
  { step: "detect", actions: [{ do: "slide", label: "pre-cluster-threshold", value: 0.5 }, { do: "slide", label: "nms-iou-threshold", value: 0.3, expectStage: "walkers", solves: false }, { do: "slide", label: "nms-iou-threshold", value: 0.5, solves: true }] },
  { step: "track", actions: [{ do: "answer", value: 4, solves: false, expectStage: "ID switches" }, { do: "answer", value: 3, solves: true }] },
  { step: "count", actions: [{ do: "python", code: "def crossed(p, c, x):\n    if p < x <= c:\n        return 'entry'\n    if c < x <= p:\n        return 'exit'\n    return None\n", solves: true }] },
  { step: "publish", actions: [{ do: "answer", value: 25, expect: "frame number" }, { do: "answer", value: 833, solves: true, expectStage: "18:00:00.833Z" }] },
  { step: "scale", actions: [{ do: "choose", text: "NVDEC", expect: "53.3%" }, { do: "choose", text: "GPU SMs", solves: true }] },
  { step: "keepup", actions: [{ do: "select", label: "batch-size", value: 4 }, { do: "select", label: "interval", value: 4, expect: "breaks the tracker" }, { do: "select", label: "interval", value: 0 }, { do: "select", label: "batch-size", value: 16, solves: true }] },
];
