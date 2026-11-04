// Pure list-based MLP. Rows of W1 are hidden neurons; W2 is one output row.
export const SHAPE = [2, 3, 1];
export const DATASET = [
  { x: [-1, -1], t: 0 }, { x: [-1, 1], t: 1 },
  { x: [1, -1], t: 1 }, { x: [1, 1], t: 0 },
];
export const EXAMPLE = DATASET[2];
export const INIT = {
  W1: [[0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
  b1: [0.25, 0.25, -0.25], W2: [0.5, 0.5, -0.25], b2: 0.1,
};
export const clone = (p) => ({ W1: p.W1.map(r => [...r]), b1: [...p.b1], W2: [...p.W2], b2: p.b2 });
export const PARAMS = INIT.W1.flat().length + INIT.b1.length + INIT.W2.length + 1;
export const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
export const relu = (z) => Math.max(0, z);
export function forward(x, p = INIT) {
  const z = p.W1.map((row, i) => dot(row, x) + p.b1[i]);
  const h = z.map(relu);
  return { x: [...x], z, h, y: dot(p.W2, h) + p.b2 };
}
export const loss = (y, t) => (y - t) ** 2;
export function backward(x, t, p = INIT) {
  const f = forward(x, p), dy = 2 * (f.y - t);
  const dh = p.W2.map(w => dy * w);
  // Use derivative 0 at z=0, matching PyTorch's convention.
  const dz = dh.map((v, i) => f.z[i] > 0 ? v : 0);
  return { dy, dh, dz, W1: dz.map(v => x.map(a => v * a)), b1: dz, W2: f.h.map(v => dy * v), b2: dy };
}
export function update(p, g, lr) {
  return { W1: p.W1.map((r, i) => r.map((v, j) => v - lr * g.W1[i][j])),
    b1: p.b1.map((v, i) => v - lr * g.b1[i]), W2: p.W2.map((v, i) => v - lr * g.W2[i]), b2: p.b2 - lr * g.b2 };
}
export const meanLoss = (p, data = DATASET) => data.reduce((n, { x, t }) => n + loss(forward(x, p).y, t), 0) / data.length;
export function batchGradient(p, data = DATASET) {
  const g = { W1: p.W1.map(r => r.map(() => 0)), b1: p.b1.map(() => 0), W2: p.W2.map(() => 0), b2: 0 };
  for (const { x, t } of data) {
    const b = backward(x, t, p), n = data.length;
    g.W1.forEach((r, i) => r.forEach((_, j) => g.W1[i][j] += b.W1[i][j] / n));
    g.b1.forEach((_, i) => { g.b1[i] += b.b1[i] / n; g.W2[i] += b.W2[i] / n; });
    g.b2 += b.b2 / n;
  }
  return g;
}
// Parameter paths also drive the finite-difference tests in Python.
export const PATHS = [
  ...INIT.W1.flatMap((r, i) => r.map((_, j) => ['W1', i, j])),
  ...INIT.b1.map((_, i) => ['b1', i]), ...INIT.W2.map((_, i) => ['W2', i]), ['b2'],
];
export const at = (p, path) => path.reduce((o, k) => o[k], p);
export function perturbed(p, path, delta) {
  const q = clone(p), parent = path.slice(0, -1).reduce((o, k) => o[k], q);
  parent[path.at(-1)] += delta;
  return q;
}
export function finiteDifferences(x, t, p = INIT, eps = 1e-6) {
  return PATHS.map(path => (loss(forward(x, perturbed(p, path, eps)).y, t) - loss(forward(x, perturbed(p, path, -eps)).y, t)) / (2 * eps));
}
export const RATES = [0.0001, 0.001, 0.01, 0.1, 0.3, 1, 3, 10];
export const DEFAULTS = { lr: 0.001, steps: 50 };
export const TARGET = 0.01;
export function configOf(input = {}) {
  return { lr: RATES.includes(Number(input.lr)) ? Number(input.lr) : DEFAULTS.lr,
    steps: Number.isInteger(input.steps) && input.steps > 0 && input.steps <= 200 ? input.steps : DEFAULTS.steps };
}
export function train(input = {}) {
  const config = configOf(input);
  let params = clone(INIT), divergedAt = null;
  const curve = [meanLoss(params)];
  for (let i = 1; i <= config.steps; i++) {
    const next = update(params, batchGradient(params), config.lr), v = meanLoss(next);
    // A declared numerical guard, not an invented timing or convergence measurement.
    if (!Number.isFinite(v) || v > 1e6) { divergedAt = i; break; }
    params = next;
    curve.push(v);
  }
  return { config, params, curve, steps: curve.length - 1, finalLoss: curve.at(-1), divergedAt,
    predictions: DATASET.map(({ x }) => forward(x, params).y) };
}
export function verdict(run) {
  if (run.divergedAt !== null) return `Diverged at step ${run.divergedAt}: loss exceeded the 1,000,000 guard. Lower lr.`;
  if (run.finalLoss >= TARGET) return `Too slow or stalled: ${run.finalLoss.toFixed(5)} after ${run.steps} steps. Try another lr; a large rate can also kill ReLU units.`;
  return `Target reached: ${run.finalLoss.toFixed(5)} after ${run.steps} steps.`;
}
export const MEMORY = { master: 4, weights: 2, grads: 2, moments: 8, parameters: 7e9 };
export const bytesPerParam = () => MEMORY.master + MEMORY.weights + MEMORY.grads + MEMORY.moments;
export const memoryGB = () => MEMORY.parameters * bytesPerParam() / 1e9;
export const F = forward(EXAMPLE.x), B = backward(EXAMPLE.x, EXAMPLE.t);
export const HAND_LR = 0.1;
export const UPDATED = update(INIT, B, HAND_LR);
export const ANSWERS = { z: F.z[0], relu: 'gate', output: F.y, loss: loss(F.y, EXAMPLE.t), dy: B.dy, weight: B.W2[0],
  update: UPDATED.W2[0], python: true, lr: 0.1, memory: memoryGB() };
const near = (v, n) => Number.isFinite(v) && Math.abs(v - n) < 1e-6;
export const MISSIONS = [
  ...['z', 'output', 'loss', 'dy', 'weight', 'update', 'memory'].map(id => ({ id, title: ({z:'Forward one neuron',output:'Combine the hidden values',loss:'Measure the loss',dy:'Start backward',weight:'Chain to a weight',update:'Apply SGD',memory:'Budget training memory'})[id], goal: `Calculate ${id}.`, check: a => near(a.value, ANSWERS[id]) })),
  { id: 'relu', title: 'Apply ReLU', goal: 'Gate the negative preactivations and their local gradients.', check: a => a.choice === ANSWERS.relu },
  { id: 'python', title: 'Write backward', goal: 'Return every parameter gradient.', check: a => a.passed === true },
  { id: 'lr', title: 'Pick a learning rate', goal: `Reach mean loss below ${TARGET} in ${DEFAULTS.steps} updates.`, check: a => { const r = train(a); return !r.divergedAt && r.finalLoss < TARGET; } },
];
export function artifact(input = {}) {
  const r = train(input);
  return JSON.stringify({ optimizer: 'SGD', lr: r.config.lr, steps: r.config.steps, batch: DATASET.length,
    loss: 'mean_squared_error', final_loss: r.finalLoss, completed_steps: r.steps, diverged_at: r.divergedAt,
    model: { shape: SHAPE, activation: 'ReLU', output: 'linear', init: INIT }, dataset: DATASET }, null, 2);
}
export const mapGrid = (p, n = 20) => Array.from({ length: n * n }, (_, i) => {
  const col = i % n, row = Math.floor(i / n), x = [-1.25 + (col + 0.5) * 2.5 / n, 1.25 - (row + 0.5) * 2.5 / n];
  const score = forward(x, p).y;
  return { row, col, x, score, label: Number(score >= 0.5) };
});
const altered = { W1: [[0.3, -0.7], [-0.2, 0.6], [0.8, 0.2]], b1: [0.15, -0.1, 0.4], W2: [0.4, -0.3, 0.7], b2: -0.2 };
export const PY_SOLUTION = `def backward(x, t, params):
    z = [sum(w*a for w,a in zip(row,x)) + b for row,b in zip(params['W1'],params['b1'])]
    h = [max(0,v) for v in z]
    y = sum(w*a for w,a in zip(params['W2'],h)) + params['b2']
    dy = 2*(y-t)
    dz = [dy*w if v > 0 else 0.0 for w,v in zip(params['W2'],z)]
    return {'W1': [[d*a for a in x] for d in dz], 'b1': dz,
            'W2': [dy*a for a in h], 'b2': dy}
`;
export const PY_DATA = {
  x: EXAMPLE.x, t: EXAMPLE.t, params: INIT, board: { W2: B.W2[0], b2: B.b2 },
  cases: [...DATASET.map(e => ({ ...e, params: INIT })),
    { x: [0.4, -0.8], t: -0.3, params: altered }, { x: [-0.6, 0.7], t: 0.35, params: altered }]
    .map(c => ({ ...c, expected: finiteDifferences(c.x, c.t, c.params) })),
};
export const PY_TESTS = `def flat(g):
    return [v for row in g['W1'] for v in row] + g['b1'] + g['W2'] + [g['b2']]
def agrees(c):
    return all(abs(a-b) < 0.00001 for a,b in zip(flat(backward(c['x'],c['t'],c['params'])),c['expected'])) and len(flat(backward(c['x'],c['t'],c['params']))) == len(c['expected'])
g = backward(DATA['x'],DATA['t'],DATA['params'])
check('parameter shapes', len(g['W1']) == 3 and all(len(r) == 2 for r in g['W1']) and len(g['b1']) == 3 and len(g['W2']) == 3, 'Return W1: 3x2, b1: 3, W2: 3 and scalar b2.')
check('board output gradients', abs(g['W2'][0]-DATA['board']['W2']) < 0.000001 and abs(g['b2']-DATA['board']['b2']) < 0.000001, 'Use 2*(y-t), then multiply by h for W2.')
check('ReLU blocks negative z', all(v == 0 for r in g['W1'][1:] for v in r) and g['b1'][1:] == [0,0], 'Multiply by zero when z is negative.')
check('finite differences: all XOR points', all(agrees(c) for c in DATA['cases'][:4]), 'Compare every weight and bias; include the input x in W1 gradients.')
check('finite differences: changed weights', all(agrees(c) for c in DATA['cases'][4:]), 'Use params, x and t rather than the example constants.')
import copy
before = copy.deepcopy(DATA['params'])
backward(DATA['x'],DATA['t'],DATA['params'])
check('backward does not update weights', DATA['params'] == before, 'Return gradients; SGD performs the update later.')
`;
// One place to select the parameters actually displayed in the graph and map.
export function displayState(input, trained, updated) {
  const run = trained ? train(input) : null;
  const params = run ? run.params : updated ? UPDATED : INIT;
  return { params, forward: forward(EXAMPLE.x, params), run };
}
// Per-example rows for the batch panel: prediction, squared error and the mean the full-batch loop minimizes.
export function batchRows(p = INIT, data = DATASET) {
  const rows = data.map(({ x, t }) => { const y = forward(x, p).y; return { x, t, y, l: loss(y, t) }; });
  return { rows, mean: rows.reduce((n, r) => n + r.l, 0) / rows.length };
}
// The one-example hand step helps example 3 but raises the batch mean: the reason to average gradients.
export const BATCH_INIT = batchRows(INIT), BATCH_HAND = batchRows(UPDATED);
// Approximate unsharded mixed-precision Adam state for 7B parameters, one row per buffer (decimal GB).
export const MEMORY_ROWS = [['FP32 master', 'master'], ['FP16 weights', 'weights'], ['FP16 grads', 'grads'], ['FP32 Adam m + v', 'moments']]
  .map(([label, key]) => ({ label, key, bytes: MEMORY[key], gb: MEMORY[key] * MEMORY.parameters / 1e9 }));
// Final loss (or divergence step) for each learning rate the reader has tried, in RATES order.
export const sweep = (rates = RATES, steps = DEFAULTS.steps) => RATES.filter(lr => rates.includes(lr)).map(lr => {
  const r = train({ lr, steps });
  return { lr, finalLoss: r.finalLoss, divergedAt: r.divergedAt, ok: !r.divergedAt && r.finalLoss < TARGET };
});
