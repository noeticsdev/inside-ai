// Inside a RAG pipeline: chunk, embed (hashed bag-of-words), index, retrieve top-k,
// pack under a token budget, answer from a fixed script with a citation.
// Pure and deterministic: no DOM, no clock, no Math.random.

export const DIMS = 64;

// Six short company-handbook documents. Each carries one gold fact sentence,
// stored verbatim in GOLDS so the generator can only cite what it retrieved.
export const DOCS = [
  {
    id: "leave",
    title: "Leave policy",
    text: "Leave policy. Staff get 25 vacation days per year. Book leave in the calendar app. Managers approve within three days.",
  },
  {
    id: "expenses",
    title: "Expenses guide",
    text: "Expenses guide. Dinner claims up to 60 dollars per person need a receipt. Lunch claims need no receipt. Finance pays Fridays.",
  },
  {
    id: "laptop",
    title: "Laptop help",
    text: "Laptop help. Request a new laptop through the IT portal after two years. Back up files first. Chargers wait at reception.",
  },
  {
    id: "security",
    title: "Security rules",
    text: "Security rules. Forward suspicious email to security at company dot example. Lock screens. Report lost badges fast.",
  },
  {
    id: "travel",
    title: "Travel rules",
    text: "Travel rules. Book trains at least 14 days ahead for a discount. Hotels need approval. Keep every boarding pass.",
  },
  {
    id: "hybrid",
    title: "Hybrid work",
    text: "Hybrid work. Work from home up to two days each week. Team days are Tuesday and Thursday. Core hours are ten to four.",
  },
];

export const GOLDS = {
  leave: ["Staff get 25 vacation days per year."],
  expenses: ["Dinner claims up to 60 dollars per person need a receipt."],
  laptop: ["Request a new laptop through the IT portal after two years."],
  security: ["Forward suspicious email to security at company dot example."],
  travel: ["Book trains at least 14 days ahead for a discount."],
  hybrid: ["Work from home up to two days each week."],
};

export const QUESTIONS = {
  leave: {
    label: "Leave days?",
    text: "How many vacation days do staff get each year?",
    gold: ["Staff get 25 vacation days per year."],
  },
  expenses: {
    label: "Dinner receipts?",
    text: "What dinner claims need a receipt?",
    gold: ["Dinner claims up to 60 dollars per person need a receipt."],
  },
  laptop: {
    label: "New laptop?",
    text: "When can I get a new laptop?",
    gold: ["Request a new laptop through the IT portal after two years."],
  },
  twopart: {
    label: "Leave + dinner (two-part)",
    text: "How many vacation days do staff get, and what dinner claims need a receipt?",
    gold: ["Staff get 25 vacation days per year.", "Dinner claims up to 60 dollars per person need a receipt."],
  },
  unanswerable: {
    label: "Twins parental pay (unanswerable)",
    text: "What pay do parents of twins get?",
    gold: [],
  },
};

// Plausible wrong answers the fixed script prints with the guardrail off.
// They are flagged unsupported and carry no citation.
export const WRONG = {
  leave: "Staff get 20 vacation days per year.",
  expenses: "Dinner claims of any size need no receipt.",
  laptop: "Everyone gets a new laptop every year.",
  twopart: "Staff get 20 vacation days and dinner needs no receipt.",
  unanswerable: "Parents of twins get twelve weeks of paid leave.",
};

const STOP = new Set(
  "a,an,the,and,or,of,to,in,on,for,with,is,are,was,were,be,do,does,did,you,your,it,its,this,that,these,those,how,what,when,where,which,who,can,could,should,would,i,me,my,we,our,they,their,at,by,from,as,so,if,then,than,not,no,any,never,there,here,have,has,had,will,shall,may,might,must,also,into,out,over,under,again,once,each,other,some,such,only,own,same,too,very,just,about,above,after,before,between,both,during,through,while,within".split(","),
);

function hashWord(word) {
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % DIMS;
}

export function contentTokens(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

// Deterministic hashed bag-of-words vector, said honestly in the copy:
// 64 dims, fixed FNV-1a hash, stopwords removed. Real models learn thousands
// of dims; this one counts words into buckets.
export function embed(text) {
  const vec = new Array(DIMS).fill(0);
  for (const w of contentTokens(text)) vec[hashWord(w)] += 1;
  return vec;
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < DIMS; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export const wordsOf = (text) => text.split(/\s+/).filter(Boolean);
// Token estimate: words x 1.3, rounded. Said honestly on the page.
export const tokensOf = (words) => Math.round(words * 1.3);

// Fixed instruction line packed with every prompt.
export const PROMPT_WORDS = 14;
export const PROMPT_LINE = "Answer only from the cards. Quote the card. Say you do not know otherwise.";

export const COST = { chunk: 4, embed: 2, index: 1, retrieve: 6, pack: 3, answer: 12, done: 0 };

export const DEFAULTS = { question: "leave", chunkSize: 24, overlap: 6, k: 1, budget: 160, guardrail: true };

export function configOf(input = {}) {
  const chunkSize = Number.isInteger(input.chunkSize) ? Math.min(40, Math.max(6, input.chunkSize)) : DEFAULTS.chunkSize;
  const overlap = Number.isInteger(input.overlap)
    ? Math.min(12, Math.max(0, Math.min(input.overlap, chunkSize - 1)))
    : Math.min(DEFAULTS.overlap, chunkSize - 1);
  return {
    question: Object.hasOwn(QUESTIONS, input.question) ? input.question : DEFAULTS.question,
    chunkSize,
    overlap,
    k: Number.isInteger(input.k) ? Math.min(4, Math.max(1, input.k)) : DEFAULTS.k,
    budget: Number.isInteger(input.budget) ? Math.min(320, Math.max(40, input.budget)) : DEFAULTS.budget,
    guardrail: typeof input.guardrail === "boolean" ? input.guardrail : DEFAULTS.guardrail,
  };
}

// Chunk one document by words. Overlap re-uses the tail of the previous card.
export function chunkDoc(doc, chunkSize, overlap) {
  const words = wordsOf(doc.text);
  const out = [];
  const step = Math.max(1, chunkSize - overlap);
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + chunkSize);
    if (!slice.length) break;
    out.push({ doc: doc.id, title: doc.title, text: slice.join(" "), words: slice.length });
    if (start + chunkSize >= words.length) break;
  }
  return out;
}

export function simulate(input = {}) {
  const config = configOf(input);
  const q = QUESTIONS[config.question];
  const events = [];
  let clock = 0;
  const push = (type, station, cost, fields) => {
    clock += cost;
    events.push({ index: events.length, type, station, cost, clock, ...fields });
  };

  // 1. Cut every document into cards.
  const chunks = [];
  for (const doc of DOCS) {
    const cards = chunkDoc(doc, config.chunkSize, config.overlap);
    for (const card of cards) {
      const id = chunks.length;
      chunks.push({ id, ...card, vec: embed(card.text) });
      const preview = card.text.split(" ").slice(0, 5).join(" ");
      push("chunk", "cutter", COST.chunk, {
        card: id,
        words: card.words,
        trace: `cut card ${id + 1} (${card.words} words): “${preview}…”`,
      });
    }
  }

  // 2. Stamp every card with its vector.
  push("embed", "press", COST.embed, {
    cards: chunks.length,
    dims: DIMS,
    trace: `stamped ${chunks.length} cards with a ${DIMS}-number vector each`,
  });

  // 3. File the cards in the drawers.
  push("index", "index", COST.index, {
    cards: chunks.length,
    trace: `filed ${chunks.length} cards in the drawers`,
  });

  // 4. Retrieve the top-k cards by cosine similarity.
  const qvec = embed(q.text);
  const scored = chunks
    .map((c) => ({ id: c.id, score: cosine(qvec, c.vec) }))
    .sort((a, b) => b.score - a.score || a.id - b.id);
  const top = scored.slice(0, Math.min(config.k, scored.length));
  const topScore = top.length ? top[0].score : 0;
  for (const [rank, hit] of top.entries()) {
    const card = chunks[hit.id];
    push("retrieve", "arm", COST.retrieve, {
      card: hit.id,
      rank: rank + 1,
      score: Math.round(hit.score * 1000) / 1000,
      trace: `pulled card ${hit.id + 1} (score ${hit.score.toFixed(3)}): “${card.text.split(" ").slice(0, 6).join(" ")}…”`,
    });
  }

  // 5. Pack the pulled cards under the token budget, best score first.
  const qTokens = tokensOf(wordsOf(q.text).length);
  const overhead = tokensOf(PROMPT_WORDS) + qTokens;
  let packed = [];
  let used = overhead;
  let overflow = 0;
  for (const hit of top) {
    const card = chunks[hit.id];
    const t = tokensOf(card.words);
    if (used + t <= config.budget) {
      packed.push({ id: hit.id, tokens: t, score: Math.round(hit.score * 1000) / 1000 });
      used += t;
    } else {
      overflow += 1;
    }
  }
  const packedTexts = packed.map((p) => chunks[p.id].text);
  push("pack", "tray", COST.pack, {
    retrieved: top.length,
    kept: packed.length,
    dropped: overflow,
    tokens: used,
    budget: config.budget,
    trace:
      packed.length === top.length
        ? `packed ${packed.length} of ${top.length} cards: ${used} of ${config.budget} tokens`
        : `budget full: packed ${packed.length} of ${top.length} cards, ${overflow} fell off (${used} of ${config.budget} tokens)`,
  });

  // 6. Answer from the fixed script. Grounded only when every gold fact
  // sits whole inside the packed cards.
  const missing = q.gold.filter((fact) => !packedTexts.some((t) => t.includes(fact)));
  const grounded = q.gold.length > 0 && missing.length === 0;
  let status;
  let answer;
  let citation;
  if (grounded) {
    status = "grounded";
    answer = q.gold.join(" ");
    const titles = [];
    for (const fact of q.gold) {
      const card = packed.map((p) => chunks[p.id]).find((c) => c.text.includes(fact));
      if (card && !titles.includes(card.title)) titles.push(card.title);
    }
    citation = titles.join(" + ");
  } else if (config.guardrail) {
    status = "not-found";
    answer = "I don't know.";
    citation = "—";
  } else {
    status = "unsupported";
    answer = WRONG[config.question];
    citation = "none — unsupported";
  }
  push("answer", "printer", COST.answer, {
    status,
    answer,
    citation,
    trace:
      status === "grounded"
        ? `printed the answer, cited: ${citation}`
        : status === "not-found"
          ? "no card holds the answer — printed “I don't know”"
          : "guardrail off — printed a guess with no citation",
  });

  push("done", "printer", COST.done, {
    status,
    trace: status === "grounded" ? "run complete: grounded answer" : `run complete: ${status}`,
  });

  return {
    config,
    events,
    totals: {
      chunks: chunks.length,
      topScore: Math.round(topScore * 1000) / 1000,
      tokensPacked: used,
      budget: config.budget,
      kept: packed.length,
      retrieved: top.length,
      dropped: overflow,
      status,
      citation,
      answer,
    },
  };
}

export function encode(config) {
  const c = configOf(config);
  const params = new URLSearchParams();
  if (c.question !== DEFAULTS.question) params.set("q", c.question);
  if (c.chunkSize !== DEFAULTS.chunkSize) params.set("cs", String(c.chunkSize));
  if (c.overlap !== DEFAULTS.overlap) params.set("ov", String(c.overlap));
  if (c.k !== DEFAULTS.k) params.set("k", String(c.k));
  if (c.budget !== DEFAULTS.budget) params.set("b", String(c.budget));
  if (c.guardrail !== DEFAULTS.guardrail) params.set("g", "off");
  return params.toString();
}

export function decode(search) {
  const params = new URLSearchParams(search);
  const int = (name) => {
    const v = params.get(name);
    return v !== null && /^-?\d+$/.test(v) ? Number(v) : undefined;
  };
  return configOf({
    question: params.get("q") ?? undefined,
    chunkSize: int("cs"),
    overlap: int("ov"),
    k: int("k"),
    budget: int("b"),
    guardrail: params.get("g") === "off" ? false : params.get("g") === null ? undefined : true,
  });
}

export const MISSIONS = [
  {
    id: "grounded",
    title: "A grounded answer",
    goal: "Ask the leave question and get a cited, correct answer.",
    hint: "Run with the leave question and whole cards: chunk size 24, overlap 6.",
    try: { question: "leave", chunkSize: 24, overlap: 6, k: 1, budget: 160, guardrail: true },
    check: (run) => run.config.question === "leave" && run.totals.status === "grounded",
  },
  {
    id: "split-fact",
    title: "Break it: cards too small",
    goal: "Shrink the chunk size until the leave fact splits and the answer is lost.",
    hint: "The leave fact needs 7 words in one card. Try chunk size 6.",
    try: { question: "leave", chunkSize: 6, overlap: 0, k: 1, budget: 160, guardrail: true },
    check: (run) => run.config.question === "leave" && run.totals.status !== "grounded",
  },
  {
    id: "two-facts",
    title: "Tune it: both halves",
    goal: "Answer the two-part question: pull both facts and stay inside the budget.",
    hint: "One card holds leave, another holds dinner. k = 1 can only pull one.",
    try: { question: "twopart", chunkSize: 24, overlap: 6, k: 2, budget: 160, guardrail: true },
    check: (run) =>
      run.config.question === "twopart" && run.totals.status === "grounded" && run.totals.tokensPacked <= run.totals.budget,
  },
  {
    id: "honest-idk",
    title: "Say I don't know",
    goal: "Ask the unanswerable twins question with the guardrail on.",
    hint: "No card mentions twins. The honest machine admits it.",
    try: { question: "unanswerable", chunkSize: 24, overlap: 6, k: 2, budget: 160, guardrail: true },
    check: (run) => run.config.question === "unanswerable" && run.config.guardrail && run.totals.status === "not-found",
  },
];
