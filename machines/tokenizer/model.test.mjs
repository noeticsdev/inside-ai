import { test, expect } from "bun:test";
import * as M from "./model.mjs";
import content from "./content.mjs";

const GRID = [];
for (const merges of [0, 1, 10, 32, 40]) for (const preset of Object.keys(M.PRESETS)) GRID.push({ merges, preset });

test("training learns real BPE merges in rank order", () => {
  expect(M.MERGES.length).toBe(40);
  expect(M.MERGES.slice(0, 4).map((m) => [m.a, m.b, m.into])).toEqual([
    ["h", "e", "he"],
    ["n", "g", "ng"],
    ["t", "he", "the"],
    ["i", "ng", "ing"],
  ]);
  expect(M.BASE_VOCAB_SIZE).toBe(23);
});

test("the default run prints exact numbers", () => {
  const run = M.simulate();
  expect(run.events.map((e) => e.type).join(" ")).toBe(
    "intake merge merge merge merge merge merge merge merge merge merge exit",
  );
  expect(run.totals).toEqual({
    steps: 12,
    text: M.PRESETS.english,
    chars: 50,
    tokens: 37,
    cpt: 1.35,
    vocabSize: 33,
    mergesApplied: 10,
    lastMerge: { rank: 9, a: "e", b: "a", into: "ea" },
    tokenList: run.totals.tokenList,
  });
  expect(run.totals.tokenList.join("|")).toBe(
    "the| |e|ng|in|e| |l|ea|r|n|s| |m|or|e| |and| |the| |w|he|e|l|s| |s|o|u|nd| |l|o|u|d|er",
  );
});

test("the english token curve falls with merges", () => {
  const at = (n) => M.simulate({ preset: "english", merges: n }).totals.tokens;
  expect([at(0), at(10), at(20), at(32), at(36), at(40)]).toEqual([50, 37, 32, 26, 25, 24]);
  expect(M.SWEET_MERGES).toBe(32);
  expect(at(31)).toBeGreaterThan(M.SWEET_TOKENS);
});

test("unseen text barely fuses", () => {
  const hindi = M.simulate({ preset: "hindi", merges: 30 }).totals;
  const code = M.simulate({ preset: "code", merges: 30 }).totals;
  expect([hindi.tokens, hindi.cpt]).toEqual([30, 1]);
  expect(code.cpt).toBeLessThan(M.BREAK_CPT);
  expect(M.simulate({ preset: "english", merges: 30 }).totals.cpt).toBeGreaterThan(M.BREAK_CPT);
});

test("no token ever crosses a word boundary", () => {
  for (const config of GRID) {
    const run = M.simulate(config);
    for (const t of run.totals.tokenList) expect(t === " " || !t.includes(" ")).toBe(true);
    const words = run.totals.text.split(" ").length;
    expect(run.totals.tokenList.filter((t) => t === " ").length).toBe(words - 1);
  }
});

test("every run is deterministic, sequential and traced", () => {
  for (const config of GRID) {
    const run = M.simulate(config);
    expect(M.simulate(config)).toEqual(run);
    expect(run.events.length).toBe(config.merges + 2);
    run.events.forEach((event, i) => {
      expect(event.index).toBe(i);
      expect(typeof event.trace).toBe("string");
      expect(event.trace.length).toBeGreaterThan(5);
    });
    const counts = run.events.map((e) => e.tokenCount);
    counts.forEach((n, i) => {
      if (i) expect(n).toBeLessThanOrEqual(counts[i - 1]);
    });
  }
});

test("merge events name the press target", () => {
  const run = M.simulate({ preset: "english", merges: 3 });
  const first = run.events[1];
  expect(first.merge).toEqual({ rank: 0, a: "h", b: "e", into: "he" });
  // "wheels" holds the first "he" of the row: the press aims at its index.
  expect(first.tokens[first.at]).toBe("he");
  expect(first.vocabSize).toBe(M.BASE_VOCAB_SIZE + 1);
});

test("the share URL round-trips every setting and rejects garbage", () => {
  expect(M.encode(M.DEFAULTS)).toBe("");
  for (const config of GRID) expect(M.decode("?" + M.encode(config))).toEqual(config);
  expect(M.decode("?merges=banana&preset=<script>")).toEqual(M.DEFAULTS);
  expect(M.decode("?merges=999&preset=hindi")).toEqual({ merges: 40, preset: "hindi" });
  expect(M.decode("?merges=-3")).toEqual({ merges: 0, preset: "english" });
});

test("every mission has a passing config and the default does not pass them all", () => {
  for (const mission of M.MISSIONS) {
    expect(mission.check(M.simulate(mission.try))).toBe(true);
    expect(GRID.some((config) => mission.check(M.simulate(config)))).toBe(true);
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
  const positions = new Set();
  for (const q of content.quiz) {
    expect(q.options).toHaveLength(4);
    expect(q.correct).toBeGreaterThanOrEqual(0);
    expect(q.correct).toBeLessThan(4);
    expect(q.explanation.length).toBeGreaterThan(10);
    const lengths = q.options.map((o) => o.length);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(45);
    positions.add(q.correct);
  }
  expect(positions.size).toBeGreaterThanOrEqual(3);
});
