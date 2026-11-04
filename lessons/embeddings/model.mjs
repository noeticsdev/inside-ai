// Inside embeddings: meaning as direction. Pure and deterministic: no DOM, no clock.
//
// A tiny library of 12 sentences, each with a HAND-SET 6-dimensional vector over
// named axes. The copy says so honestly. Real models learn thousands of dimensions;
// here the arithmetic (cosine, dot product, keyword overlap) is the real thing.

export const AXES = ["animal", "food", "tech", "money", "place", "feeling"];

// Fixed 6D -> 2D linear projection used ONLY for the drawing; the scores use all 6.
// The rows are the first two principal components of the 12 normalized document
// vectors, rounded to two decimals, so topics land in separate regions of the plot.
export const PROJ = [
  [-0.71, 0.02, 0.56, 0.38, -0.09, -0.19],
  [-0.44, 0.56, -0.57, 0.17, 0.19, 0.31],
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
  { id: "puppy", text: "puppy chases ball park", v: [0.98, 0.1, 0.0, 0.0, 0.1, 0.1] },
  { id: "kitten", text: "kitten naps sunny rug", v: [0.7, 0.1, 0.0, 0.0, 0.55, 0.4] },
  { id: "dog", text: "young dog runs meadow", v: [0.9, 0.0, 0.0, 0.0, 0.35, 0.25] },
  { id: "server", text: "server hums datacenter cold", v: [0.0, 0.0, 0.9, 0.2, 0.4, 0.0] },
  { id: "beach", text: "beach sunset calm waves", v: [0.05, 0.1, 0.0, 0.0, 0.85, 0.8] },
  { id: "mountain", text: "mountain trail quiet dawn", v: [0.1, 0.0, 0.0, 0.0, 0.8, 0.6] },
];

export const QUERIES = {
  puppy: { text: "puppy", v: [1, 0, 0, 0, 0, 0], right: "puppy" },
  canine: { text: "dog", v: [1, 0, 0, 0, 0, 0], right: "puppy" },
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


export const normalize = v => { const n = norm(v); return n ? v.map(x => x / n) : v.map(() => 0); };
export const rank = (query, method = 'cosine') => DOCS.map(d => ({ ...d, score: method === 'keyword' ? keywordScore(query.text, d.text) : cosine(query.v, d.v) })).sort((a,b) => b.score-a.score || a.id.localeCompare(b.id));
export const SIZE = { docs: 1000000, dims: 768, fp32: 4, int8: 1 };
export const bytes = (n, d, b) => n*d*b;
export const relevant = ['dog','puppy','kitten'];
export function thresholdStats(t) { const selected = rank(QUERIES.puppy).filter(d => d.score >= t); const tp = selected.filter(d => relevant.includes(d.id)).length; return { selected, tp, fp: selected.length-tp, missed: relevant.length-tp, precision: selected.length ? tp/selected.length : 0, recall: tp/relevant.length }; }
export const ANSWERS = { dot: dot([1,2,0,0],[2,1,0,0]), length: norm([3,4,0,0]), nearest: rank(QUERIES.puppy)[0].id, fp32: bytes(SIZE.docs,SIZE.dims,SIZE.fp32), ops: SIZE.docs*SIZE.dims, keyword: rank(QUERIES.canine)[0].id, indexFp32: bytes(DOCS.length,AXES.length,SIZE.fp32), indexInt8: bytes(DOCS.length,AXES.length,SIZE.int8), int8: bytes(SIZE.docs,SIZE.dims,SIZE.int8) };
export const MISSIONS = [
 ['embed','dot'],['normalize','length'],['compare','nearest'],['store','fp32'],['search','ops'],['keyword','keyword'],['python',null],['threshold',null],['scale','int8']
].map(([id,key]) => ({id,title:id,goal:id,check: x => key ? x.value === ANSWERS[key] : id === 'threshold' ? thresholdStats(x.threshold).precision === 1 && thresholdStats(x.threshold).recall === 1 : x.passed === true}));
// Any threshold in (above, atMost] keeps every relevant document and drops every other one.
export function thresholdWindow() {
  const r = rank(QUERIES.puppy);
  return { above: Math.max(...r.filter((d) => !relevant.includes(d.id)).map((d) => d.score)), atMost: Math.min(...r.filter((d) => relevant.includes(d.id)).map((d) => d.score)) };
}
export const THRESHOLD_START = 0.8;
