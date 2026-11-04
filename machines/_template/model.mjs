// Reference machine: a read-through cache. Pure and deterministic: no DOM, no clock.
// Copy this folder to start a new machine. See AGENTS.md, "Machine contract".

export const PATTERNS = {
  mixed: ["user:7", "user:9", "user:7"],
  repeat: ["user:7", "user:7", "user:7"],
  unique: ["user:7", "user:9", "user:4"],
};

export const COST = { intake: 5, lookup: 2, fetch: 120, store: 3, exit: 5 };

export const DEFAULTS = { cache: true, pattern: "mixed" };

export function configOf(input = {}) {
  return {
    cache: typeof input.cache === "boolean" ? input.cache : DEFAULTS.cache,
    pattern: Object.hasOwn(PATTERNS, input.pattern) ? input.pattern : DEFAULTS.pattern,
  };
}

export function simulate(input = {}) {
  const config = configOf(input);
  const stored = [];
  const events = [];
  let clock = 0;
  let hits = 0;
  let fetches = 0;

  const push = (type, station, cost, fields) => {
    clock += cost;
    events.push({ index: events.length, type, station, cost, clock, hits, fetches, stored: stored.slice(), ...fields });
  };

  PATTERNS[config.pattern].forEach((key, n) => {
    push("intake", "intake", COST.intake, { key, trace: `request ${n + 1}: ${key}` });
    if (config.cache) {
      const hit = stored.includes(key);
      if (hit) hits += 1;
      push("lookup", "cache", COST.lookup, { key, hit, trace: hit ? `cache hit: ${key}` : `cache miss: ${key}` });
      if (hit) {
        push("exit", "exit", COST.exit, { key, source: "cache", trace: `served ${key} from the cache` });
        return;
      }
    } else {
      push("bypass", "cache", 0, { key, trace: "cache switched off" });
    }
    fetches += 1;
    push("fetch", "origin", COST.fetch, { key, trace: `origin fetch: ${key}` });
    if (config.cache) {
      stored.push(key);
      push("store", "cache", COST.store, { key, trace: `stored ${key}` });
    }
    push("exit", "exit", COST.exit, { key, source: "origin", trace: `served ${key} from the origin` });
  });

  return { config, events, totals: { steps: events.length, hits, fetches, clock } };
}

export function encode(config) {
  const c = configOf(config);
  const params = new URLSearchParams();
  if (!c.cache) params.set("cache", "off");
  if (c.pattern !== DEFAULTS.pattern) params.set("pattern", c.pattern);
  return params.toString();
}

export function decode(search) {
  const params = new URLSearchParams(search);
  return configOf({ cache: params.get("cache") !== "off", pattern: params.get("pattern") });
}

export const MISSIONS = [
  {
    id: "first-hit",
    title: "Catch a hit",
    goal: "Run the machine and serve one request from the cache.",
    hint: "The third request asks for user:7 again.",
    try: { cache: true, pattern: "mixed" },
    check: (run) => run.totals.hits >= 1,
  },
  {
    id: "all-hits",
    title: "Hit every repeat",
    goal: "Pick a request pattern where every request after the first is a hit.",
    hint: "If every request asks for the same key, only the first one has to travel to the origin.",
    try: { cache: true, pattern: "repeat" },
    check: (run) => run.config.cache && run.totals.hits === PATTERNS[run.config.pattern].length - 1,
  },
  {
    id: "break-it",
    title: "Break the cache",
    goal: "Switch the cache off and watch every request pay the 120 ms origin cost.",
    hint: "Untick Cache, then run.",
    try: { cache: false, pattern: "mixed" },
    check: (run) => !run.config.cache && run.totals.fetches === PATTERNS[run.config.pattern].length,
  },
];
