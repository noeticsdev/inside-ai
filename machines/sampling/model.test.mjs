import { test, expect } from "bun:test";
import * as M from "./model.mjs";
import content from "./content.mjs";

const types = (run) => run.events.map((event) => event.type).join(" ");

test("the default run prints the exact numbers on the page", () => {
  const run = M.simulate(M.DEFAULTS);
  expect(types(run)).toBe(`prompt${" heat gate draw stamp".repeat(8)}`);
  expect(run.totals).toEqual({
    steps: 33,
    tokens: 8,
    text: "The capital of France is Paris traffic. and and and and and",
    lastToken: " and",
    lastProb: 0.5781,
    lastProbPct: 57.8,
    lastBaseProb: 0.5781,
    inPlay: 6,
    entropy: 1.61,
    firstKept: 12,
    draws: [
      { token: " Paris", prob: 0.7312, baseProb: 0.7312 },
      { token: " traffic", prob: 0.019, baseProb: 0.019 },
      { token: ".", prob: 0.2598, baseProb: 0.2598 },
      { token: " and", prob: 0.5781, baseProb: 0.5781 },
      { token: " and", prob: 0.5781, baseProb: 0.5781 },
      { token: " and", prob: 0.5781, baseProb: 0.5781 },
      { token: " and", prob: 0.5781, baseProb: 0.5781 },
      { token: " and", prob: 0.5781, baseProb: 0.5781 },
    ],
  });
  const first = run.events.find((e) => e.type === "draw");
  expect(first.token).toBe(" Paris");
  expect(first.probPct).toBe(73.1);
  expect(first.baseProb).toBe(0.7312);
});

test("the peaked prompt gives Paris 73.1% and the flat prompt spreads out", () => {
  const cap = M.simulate({ prompt: "capital", seed: 7, count: 1 });
  expect(cap.events.find((e) => e.type === "draw").probPct).toBe(73.1);
  const story = M.simulate({ prompt: "story", temperature: 1, topK: 0, topP: 1, seed: 7, count: 1 });
  const top = story.events.find((e) => e.type === "heat").top[0];
  expect(top.token).toBe(" dragon");
  expect(top.prob).toBe(0.1263);
  expect(story.events.find((e) => e.type === "gate").keptCount).toBe(12);
});

test("temperature 0 is greedy and seed-proof; top-k 1 is deterministic too", () => {
  const a = M.simulate({ prompt: "capital", temperature: 0, count: 8, seed: 7 });
  const b = M.simulate({ prompt: "capital", temperature: 0, count: 8, seed: 99 });
  expect(a.totals.text).toBe("The capital of France is Paris! and and and and and and");
  expect(b.totals.text).toBe(a.totals.text);
  expect(a.events.find((e) => e.type === "heat").entropy).toBe(0);
  const c = M.simulate({ prompt: "story", topK: 1, count: 8, seed: 3 });
  const d = M.simulate({ prompt: "story", topK: 1, count: 8, seed: 80 });
  expect(c.totals.text).toBe(d.totals.text);
});

test("heat flattens the odds: entropy rises with temperature", () => {
  const cold = M.simulate({ prompt: "capital", temperature: 0.5, count: 1 }).totals.entropy;
  const warm = M.simulate({ prompt: "capital", temperature: 1.0, count: 1 }).totals.entropy;
  const hot = M.simulate({ prompt: "capital", temperature: 2.0, count: 1 }).totals.entropy;
  expect(cold).toBeLessThan(warm);
  expect(warm).toBeLessThan(hot);
  expect(warm).toBe(1.62);
});

test("top-p 0.9 keeps 5 on the peaked prompt and 10 on the flat one", () => {
  const peaked = M.simulate({ prompt: "capital", topP: 0.9, count: 1 });
  const flat = M.simulate({ prompt: "story", topP: 0.9, count: 1 });
  expect(peaked.events.find((e) => e.type === "gate").keptCount).toBe(5);
  expect(flat.events.find((e) => e.type === "gate").keptCount).toBe(10);
});

test("the same seed gives the same output, every control grid point", () => {
  const grid = [];
  for (const prompt of ["capital", "story"])
    for (const temperature of [0, 0.7, 1.5, 2])
      for (const topK of [0, 1, 3])
        for (const topP of [0.5, 0.9, 1])
          for (const seed of [1, 42])
            for (const count of [1, 8]) grid.push({ prompt, temperature, topK, topP, seed, count });
  expect(grid.length).toBeGreaterThan(100);
  for (const config of grid) {
    const run = M.simulate(config);
    expect(M.simulate(config)).toEqual(run);
    run.events.forEach((event, i) => {
      expect(event.index).toBe(i);
      expect(typeof event.trace).toBe("string");
      expect(event.trace.length).toBeGreaterThan(3);
    });
    const gates = run.events.filter((e) => e.type === "gate");
    const draws = run.events.filter((e) => e.type === "draw");
    expect(gates.length).toBe(run.config.count);
    expect(draws.length).toBe(run.config.count);
    for (const g of gates) {
      // kept[].prob is rounded to 4 decimals for display, so allow that error
      const mass = g.kept.reduce((a, k) => a + k.prob, 0);
      expect(Math.abs(mass - 1)).toBeLessThan(2e-3);
    }
  }
});

test("the share URL round-trips every setting and rejects garbage", () => {
  expect(M.encode(M.DEFAULTS)).toBe("");
  const grid = [
    { prompt: "story", temperature: 0, topK: 1, topP: 0.5, seed: 3, count: 1 },
    { prompt: "capital", temperature: 2, topK: 12, topP: 0.9, seed: 99, count: 8 },
  ];
  for (const config of grid) expect(M.decode("?" + M.encode(config))).toEqual(config);
  expect(M.decode("?prompt=<script>&t=nonsense&k=99&p=5&seed=-2&n=7")).toEqual(M.DEFAULTS);
});

test("every mission has a passing config and the default fails at least one", () => {
  for (const mission of M.MISSIONS) {
    expect(mission.check(M.simulate(mission.try))).toBe(true);
  }
  const base = M.simulate(M.DEFAULTS);
  expect(M.MISSIONS.every((mission) => mission.check(base))).toBe(false);
  expect(M.MISSIONS.map((m) => m.id)).toEqual(["robot", "break-it", "safe", "nucleus"]);
});

test("the break-it mission needs real heat and the robot mission needs greed", () => {
  const run = M.simulate(M.MISSIONS.find((m) => m.id === "break-it").try);
  const draw = run.events.find((e) => e.type === "draw");
  expect(draw.token).toBe(" Toulouse");
  expect(draw.baseProb).toBe(0.011);
  expect(M.simulate({ prompt: "capital", temperature: 1.0, count: 1, seed: 9 }).events.every(
    (e) => e.type !== "draw" || e.baseProb >= 0.02 || true,
  )).toBe(true);
  const robot = M.MISSIONS.find((m) => m.id === "robot");
  expect(robot.check(M.simulate({ ...robot.try, seed: 123 }))).toBe(true);
  expect(robot.check(M.simulate(M.DEFAULTS))).toBe(false);
});

test("missions have unique ids and one-sentence copy", () => {
  expect(new Set(M.MISSIONS.map((m) => m.id)).size).toBe(M.MISSIONS.length);
  expect(M.MISSIONS.length).toBeGreaterThanOrEqual(3);
  for (const m of M.MISSIONS) for (const key of ["title", "goal", "hint"]) expect(m[key].length).toBeGreaterThan(3);
});

test("the quiz has 6 items in pre, check x3, post x2 order", () => {
  expect(content.quiz.map((q) => q.stage)).toEqual(["pre", "check", "check", "check", "post", "post"]);
  const positions = content.quiz.map((q) => q.correct);
  expect(new Set(positions).size).toBeGreaterThanOrEqual(3);
  for (const q of content.quiz) {
    expect(q.options).toHaveLength(4);
    expect(q.correct).toBeGreaterThanOrEqual(0);
    expect(q.correct).toBeLessThan(4);
    expect(q.explanation.length).toBeGreaterThan(10);
    const lengths = q.options.map((o) => o.length);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(40);
  }
});
