import { test, expect } from "bun:test";
import * as M from "./model.mjs";
import content from "./content.mjs";

const types = (run) => run.events.map((event) => event.type).join(" ");
const grid = [];
for (const cache of [true, false]) for (const pattern of Object.keys(M.PATTERNS)) grid.push({ cache, pattern });

test("with the cache on, the repeat request is a hit", () => {
  const run = M.simulate();
  expect(types(run)).toBe("intake lookup fetch store exit intake lookup fetch store exit intake lookup exit");
  expect(run.totals).toEqual({ steps: 13, hits: 1, fetches: 2, clock: 282 });
  expect(run.events.at(-1).source).toBe("cache");
});

test("with the cache off, every request goes to the origin", () => {
  const run = M.simulate({ cache: false });
  expect(run.totals.hits).toBe(0);
  expect(run.totals.fetches).toBe(3);
  expect(run.totals.clock).toBe(390);
});

test("the repeat pattern hits twice", () => {
  expect(M.simulate({ pattern: "repeat" }).totals).toEqual({ steps: 11, hits: 2, fetches: 1, clock: 159 });
});

test("every run is deterministic, sequential and its clock never goes back", () => {
  for (const config of grid) {
    const run = M.simulate(config);
    expect(M.simulate(config)).toEqual(run);
    run.events.forEach((event, i) => {
      expect(event.index).toBe(i);
      expect(typeof event.trace).toBe("string");
      if (i) expect(event.clock).toBeGreaterThanOrEqual(run.events[i - 1].clock);
    });
  }
});

test("the share URL round-trips every setting and rejects garbage", () => {
  expect(M.encode(M.DEFAULTS)).toBe("");
  for (const config of grid) expect(M.decode("?" + M.encode(config))).toEqual(config);
  expect(M.decode("?cache=nonsense&pattern=<script>")).toEqual(M.DEFAULTS);
});

test("every mission has a passing config and the default does not pass them all", () => {
  for (const mission of M.MISSIONS) {
    expect(mission.check(M.simulate(mission.try))).toBe(true);
    expect(grid.some((config) => mission.check(M.simulate(config)))).toBe(true);
  }
  const base = M.simulate(M.DEFAULTS);
  expect(M.MISSIONS.every((mission) => mission.check(base))).toBe(false);
});

test("missions have unique ids and one-sentence copy", () => {
  expect(new Set(M.MISSIONS.map((m) => m.id)).size).toBe(M.MISSIONS.length);
  expect(M.MISSIONS.length).toBeGreaterThanOrEqual(3);
  for (const m of M.MISSIONS) for (const key of ["title", "goal", "hint"]) expect(m[key].length).toBeGreaterThan(3);
});

test("the quiz has 6 items in pre, check x3, post x2 order", () => {
  expect(content.quiz.map((q) => q.stage)).toEqual(["pre", "check", "check", "check", "post", "post"]);
  for (const q of content.quiz) {
    expect(q.options).toHaveLength(4);
    expect(q.correct).toBeGreaterThanOrEqual(0);
    expect(q.correct).toBeLessThan(4);
    expect(q.explanation.length).toBeGreaterThan(10);
  }
});
