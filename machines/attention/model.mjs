// Inside an attention head: scaled dot-product attention, softmax(QK^T/sqrt(d))·V.
// Pure and deterministic: no DOM, no clock, no Math.random.
// Hand-set Q, K, V vectors (d=4) for two heads, stated honestly in the copy:
// head A links the pronoun "it" to its noun "cat"; head B attends to the
// previous token. The arithmetic (scores, scaling, causal mask, softmax with
// temperature, weighted value mix) is real.

export const TOKENS = ["The", "cat", "sat", "on", "the", "mat", "because", "it", "was", "tired"];
export const D = 4;
export const SQRT_D = 2; // sqrt(4)

// Head A (coreference): Q["it"] matches K["cat"].
export const QA = [
  [0.5, 0.2, 0.0, 0.2],
  [2.4, 0.2, 0.0, 0.1],
  [0.2, 2.0, 0.2, 0.0],
  [0.1, 0.2, 1.8, 0.0],
  [0.5, 0.3, 0.1, 0.0],
  [1.6, 0.1, 0.0, 0.2],
  [0.0, 0.3, 0.4, 1.6],
  [3.0, 0.0, 0.0, 0.0],
  [0.0, 0.2, 1.6, 0.1],
  [1.0, 0.0, 0.2, 1.0],
];
export const KA = [
  [0.4, 0.2, 0.0, 0.2],
  [2.6, 0.1, 0.0, 0.2],
  [0.1, 1.8, 0.3, 0.0],
  [0.0, 0.2, 1.6, 0.1],
  [0.5, 0.3, 0.1, 0.0],
  [1.4, 0.1, 0.0, 0.3],
  [0.0, 0.4, 0.3, 1.4],
  [0.3, 0.1, 0.2, 0.1],
  [0.1, 0.2, 1.4, 0.2],
  [0.9, 0.0, 0.1, 0.9],
];

// Head B (positional): Q[i] matches K[i-1]. One-hot direction by (i-1)%4,
// key strength grows slightly with position so the nearest past key wins ties.
function oneHot(m) {
  const v = [0, 0, 0, 0];
  v[((m % 4) + 4) % 4] = 1;
  return v;
}
export const QB = TOKENS.map((_, i) => (i === 0 ? [0.2, 0.2, 0.2, 0.2] : oneHot(i - 1).map((x) => x * 2.2)));
export const KB = TOKENS.map((_, j) => oneHot(j).map((x) => x * 2.2 * (1 + 0.03 * j)));

export const V = [
  [0.2, 0.1, 0.0, 0.3],
  [0.9, 0.2, 0.1, 0.0],
  [0.1, 0.9, 0.2, 0.1],
  [0.0, 0.3, 0.9, 0.2],
  [0.2, 0.2, 0.1, 0.1],
  [0.8, 0.1, 0.2, 0.1],
  [0.1, 0.2, 0.3, 0.9],
  [0.3, 0.1, 0.1, 0.2],
  [0.0, 0.2, 0.8, 0.3],
  [0.5, 0.1, 0.4, 0.8],
];

export const HEADS = { A: { Q: QA, K: KA }, B: { Q: QB, K: KB } };

export const DEFAULTS = { focus: 2, head: "A", scale: true, causal: false, temp: 1 };

export function configOf(input = {}) {
  const focus = Number.isInteger(input.focus) && input.focus >= 0 && input.focus < TOKENS.length ? input.focus : DEFAULTS.focus;
  const head = input.head === "B" ? "B" : "A";
  const scale = typeof input.scale === "boolean" ? input.scale : DEFAULTS.scale;
  const causal = typeof input.causal === "boolean" ? input.causal : DEFAULTS.causal;
  let temp = typeof input.temp === "number" && Number.isFinite(input.temp) ? input.temp : DEFAULTS.temp;
  temp = Math.min(2, Math.max(0.2, Math.round(temp * 10) / 10));
  return { focus, head, scale, causal, temp };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const r4 = (x) => Math.round(x * 10000) / 10000;

export function simulate(input = {}) {
  const config = configOf(input);
  const { focus, head, scale, causal, temp } = config;
  const { Q, K } = HEADS[head];
  const q = Q[focus];
  const events = [];
  let clock = 0;

  const raws = K.map((k) => dot(q, k));
  const maxScore = Math.max(...raws.filter((_, j) => !(causal && j > focus)));
  const logits = raws.map((raw, j) => ({ j, masked: causal && j > focus, logit: raw / (scale ? SQRT_D : 1) / temp }));

  events.push({
    index: 0, type: "query", station: "query", cost: 1, clock: (clock += 1),
    focus, token: TOKENS[focus], head,
    trace: `query from "${TOKENS[focus]}" on head ${head}`,
  });

  for (const { j, masked, logit } of logits) {
    events.push({
      index: events.length, type: "score", station: "score", cost: 1, clock: (clock += 1),
      key: j, token: TOKENS[j], raw: r2(raws[j]), logit: masked ? null : r2(logit), masked,
      trace: masked
        ? `masked: "${TOKENS[focus]}" cannot see later token "${TOKENS[j]}"`
        : `score ${TOKENS[focus]}→${TOKENS[j]}: ${r2(raws[j]).toFixed(2)}${scale ? " / 2" : ""} / ${temp} = ${r2(logit).toFixed(2)}`,
    });
  }

  const exps = logits.map(({ masked, logit }) => (masked ? 0 : Math.exp(logit)));
  const denom = exps.reduce((a, b) => a + b, 0);
  const weights = exps.map((e) => e / denom);
  const entropyBits = -weights.reduce((a, w) => (w > 0 ? a + w * Math.log2(w) : a), 0);
  events.push({
    index: events.length, type: "weigh", station: "weigh", cost: 1, clock: (clock += 1),
    weights: weights.map(r4), entropy: r2(entropyBits),
    trace: `softmax over ${causal ? focus + 1 : TOKENS.length} open keys: entropy ${r2(entropyBits).toFixed(2)} bits`,
  });

  const output = [0, 1, 2, 3].map((k) => weights.reduce((a, w, j) => a + w * V[j][k], 0));
  events.push({
    index: events.length, type: "mix", station: "mix", cost: 1, clock: (clock += 1),
    output: output.map(r3),
    trace: `mixed values into [${output.map(r3).map((x) => x.toFixed(3)).join(", ")}]`,
  });

  let topIndex = 0;
  weights.forEach((w, j) => {
    if (w > weights[topIndex]) topIndex = j;
  });
  const totals = {
    topIndex,
    top: TOKENS[topIndex],
    topWeight: r3(weights[topIndex]),
    entropyBits: r2(entropyBits),
    sum: r3(weights.reduce((a, b) => a + b, 0)),
    maxScore: r2(maxScore),
    output: output.map(r3),
    weights: weights.map(r4),
  };
  events.push({
    index: events.length, type: "exit", station: "mix", cost: 1, clock: (clock += 1),
    trace: `output ready: top key "${TOKENS[topIndex]}" at ${r3(weights[topIndex]).toFixed(3)}`,
  });

  return { config, events, totals };
}

export function encode(config) {
  const c = configOf(config);
  const params = new URLSearchParams();
  if (c.focus !== DEFAULTS.focus) params.set("focus", String(c.focus));
  if (c.head !== DEFAULTS.head) params.set("head", c.head);
  if (c.scale !== DEFAULTS.scale) params.set("scale", "off");
  if (c.causal !== DEFAULTS.causal) params.set("causal", "on");
  if (c.temp !== DEFAULTS.temp) params.set("temp", String(c.temp));
  return params.toString();
}

export function decode(search) {
  const params = new URLSearchParams(search);
  const focus = Number.parseInt(params.get("focus") ?? "", 10);
  const head = params.get("head");
  const scale = params.get("scale");
  const causal = params.get("causal");
  const temp = params.get("temp") === null ? Number.NaN : Number(params.get("temp"));
  return configOf({
    focus: Number.isInteger(focus) ? focus : DEFAULTS.focus,
    head: head === "A" || head === "B" ? head : DEFAULTS.head,
    scale: scale === null ? DEFAULTS.scale : scale === "off" ? false : scale === "on" ? true : DEFAULTS.scale,
    causal: causal === null ? DEFAULTS.causal : causal === "on" ? true : causal === "off" ? false : DEFAULTS.causal,
    temp: Number.isFinite(temp) ? temp : DEFAULTS.temp,
  });
}

export const MISSIONS = [
  {
    id: "who-is-it",
    title: "Who is “it”?",
    goal: "Make the focus token “it” put more than half its weight on “cat”.",
    hint: "Focus the query “it” and run head A, the coreference head.",
    try: { focus: 7, head: "A", scale: true, causal: false, temp: 1 },
    check: (run) => run.config.focus === 7 && run.config.head === "A" && run.totals.weights[1] > 0.5,
  },
  {
    id: "saturate",
    title: "Saturate it",
    goal: "Push one weight above 0.95 and see why a saturated head barely learns.",
    hint: "Switch √d scaling off and drop the temperature: sharp scores, one winner.",
    try: { focus: 7, head: "A", scale: false, causal: false, temp: 0.5 },
    check: (run) => Math.max(...run.totals.weights) > 0.95,
  },
  {
    id: "no-peeking",
    title: "No peeking",
    goal: "Turn the causal mask on and show token 3 gives zero weight to later tokens.",
    hint: "Focus “on” (position 3), switch the mask on, and watch future threads cut.",
    try: { focus: 3, head: "A", scale: true, causal: true, temp: 1 },
    check: (run) => run.config.causal === true && run.config.focus === 3 && run.totals.weights.slice(4).every((w) => w === 0),
  },
  {
    id: "positional",
    title: "Find the positional head",
    goal: "Switch to head B and find a token whose top key is the token before it.",
    hint: "Head B listens backwards: focus “the” (position 4) with the mask on.",
    try: { focus: 4, head: "B", scale: true, causal: true, temp: 1 },
    check: (run) => run.config.head === "B" && run.totals.topIndex === run.config.focus - 1,
  },
];
