import { test, expect } from "bun:test";
import * as M from "./model.mjs";
import content from "./content.mjs";

const grid = [];
for (const focus of [0, 2, 3, 4, 7, 9])
  for (const head of ["A", "B"])
    for (const scale of [true, false])
      for (const causal of [true, false])
        for (const temp of [0.2, 1, 2]) grid.push({ focus, head, scale, causal, temp });

test("the default run prints the exact page numbers", () => {
  const run = M.simulate();
  expect(run.config).toEqual({ focus: 2, head: "A", scale: true, causal: false, temp: 1 });
  expect(run.totals.top).toBe("sat");
  expect(run.totals.topWeight).toBe(0.343);
  expect(run.totals.entropyBits).toBe(3.01);
  expect(run.totals.sum).toBe(1);
  expect(run.totals.maxScore).toBe(3.68);
  expect(run.totals.output).toEqual([0.247, 0.422, 0.286, 0.245]);
});

test("“it” puts more than half its weight on “cat” on head A", () => {
  const run = M.simulate({ focus: 7 });
  expect(run.totals.top).toBe("cat");
  expect(run.totals.topWeight).toBe(0.693);
  expect(run.totals.weights[1]).toBe(0.6933);
  expect(run.totals.entropyBits).toBe(1.73);
  expect(run.totals.maxScore).toBe(7.8);
});

test("unscaled and cold, the head saturates onto one token", () => {
  const run = M.simulate({ focus: 7, scale: false, temp: 0.5 });
  expect(Math.max(...run.totals.weights)).toBeGreaterThan(0.95);
  expect(run.totals.top).toBe("cat");
  expect(run.totals.entropyBits).toBeLessThan(0.1);
});

test("the causal mask gives zero weight to every later token", () => {
  const run = M.simulate({ focus: 3, causal: true });
  expect(run.totals.weights.slice(4)).toEqual(new Array(6).fill(0));
  expect(run.totals.weights.slice(0, 4).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  expect(run.events.filter((e) => e.type === "score" && e.masked)).toHaveLength(6);
});

test("head B with the mask attends to the previous token", () => {
  const run = M.simulate({ focus: 4, head: "B", causal: true });
  expect(run.totals.topIndex).toBe(3);
  expect(run.totals.top).toBe("on");
  expect(run.totals.topWeight).toBe(0.778);
});

test("the output is the weight-by-value mix", () => {
  const run = M.simulate({ focus: 7 });
  const expect0 = run.totals.weights.reduce((a, w, j) => a + w * M.V[j][0], 0);
  expect(run.totals.output[0]).toBe(Math.round(expect0 * 1000) / 1000);
  expect(run.totals.output).toEqual([0.763, 0.191, 0.152, 0.092]);
});

test("every run is deterministic, sequential and its clock never goes back", () => {
  for (const config of grid) {
    const run = M.simulate(config);
    expect(M.simulate(config)).toEqual(run);
    expect(run.events[0].type).toBe("query");
    expect(run.events.at(-1).type).toBe("exit");
    run.events.forEach((event, i) => {
      expect(event.index).toBe(i);
      expect(typeof event.trace).toBe("string");
      expect(event.trace.length).toBeGreaterThan(3);
      if (i) expect(event.clock).toBeGreaterThanOrEqual(run.events[i - 1].clock);
    });
    expect(run.totals.weights).toHaveLength(M.TOKENS.length);
    expect(run.totals.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    for (const w of run.totals.weights) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  }
});

test("the share URL round-trips every setting and rejects garbage", () => {
  expect(M.encode(M.DEFAULTS)).toBe("");
  for (const config of grid) expect(M.decode("?" + M.encode(config))).toEqual(config);
  expect(M.decode("?focus=<script>&head=Z&scale=xx&causal=yy&temp=abc")).toEqual(M.DEFAULTS);
  expect(M.decode("?focus=99&temp=50")).toEqual({ ...M.DEFAULTS, temp: 2 });
});

test("every mission has a passing config and the default does not pass them all", () => {
  for (const mission of M.MISSIONS) {
    expect(mission.check(M.simulate(mission.try))).toBe(true);
    expect(grid.some((config) => mission.check(M.simulate(config)))).toBe(true);
  }
  const base = M.simulate(M.DEFAULTS);
  expect(M.MISSIONS.every((mission) => mission.check(base))).toBe(false);
});

test("missions have unique ids, both kinds, and one-sentence copy", () => {
  expect(new Set(M.MISSIONS.map((m) => m.id)).size).toBe(M.MISSIONS.length);
  expect(M.MISSIONS.length).toBeGreaterThanOrEqual(3);
  const text = M.MISSIONS.map((m) => m.title + m.goal).join(" ").toLowerCase();
  expect(text).toMatch(/break|saturat|wrong|off/);
  expect(text).toMatch(/tune|find|make|switch|turn/);
  for (const m of M.MISSIONS) for (const key of ["title", "goal", "hint"]) expect(m[key].length).toBeGreaterThan(3);
});

test("the quiz has 6 items in pre, check x3, post x2 order with spread answers", () => {
  expect(content.quiz.map((q) => q.stage)).toEqual(["pre", "check", "check", "check", "post", "post"]);
  for (const q of content.quiz) {
    expect(q.options).toHaveLength(4);
    expect(q.correct).toBeGreaterThanOrEqual(0);
    expect(q.correct).toBeLessThan(4);
    expect(q.explanation.length).toBeGreaterThan(10);
    const lens = q.options.map((o) => o.length);
    expect(Math.max(...lens) - Math.min(...lens)).toBeLessThan(40);
  }
  expect(new Set(content.quiz.map((q) => q.correct)).size).toBeGreaterThanOrEqual(3);
});
