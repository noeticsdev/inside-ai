// Inside embeddings: meaning as direction. Pure and deterministic: no DOM, no clock.
//
// A tiny library of 12 sentences, each with a HAND-SET 6-dimensional vector over
// named axes. The copy says so honestly. Real models learn thousands of dimensions;
// here the arithmetic (cosine, dot product, keyword overlap) is the real thing.

export const AXES = ["animal", "food", "tech", "money", "place", "feeling"];

// Fixed, honest 6D -> 2D projection used ONLY for the drawing. The scores use all 6.
export const PROJ = [
  [0.8, -0.3, 0.5, -0.2, 0.4, 0.1],
  [0.2, 0.4, -0.6, 0.3, 0.7, -0.5],
];

export function project2(v) {
  return [
    v[0] * PROJ[0][0] + v[1] * PROJ[0][1] + v[2] * PROJ[0][2] + v[3] * PROJ[0][3] + v[4] * PROJ[0][4] + v[5] * PROJ[0][5],
    v[0] * PROJ[1][0] + v[1] * PROJ[1][1] + v[2] * PROJ[1][2] + v[3] * PROJ[1][3] + v[4] * PROJ[1][4] + v[5] * PROJ[1][5],
  ];
}

export const DOCS = [
  { id: "pizza", text: "pizza oven cheese hot", v: [0.05, 0.95, 0.05, 0.1, 0.2, 0.3] },
  { id: "bread", text: "fresh bread bakery morning", v: [0.0, 0.9, 0.0, 0.15, 0.35, 0.25] },
  { id: "laptop", text: "laptop compiles code night", v: [0.0, 0.05, 0.95, 0.1, 0.1, 0.0] },
  { id: "encyclopedia", text: "encyclopedia lists every topic fact archive", v: [1.3, 1.3, 1.3, 1.3, 1.3, 1.3] },
  { id: "bank", text: "bank approves loan house", v: [0.0, 0.05, 0.05, 0.95, 0.5, 0.1] },
  { id: "stocks", text: "stocks climb market rally", v: [0.0, 0.0, 0.1, 0.9, 0.3, 0.4] },
  { id: "puppy", text: "puppy chases ball park", v: [0.9, 0.1, 0.0, 0.0, 0.5, 0.4] },
  { id: "kitten", text: "kitten naps sunny rug", v: [0.88, 0.05, 0.0, 0.0, 0.4, 0.5] },
  { id: "dog", text: "young dog runs meadow", v: [0.85, 0.05, 0.0, 0.0, 0.55, 0.35] },
  { id: "server", text: "server hums datacenter cold", v: [0.0, 0.0, 0.9, 0.2, 0.4, 0.0] },
  { id: "beach", text: "beach sunset calm waves", v: [0.05, 0.1, 0.0, 0.0, 0.85, 0.8] },
  { id: "mountain", text: "mountain trail quiet dawn", v: [0.1, 0.0, 0.0, 0.0, 0.8, 0.6] },
];

export const QUERIES = {
  puppy: { text: "puppy", v: [0.88, 0.05, 0.0, 0.0, 0.55, 0.35], right: "dog" },
  trail: { text: "meadow trail walk", v: [0.4, 0.0, 0.0, 0.0, 0.8, 0.5], right: "dog" },
  server: { text: "midnight server hum", v: [0.0, 0.0, 0.92, 0.15, 0.35, 0.05], right: "server" },
  bread: { text: "warm bread cheese", v: [0.02, 0.92, 0.02, 0.12, 0.28, 0.28], right: "bread" },
  beach: { text: "quiet calm shore", v: [0.05, 0.05, 0.0, 0.0, 0.82, 0.78], right: "beach" },
  loan: { text: "house loan bank", v: [0.0, 0.05, 0.05, 0.93, 0.48, 0.1], right: "bank" },
};

export const METHODS = ["cosine", "dot", "keyword"];

export const STOPWORDS = new Set(
  "a,an,the,and,or,of,to,in,on,at,for,with,every".split(","),
);

export function keywords(text) {
  return text.toLowerCase().split(/[^a-z]+/).filter((w) => w && !STOPWORDS.has(w));
}

export function keywordScore(a, b) {
  const sa = new Set(keywords(a));
  let n = 0;
  for (const w of new Set(keywords(b))) if (sa.has(w)) n += 1;
  return n;
}

export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const norm = (a) => Math.sqrt(dot(a, a));
export function cosine(a, b) {
  const n = norm(a) * norm(b);
  return n === 0 ? 0 : dot(a, b) / n;
}

const r4 = (x) => Math.round(x * 10000) / 10000;
const r1 = (x) => Math.round(x * 10) / 10;

export const DEFAULTS = { query: "puppy", method: "cosine", k: 3, normalise: false, mixA: 0, mixT: 0 };

export function configOf(input = {}) {
  const q = input.query;
  const method = METHODS.includes(input.method) ? input.method : DEFAULTS.method;
  let k = Number.parseInt(input.k, 10);
  if (!Number.isFinite(k)) k = DEFAULTS.k;
  k = Math.max(1, Math.min(5, k));
  const clampMix = (x) => {
    const n = Number.parseInt(x, 10);
    return Number.isFinite(n) ? Math.max(-5, Math.min(5, n)) : 0;
  };
  return {
    query: Object.hasOwn(QUERIES, q) ? q : DEFAULTS.query,
    method,
    k,
    normalise: typeof input.normalise === "boolean" ? input.normalise : DEFAULTS.normalise,
    mixA: clampMix(input.mixA),
    mixT: clampMix(input.mixT),
  };
}

// Query vector after the mixer: each slider step adds 0.1 on its axis, floored at 0.
export function queryVector(config) {
  const base = QUERIES[config.query].v.slice();
  base[0] = Math.max(0, base[0] + config.mixA * 0.1);
  base[2] = Math.max(0, base[2] + config.mixT * 0.1);
  return base;
}

export function simulate(input = {}) {
  const config = configOf(input);
  const q = queryVector(config);
  const qn = norm(q);
  const qText = QUERIES[config.query].text;
  const right = QUERIES[config.query].right;
  const events = [];
  let clock = 0;
  const push = (type, station, cost, fields) => {
    clock += cost;
    events.push({ index: events.length, type, station, cost, clock, ...fields });
  };

  push("intake", "query", 5, {
    query: config.query, queryText: qText, mixA: config.mixA, mixT: config.mixT,
    trace: `query card "${qText}" drops onto the pivot`,
  });

  const scored = DOCS.map((d, i) => {
    const cos = cosine(q, d.v);
    const raw = dot(q, d.v);
    const score = config.method === "keyword" ? keywordScore(qText, d.text)
      : config.method === "dot" ? (config.normalise ? cosine(q, d.v) : raw)
      : cos;
    const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    return { i, id: d.id, text: d.text, cos: r4(cos), raw: r4(raw), kw: keywordScore(qText, d.text), angle: r1(angle), score: typeof score === "number" && config.method !== "keyword" ? r4(score) : score };
  });

  for (const s of scored) {
    push("score", "ring", 5, {
      doc: s.id, text: s.text, cos: s.cos, raw: s.raw, kw: s.kw, angle: s.angle,
      trace: `"${s.text}": cosine ${s.cos.toFixed(4)}, dot ${s.raw.toFixed(4)}, keywords ${s.kw}, angle ${s.angle.toFixed(1)}°`,
    });
  }

  const ranked = scored.slice().sort((a, b) => b.score - a.score || a.i - b.i);
  const rightRank = ranked.findIndex((s) => s.id === right) + 1;
  const top = ranked[0];
  push("rank", "angle", 8, {
    method: config.method, normalise: config.normalise,
    order: ranked.map((s) => s.id), top: top.id, topScore: top.score, angle: top.angle, rightRank,
    trace: `${config.method} ranks "${top.text}" first at ${top.angle.toFixed(1)}°; the right card is #${rightRank}`,
  });

  const topK = ranked.slice(0, config.k);
  topK.forEach((s, r) => {
    push("slot", "rack", 4, {
      rank: r + 1, doc: s.id, text: s.text, score: s.score,
      trace: `rack lifts "${s.text}" into slot ${r + 1}`,
    });
  });

  const shared = keywordScore(qText, top.text);
  return {
    config, events,
    totals: {
      steps: events.length, top: top.id, topText: top.text, topScore: top.score,
      angle: top.angle, shared, right: right, rightRank, k: config.k, method: config.method, clock,
    },
  };
}

export function encode(config) {
  const c = configOf(config);
  const params = new URLSearchParams();
  if (c.query !== DEFAULTS.query) params.set("query", c.query);
  if (c.method !== DEFAULTS.method) params.set("method", c.method);
  if (c.k !== DEFAULTS.k) params.set("k", String(c.k));
  if (c.normalise !== DEFAULTS.normalise) params.set("norm", "on");
  if (c.mixA !== 0) params.set("mixA", String(c.mixA));
  if (c.mixT !== 0) params.set("mixT", String(c.mixT));
  return params.toString();
}

export function decode(search) {
  const params = new URLSearchParams(search);
  return configOf({
    query: params.get("query"),
    method: params.get("method"),
    k: params.get("k"),
    normalise: params.get("norm") === "on",
    mixA: params.get("mixA"),
    mixT: params.get("mixT"),
  });
}

export const MISSIONS = [
  {
    id: "no-shared-words",
    title: "No shared words",
    goal: "Top the cosine ranking with a card that shares zero keywords with the query.",
    hint: "Query “puppy”, cosine: the winner is “young dog runs meadow”.",
    try: { query: "puppy", method: "cosine", k: 3, normalise: false, mixA: 0, mixT: 0 },
    check: (run) => run.config.method === "cosine" && run.totals.top === run.totals.right && run.totals.shared === 0,
  },
  {
    id: "break-keyword",
    title: "Break keyword search",
    goal: "With keyword search, push the right card below rank 3.",
    hint: "Same query, keyword method: “puppy” matches one card and buries the right one.",
    try: { query: "puppy", method: "keyword", k: 3, normalise: false, mixA: 0, mixT: 0 },
    check: (run) => run.config.method === "keyword" && run.totals.rightRank > 3,
  },
  {
    id: "long-vector-bully",
    title: "Tame the long-vector bully",
    goal: "With dot product, switch normalise on so the right card beats the encyclopedia.",
    hint: "Dot + normalise off lets the giant encyclopedia card win. Flip normalise on.",
    try: { query: "puppy", method: "dot", k: 1, normalise: true, mixA: 0, mixT: 0 },
    check: (run) => run.config.method === "dot" && run.config.normalise === true && run.totals.top === run.totals.right,
  },
  {
    id: "tune-k",
    title: "Widen the rack",
    goal: "Query “meadow trail walk”: set k just big enough to catch the right card.",
    hint: "Cosine puts the right card at #3. Raise k until the rack holds it.",
    try: { query: "trail", method: "cosine", k: 3, normalise: false, mixA: 0, mixT: 0 },
    check: (run) => run.config.query === "trail" && run.config.method === "cosine" && run.totals.rightRank === 3 && run.config.k === 3,
  },
];
