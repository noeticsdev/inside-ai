import { test, expect } from "bun:test";
import * as M from "./model.mjs";
import content from "./content.mjs";

const rankOf = (run) => run.events.find((e) => e.type === "rank").order.join(" ");

const grid = [];
for (const query of Object.keys(M.QUERIES))
  for (const method of M.METHODS)
    for (const k of [1, 3, 5])
      for (const normalise of [true, false])
        grid.push({ query, method, k, normalise, mixA: 0, mixT: 0 });
grid.push({ query: "puppy", method: "cosine", k: 3, normalise: false, mixA: 3, mixT: -2 });

test("the default run prints the exact numbers on the page", () => {
  const run = M.simulate();
  expect(rankOf(run)).toBe("dog puppy kitten encyclopedia mountain beach bread pizza stocks bank server laptop");
  expect(run.totals).toMatchObject({ top: "dog", topScore: 0.9999, angle: 1, shared: 0, right: "dog", rightRank: 1, k: 3, method: "cosine" });
  const dog = run.events.find((e) => e.type === "score" && e.doc === "dog");
  expect(dog.cos).toBe(0.9999);
  expect(dog.angle).toBe(1);
  expect(dog.kw).toBe(0);
});

test("the long-vector bully wins on raw dot product and loses when normalised", () => {
  const raw = M.simulate({ query: "puppy", method: "dot", normalise: false });
  expect(raw.totals.top).toBe("encyclopedia");
  expect(raw.totals.topScore).toBe(2.379);
  expect(raw.totals.rightRank).toBe(3);
  const fixed = M.simulate({ query: "puppy", method: "dot", normalise: true });
  expect(fixed.totals.top).toBe("dog");
  expect(fixed.totals.topScore).toBe(0.9999);
  expect(fixed.totals.rightRank).toBe(1);
});

test("keyword search buries the right card for the puppy query", () => {
  const run = M.simulate({ query: "puppy", method: "keyword" });
  expect(run.totals.top).toBe("puppy");
  expect(run.totals.topScore).toBe(1);
  expect(run.totals.rightRank).toBe(9);
});

test("the trail query puts the right card at rank 3 under cosine", () => {
  const run = M.simulate({ query: "trail", method: "cosine", k: 3 });
  expect(run.totals.rightRank).toBe(3);
  expect(run.totals.top).toBe("mountain");
  expect(run.totals.topScore).toBe(0.9516);
  expect(run.totals.angle).toBe(17.9);
});

test("the mixer boosts change the query vector and the ranking", () => {
  const q0 = M.queryVector(M.configOf({ query: "puppy" }));
  expect(q0[0]).toBeCloseTo(0.88, 10);
  const q1 = M.queryVector(M.configOf({ query: "puppy", mixA: 5, mixT: -5 }));
  expect(q1[0]).toBeCloseTo(1.38, 10);
  expect(q1[2]).toBe(0);
  expect(M.simulate({ query: "puppy" }).totals.top).toBe("dog");
  expect(M.simulate({ query: "puppy", mixA: 5 }).totals.top).toBe("puppy");
});

test("every run is deterministic, sequential and its clock never goes back", () => {
  for (const config of grid) {
    const run = M.simulate(config);
    expect(M.simulate(config)).toEqual(run);
    expect(run.events.at(-1).type).toBe("slot");
    run.events.forEach((event, i) => {
      expect(event.index).toBe(i);
      expect(typeof event.trace).toBe("string");
      if (i) expect(event.clock).toBeGreaterThanOrEqual(run.events[i - 1].clock);
    });
    expect(run.events.filter((e) => e.type === "slot")).toHaveLength(run.config.k);
  }
});

test("the share URL round-trips every setting and rejects garbage", () => {
  expect(M.encode(M.DEFAULTS)).toBe("");
  for (const config of grid) expect(M.decode("?" + M.encode(config))).toEqual(M.configOf(config));
  expect(M.decode("?query=<script>&method=nonsense&k=nonsense&mixA=nonsense")).toEqual(M.DEFAULTS);
  expect(M.decode("")).toEqual(M.DEFAULTS);
});

test("every mission has a passing config and the default does not pass them all", () => {
  for (const mission of M.MISSIONS) {
    expect(mission.check(M.simulate(mission.try))).toBe(true);
    expect(grid.some((config) => mission.check(M.simulate(config)))).toBe(true);
  }
  const base = M.simulate(M.DEFAULTS);
  expect(M.MISSIONS.every((mission) => mission.check(base))).toBe(false);
});

test("missions have unique ids, both break and tune kinds, and one-sentence copy", () => {
  expect(new Set(M.MISSIONS.map((m) => m.id)).size).toBe(M.MISSIONS.length);
  expect(M.MISSIONS.length).toBeGreaterThanOrEqual(4);
  for (const m of M.MISSIONS) for (const key of ["title", "goal", "hint"]) expect(m[key].length).toBeGreaterThan(3);
});

test("the quiz has 6 items in pre, check x3, post x2 order with spread answers", () => {
  expect(content.quiz.map((q) => q.stage)).toEqual(["pre", "check", "check", "check", "post", "post"]);
  for (const q of content.quiz) {
    expect(q.options).toHaveLength(4);
    expect(q.correct).toBeGreaterThanOrEqual(0);
    expect(q.correct).toBeLessThan(4);
    expect(q.explanation.length).toBeGreaterThan(10);
  }
  expect(new Set(content.quiz.map((q) => q.correct)).size).toBeGreaterThanOrEqual(3);
});
