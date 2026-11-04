// Token sampler model. Pure and deterministic: no DOM, no clock, seeded draws.
// The logits and the continuation table are a fixed simulation, not a language
// model. The sampling arithmetic (softmax, temperature, top-k, top-p, the
// inverse-CDF draw and the repetition penalty) is real.

// One prompt, one vocabulary slice of four candidates for the next token.
export const PROMPTS = {
  story: {
    text: 'Once upon a time there was a',
    tokens: [' dragon', ' castle', ' girl', ' boy'],
    logits: [2, 1, 0, -1],
  },
};

// The worked single-step example that the build steps follow on the board.
// Pipeline order matches Hugging Face: temperature, then top-k, then top-p.
export const EXAMPLE = {
  tokens: PROMPTS.story.tokens,
  logits: PROMPTS.story.logits,
  hotT: 0.5, // the temperature step's what-if
  T: 1,      // the chain keeps T = 1 for the cuts and the draw
  k: 3,
  p: 0.9,
  u: 0.7,
};
export const NAMES = EXAMPLE.tokens.map((t) => t.trim());
export const PROMPT_CONTEXT = PROMPTS.story.text.split(' ').map((t, i) => i ? ` ${t}` : t);

// Fixed continuation table: the candidates for the next token after each token.
// The castle row is the only real choice. " in" leads back to "a castle" and is
// already in the context ("lived in"), so a repetition penalty can demote it.
export const FOLLOW = {
  ' dragon': ' who', ' who': ' lived', ' lived': ' in', ' in': ' a', ' a': ' castle',
  ' by': ' the', ' the': ' sea', ' sea': '.', '.': '<EOS>',
  ' girl': '.', ' boy': '.',
};
export const CASTLE_ROW = { tokens: [' in', ' by', '.'], logits: [3, 2.5, 1] };
export function nextRow(tokens) {
  const last = tokens.at(-1);
  if (last === ' castle') return CASTLE_ROW;
  return { tokens: [FOLLOW[last] || '<EOS>'], logits: [3] };
}
export const END_TOKENS = ['<EOS>'];

export function mulberry32(seed) {
  let a = (seed + 0x6d2b79f5) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function softmax(logits, t = 1) {
  if (t <= 0) {
    const i = logits.indexOf(Math.max(...logits));
    return logits.map((_, j) => +(i === j));
  }
  const a = logits.map((x) => x / t), m = Math.max(...a);
  const e = a.map((x) => Math.exp(x - m)), sum = e.reduce((x, y) => x + y, 0);
  return e.map((x) => x / sum);
}

// Indices kept by top-k (k = 0 disables it) then top-p, in descending order.
export function filterKept(logits, probs, k = 0, p = 1) {
  let ids = logits.map((_, i) => i).sort((a, b) => probs[b] - probs[a] || a - b);
  if (k > 0) ids = ids.slice(0, k);
  const total = ids.reduce((s, i) => s + probs[i], 0);
  let mass = 0;
  const out = [];
  for (const i of ids) {
    out.push(i);
    mass += probs[i] / total;
    if (mass + 1e-12 >= p) break;
  }
  return out;
}

export function distribution(logits, t = 1, k = 0, p = 1) {
  const probs = softmax(logits, t), kept = filterKept(logits, probs, k, p);
  const mass = kept.reduce((s, i) => s + probs[i], 0);
  return { probs, kept, mass, final: kept.map((i) => probs[i] / mass) };
}

// Inverse CDF over the kept, renormalised tokens. Half-open intervals: a draw
// on a boundary belongs to the next segment.
export function sample(logits, t = 1, k = 0, p = 1, u = 0) {
  const { kept, final } = distribution(logits, t, k, p);
  let c = 0;
  for (let i = 0; i < kept.length; i++) {
    c += final[i];
    if (u < c) return kept[i];
  }
  return kept.at(-1);
}

export function entropyBits(ps) {
  return -ps.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
}

const E = EXAMPLE;
export const WORK = {
  probs: softmax(E.logits, E.T),
  hot: softmax(E.logits, E.hotT),
  topk: distribution(E.logits, E.T, E.k, 1),
  nucleus: distribution(E.logits, E.T, E.k, E.p),
};
export const ANSWERS = {
  softmax: WORK.probs[0],
  temperature: WORK.hot[0],
  topk: WORK.topk.final[0],
  nucleus: WORK.nucleus.kept.length,
  draw: sample(E.logits, E.T, E.k, E.p, E.u),
  entropy: entropyBits(WORK.probs),
};

// The reader's GenerationConfig for the loop. top_k and top_p carry over from
// the build; temperature 0 means greedy decoding.
export const DEFAULTS = { temperature: 0, top_k: 3, top_p: 0.9, repetition_penalty: 1, max_tokens: 20, stop: [], seed: 7 };

// CTRL-style penalty, as in Hugging Face: divide a seen token's positive logit,
// multiply a negative one.
export function penalise(x, seen, rp) {
  if (!seen || rp <= 1) return x;
  return x < 0 ? x * rp : x / rp;
}

// One seeded run. Each step records its row, the penalised logits, the draw u
// and the chosen token so the page can show any position.
export function generate(cfg = {}) {
  const c = { ...DEFAULTS, ...cfg }, rand = mulberry32(c.seed), tokens = [], steps = [];
  let reason = 'max_tokens';
  for (let n = 0; n < c.max_tokens; n++) {
    const row = n === 0 ? PROMPTS.story : nextRow(tokens);
    const logits = row.logits.map((v, i) => penalise(v, [...PROMPT_CONTEXT, ...tokens].includes(row.tokens[i]), c.repetition_penalty));
    const u = c.temperature <= 0 ? 0 : rand();
    const i = sample(logits, c.temperature, c.top_k, c.top_p, u), token = row.tokens[i];
    steps.push({ n, row, logits, u, token });
    if (END_TOKENS.includes(token)) { reason = 'EOS'; break; }
    tokens.push(token);
    if (c.stop.some((s) => tokens.join('').includes(s))) { reason = 'stop string'; break; }
  }
  const grams = tokens.slice(0, -2).map((_, i) => tokens.slice(i, i + 3).join('|'));
  return {
    config: c, tokens, steps, reason,
    text: PROMPTS.story.text + tokens.join(''),
    repeated3: new Set(grams).size !== grams.length,
  };
}

export const LOOP_OPTIONS = {
  temperature: [0, 1, 1.5],
  top_p: [0.9, 1],
  repetition_penalty: [1, 1.5, 2],
};
export const loopSolved = (r) => !r.repeated3 && r.reason === 'EOS';

export const MISSIONS = [
  { id: 'softmax', check: (v) => Math.abs(v - ANSWERS.softmax) < 0.005 },
  { id: 'temperature', check: (v) => Math.abs(v - ANSWERS.temperature) < 0.005 },
  { id: 'topk', check: (v) => Math.abs(v - ANSWERS.topk) < 0.005 },
  { id: 'nucleus', check: (v) => v === ANSWERS.nucleus },
  { id: 'draw', check: (v) => v === NAMES[ANSWERS.draw] },
  { id: 'loop', check: (c) => loopSolved(generate(c)) },
  { id: 'python', check: (v) => !!v },
  { id: 'stop', check: (v) => v === 'eos' },
  { id: 'entropy', check: (v) => Math.abs(v - ANSWERS.entropy) < 0.01 },
];
