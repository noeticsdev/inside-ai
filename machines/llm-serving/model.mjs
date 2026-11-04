// Fixed-cost teaching simulation. The KV pool is separate from model weights.
export const DEFAULTS = { requests: 8, prompt: 1024, output: 32, cache: true, batching: 'continuous', memory: 24 };
export const OPTIONS = { requests: Array.from({length:16}, (_,i)=>i+1), prompt: [1024,8192,32768], output: [16,32,64], cache: [true,false], batching: ['static','continuous'], memory: [24,48,80] };
export const KV_BYTES_PER_TOKEN = 2 * 32 * 8 * 128 * 2;
export function configOf(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  return Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, OPTIONS[k].includes(input[k]) ? input[k] : DEFAULTS[k]]));
}
export function simulate(input = {}) {
  const config = configOf(input), events = [];
  const req = Array.from({length:config.requests}, (_,i) => ({ id:i+1, length: Math.max(1, Math.round(config.output * (i % 2 ? 1 : .25))), done:0, first:null, end:null }));
  const waiting = req.slice(), active = [];
  let clock=0, compute=0, peak=0, preemptions=0, produced=0;
  const capacity = config.memory * 1e9;
  const reserve = r => config.cache ? (config.prompt + r.length) * KV_BYTES_PER_TOKEN : 0;
  const push = (type, station, trace, extra={}) => events.push({index:events.length,type,station,trace,clock,active:active.map(r=>r.id), waiting:waiting.length, produced, ...extra});
  // Requests that cannot fit are deferred; count each request once, not each retry.
  const deferred = new Set();
  while (waiting.length || active.length) {
    if (config.batching === 'continuous' || active.length === 0) {
      while (waiting.length && active.length < 8) {
        const r = waiting[0], used = active.reduce((s,x)=>s+reserve(x),0);
        if (used + reserve(r) > capacity) {
          if (!deferred.has(r.id)) { deferred.add(r.id); preemptions++; push('defer','memory',`Request ${r.id} waits for KV space.`,{kv:used}); }
          break;
        }
        waiting.shift(); active.push(r);
        const cost = config.prompt * .02; clock += cost; compute += config.prompt;
        peak = Math.max(peak,used+reserve(r));
        push('prefill','prefill',`Request ${r.id} prefills ${config.prompt} prompt tokens.`,{kv:used+reserve(r)});
      }
    }
    if (!active.length) throw new Error('A single request exceeds the KV pool');
    const cost = (8 + .5 * active.length) * (config.cache ? 1 : (config.prompt / 128 + 1));
    clock += cost;
    for (const r of active) { compute += config.cache ? 1 : config.prompt+r.done+1; r.done++; produced++; if (r.first === null) r.first=clock; if (r.done === r.length) r.end=clock; }
    const kv = active.reduce((s,r)=>s+reserve(r),0);
    push('decode','batch',`The batch stamps ${active.length} token${active.length===1?'':'s'}.`,{kv});
    for (let i=active.length-1;i>=0;i--) if (active[i].end !== null) active.splice(i,1);
  }
  const sorted = req.map(r=>r.end).sort((a,b)=>a-b);
  const totals = { tokens:produced, clock, throughput:produced/clock*1000, ttft:Math.max(...req.map(r=>r.first)), p50:sorted[Math.floor((sorted.length-1)/2)], kvPeak:peak, budget:capacity, preemptions, compute, requests:req.map(r=>({id:r.id,first:r.first,end:r.end,length:r.length})) };
  push('exit','batch',`All ${config.requests} requests have finished.`,{kv:0});
  return {config,events,totals};
}
export function encode(input) { const c=configOf(input), p=new URLSearchParams(); for (const k of Object.keys(c)) if (c[k]!==DEFAULTS[k]) p.set(k,String(c[k])); return p.toString(); }
export function decode(search) { const p=new URLSearchParams(search), input={}; for(const k of Object.keys(DEFAULTS)) { const v=p.get(k); if(v!==null) input[k]=typeof DEFAULTS[k]==='number'?Number(v):typeof DEFAULTS[k]==='boolean'?(v==='true'?true:v==='false'?false:null):v; } return configOf(input); }
export const MISSIONS = [
 {id:'cache',title:'Feel the cache',goal:'Switch the KV cache off and make compute at least five times the cached run.',hint:'Keep the same workload and switch Cache off.',try:{...DEFAULTS,cache:false},check:r=>!r.config.cache && r.totals.compute >= 5*simulate({...r.config,cache:true}).totals.compute},
 {id:'fill',title:'Fill the GPU',goal:'Make a request wait because the KV pool is full.',hint:'Use long prompts and the 24 GB pool.',try:{...DEFAULTS,requests:16,prompt:32768},check:r=>r.totals.preemptions>0},
 {id:'continuous',title:'Continuous wins',goal:'Use continuous batching to beat static throughput on the same workload.',hint:'Mixed short and long outputs leave holes in a static batch.',try:{...DEFAULTS,batching:'continuous',requests:12},check:r=>r.config.batching==='continuous' && r.totals.throughput>simulate({...r.config,batching:'static'}).totals.throughput},
 {id:'tune',title:'Latency vs throughput',goal:'Keep the slowest first token under 200 ms and throughput above 200 tokens/s.',hint:'Use a short prompt and a small queue.',try:{...DEFAULTS,requests:4},check:r=>r.totals.ttft<200 && r.totals.throughput>200},
];
