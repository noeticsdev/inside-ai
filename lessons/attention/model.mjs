// A deterministic teaching head. Fixed, untrained projections; all arithmetic is real.
export const TOKENS = ['The', 'cat', 'sat', 'on', 'the'];
export const D_MODEL = 8;
export const D_K = 4;
export const FOCUS = 2; // displayed positions are one-based: row 3
export const X = TOKENS.map((_, i) => Array.from({ length: D_MODEL }, (_, j) => +(i === j)));
const pad = (rows) => [...rows, ...Array.from({ length: D_MODEL - rows.length }, () => [0, 0, 0, 0])];
export const W_Q = pad([[1,0,0,0], [0,1,0,0], [2,0,2,0], [0,0,1,1], [1,1,0,0]]);
export const W_K = pad([[1,0,1,0], [0,1,0,1], [1,1,0,0], [0,0,1,0], [1,0,0,1]]);
// Reuse the first five value vectors from machines/attention/model.mjs.
export const W_V = pad([[0.2,0.1,0,0.3], [0.9,0.2,0.1,0], [0.1,0.9,0.2,0.1], [0,0.3,0.9,0.2], [0.2,0.2,0.1,0.1]]);
export const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export const transpose = (a) => a[0].map((_, j) => a.map((r) => r[j]));
export const matmul = (a, b) => { const bt = transpose(b); return a.map((r) => bt.map((c) => dot(r, c))); };
export function softmax(row) {
  const max = Math.max(...row);
  const exps = row.map((v) => v === -Infinity ? 0 : Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / sum);
}
export function attention(Q, K, V, causal = true) {
  const raw = matmul(Q, transpose(K));
  const scaled = raw.map((r) => r.map((v) => v / Math.sqrt(Q[0].length)));
  const masked = scaled.map((r, i) => r.map((v, j) => causal && j > i ? -Infinity : v));
  const weights = masked.map(softmax);
  return { raw, scaled, masked, weights, output: matmul(weights, V) };
}
export const DEFAULTS = { tokens: 5, heads: 8 };
export function configOf(input = {}) {
  return { tokens: [4,5].includes(input.tokens) ? input.tokens : DEFAULTS.tokens, heads: [4,8].includes(input.heads) ? input.heads : DEFAULTS.heads };
}
export function simulate(input = {}) {
  const config = configOf(input);
  const x = X.slice(0, config.tokens);
  const Q = matmul(x, W_Q), K = matmul(x, W_K), V = matmul(x, W_V);
  return { config, X: x, Q, K, V, ...attention(Q, K, V) };
}
export const maskedCells = (t) => t * (t - 1) / 2;
export const headWidth = (d, heads) => d / heads;
export const projectionParameters = (d) => 4 * d * d; // Q, K, V and output; no biases
export const scoreBytes = (t, bytes = 2) => t * t * bytes;
export const SCALE = { dModel: 512, heads: 8, context: 8192, bytes: 2 };
export const EXAMPLE = simulate();
export const V = EXAMPLE.V;
export const ANSWERS = {
  shape: '5x4', dot: EXAMPLE.raw[FOCUS][0], scaled: EXAMPLE.scaled[FOCUS][0],
  masked: maskedCells(DEFAULTS.tokens), weight: EXAMPLE.weights[FOCUS][0], mix: EXAMPLE.output[FOCUS][0],
  width: headWidth(SCALE.dModel, SCALE.heads), parameters: projectionParameters(SCALE.dModel), memory: scoreBytes(SCALE.context),
};
// Worked arithmetic shared by the figures, captions and tests.
export function rowWork(input = {}) {
  const r = simulate(input), i = FOCUS;
  const scores = r.masked[i].slice(0, i + 1);
  const exponentials = scores.map(Math.exp);
  const denominator = exponentials.reduce((a, b) => a + b, 0);
  const products = r.Q[i].map((v, c) => v * r.K[0][c]);
  const contributions = r.weights[i].slice(0, i + 1).map((w, j) => w * r.V[j][0]);
  return { scores, exponentials, denominator, products, contributions };
}
const numeric = (want, tolerance = 0) => (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v - want) <= tolerance;
export const MISSIONS = [
  { id:'project', title:'Project to queries', goal:'Match the projection dimensions.', check: (r) => r.choice === `${configOf(r).tokens}x4` },
  { id:'score', title:'Score one pair', goal:'Compute a query–key dot product.', check: (r) => numeric(ANSWERS.dot)(r.value) },
  { id:'scale', title:'Scale the score', goal:'Divide by the square root of head width.', check: (r) => numeric(ANSWERS.scaled)(r.value) },
  { id:'mask', title:'Mask the future', goal:'Count the strictly upper triangle.', check: (r) => numeric(maskedCells(configOf(r).tokens))(r.value) },
  { id:'softmax', title:'Softmax a row', goal:'Normalize the visible scores.', check: (r) => numeric(ANSWERS.weight, 0.01)(r.value) },
  { id:'mix', title:'Mix the values', goal:'Compute one output component.', check: (r) => numeric(ANSWERS.mix, 0.001)(r.value) },
  { id:'python', title:'Write the head', goal:'Pass five Python checks.', check: (r) => r.passed === true },
  { id:'heads', title:'Split into heads', goal:'Calculate the width of each head.', check: (r) => numeric(headWidth(SCALE.dModel, configOf(r).heads))(r.value) },
  { id:'memory', title:'Count the memory', goal:'Count the bytes of a dense score matrix.', check: (r) => numeric(ANSWERS.memory)(r.value) },
];
export function artifact(input = {}) {
  const c = configOf(input), dk = headWidth(SCALE.dModel, c.heads);
  return `# Your teaching head (untrained example; no batch axis)\nT = ${c.tokens}\nX: [T, ${D_MODEL}]\nW_Q, W_K, W_V: [${D_MODEL}, ${D_K}]\nQ, K, V: [T, ${D_K}]\nscores = Q @ K.T / sqrt(${D_K})   # [T, T]\nweights = softmax(causal_mask(scores), dim=-1)\noutput = weights @ V             # [T, ${D_K}]\n\n# A separate full-size PyTorch configuration\nimport torch\nfrom torch import nn\nhead = nn.MultiheadAttention(\n    embed_dim=${SCALE.dModel}, num_heads=${c.heads},\n    dropout=0.0, bias=False, batch_first=True\n)  # d_k = ${dk}; Q/K/V + W_O = ${projectionParameters(SCALE.dModel)} weights\nx = torch.randn(1, T, ${SCALE.dModel})\n# MultiheadAttention boolean mask: True blocks a position\nmask = torch.ones(T, T, dtype=torch.bool).triu(1)\ny, _ = head(x, x, x, attn_mask=mask, need_weights=False)\n# y: [1, T, ${SCALE.dModel}] after concatenation and W_O\n`;
}
export const PY_SOLUTION = `import math

def attention(Q, K, V, causal=True):
    weights = []
    for i, q in enumerate(Q):
        scores = [sum(a*b for a, b in zip(q, k)) / math.sqrt(len(q))
                  for k in K]
        scores = [s if not causal or j <= i else -math.inf
                  for j, s in enumerate(scores)]
        peak = max(scores)
        exps = [math.exp(s - peak) for s in scores]
        weights.append([e / sum(exps) for e in exps])
    output = [[sum(w[j] * V[j][c] for j in range(len(V)))
               for c in range(len(V[0]))] for w in weights]
    return output, weights
`;
export const pythonData = (input = {}) => { const r = simulate(input); return { Q:r.Q, K:r.K, V:r.V, output:r.output, weights:r.weights }; };
export const PY_TESTS = [
  "check('rows sum to one', len(attention(DATA['Q'], DATA['K'], DATA['V'])[1]) == len(DATA['Q']) and all(len(w) == len(DATA['K']) and abs(sum(w)-1) < 1e-9 and all(v >= 0 for v in w) for w in attention(DATA['Q'], DATA['K'], DATA['V'])[1]), 'Return a full nonnegative row per query. Normalize rows, not columns.')",
  "check('future positions are zero', all(w[i] > 0 and all(abs(w[j]) < 1e-12 for j in range(i+1,len(w))) for i,w in enumerate(attention(DATA['Q'], DATA['K'], DATA['V'])[1])), 'Mask j > i before softmax; keep the diagonal.')",
  "check('matches every board output', all(abs(a-b) < 1e-9 for row,want in zip(attention(DATA['Q'], DATA['K'], DATA['V'])[0], DATA['output']) for a,b in zip(row,want)) and len(attention(DATA['Q'], DATA['K'], DATA['V'])[0]) == len(DATA['output']) and all(len(row) == len(DATA['V'][0]) for row in attention(DATA['Q'], DATA['K'], DATA['V'])[0]), 'Scale, normalize, then multiply by V.')",
  "check('one token returns its value', attention([[2,0]], [[1,0]], [[3,4]]) == ([[3.0,4.0]], [[1.0]]), 'One visible key has weight one.')",
  "check('uniform scores without a mask', attention([[0,0],[0,0]], [[1,0],[0,1]], [[2,4],[4,8]], causal=False) == ([[3.0,6.0],[3.0,6.0]], [[0.5,0.5],[0.5,0.5]]), 'Equal scores give equal weights; honor causal=False.')",
].join('\n');
