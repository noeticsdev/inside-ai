// Inside next-token sampling: pure, deterministic state model.
// Two prompts carry fixed, hand-set example logits (a real model learns
// thousands of dimensions; these 12-token toys stand in for it). The math is
// real: softmax(logits / T), top-k, top-p renormalisation, then a seeded
// cumulative draw (mulberry32). A tiny fixed bigram table continues the text.

export const PROMPTS = {
  capital: {
    text: "The capital of France is",
    tokens: [" Paris", " London", " Berlin", " Madrid", " Rome", " Lyon", " Marseille", " Toulouse", " France", " Europe", " bananas", " ..."],
    logits: [4.0, 1.6, 1.4, 1.2, 1.0, 0.6, 0.1, -0.2, -0.6, -0.9, -1.6, -2.1],
  },
  story: {
    text: "Once upon a time there was a",
    tokens: [" dragon", " castle", " girl", " boy", " forest", " king", " queen", " robot", " knight", " storm", " whisper", " potato"],
    logits: [1.2, 1.1, 1.0, 0.95, 0.9, 0.85, 0.8, 0.7, 0.6, 0.5, 0.35, -0.3],
  },
};

// Tiny fixed bigram table: token -> continuation candidates. Anything not
// listed falls back to DEFAULT_FOLLOW. Each row is peaked on purpose so a
// short continuation reads like a sentence fragment.
export const FOLLOW = {
  " Paris": { tokens: ["!", ".", " at dawn", " traffic", " pigeons", " xyzzy"], logits: [3.2, 2.0, 0.8, -0.4, -0.9, -2.4] },
  " London": { tokens: ["!", ".", " fog", " bridge", " buses", " xyzzy"], logits: [3.0, 1.9, 0.7, -0.5, -1.0, -2.5] },
  " Berlin": { tokens: ["!", ".", " wall", " techno", " rain", " xyzzy"], logits: [2.9, 1.8, 0.6, -0.6, -1.1, -2.6] },
  " dragon": { tokens: [" roared", " slept", "!", ",", " danced", " xyzzy"], logits: [2.8, 1.6, 0.7, -0.3, -1.1, -2.6] },
  " castle": { tokens: [" stood", " gates", "!", ".", " crumbled", " xyzzy"], logits: [2.7, 1.5, 0.6, -0.4, -1.2, -2.7] },
  " girl": { tokens: [" laughed", " ran", "!", ".", " vanished", " xyzzy"], logits: [2.6, 1.4, 0.5, -0.5, -1.3, -2.8] },
  " and": { tokens: [" then", " slept", " smiled", " left", ".", " xyzzy"], logits: [2.2, 1.6, 1.2, 0.8, 0.2, -2.6] },
  " then": { tokens: [" slept", " left", " smiled", ".", "!", " xyzzy"], logits: [2.0, 1.5, 1.1, 0.6, 0.1, -2.6] },
};
export const DEFAULT_FOLLOW = { tokens: [".", " and", "!", " then", " softly", " xyzzy"], logits: [2.6, 1.8, 0.9, -0.2, -0.9, -2.4] };
// "." and "!" end the text, standing in for the end-of-sequence token a real model emits.
export const END_TOKENS = [".", "!"];

export const DEFAULTS = { prompt: "capital", temperature: 1.0, topK: 0, topP: 1.0, seed: 7, count: 8 };
export const TOPK_OFF = 0;

export function configOf(input = {}) {
  const temperature = Number(input.temperature);
  const topK = Number(input.topK);
  const topP = Number(input.topP);
  const seed = Number(input.seed);
  const count = Number(input.count);
  return {
    prompt: Object.hasOwn(PROMPTS, input.prompt) ? input.prompt : DEFAULTS.prompt,
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, Math.round(temperature * 10) / 10)) : DEFAULTS.temperature,
    topK: Number.isInteger(topK) && topK >= 0 && topK <= 12 ? topK : DEFAULTS.topK,
    topP: Number.isFinite(topP) ? Math.min(1, Math.max(0.1, Math.round(topP * 20) / 20)) : DEFAULTS.topP,
    seed: Number.isInteger(seed) && seed >= 0 && seed <= 999 ? seed : DEFAULTS.seed,
    count: count === 1 ? 1 : DEFAULTS.count,
  };
}

export function mulberry32(seed) {
  let a = (seed + 0x6d2b79f5) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function softmax(logits, temperature) {
  if (temperature === 0) {
    let best = 0;
    for (let i = 1; i < logits.length; i++) if (logits[i] > logits[best]) best = i;
    return logits.map((_, i) => (i === best ? 1 : 0));
  }
  const scaled = logits.map((l) => l / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function baseProbs(logits) {
  return softmax(logits, 1);
}

// Keep the top-k by logit (topK 0 = off), then the smallest set by
// probability whose mass reaches topP. Returns indices in probability-desc
// order (ties broken by index, so the draw order is deterministic).
export function filterKept(logits, probs, topK, topP) {
  let idx = logits.map((_, i) => i);
  if (topK > 0) idx = [...idx].sort((a, b) => logits[b] - logits[a] || a - b).slice(0, Math.min(topK, idx.length));
  idx.sort((a, b) => probs[b] - probs[a] || a - b);
  const kept = [];
  let mass = 0;
  for (const i of idx) {
    kept.push(i);
    mass += probs[i];
    if (mass >= topP) break;
  }
  return kept.length ? kept : [idx[0]];
}

export function entropyBits(probs) {
  let h = 0;
  for (const p of probs) if (p > 0) h -= p * Math.log2(p);
  return h;
}

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;
const round4 = (v) => Math.round(v * 10000) / 10000;

export function simulate(input = {}) {
  const config = configOf(input);
  const rand = mulberry32(config.seed);
  const events = [];
  const draws = [];
  let text = PROMPTS[config.prompt].text;
  const push = (type, station, fields) => {
    events.push({ index: events.length, type, station, ...fields });
  };

  push("prompt", "logits", {
    prompt: config.prompt,
    promptText: PROMPTS[config.prompt].text,
    trace: `prompt: "${PROMPTS[config.prompt].text}"`,
  });

  for (let step = 0; step < config.count; step++) {
    const prev = draws.length ? draws[draws.length - 1].token : null;
    const row = step === 0 ? PROMPTS[config.prompt] : FOLLOW[prev] || DEFAULT_FOLLOW;
    const { tokens, logits } = row;
    const base = baseProbs(logits);
    const probs = softmax(logits, config.temperature);
    const kept = filterKept(logits, probs, config.topK, config.topP);
    const mass = kept.reduce((a, i) => a + probs[i], 0);
    const final = kept.map((i) => probs[i] / mass);
    const entropy = config.temperature === 0 ? 0 : round2(entropyBits(final));
    const minKeptBase = round4(Math.min(...kept.map((i) => base[i])));

    const topIdx = [...logits.keys()].sort((a, b) => logits[b] - logits[a] || a - b).slice(0, 3);
    push("heat", "heat", {
      step,
      temperature: config.temperature,
      greedy: config.temperature === 0,
      bars: tokens.map((token, i) => ({ token, logit: logits[i] })),
      top: topIdx.map((i) => ({ token: tokens[i], logit: logits[i], prob: round4(probs[i]) })),
      entropy,
      trace: config.temperature === 0
        ? `step ${step + 1}: temperature 0, greedy, no odds`
        : `step ${step + 1}: temperature ${config.temperature}, entropy ${entropy.toFixed(2)} bits`,
    });

    push("gate", "gate", {
      step,
      kept: kept.map((i, k) => ({ token: tokens[i], prob: round4(final[k]), baseProb: round4(base[i]) })),
      slots: tokens.map((token, i) => ({ token, prob: kept.includes(i) ? round4(final[kept.indexOf(i)]) : 0 })),
      keptCount: kept.length,
      ofCount: tokens.length,
      minKeptBase,
      trace: `step ${step + 1}: ${kept.length} of ${tokens.length} tokens still in play`,
    });

    let pick;
    let r = null;
    if (config.temperature === 0) {
      pick = kept.reduce((a, b) => (logits[b] > logits[a] || (logits[b] === logits[a] && b < a) ? b : a), kept[0]);
    } else {
      r = rand();
      let cum = 0;
      pick = kept[kept.length - 1];
      for (let k = 0; k < kept.length; k++) {
        cum += final[k];
        if (r < cum) {
          pick = kept[k];
          break;
        }
      }
    }
    const token = tokens[pick];
    const prob = config.temperature === 0 ? 1 : round4(final[kept.indexOf(pick)]);
    const probPct = config.temperature === 0 ? 100 : round1((final[kept.indexOf(pick)] ?? 0) * 100);
    const baseProb = round4(base[pick]);
    text += token;
    draws.push({ token, prob, baseProb });
    push("draw", "draw", {
      step,
      r: r === null ? null : round4(r),
      chosen: pick,
      token,
      prob,
      probPct,
      baseProb,
      trace: `step ${step + 1}: ball lands on "${token.trim() || token}" at ${config.temperature === 0 ? 100 : probPct}%`,
    });

    push("stamp", "tape", {
      step,
      token,
      text,
      trace: `step ${step + 1}: stamped "${token.trim() || token}", tape reads "…${text.slice(-28)}"`,
    });
    if (END_TOKENS.includes(token)) break;
  }

  const last = draws[draws.length - 1];
  const firstGate = events.find((e) => e.type === "gate");
  return {
    config,
    events,
    totals: {
      steps: events.length,
      tokens: draws.length,
      text,
      lastToken: last.token,
      lastProb: last.prob,
      lastProbPct: events.filter((e) => e.type === "draw").at(-1).probPct,
      lastBaseProb: last.baseProb,
      inPlay: events.filter((e) => e.type === "draw").at(-1) ? events.filter((e) => e.type === "gate").at(-1).keptCount : 0,
      entropy: events.filter((e) => e.type === "heat").at(-1).entropy,
      firstKept: firstGate.keptCount,
      draws: draws.map((d) => ({ ...d })),
    },
  };
}

export function encode(config) {
  const c = configOf(config);
  const params = new URLSearchParams();
  if (c.prompt !== DEFAULTS.prompt) params.set("prompt", c.prompt);
  if (c.temperature !== DEFAULTS.temperature) params.set("t", String(c.temperature));
  if (c.topK !== DEFAULTS.topK) params.set("k", String(c.topK));
  if (c.topP !== DEFAULTS.topP) params.set("p", String(c.topP));
  if (c.seed !== DEFAULTS.seed) params.set("seed", String(c.seed));
  if (c.count !== DEFAULTS.count) params.set("n", String(c.count));
  return params.toString();
}

export function decode(search) {
  const params = new URLSearchParams(search);
  return configOf({
    prompt: params.get("prompt"),
    temperature: params.get("t") === null ? undefined : Number(params.get("t")),
    topK: params.get("k") === null ? undefined : Number(params.get("k")),
    topP: params.get("p") === null ? undefined : Number(params.get("p")),
    seed: params.get("seed") === null ? undefined : Number(params.get("seed")),
    count: params.get("n") === null ? undefined : Number(params.get("n")),
  });
}

export const MISSIONS = [
  {
    id: "robot",
    title: "Be a robot",
    goal: "Make the output deterministic: temperature 0 or top-k 1, then the same text comes out for any seed.",
    hint: "Set Temperature to 0 and press Generate 8. Change the seed and run again: the tape never changes.",
    try: { prompt: "capital", temperature: 0, topK: 0, topP: 1.0, seed: 7, count: 8 },
    check: (run) => (run.config.temperature === 0 || run.config.topK === 1) && run.config.count === 8,
  },
  {
    id: "break-it",
    title: "Break it",
    goal: "Push the temperature to 2 with the filters off until a token under 2% base odds gets picked.",
    hint: "Set Temperature to 2, top-k off, top-p 1.0, Generate 1, and try seeds until the readout shows a base odd under 2%.",
    try: { prompt: "capital", temperature: 2.0, topK: 0, topP: 1.0, seed: 9, count: 1 },
    check: (run) =>
      run.config.temperature >= 1.5 &&
      run.events.some((e) => e.type === "draw" && e.baseProb < 0.02),
  },
  {
    id: "safe",
    title: "Creative but safe",
    goal: "Keep temperature at 1 or higher, but make it impossible to pick anything under 5% base odds.",
    hint: "Heat spreads the odds, so close the shutters: a small top-k keeps only the strong tokens in play.",
    try: { prompt: "capital", temperature: 1.2, topK: 3, topP: 1.0, seed: 7, count: 8 },
    check: (run) =>
      run.config.temperature >= 1.0 &&
      run.events.filter((e) => e.type === "gate").length > 0 &&
      run.events.filter((e) => e.type === "gate").every((e) => e.minKeptBase >= 0.05),
  },
  {
    id: "nucleus",
    title: "Size the nucleus",
    goal: "On the peaked prompt with top-p 0.9, exactly 5 tokens stay in play after the shutters.",
    hint: "Pick the capital prompt, set top-p to 0.9 with top-k off, and read the in-play readout.",
    try: { prompt: "capital", temperature: 1.0, topK: 0, topP: 0.9, seed: 7, count: 1 },
    check: (run) =>
      run.config.prompt === "capital" &&
      run.config.topP === 0.9 &&
      run.events.some((e) => e.type === "gate" && e.step === 0 && e.keptCount === 5),
  },
];
