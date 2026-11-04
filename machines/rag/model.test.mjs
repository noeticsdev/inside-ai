import { test, expect } from "bun:test";
import * as M from "./model.mjs";
import content from "./content.mjs";

const grid = [];
for (const question of Object.keys(M.QUESTIONS))
  for (const chunkSize of [6, 12, 24, 40])
    for (const overlap of [0, 6])
      for (const k of [1, 2, 4])
        for (const budget of [40, 160])
          for (const guardrail of [true, false]) grid.push({ question, chunkSize, overlap, k, budget, guardrail });

test("the default run cuts 6 cards and prints the exact numbers on the page", () => {
  const run = M.simulate();
  expect(run.events.map((e) => e.type).join(" ")).toBe("chunk chunk chunk chunk chunk chunk embed index retrieve pack answer done");
  expect(run.totals.chunks).toBe(6);
  expect(run.totals.topScore).toBe(0.636);
  expect(run.totals.tokensPacked).toBe(56);
  expect(run.totals.budget).toBe(160);
  expect(run.totals.status).toBe("grounded");
  expect(run.totals.citation).toBe("Leave policy");
  expect(run.totals.answer).toBe("Staff get 25 vacation days per year.");
});

test("tokens are words x 1.3 rounded, including the 14-word prompt line", () => {
  expect(M.tokensOf(20)).toBe(26);
  expect(M.tokensOf(9)).toBe(12);
  expect(M.PROMPT_WORDS).toBe(14);
  // Default: 14-word prompt + 9-word question + one 20-word card.
  expect(M.simulate().totals.tokensPacked).toBe(M.tokensOf(14) + M.tokensOf(9) + M.tokensOf(20));
});

test("the two-part question needs k 2 and stays inside the budget", () => {
  const run = M.simulate({ question: "twopart", k: 2 });
  expect(run.totals.status).toBe("grounded");
  expect(run.totals.citation).toBe("Leave policy + Expenses guide");
  expect(run.totals.tokensPacked).toBe(89);
  expect(run.totals.tokensPacked).toBeLessThanOrEqual(run.totals.budget);
  expect(M.simulate({ question: "twopart", k: 1 }).totals.status).toBe("not-found");
});

test("tiny chunks split the leave fact and the honest machine says it does not know", () => {
  const run = M.simulate({ question: "leave", chunkSize: 6, overlap: 0 });
  expect(run.totals.chunks).toBe(23);
  expect(run.totals.status).toBe("not-found");
  expect(run.totals.answer).toBe("I don't know.");
  expect(run.totals.citation).toBe("—");
});

test("with the guardrail off a lost fact becomes an unsupported guess", () => {
  const run = M.simulate({ question: "leave", chunkSize: 6, overlap: 0, guardrail: false });
  expect(run.totals.status).toBe("unsupported");
  expect(run.totals.answer).toBe(M.WRONG.leave);
  expect(run.totals.citation).toBe("none — unsupported");
});

test("the unanswerable question is never grounded", () => {
  expect(M.simulate({ question: "unanswerable", k: 2 }).totals).toMatchObject({ status: "not-found", answer: "I don't know." });
  expect(M.simulate({ question: "unanswerable", k: 4, guardrail: false }).totals).toMatchObject({ status: "unsupported" });
});

test("a budget of 40 packs nothing and loses the answer", () => {
  const run = M.simulate({ budget: 40 });
  expect(run.totals.kept).toBe(0);
  expect(run.totals.dropped).toBe(1);
  expect(run.totals.status).toBe("not-found");
});

test("the embedding is deterministic and ranks the leave card first", () => {
  expect(M.embed("Staff get vacation days")).toEqual(M.embed("Staff get vacation days"));
  expect(M.embed("Staff get vacation days").length).toBe(64);
  const run = M.simulate();
  const first = run.events.find((e) => e.type === "retrieve");
  expect(first.card).toBe(0);
  expect(first.score).toBe(run.totals.topScore);
});

test("every run is deterministic, sequential and its clock never goes back", () => {
  for (const config of grid) {
    const run = M.simulate(config);
    expect(M.simulate(config)).toEqual(run);
    expect(run.events.at(-1).type).toBe("done");
    run.events.forEach((event, i) => {
      expect(event.index).toBe(i);
      expect(typeof event.trace).toBe("string");
      expect(event.trace.length).toBeGreaterThan(0);
      if (i) expect(event.clock).toBeGreaterThanOrEqual(run.events[i - 1].clock);
    });
    expect(run.totals.tokensPacked).toBeLessThanOrEqual(run.config.budget + M.tokensOf(40));
  }
}, 60000);

test("the share URL round-trips every setting and rejects garbage", () => {
  expect(M.encode(M.DEFAULTS)).toBe("");
  expect(M.decode("?g=off").guardrail).toBe(false);
  for (const config of grid.slice(0, 200)) expect(M.decode("?" + M.encode(M.configOf(config)))).toEqual(M.configOf(config));
  expect(M.decode("?q=<script>&cs=nonsense")).toEqual(M.DEFAULTS);
  expect(M.decode("?k=99&b=-5")).toEqual({ ...M.DEFAULTS, k: 4, budget: 40 });
  expect(M.configOf({ chunkSize: 6, overlap: 12 }).overlap).toBe(5);
});

test("every mission has a passing config and the default does not pass them all", () => {
  for (const mission of M.MISSIONS) {
    expect(mission.check(M.simulate(mission.try))).toBe(true);
    expect(grid.some((config) => mission.check(M.simulate(config)))).toBe(true);
  }
  const base = M.simulate(M.DEFAULTS);
  expect(M.MISSIONS.every((mission) => mission.check(base))).toBe(false);
}, 60000);

test("missions include a break-it and a tune-it with unique ids", () => {
  expect(M.MISSIONS).toHaveLength(4);
  expect(new Set(M.MISSIONS.map((m) => m.id)).size).toBe(4);
  expect(M.MISSIONS[1].id).toBe("split-fact");
  expect(M.MISSIONS[2].id).toBe("two-facts");
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
  expect(new Set(content.quiz.map((q) => q.correct)).size).toBe(4);
});
