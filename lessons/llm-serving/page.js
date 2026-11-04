import * as M from './model.mjs';
import { createGuide, h, s, T_, fmt, metricsRow, pyCell, svgBox } from '../../platform/shell/guide-runtime.js';

let G;
const C = Object.fromEntries(M.MISSIONS.map(m => [m.id, m.check]));
const cfg = () => M.configOf(G?.settings);
const solved = id => Boolean(G?.solved(id));
const n = v => fmt(v);
const fixed = (v, digits = 2) => Number(v).toFixed(digits);
const pre = text => h('pre', { class: 'sv-code', text });
const cap = text => h('p', { class: 'cu-cap', text });
const close = (text, note) => h('div', {}, pre(text), note ? cap(note) : null);
const unknown = (id, text) => solved(id) ? text : '?';

// Figure tier: GPU carrier, 4 mounts, HBM partitions, 24 page tiles, SM tiles,
// host request ring, scheduler table, sampler and network output. No metaphor machinery.
function board(ctx) {
  const { built, fresh, hit } = ctx;
  const c = cfg(), mem = M.memory({ kvBytes: c.kvDtype === 'fp8' ? 1 : 2 });
  const svg = s('svg', { viewBox: '0 0 1000 620', role: 'img', 'aria-label': 'Inference server being assembled: request queue, tokenizer, scheduler, GPU weights and KV pages, SMs, sampler, detokenizer and SSE stream.' });
  const rect = (x, y, w, hh, cls = 'hw-part', rx = 6) => s('rect', { x, y, width: w, height: hh, rx, class: cls });
  const text = (x, y, t, cls = 'hw-sub', anchor) => T_(x, y, t, cls, anchor);
  const group = (id, step, kids) => {
    if (built < step) return;
    const g = s('g', { class: `hw-grp ${fresh === step || ctx.on.includes(id) ? 'is-on' : ''}`, 'data-hw': id }, kids);
    if (hit) { g.setAttribute('data-hit', ''); g.onclick = () => hit(id); }
    svg.append(g);
  };
  const path = d => svg.append(s('path', { class: 'sv-route', d }));
  // Host and the unpopulated GPU carrier are the kit, before any software is added.
  svg.append(rect(242, 226, 724, 310, 'hw-chassis', 12), text(260, 250, 'GPU · HBM + SMs', 'hw-label'));
  for (const [x,y] of [[252,236],[956,236],[252,526],[956,526]]) svg.append(s('circle', { cx:x, cy:y, r:3, class:'hw-detail' }));
  svg.append(text(28, 85, 'SIMULATION · 80 GB HBM · 2.0 TB/s · 200 TFLOP/s', 'hw-sub'));
  svg.append(text(32, 115, 'HOST / REQUESTS', 'hw-chassis-label'));
  svg.append(rect(28, 136, 176, 142, 'hw-fill'), text(42, 160, 'request queue', 'hw-label'));
  M.TRAFFIC.slice(0, 3).forEach((r,i) => svg.append(rect(42, 173+i*28, 148, 23, 'hw-detail-fill', 3), text(49, 189+i*28, `${r.id} · ${r.prompt} in`, 'hw-sub')));
  group('weights', 1, [rect(264, 268, 680, 62), text(278, 289, 'HBM · decimal GB', 'hw-sub'), ...memoryBar(rect, mem, 278, 302, 650, built >= 3), text(278, 351, `weights · ${unknown('weights', '16.06 GB')}`, 'hw-label')]);
  group('kv', 2, [rect(510, 366, 416, 144), text(526, 390, `KV CACHE · ${c.kvDtype === 'fp8' ? 'FP8' : 'FP16'}`, 'hw-label'), text(526, 413, `${unknown('kv', n(mem.perToken))} B / token`, 'hw-sub')]);
  group('pool', 3, [rect(28, 326, 176, 126), text(42, 352, 'scheduler', 'hw-label'), text(42, 378, `max-num-seqs ${c.maxSeqs}`, 'hw-sub'), text(42, 402, `${unknown('capacity', n(mem.blocks))} KV blocks`, 'hw-sub'), text(42, 426, built >= 7 ? 'budget guard: on' : 'FCFS admission', 'hw-sub')]);
  group('tokenizer', 4, [rect(260, 129, 238, 66), text(276, 154, 'tokenizer.encode()', 'hw-label'), text(276, 178, 'prompt → token IDs', 'hw-sub')]);
  group('sm', 4, [rect(264, 366, 226, 144), text(280, 390, 'SMs · transformer', 'hw-label'), ...Array.from({length:12},(_,i)=>rect(280+(i%4)*47, 407+Math.floor(i/4)*27, 39, 19, 'hw-detail-fill', 2))]);
  if (built >= 4) { path('M204 264H220V160H260'); path('M379 195V211H226V300H116V326'); path('M204 387H264'); }
  if (built >= 5) {
    // A real first-fit allocation after a request leaves and another grows.
    const allocation = M.pagingExample();
    const sample = [...Array.from({length:16},(_,i)=>56+i), ...Array.from({length:8},(_,i)=>126+i)];
    const g = s('g', {class: fresh === 5 ? 'sv-fresh' : ''});
    sample.forEach((p,i) => {
      const owner=allocation.pages[p], x=526+(i%12)*32, y=432+Math.floor(i/12)*29;
      g.append(rect(x,y,25,21,owner ? `sv-page sv-owner-${{A:1,C:2,D:0}[owner]}` : 'cu-slot-empty',2), text(x+12.5,y+15,owner||'–','sv-owner-label','middle'));
    });
    g.append(text(526, 499, 'allocator example · A / C / D requests', 'hw-sub'));
    svg.append(g);
    path('M490 438H510');
  }
  group('sampler', 6, [rect(264, 553, 226, 39), text(377, 578, 'sampler · token ID', 'hw-label', 'middle')]);
  if (built >= 6) path('M264 510V540H377V553');
  if (built >= 8) {
    group('stream', 8, [rect(510, 553, 222, 39), text(621,578,'detokenizer','hw-label','middle'), rect(752,553,214,39), text(859,578,'SSE → clients','hw-label','middle')]);
    path('M490 573H510'); path('M732 573H752');
    svg.append(text(510, 614, `fixed script: ${M.STREAM.slice(0,2).map(t=>JSON.stringify(t)).join(' → ')}`, 'hw-sub'));
  }
  const rows = [
    ['prompt tokens', unknown('phase', n(M.EXAMPLE.prompt))],
    ['prefill', unknown('phase', `${fixed(M.prefillMs(M.EXAMPLE.prompt),1)} ms`)],
    ['prompt KV', unknown('kv', `${n(M.EXAMPLE.prompt * mem.perToken)} B`)],
    ['weight-only ceiling', unknown('speed', `${fixed(1000/M.weightReadMs())} tok/s`)],
    ['first request TTFT', unknown('batch', `${fixed(M.prefillMs(M.EXAMPLE.prompt)+M.EXAMPLE.hostMs,1)} ms`)],
  ];
  svg.append(rect(530, 30, 436, 172, 'hw-fill'), text(548, 54, 'ONE REQUEST, STAGE BY STAGE', 'hw-chassis-label'));
  rows.forEach(([label,value],i) => svg.append(text(548, 82+i*25, label, 'ro-t'), text(948, 82+i*25, value, value === '?' ? 'ro-t' : 'ro-a', 'end')));
  if (built >= 3) svg.append(text(278, 526, `KV pool ${fixed(mem.kvPool/1e9)} GB · ${n(mem.tokens)} paged slots`, 'hw-sub'));
  return svg;
}
function memoryBar(rect, mem, x, y, width, full) {
  const segments = full ? [[mem.weights,'sv-weights'],[mem.kvPool,'sv-kv'],[mem.overhead,'sv-overhead'],[mem.outside,'sv-outside']] : [[mem.weights,'sv-weights'],[M.GPU.bytes-mem.weights,'sv-outside']];
  let cursor=x;
  return segments.map(([bytes,cls])=>{const w=width*bytes/M.GPU.bytes;const el=rect(cursor,y,w,14,cls,0);cursor+=w;return el;});
}
function weightsClose() {
  const svg = svgBox(760, 186, 'FP16 parameter storage split across K, Q, V, output and feed-forward tensors');
  svg.append(T_(20,24,'checkpoint tensors → HBM','cu-t-a'));
  ['embed_tokens.weight','self_attn.{q,k,v,o}_proj','mlp.{gate,up,down}_proj','lm_head.weight'].forEach((label,i)=>{
    const x=20+(i%2)*370, y=42+Math.floor(i/2)*54;
    svg.append(s('rect',{x,y,width:350,height:36,rx:4,class:'cu-slot'}),T_(x+12,y+22,label,'cu-t'));
  });
  svg.append(T_(20,168,`${n(M.MODEL.params)} parameters × 2 B = ${unknown('weights', n(M.weightBytes()))} B`,'cu-t-a'));
  return svg;
}
function kvClose() {
  return h('div', {}, h('div',{class:'cu-chain'}, ['K','V'].map(label=>h('div',{},h('span',{text:`${label} · one token, all layers`}),h('strong',{text:`[${M.MODEL.layers}, ${M.MODEL.kvHeads}, ${M.MODEL.headDim}] FP16`})) )),pre(`2 × ${M.MODEL.layers} layers × ${M.MODEL.kvHeads} KV heads × ${M.MODEL.headDim} elements × 2 B\n= ${unknown('kv', n(M.ANSWERS.kv))} B per token`),cap(`GQA: ${M.MODEL.queryHeads} query heads share ${M.MODEL.kvHeads} KV heads. Queries are not stored in this cache.`));
}
function capacityClose() {
  const mem=M.memory(), svg=svgBox(760,150,'GPU memory divided into weights, KV pool, runtime and reserved margin');
  const segments=[[mem.weights,'weights','sv-weights'],[mem.kvPool,'KV pool','sv-kv'],[mem.overhead,'runtime','sv-overhead'],[mem.outside,'margin','sv-outside']];
  let x=20;
  segments.forEach(([bytes,label,cls])=>{const width=720*bytes/M.GPU.bytes; svg.append(s('rect',{x,y:32,width,height:35,class:cls})); x+=width;});
  svg.append(T_(20,20,'80 GB HBM · simulation budget','cu-t-b'),T_(20,95,'weights 16.06 GB', 'cu-t'),T_(200,95,'KV pool 51.94 GB', 'cu-t-a'),T_(400,95,'runtime 4 GB · margin 8 GB', 'cu-t'),T_(20,145,`floor(${n(mem.kvPool)} / ${n(mem.perToken)}) = ${unknown('capacity',n(mem.rawTokens))} token entries`,'cu-t-a'));
  return h('div',{},svg,cap('The executor budget excludes the margin. Real engines profile runtime overhead.'));
}
function phaseClose() {
  const svg=svgBox(760,150,'Prefill processes a prompt together, then decode appends positions one at a time');
  svg.append(T_(20,22,'PREFILL · prompt positions together','cu-t-b'),T_(400,22,'DECODE · one position per sequence','cu-t-b'));
  for(let i=0;i<8;i++) svg.append(s('rect',{x:20+i*38,y:36,width:31,height:28,rx:3,class:'cu-slot-on'}));
  for(let i=0;i<3;i++) svg.append(s('rect',{x:400+i*88,y:36,width:70,height:28,rx:3,class:'cu-slot'}),T_(435+i*88,55,'+1','cu-t','middle'));
  svg.append(T_(20,90,`${n(M.EXAMPLE.prompt)} tokens · ${fixed(M.prefillMs(M.EXAMPLE.prompt),1)} ms`,'cu-t-a'),T_(400,90,`${fixed(M.weightReadMs())} ms weight-only bound`,'cu-t-a'),T_(20,120,'2 × parameters × tokens / FLOPs','cu-t'),T_(400,120,'(weights + KV reads) / bandwidth','cu-t'));
  return h('div',{},svg,cap('Simulation: prefill writes KV and samples the first token. Each later decode iteration appends one position per active sequence.'));
}
function pagesClose() {
  const svg=svgBox(760,160,'Logical KV pages map to separate physical HBM blocks; the final block has eight unused slots');
  const physical=M.pagingExample().table.A.slice(0,3);
  physical.forEach((p,i)=>{
    svg.append(s('rect',{class:'cu-slot',x:20+i*180,y:18,width:164,height:34,rx:4}),T_(30+i*180,40,`logical ${i} → page ${p}`,'cu-t'));
  });
  svg.append(T_(20,78,`last logical page · ${M.ANSWERS.blocks-1} · offsets within a ${M.EXAMPLE.blockSize}-slot block`,'cu-t'));
  for(let i=0;i<M.EXAMPLE.blockSize;i++) svg.append(s('rect',{class:i<M.EXAMPLE.blockSize-M.ANSWERS.waste?'cu-slot-on':'cu-slot-empty',x:20+i*44,y:92,width:38,height:28,rx:2}),T_(39+i*44,111,String(i),'cu-t','middle'));
  svg.append(T_(20,148,`${n(M.EXAMPLE.prompt)} occupied slots · ${unknown('pages',`${M.ANSWERS.blocks} blocks · ${M.ANSWERS.waste} unused slots`)}`,'cu-t-a'));
  return h('div',{},svg,cap(`Allocator example above: B releases its pages; D takes four of them. When A grows, its next logical page maps to physical page ${M.pagingExample().table.A.at(-1)}. A's earlier KV stays in place. The grid samples physical blocks 56–71 and 126–133.`));
}
function speedClose() {
  const one=M.decodeStep([M.EXAMPLE.prompt]), svg=svgBox(760,140,'A shared weight pass and per-sequence KV reads feed a decode iteration');
  svg.append(s('rect',{x:20,y:25,width:290,height:44,rx:4,class:'cu-slot-on'}),T_(165,52,`${fixed(M.weightBytes()/1e9)} GB shared weights`,'cu-t','middle'),s('path',{d:'M310 47H375',class:'cu-axis'}),s('rect',{x:375,y:25,width:180,height:44,rx:4,class:'cu-slot'}),T_(465,52,'decode iteration','cu-t','middle'),s('path',{d:'M555 47H630',class:'cu-axis'}),T_(635,52,unknown('speed',`${fixed(M.weightReadMs())} ms`),'cu-t-a'),T_(20,105,`+ ${n(one.kvRead)} B KV for ${n(M.EXAMPLE.prompt)} cached positions → ${fixed(one.ms,4)} ms`,'cu-t'));
  return h('div',{},svg,cap(`Simulation at ${M.GPU.bandwidth/1e12} TB/s. The weight-only ceiling is ${unknown('speed',`${fixed(1000/M.weightReadMs())} tokens/s`)}; each sequence adds KV reads.`));
}
function trafficClose() {
  const run=M.simulate(cfg()), t=run.totals;
  const chosen=[run.events.find(e=>e.type==='admit'),run.events.find(e=>e.promptTokens && e.decoded.length),run.events.find(e=>e.type==='free')].filter(Boolean);
  return h('div',{}, metricsRow([['output tokens/s',Math.round(t.throughput),t.throughput>=M.TARGET.throughput?'ok':'bad'],['worst TTFT',`${Math.round(t.ttft)} ms`,t.ttft<=M.TARGET.ttft?'ok':'bad'],['streaming gap',`${fixed(t.maxGap,1)} ms`,t.maxGap<=M.TARGET.maxGap?'ok':'bad'],['peak / KV blocks',`${n(t.peakBlocks)} / ${n(run.memory.blocks)}`,'']]),pre(chosen.map(e=>`${fixed(e.clock,1).padStart(8)} ms  ${e.trace}`).join('\n')),h('details',{class:'sv-stream'},h('summary',{text:'Inspect the SSE format (fixed script)'}),pre(M.STREAM.map(text=>`data: ${JSON.stringify({choices:[{text}]})}\n`).join('\n')+'\ndata: [DONE]')),cap(`Simulation: ${M.TRAFFIC.length} requests arrive in three waves. ${M.TRAFFIC.filter(r=>r.prompt===7000).length} long prompts have 7,000 tokens; the others have 1,000. Outputs have 32 or 128 tokens in the fixed traffic spec. TTFT includes queueing, prefill and a fixed ${M.EXAMPLE.hostMs} ms host/network cost.`));
}
function quantClose() {
  return h('div',{},h('div',{class:'dt-wrap'},h('table',{class:'dt'},h('thead',{},h('tr',{},['weights / KV','KV B/token','whole contexts'].map(text=>h('th',{text})))),h('tbody',{},[['FP16 / FP16',M.memory()],['INT8 / FP16',M.memory({weightDtypeBytes:1})],['FP16 / FP8',M.memory({kvBytes:1})]].map(([label,m])=>h('tr',{},h('td',{text:label}),h('td',{text:n(m.perToken)}),h('td',{text:label==='FP16 / FP8'&&!solved('quantize')?'?':String(m.maxSeqs)})))))),cap(`Storage simulation at ${n(M.EXAMPLE.ctxLen)} total tokens per context. INT8 weight comparison omits scales and metadata. These are memory limits, separate from the scheduler's max-num-seqs.`));
}
let pythonHost;
function pythonBench(host,g) {
  host.append(pre(`Admission guard: reserve full contexts before admitting traffic.\npool = gpu_bytes × utilization − weights − overhead\nmax_batch = floor(pool / (ctx_len × KV_bytes_per_token))`));
  if (pythonHost) { host.append(pythonHost); return; }
  pythonHost=h('div'); host.append(pythonHost);
  pyCell(pythonHost,{id:'serving-budget',title:'Python · write the admission budget',prompt:'Implement both functions. ctx_len includes prompt and output. It is block-aligned here, so no page rounding is needed. Use integer floor division; weights stay FP16 in the FP8 test.',starter:`def kv_bytes_per_token(layers, kv_heads, head_dim, bytes):\n    return 0\n\ndef max_batch(gpu_bytes, weight_bytes, ctx_len, layers, kv_heads, head_dim,\n              bytes, overhead_bytes, utilization):\n    return 0\n\nprint(kv_bytes_per_token(32, 8, 128, 2))\n`,data:M.PY_DATA,tests:M.PY_TESTS,solution:M.PY_SOLUTION,onPass:()=>g.pass('python',{passed:true})});
}
const add=(glyph,name,runs,conf)=>[{glyph,name,runs,conf}];
const numTask=(id,prompt,unit,hint)=>(ui)=>ui.number({prompt,placeholder:unit,unit,check:value=>C[id]({value}),hint});
const STEPS=[
  {id:'kit',phase:'kit',kicker:'Before you start',title:'Check your server kit',minutes:1,view:'board',lead:'You will assemble an inference server, from model weights to streamed responses. Budget its memory, write an admission check, then tune the scheduler for mixed traffic. <b>This is a simulation.</b>',parts:()=>[
    {title:'Hardware + model',n:2},{glyph:'gpu',name:'One example GPU',runs:'80 GB HBM · 2.0 TB/s · 200 TFLOP/s (simulated)',hw:'weights'},
    {glyph:'model',name:'Llama 3 8B shape',runs:'8.03B rounded params · 32 layers · 8 KV heads · head_dim 128',hw:'kv'},
    {title:'Traffic',n:1},{glyph:'nic',name:'Fixed token-count workload',runs:'24 requests · short and long prompts · streamed output',hw:'pool'}],closeLabel:'THE BUILD',close:()=>close('queue → tokenizer → scheduler → GPU\n        weights + KV pages + SMs\nsampler → detokenizer → SSE → client','Token counts are fixed inputs; this lesson does not run a tokenizer or generate language.'),task:'predict',nextLabel:'Load the model'},
  {id:'weights',phase:'build',kicker:'GPU · HBM',title:'Load the weights',minutes:2,view:'board',on:['weights'],lead:'Load the model tensors into HBM with <code>--dtype half</code>. Our rounded parameter count is <b>8.03 billion</b>; FP16 stores each parameter in 2 bytes. The weights are shared by all requests.',adds:add('model','FP16 model weights','checkpoint tensors → GPU memory','--dtype half'),closeLabel:'CLOSE-UP · CHECKPOINT STORAGE',close:weightsClose,mission:'weights',task:numTask('weights','How many decimal GB do the weights occupy? Give two decimal places.','GB',v=>Math.abs(v-32.12)<.1?'32.12 GB uses FP32: 4 bytes per parameter. FP16 uses 2.':Math.abs(v-8.03)<.1?'8.03 counts billions of parameters, not bytes. Multiply by 2 bytes.':'Use 8.03 × 2. Decimal GB means one billion bytes.'),after:()=>`8.03 billion × 2 = <b>${M.ANSWERS.weightsGB} GB</b>. These tensors stay resident; a decode iteration streams them through the SMs again.`},
  {id:'kv',phase:'build',kicker:'GPU · HBM',title:'Size the KV entry',minutes:3,view:'board',on:['kv'],lead:'Add the per-layer key and value cache. This grouped-query model has <b>8 KV heads</b> shared by 32 query heads, with 128 elements per head. Store both K and V for every token at every layer.',adds:add('matrix','Per-token K + V','32 layers · 8 KV heads · head_dim 128','use_cache=True\n# FP16: 2 bytes per element'),closeLabel:'CLOSE-UP · ONE CACHED TOKEN',close:kvClose,mission:'kv',task:numTask('kv','How many bytes does one token add across all layers in FP16?','bytes',v=>v===65536?'That stores only K or V. The cache needs both: multiply by 2.':v===524288?'That uses 32 query heads. GQA caches only the 8 KV heads.':'Multiply 2 (K and V) × 32 layers × 8 KV heads × 128 × 2 bytes.'),after:()=>`2 × 32 × 8 × 128 × 2 = <b>${n(M.ANSWERS.kv)} B/token</b>. The ${n(M.EXAMPLE.prompt)}-token prompt needs ${n(M.ANSWERS.kv*M.EXAMPLE.prompt)} bytes before later decode positions grow the cache.`},
  {id:'capacity',phase:'build',kicker:'Scheduler · memory budget',title:'Reserve room for the cache',minutes:3,view:'board',on:['pool'],lead:'Set <code>--gpu-memory-utilization 0.9</code>, leaving an executor budget of 72 GB. Subtract the weights and a simulated 4 GB for runtime and activations. The scheduler must admit requests within what remains.',adds:add('db','KV pool budget','weights, overhead and safety margin counted separately','--gpu-memory-utilization 0.9'),closeLabel:'CLOSE-UP · MEMORY LEDGER',close:capacityClose,mission:'capacity',task:numTask('capacity','Before rounding into pages, how many whole token entries fit in the KV pool? Round down.','tokens',v=>v===Math.floor(80e9/M.ANSWERS.kv)?'That spends all HBM on KV. Subtract the margin, weights and overhead first.':v===Math.floor((72e9-M.weightBytes())/M.ANSWERS.kv)?'That forgets the 4 GB runtime and activation reservation.':'The KV pool is 51.94 billion bytes. Divide by 131,072 and round down.'),after:()=>`(80 × 0.9 − 16.06 − 4) GB = <b>51.94 GB</b>. floor(51,940,000,000 / 131,072) = <b>${n(M.ANSWERS.capacity)} tokens</b> before page rounding.`},
  {id:'phase',phase:'build',kicker:'CPU tokenizer → GPU SMs',title:'Separate prefill from decode',minutes:3,view:'board',on:['sm','tokenizer'],lead:'Add <code>tokenizer.encode()</code> and the transformer forward pass on the SMs. Prefill processes the prompt positions together and writes their KV entries. Decode then processes one new position per active sequence.',adds:add('gpu','Tokenizer + transformer forward','CPU: text → IDs · GPU: IDs + context → logits','tokenizer.encode(prompt)\nmodel(input_ids, use_cache=True)'),closeLabel:'CLOSE-UP · TWO TIME MODELS',close:phaseClose,mission:'phase',task:ui=>ui.choice({prompt:'For a long prompt followed by small-batch generation, which resources limit these phases in the simulation?',options:[['decode-compute','Prefill: memory · decode: compute','That reverses the work. Prefill multiplies many token vectors; decode repeatedly reads the shared weights.'],['both-compute','Both phases: compute','One decode sequence does little arithmetic per weight byte. The bandwidth bound wins.'],['prefill-compute','Prefill: compute · decode: memory'],['both-memory','Both phases: memory','The long prompt reuses each weight across many positions, making arithmetic the limit.']],check:choice=>C.phase({choice})}),after:()=>`Prefill: 2 × ${n(M.MODEL.params)} × ${n(M.EXAMPLE.prompt)} / ${n(M.GPU.flops)} = <b>${fixed(M.prefillMs(M.EXAMPLE.prompt),1)} ms</b>. Its last-position logits produce the first token; no extra decode iteration is required for that token. These times are a simulation.`},
  {id:'pages',phase:'build',kicker:'GPU · PagedAttention',title:'Page the KV cache',minutes:3,view:'board',on:['kv'],lead:'Add a page table and <code>--block-size 16</code>. Logical KV pages can map to separate physical blocks, so a growing request does not need one large contiguous allocation. Only its final page can be partly empty.',adds:add('db','KV page table','logical pages → physical HBM blocks','--block-size 16'),closeLabel:'CLOSE-UP · LOGICAL → PHYSICAL',close:pagesClose,mission:'pages',task:numTask('pages','A request has 1,000 cached tokens. How many 16-token blocks must the allocator provide?','blocks',v=>v===62?'62 blocks hold only 992 tokens, so 8 tokens have nowhere to go. Round up.':v===62.5?'A half block cannot be allocated. Round 62.5 up to a whole block.':'Use ceil(1000 / 16). The final block may be partly empty.'),after:()=>`ceil(1000 / 16) = <b>${M.ANSWERS.blocks} blocks</b>. They hold ${M.pageLayout(1000).slots} slots: ${M.ANSWERS.waste} remain unused. The full pool fits ${n(M.memory().blocks)} blocks, or ${n(M.memory().tokens)} paged token slots.`},
  {id:'speed',phase:'build',kicker:'GPU · sampler',title:'Bound the decode speed',minutes:3,view:'board',on:['sm','sampler'],lead:'Add a sampler to choose a token ID from the output logits. Before sampling, each small-batch decode iteration streams the resident weights through the SMs. Estimate the weight-read cost from bandwidth, then compare it with the KV-aware estimate.',adds:add('dice','Logits → token sampler','sampling and RNG costs omitted from the timing simulation','SamplingParams(temperature=0.0)'),closeLabel:'CLOSE-UP · ONE WEIGHT PASS',close:speedClose,mission:'speed',task:numTask('speed','Ignoring KV reads and other costs, how many milliseconds does one weight pass take? Give two decimal places.','ms',v=>v<.1?'That value is in seconds. Convert seconds to milliseconds by multiplying by 1,000.':v>100?'FLOPs count arithmetic. This bound uses weight bytes divided by memory bandwidth.':'16.06 GB / 2,000 GB/s × 1,000 = milliseconds.'),after:()=>`16.06 / 2,000 × 1,000 = <b>${fixed(M.ANSWERS.decodeMs)} ms</b>. That is a weight-only ceiling of ${fixed(1000/M.ANSWERS.decodeMs)} tokens/s for one sequence. Batching shares this weight pass; KV reads increase with the active contexts.`},
  {id:'python',phase:'build',kicker:'Scheduler · admission guard',title:'Write the memory guard',minutes:5,view:'bench',where:'CPU · admission check',lead:'Add a capacity check before admitting full contexts. Implement <code>kv_bytes_per_token</code> and <code>max_batch</code> using the budget you derived. The context length includes both prompt and output positions.',adds:add('cpu','Admission budget function','five checks: FP16, GQA, FP8 and two batch budgets','max_num_seqs <= max_batch(...)'),bench:pythonBench,mission:'python',task:ui=>ui.code({prompt:'Write both Python functions on the left and run all five checks. The test contexts are block-aligned.',fallback:[['KV = 2 × layers × KV heads × dim × bytes; batch = floor((GPU × utilization − weights − overhead) / (context × KV))',true],['KV = layers × KV heads × dim × bytes; batch uses all HBM',false,'This forgets V or K and spends the weight and overhead budget on cache.'],['KV uses query heads; batch rounds capacity up',false,'GQA stores KV heads, not query heads. Rounding up admits a sequence that cannot fit.']]}),after:()=>`floor(51,940,000,000 / (8,192 × 131,072)) = <b>${M.memory().maxSeqs}</b> full ${n(M.EXAMPLE.ctxLen)}-token contexts. FP8 KV admits ${M.ANSWERS.fp8Seqs}; weights stay FP16. This is a storage bound, not a latency promise.`},
  {id:'batch',phase:'build',kicker:'Scheduler → streamed responses',title:'Batch the traffic',minutes:6,view:'board',on:['pool','stream'],lead:'Enable continuous admission, then connect the detokenizer and SSE response stream. A finished request releases its pages and slot; a waiting request can enter on the next iteration. Chunked prefill lets decode progress while long prompts are processed.',adds:()=>add('loop','Continuous scheduler + SSE','live model trace · fixed token-count traffic',`--max-num-seqs ${cfg().maxSeqs}\n--max-num-batched-tokens ${cfg().chunked?M.EXAMPLE.chunk:M.EXAMPLE.ctxLen}\n${cfg().chunked?'--enable-chunked-prefill':'--disable-chunked-prefill'}\n# detokenize IDs, then stream SSE`),closeLabel:'CLOSE-UP · TRAFFIC TRACE',close:trafficClose,mission:'batch',onReveal:g=>Object.assign(g.settings,{maxSeqs:32,chunked:true}),task:(ui,g)=>ui.selects({prompt:`Keep streaming gaps ≤ ${M.TARGET.maxGap} ms, worst TTFT ≤ ${n(M.TARGET.ttft)} ms, output ≥ ${M.TARGET.throughput} tokens/s, and enough KV for every allowed full context. Results are a simulation.`,selects:[{label:'max-num-seqs',options:M.OPTIONS.maxSeqs.map(v=>[v,`max-num-seqs=${v}`]),get:()=>cfg().maxSeqs,set:v=>g.settings.maxSeqs=v,parse:Number},{label:'chunked-prefill',options:[['off','chunked prefill: off'],['on','chunked prefill: on']],get:()=>cfg().chunked?'on':'off',set:v=>g.settings.chunked=v==='on'}],check:()=>M.batchingVerdict(cfg())}),after:()=>{const r=M.simulate(cfg());return `Your settings produce <b>${Math.round(r.totals.throughput)} tokens/s</b> with worst TTFT <b>${Math.round(r.totals.ttft)} ms</b>. The longest streaming gap is ${fixed(r.totals.maxGap,1)} ms; peak occupancy is ${n(r.totals.peakBlocks)} blocks. The ${cfg().maxSeqs} full-context admission slots also fit the memory budget. These are simulated results.`;}},
  {id:'quantize',phase:'scale',kicker:'GPU · KV precision',title:'Halve each KV element',minutes:1,view:'board',on:['kv'],lead:'Change only KV storage from FP16 to FP8. Keep the weights, context length and reservations fixed. This storage simulation omits scaling metadata; real FP8 kernels and accuracy need evaluation.',adds:()=>add('matrix','FP8 KV storage','weights remain FP16 · scheduler limit stays your choice',`--kv-cache-dtype ${cfg().kvDtype}`),closeLabel:'CLOSE-UP · PRECISION VS CAPACITY',close:quantClose,mission:'quantize',task:(ui,g)=>ui.number({prompt:`FP16 KV fits ${M.memory().maxSeqs} full ${n(M.EXAMPLE.ctxLen)}-token contexts. How many fit with FP8 KV? Your answer applies FP8 to the exported config.`,placeholder:'sequences',unit:'sequences',check:value=>C.quantize({value}),hint:v=>v===M.memory({weightDtypeBytes:1}).maxSeqs?'55 comes from INT8 weights. Here the weights stay FP16; halve KV bytes instead.':v===48?'48 is the FP16 result. FP8 uses one byte per KV element instead of two.':'Keep the 51.94 GB KV pool. Divide by 8192 × 65,536 bytes and round down.',onTry:value=>{if(C.quantize({value})){g.settings.kvDtype='fp8';g.saveSettings();}}}),onReveal:g=>{g.settings.kvDtype='fp8';},after:()=>`floor(51,940,000,000 / (8192 × 65,536)) = <b>${M.ANSWERS.fp8Seqs} contexts</b>, ${M.ANSWERS.fp8Seqs-M.memory().maxSeqs} more than FP16. INT8 weights with FP16 KV would fit only ${M.memory({weightDtypeBytes:1}).maxSeqs}. The exported max-num-seqs remains your traffic choice.`},
  {id:'done',phase:'done',kicker:'Done',title:'Keep your serving config',minutes:0,view:'board',lead:'You sized the weights and KV pool, paged the cache, wrote an admission guard and tuned the scheduler. Your command uses the batching settings you chose and the FP8 cache you budgeted. The stats below are for the fixed traffic simulation.',closeLabel:'YOUR FINAL TRAFFIC SIMULATION',close:trafficClose,task:'done'},
];
createGuide({M,steps:STEPS,board,init:g=>{G=g;Object.assign(g.settings,M.configOf(g.settings));},done:{artifactTitle:'Your vLLM-style command',artifact:()=>M.serveCommand(cfg()),stats:()=>{const r=M.simulate(cfg());return [['allowed seqs',cfg().maxSeqs],['output tok/s',Math.round(r.totals.throughput)],['worst TTFT',`${Math.round(r.totals.ttft)} ms`]];}}});
