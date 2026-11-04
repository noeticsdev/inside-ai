// Inside a tokenizer: real byte-pair encoding (BPE), trained live on a tiny corpus.
//
// Training: start from single characters (code points; production GPT-2 starts
// from UTF-8 bytes, same idea one level down). Count adjacent pairs inside
// words only: text is pre-split on spaces (GPT-2 pre-splits too, but keeps the leading space on the word), so no merge ever
// crosses a word boundary. Repeat: fuse the most frequent pair everywhere,
// ties broken lexicographically (deterministic). Encoding applies the learned
// merges in rank order. Characters never seen in training stay as singletons.

export const CORPUS = [
  "the little engine runs on the long track. the engine sings while the wheels turn round and round",
  "learning takes time. reading and speaking and listening need many slow mornings in the station house",
  "the station master handed paper tickets to the waiting passengers under the shining lamps",
  "a token is a small part of a word. small parts join to make longer words that hold more meaning",
  "the more the engine learns the more the passengers cheer and the louder the wheels sound",
];

export const MAX_MERGES = 40;

export const PRESETS = {
  english: "the engine learns more and the wheels sound louder",
  code: "def fib(n): return n if n < 2 else fib(n-1) + fib(n-2)",
  hindi: "यह छोटा इंजन बहुत तेज़ चलता है",
  rare: "antidisestablishmentarianism",
};

export const PRESET_LABELS = {
  english: "English (close to training)",
  code: "Python line",
  hindi: "Hindi sentence",
  rare: "Rare long word",
};

export const DEFAULTS = { merges: 10, preset: "english" };

const charsOf = (word) => Array.from(word);
const wordsOf = (text) => text.split(" ").filter((w) => w.length > 0);

function countPairs(words) {
  const counts = new Map();
  for (const pieces of words) {
    for (let i = 0; i + 1 < pieces.length; i++) {
      const key = pieces[i] + "\u0000" + pieces[i + 1];
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

function pickBest(counts) {
  let best = null;
  let bestCount = 0;
  for (const [key, n] of counts) {
    if (best === null || n > bestCount || (n === bestCount && key < best)) {
      best = key;
      bestCount = n;
    }
  }
  return bestCount >= 2 ? best : null;
}

function fuseOnce(pieces, a, b) {
  const into = a + b;
  const out = [];
  for (let i = 0; i < pieces.length; i++) {
    if (i + 1 < pieces.length && pieces[i] === a && pieces[i + 1] === b) {
      out.push(into);
      i++;
    } else {
      out.push(pieces[i]);
    }
  }
  return out;
}

// Train once at module load: deterministic, no randomness.
function train() {
  let words = [];
  for (const para of CORPUS) for (const w of wordsOf(para)) words.push(charsOf(w));
  const base = new Set([" "]);
  for (const w of words) for (const c of w) base.add(c);
  const merges = [];
  for (let n = 0; n < MAX_MERGES; n++) {
    const key = pickBest(countPairs(words));
    if (!key) break;
    const [a, b] = key.split("\u0000");
    const into = a + b;
    words = words.map((pieces) => fuseOnce(pieces, a, b));
    merges.push({ rank: merges.length, a, b, into });
  }
  return { baseSize: base.size, merges };
}

const TRAINED = train();
export const MERGES = TRAINED.merges;
export const BASE_VOCAB_SIZE = TRAINED.baseSize;

export function mergesUpTo(n) {
  return MERGES.slice(0, Math.max(0, Math.min(MAX_MERGES, n)));
}

export function encodeWord(word, merges) {
  let pieces = charsOf(word);
  for (const m of merges) pieces = fuseOnce(pieces, m.a, m.b);
  return pieces;
}

export function encodeText(text, merges) {
  const words = wordsOf(text);
  const tokens = [];
  words.forEach((w, i) => {
    for (const t of encodeWord(w, merges)) tokens.push(t);
    if (i + 1 < words.length) tokens.push(" ");
  });
  return tokens;
}

export function configOf(input = {}) {
  const merges = Number.isInteger(input.merges)
    ? Math.max(0, Math.min(MAX_MERGES, input.merges))
    : typeof input.merges === "number" && Number.isFinite(input.merges)
      ? Math.max(0, Math.min(MAX_MERGES, Math.floor(input.merges)))
      : DEFAULTS.merges;
  const preset = Object.hasOwn(PRESETS, input.preset) ? input.preset : DEFAULTS.preset;
  return { merges, preset };
}

export function simulate(input = {}) {
  const config = configOf(input);
  const text = PRESETS[config.preset];
  const chars = Array.from(text).length;
  const merges = mergesUpTo(config.merges);
  const events = [];
  let tokens = encodeText(text, []);

  const push = (type, station, fields) => {
    events.push({ index: events.length, type, station, ...fields });
  };

  push("intake", "stick", {
    tokens: tokens.slice(),
    tokenCount: tokens.length,
    vocabSize: BASE_VOCAB_SIZE,
    lastMerge: null,
    trace: `set "${text}" on the stick: ${tokens.length} single sorts`,
  });

  let current = tokens.slice();
  merges.forEach((m, i) => {
    const words = [];
    let w = [];
    for (const t of current) {
      if (t === " ") {
        words.push(w);
        w = [];
      } else w.push(t);
    }
    words.push(w);
    const fused = words.map((pieces) => fuseOnce(pieces, m.a, m.b));
    current = [];
    fused.forEach((pieces, wi) => {
      for (const t of pieces) current.push(t);
      if (wi + 1 < fused.length) current.push(" ");
    });
    // Index of the first fused piece in the new row (press target).
    let at = 0;
    {
      let count = 0;
      let found = -1;
      for (const t of current) {
        if (t === m.into && found < 0) found = count;
        count++;
      }
      at = found < 0 ? 0 : found;
    }
    push("merge", "press", {
      merge: { ...m },
      at,
      tokens: current.slice(),
      tokenCount: current.length,
      vocabSize: BASE_VOCAB_SIZE + i + 1,
      lastMerge: m,
      trace: `merge ${i + 1}: "${m.a}" + "${m.b}" → "${m.into}" (${current.length} sorts left)`,
    });
  });

  const tokenCount = current.length;
  const cpt = tokenCount ? chars / tokenCount : 0;
  push("exit", "dial", {
    tokens: current.slice(),
    tokenCount,
    vocabSize: BASE_VOCAB_SIZE + merges.length,
    lastMerge: merges.length ? merges[merges.length - 1] : null,
    trace: `counted: ${tokenCount} tokens for ${chars} characters (${cpt.toFixed(2)} chars each)`,
  });

  return {
    config,
    events,
    totals: {
      steps: events.length,
      text,
      chars,
      tokens: tokenCount,
      cpt: Math.round(cpt * 100) / 100,
      vocabSize: BASE_VOCAB_SIZE + merges.length,
      mergesApplied: merges.length,
      lastMerge: merges.length ? { ...merges[merges.length - 1] } : null,
      tokenList: current.slice(),
    },
  };
}

export function encode(config) {
  const c = configOf(config);
  const params = new URLSearchParams();
  if (c.merges !== DEFAULTS.merges) params.set("merges", String(c.merges));
  if (c.preset !== DEFAULTS.preset) params.set("preset", c.preset);
  return params.toString();
}

export function decode(search) {
  const params = new URLSearchParams(search);
  const raw = params.get("merges");
  const merges = raw !== null && raw !== "" && Number.isFinite(Number(raw)) ? Math.floor(Number(raw)) : DEFAULTS.merges;
  return configOf({ merges, preset: params.get("preset") });
}

// Mission thresholds are tuned from measured runs (see model.test.mjs).
export const SQUEEZE_TOKENS = 26;
export const SWEET_TOKENS = 26;
export const BREAK_CPT = 1.3;

export function fewestMergesFor(preset, target) {
  for (let n = 0; n <= MERGES.length; n++) {
    if (simulate({ preset, merges: n }).totals.tokens <= target) return n;
  }
  return -1;
}

export const SWEET_MERGES = fewestMergesFor("english", SWEET_TOKENS);

export const MISSIONS = [
  {
    id: "squeeze",
    title: "Squeeze the sentence",
    goal: `Run the English sentence with enough merges to reach ${SQUEEZE_TOKENS} tokens or fewer.`,
    hint: "Drag Merges up toward 36 and run. Each fusion shortens the row.",
    try: { merges: 36, preset: "english" },
    check: (run) => run.config.preset === "english" && run.totals.tokens <= SQUEEZE_TOKENS,
  },
  {
    id: "break-it",
    title: "Break it with Hindi",
    goal: "Switch to the Hindi sentence and watch pieces-per-character collapse toward one each.",
    hint: "Pick the Hindi preset and run. The bench never trained on these letters.",
    try: { merges: 30, preset: "hindi" },
    check: (run) => (run.config.preset === "hindi" || run.config.preset === "code") && run.totals.cpt < BREAK_CPT,
  },
  {
    id: "sweet-spot",
    title: "Find the sweet spot",
    goal: `Reach ${SWEET_TOKENS} English tokens with the fewest merges possible.`,
    hint: "Lower Merges step by step until the token count just starts to rise.",
    try: { merges: SWEET_MERGES, preset: "english" },
    check: (run) =>
      run.config.preset === "english" &&
      run.config.merges === SWEET_MERGES &&
      run.totals.tokens <= SWEET_TOKENS &&
      (SWEET_MERGES === 0 || simulate({ preset: "english", merges: SWEET_MERGES - 1 }).totals.tokens > SWEET_TOKENS),
  },
  {
    id: "boundary",
    title: "Spaces survive",
    goal: "Prove no merge ever fuses across a word boundary: every space stays its own sort.",
    hint: "Run English with many merges, then look for a token holding a space. There is none.",
    try: { merges: 30, preset: "english" },
    check: (run) =>
      run.config.merges >= 10 &&
      run.totals.tokenList.every((t) => t === " " || !t.includes(" ")) &&
      run.totals.tokenList.includes(" "),
  },
];
