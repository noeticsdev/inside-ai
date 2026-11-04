// Pure deterministic teaching model. Decimal GB/TB. All times are simulated, not measured.
// Llama 3 8B shape; parameter count rounded to 8.03 billion for the exercise.
export const MODEL = Object.freeze({ params: 8.03e9, layers: 32, kvHeads: 8, queryHeads: 32, headDim: 128, hidden: 4096 });
export const GPU = Object.freeze({ bytes: 80e9, bandwidth: 2e12, flops: 200e12, overhead: 4e9, utilization: 0.9 });
export const EXAMPLE = Object.freeze({ prompt: 1000, blockSize: 16, ctxLen: 8192, hostMs: 2, chunk: 512 });
export const DEFAULTS = Object.freeze({ maxSeqs: 1, chunked: false, kvDtype: 'auto' });
export const OPTIONS = Object.freeze({ maxSeqs: [1, 4, 8, 16, 32, 64], chunked: [false, true], kvDtype: ['auto', 'fp8'] });
export function configOf(input = {}) {
  input = input && typeof input === 'object' ? input : {};
  return Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, OPTIONS[k].includes(input[k]) ? input[k] : DEFAULTS[k]]));
}
export const weightBytes = (bytes = 2) => MODEL.params * bytes;
export const kvBytesPerToken = (layers = MODEL.layers, heads = MODEL.kvHeads, dim = MODEL.headDim, bytes = 2) => 2 * layers * heads * dim * bytes;
export const pagesFor = (tokens, block = EXAMPLE.blockSize) => Math.ceil(tokens / block);
export function pageLayout(tokens, block = EXAMPLE.blockSize) {
  const blocks = pagesFor(tokens, block);
  return { tokens, blocks, slots: blocks * block, waste: blocks * block - tokens };
}
export function memory({ kvBytes = 2, weightDtypeBytes = 2, utilization = GPU.utilization } = {}) {
  const weights = weightBytes(weightDtypeBytes), budget = GPU.bytes * utilization;
  const kvPool = Math.max(0, budget - weights - GPU.overhead);
  const perToken = kvBytesPerToken(MODEL.layers, MODEL.kvHeads, MODEL.headDim, kvBytes);
  const blockBytes = perToken * EXAMPLE.blockSize;
  const blocks = Math.floor(kvPool / blockBytes);
  return { budget, weights, overhead: GPU.overhead, outside: GPU.bytes - budget, kvPool, perToken, blockBytes, rawTokens: Math.floor(kvPool / perToken), blocks, tokens: blocks * EXAMPLE.blockSize, maxSeqs: Math.floor(blocks / pagesFor(EXAMPLE.ctxLen)) };
}
export const prefillMs = (tokens) => 1000 * 2 * MODEL.params * tokens / GPU.flops;
export const weightReadMs = (bytes = 2) => 1000 * weightBytes(bytes) / GPU.bandwidth;
// Roofline estimate: read weights ONCE per batch, plus each sequence's KV; compare compute cost.
export function decodeStep(contexts, kvBytes = 2) {
  const kvRead = contexts.reduce((sum, n) => sum + n * kvBytesPerToken(MODEL.layers, MODEL.kvHeads, MODEL.headDim, kvBytes), 0);
  const memoryMs = 1000 * (weightBytes() + kvRead) / GPU.bandwidth;
  const computeMs = 1000 * 2 * MODEL.params * contexts.length / GPU.flops;
  return { ms: Math.max(memoryMs, computeMs), kvRead, memoryMs, computeMs, bound: memoryMs >= computeMs ? 'memory' : 'compute' };
}
// Fixed traffic specification, not a model tokenizer or generated language.
export const TRAFFIC = Object.freeze(Array.from({ length: 24 }, (_, i) => Object.freeze({
  id: `r${String(i + 1).padStart(2, '0')}`, arrival: Math.floor(i / 8) * 200,
  prompt: i % 8 === 7 ? 7000 : 1000, output: i % 3 === 0 ? 32 : 128,
})));
// FCFS admission, block-by-block growth, freed pages reused. Completed prefill samples token 1.
// Chunked mode runs decode first, then one prompt chunk, sharing a roofline iteration cost.
// Unchunked mode finishes a whole prefill before decode. CPU + network cost is a fixed 2ms/request.
export function simulate(input = {}) {
  const config = configOf(input), mem = memory({ kvBytes: config.kvDtype === 'fp8' ? 1 : 2 });
  const req = TRAFFIC.map(r => ({ ...r, remaining: r.prompt, generated: 0, first: null, end: null, lastTokenAt: null, maxGap: 0 }));
  const waiting = req.slice(), active = [], events = [];
  let clock = 0, peakBlocks = 0;
  const occupied = (r) => pagesFor(r.prompt - r.remaining + Math.max(0, r.generated - 1));
  const emit = (type, trace, data = {}) => {
    const usedBlocks = active.reduce((a, r) => a + occupied(r), 0);
    peakBlocks = Math.max(peakBlocks, usedBlocks);
    events.push({ index: events.length, type, clock, trace, usedBlocks, active: active.map(r => r.id), waiting: waiting.length, ...data });
  };
  let iterations = 0;
  while (req.some(r => r.end === null)) {
    if (++iterations > 100000) throw new Error('Scheduler failed to make progress');
    while (waiting.length && waiting[0].arrival <= clock && active.length < config.maxSeqs) {
      const r = waiting.shift(); active.push(r);
      emit('admit', `${r.id} enters the continuous batch.`, { request: r.id });
    }
    if (!active.length) { clock = waiting[0].arrival; continue; }
    const decoders = active.filter(r => r.remaining === 0);
    const pre = active.find(r => r.remaining > 0);
    const doingDecode = config.chunked || !pre;
    // vLLM's token budget counts decode positions as well as prefill positions.
    const n = pre ? Math.min(pre.remaining, config.chunked ? EXAMPLE.chunk - decoders.length : pre.remaining) : 0;
    const projected = active.reduce((sum, r) => sum + pagesFor(r.prompt - r.remaining + Math.max(0, r.generated - 1) + (r === pre ? n : doingDecode && r.remaining === 0 ? 1 : 0)), 0);
    if (projected > mem.blocks) {
      // Conservative admission guard below makes this unreachable for feasible maxSeqs.
      return { config, events, totals: { oom: true, peakBlocks: projected, throughput: 0, ttft: Infinity, clock, tokens: 0, requests: req }, memory: mem };
    }
    const d = doingDecode && decoders.length ? decodeStep(decoders.map(r => r.prompt + r.generated - 1), config.kvDtype === 'fp8' ? 1 : 2).ms : 0;
    const p = n ? prefillMs(n) : 0;
    const compute = p + (doingDecode ? prefillMs(decoders.length) : 0);
    clock += Math.max(d, compute); // mixed-batch roofline; excludes quadratic attention + launch overhead
    if (doingDecode) for (const r of decoders) {
      r.generated++;
      r.maxGap = Math.max(r.maxGap, clock - r.lastTokenAt);
      r.lastTokenAt = clock;
    }
    if (pre) {
      pre.remaining -= n;
      if (pre.remaining === 0) { pre.generated = 1; pre.first = clock + EXAMPLE.hostMs - pre.arrival; pre.lastTokenAt = clock; }
    }
    for (const r of active) if (r.generated >= r.output) r.end = clock + EXAMPLE.hostMs;
    emit(n ? 'prefill' : 'decode', n ? `${pre.id}: ${n} prompt tokens; ${doingDecode ? decoders.length : 0} decoding sequences.` : `${decoders.length} sequences each emit one token.`, { promptTokens: n, decoded: doingDecode ? decoders.map(r => r.id) : [] });
    for (let i = active.length - 1; i >= 0; i--) if (active[i].end !== null) { const r = active.splice(i, 1)[0]; emit('free', `${r.id} finishes; its pages and scheduler slot can be reused.`, { request: r.id }); }
  }
  const tokens = req.reduce((sum, r) => sum + r.output, 0);
  return { config, events, memory: mem, totals: { oom: false, tokens, clock: clock + EXAMPLE.hostMs, throughput: tokens * 1000 / (clock + EXAMPLE.hostMs), ttft: Math.max(...req.map(r => r.first)), maxGap: Math.max(...req.map(r => r.maxGap)), peakBlocks, requests: req } };
}
export const TARGET = Object.freeze({ ttft: 3200, throughput: 480, maxGap: 50 });
export function batchingVerdict(input) {
  const c = configOf(input), run = simulate(c);
  if (c.maxSeqs > run.memory.maxSeqs) return `KV limit: ${c.maxSeqs} sequences at ${EXAMPLE.ctxLen} tokens need ${c.maxSeqs * pagesFor(EXAMPLE.ctxLen)} blocks; only ${run.memory.blocks} fit. Lower max-num-seqs.`;
  if (run.totals.oom) return 'KV blocks ran out while the requests grew.';
  if (run.totals.ttft > TARGET.ttft) return `TTFT limit: the slowest first token takes ${Math.round(run.totals.ttft)} ms; the target is at most ${TARGET.ttft} ms. More slots or chunked prefill can reduce waiting.`;
  if (run.totals.throughput < TARGET.throughput) return `Throughput limit: ${Math.round(run.totals.throughput)} tokens/s; the target is at least ${TARGET.throughput}. Share each weight read across more sequences.`;
  if (run.totals.maxGap > TARGET.maxGap) return `Streaming limit: an active stream waits ${Math.round(run.totals.maxGap)} ms between tokens. Keep gaps at most ${TARGET.maxGap} ms by splitting long prefills into chunks.`;
  return true;
}
export const ANSWERS = Object.freeze({ weightsGB: weightBytes() / 1e9, kv: kvBytesPerToken(), capacity: memory().rawTokens, phase: 'prefill-compute', blocks: pagesFor(EXAMPLE.prompt), waste: pageLayout(EXAMPLE.prompt).waste, decodeMs: weightReadMs(), fp8Seqs: memory({ kvBytes: 1 }).maxSeqs });
export const PY_SOLUTION = `def kv_bytes_per_token(layers, kv_heads, head_dim, bytes):
    return 2 * layers * kv_heads * head_dim * bytes

def max_batch(gpu_bytes, weight_bytes, ctx_len, layers, kv_heads, head_dim,
              bytes, overhead_bytes, utilization):
    pool = max(0, gpu_bytes * utilization - weight_bytes - overhead_bytes)
    per_seq = ctx_len * kv_bytes_per_token(layers, kv_heads, head_dim, bytes)
    return int(pool // per_seq)
`;
export const PY_DATA = Object.freeze({ gpu: GPU.bytes, weights: weightBytes(), ctx: EXAMPLE.ctxLen, overhead: GPU.overhead, utilization: GPU.utilization, fp16: kvBytesPerToken(), fp8: kvBytesPerToken(32, 8, 128, 1), mha: kvBytesPerToken(32, 32, 128, 2), batch: memory().maxSeqs, batchFp8: memory({ kvBytes: 1 }).maxSeqs });
export const PY_TESTS = [
  "check('FP16 KV', kv_bytes_per_token(32, 8, 128, 2) == DATA['fp16'], 'Count K and V, and 2 bytes per element.')",
  "check('GQA vs MHA', kv_bytes_per_token(32, 32, 128, 2) == DATA['mha'], '32 KV heads use four times the storage of 8 KV heads.')",
  "check('FP8 KV', kv_bytes_per_token(32, 8, 128, 1) == DATA['fp8'], 'FP8 halves the bytes, not the number of heads.')",
  "check('FP16 batch', max_batch(DATA['gpu'], DATA['weights'], DATA['ctx'], 32, 8, 128, 2, DATA['overhead'], DATA['utilization']) == DATA['batch'], 'Reserve the utilization margin and overhead before dividing; floor whole sequences.')",
  "check('FP8 batch', max_batch(DATA['gpu'], DATA['weights'], DATA['ctx'], 32, 8, 128, 1, DATA['overhead'], DATA['utilization']) == DATA['batchFp8'], 'Only KV bytes change; the weights stay FP16.')",
].join('\n');
const near = (a, b, tolerance = 0.001) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;
export const MISSIONS = [
  { id: 'weights', title: 'Load the weights', goal: 'Compute FP16 weight storage in decimal GB.', check: a => near(a.value, ANSWERS.weightsGB, .005) },
  { id: 'kv', title: 'Size one KV entry', goal: 'Compute bytes per cached token across every layer.', check: a => a.value === ANSWERS.kv },
  { id: 'capacity', title: 'Budget the pool', goal: 'Compute the unpaged KV token capacity after reservations.', check: a => a.value === ANSWERS.capacity },
  { id: 'phase', title: 'Separate the phases', goal: 'Identify the limiting resource in each phase.', check: a => a.choice === ANSWERS.phase },
  { id: 'pages', title: 'Page the cache', goal: 'Compute whole blocks for the example prompt.', check: a => a.value === ANSWERS.blocks },
  { id: 'speed', title: 'Bound decode speed', goal: 'Compute weight-read time per decode iteration.', check: a => near(a.value, ANSWERS.decodeMs, .005) },
  { id: 'python', title: 'Write the budget', goal: 'Implement KV sizing and maximum batch capacity.', check: a => a.passed === true },
  { id: 'batch', title: 'Meet the traffic target', goal: 'Meet TTFT, throughput and KV limits together.', check: a => batchingVerdict(a) === true },
  { id: 'quantize', title: 'Halve KV storage', goal: 'Compute concurrency with FP8 KV and FP16 weights.', check: a => a.value === ANSWERS.fp8Seqs },
];
export function serveCommand(input) {
  const c = configOf(input);
  return `# Teaching config; simulation times are not benchmarks.\n# Requires model access and a backend supporting this KV dtype.\nvllm serve meta-llama/Meta-Llama-3-8B \\\n  --dtype half \\\n  --max-model-len ${EXAMPLE.ctxLen} \\\n  --max-num-seqs ${c.maxSeqs} \\\n  --gpu-memory-utilization ${GPU.utilization} \\\n  --kv-cache-dtype ${c.kvDtype} \\\n  --block-size ${EXAMPLE.blockSize} \\\n  --max-num-batched-tokens ${c.chunked ? EXAMPLE.chunk : EXAMPLE.ctxLen} \\\n  ${c.chunked ? '--enable-chunked-prefill' : '--disable-chunked-prefill'}\n# Check engine flags and profiled KV capacity on your vLLM version.\n# FP8 KV needs accuracy evaluation and suitable scaling factors.\n`;
}

// A small first-fit physical allocator. Releasing B then extending A proves that
// a logical request can own noncontiguous physical pages without moving its KV.
export function allocatePages(state, id, tokens) {
  const pages = state.pages.slice();
  const table = Object.fromEntries(Object.entries(state.table).map(([key, value]) => [key, value.slice()]));
  const have = table[id] ||= [];
  const need = pagesFor(tokens);
  if (need < have.length) throw new RangeError('Use releasePages to free a request');
  if (pages.filter(owner => owner === null).length < need - have.length) return null;
  for (let p = 0; p < pages.length && have.length < need; p++) {
    if (pages[p] === null) { pages[p] = id; have.push(p); }
  }
  return { pages, table };
}
export function releasePages(state, id) {
  return { pages: state.pages.map(owner => owner === id ? null : owner), table: Object.fromEntries(Object.entries(state.table).filter(([key]) => key !== id).map(([key,value])=>[key,value.slice()])) };
}
export function pagingExample() {
  let state = { pages: Array(192).fill(null), table: {} };
  state = allocatePages(state, 'A', EXAMPLE.prompt);
  state = allocatePages(state, 'B', EXAMPLE.prompt);
  state = allocatePages(state, 'C', EXAMPLE.prompt);
  state = releasePages(state, 'B');
  state = allocatePages(state, 'D', EXAMPLE.blockSize * 4);
  state = allocatePages(state, 'A', EXAMPLE.prompt + EXAMPLE.blockSize);
  return state;
}
export const STREAM = Object.freeze(['The', ' GPU', ' shares', ' weights.']); // explicitly a fixed script
