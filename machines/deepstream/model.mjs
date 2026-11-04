// Fixed-cost, two-second discrete-event simulation. No SDK, GPU or network runs.
export const DEFAULTS = { cameras: 8, fps: 30, batch: 1, timeout: 40, interval: 0, down: false, tracker: true, budget: 1000 };
export const COST = { decode: 0.35, alpha: 5, beta: 1.2, track: 0.08, analytics: 0.04, metadata: 0.03, queue: 180 };
export const OPTIONS = { cameras: Array.from({ length: 16 }, (_, i) => i + 1), fps: [10, 15, 30, 60], batch: [1, 2, 4, 8, 16], timeout: [10, 40, 100, 250], interval: [0, 1, 2, 3, 4], budget: [400, 700, 1000] };
export function configOf(input = {}) {
  input = input && typeof input === 'object' ? input : {};
  const c = { ...DEFAULTS };
  for (const [key, values] of Object.entries(OPTIONS)) if (values.includes(Number(input[key])) && input[key] !== null && input[key] !== '') c[key] = Number(input[key]);
  for (const key of ['down', 'tracker']) if (typeof input[key] === 'boolean') c[key] = input[key];
  return c;
}
export function encode(input) { const c = configOf(input); return new URLSearchParams(Object.entries(c).filter(([k,v]) => v !== DEFAULTS[k]).map(([k,v]) => [k,String(v)])).toString(); }
export function decode(search) { const p = new URLSearchParams(search); const c = Object.fromEntries(p); for (const k of ['down','tracker']) c[k] = p.get(k) === 'true' ? true : p.get(k) === 'false' ? false : DEFAULTS[k]; return configOf(c); }
export function iou(a,b) {
  const w = Math.max(0, Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
  const h = Math.max(0, Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  const intersection = w*h; return intersection / (a.w*a.h+b.w*b.h-intersection);
}
// Fixed script: two separated lanes, one rightward and one leftward crossing.
export function objectsAt(time) { return [ { truth: 0, x: 12 + time*.03, y: 15, w: 18, h: 16 }, { truth: 1, x: 70-time*.026, y: 55, w: 18, h: 16 } ]; }
// Greedy IoU association to constant-velocity predictions; truth is never used here.
export function associate(previous, detections, time, nextId) {
  const used = new Set(); const tracks = [];
  for (const det of detections) {
    let best = -1, score = .2;
    previous.forEach((t,i) => { const dt = time-t.time; const predicted = { ...t.box, x:t.box.x+t.vx*dt, y:t.box.y+t.vy*dt }; const s = iou(predicted,det); if (!used.has(i) && s>score) { best=i; score=s; } });
    const old = previous[best]; if (old) used.add(best);
    const dt = old ? time-old.time : 0;
    tracks.push({ id: old ? old.id : nextId++, box: { x:det.x,y:det.y,w:det.w,h:det.h }, time, vx: dt ? (det.x-old.box.x)/dt : 0, vy:dt ? (det.y-old.box.y)/dt : 0 });
  }
  return { tracks, nextId };
}
export function simulate(input = {}) {
  const config = configOf(input), c = config, events = [], batches = [], frames = [];
  let decoder = 0;
  for (let f=0; f<c.fps*2; f++) for (let camera=1; camera<=c.cameras; camera++) {
    if (c.down && camera===c.cameras) continue;
    const capture=f*1000/c.fps; decoder=Math.max(capture,decoder)+COST.decode;
    frames.push({ camera, frame:f, capture, ready:decoder });
  }
  // Arrival-order mux approximates synchronized round-robin sources.
  // A source may supply another frame; timeout starts at the first queued frame.
  const pending=frames.slice();
  while(pending.length) {
    const first=pending[0].ready, deadline=first+c.timeout, selected=[];
    for (const f of pending) {
      if(f.ready>deadline || selected.length===c.batch) break;
      selected.push(f);
    }
    const full=selected.length===c.batch, release=full ? selected.at(-1).ready : deadline;
    const chosen=new Set(selected); for(let i=pending.length-1;i>=0;i--) if(chosen.has(pending[i])) pending.splice(i,1);
    batches.push({ id:batches.length, frames:selected, release, wait:release-first, timeout:!full });
  }
  // Partial-batch releases may interleave: service in release order.
  batches.sort((a,b)=>a.release-b.release || a.id-b.id);
  let gpu=0, work=0, demand=0, dropped=0, processed=0, inferred=0, crossings=0, switches=0, maxLatency=0, maxWait=0, maxQueue=0;
  const trackers = Array.from({length:c.cameras+1},()=>({ tracks:[],nextId:1,lastTruth:new Map(),sides:new Map() }));
  const metadata=[];
  const push=(clock,type,station,fields,trace)=>events.push({...fields,clock,type,station,trace});
  for (const [n,b] of batches.entries()) {
    const detect=n%(c.interval+1)===0, count=b.frames.length;
    const infer=detect ? COST.alpha+COST.beta*count : 0;
    const track=c.tracker ? COST.track*2*count : 0;
    const required=infer+track; demand+=required; maxWait=Math.max(maxWait,b.wait);
    const start=Math.max(gpu,b.release), queued=start-b.release; maxQueue=Math.max(maxQueue,queued);
    const ids=b.frames.map(f=>f.camera);
    push(b.release,'batch','batch',{batch:n,size:count,wait:b.wait,timedOut:b.timeout,cameras:ids},`Batch ${n+1}: ${count}/${c.batch} frames; ${b.wait.toFixed(1)} ms mux wait${b.timeout ? ' · timeout released it' : ''}.`);
    if(queued>COST.queue) { dropped+=count; push(b.release,'drop','infer',{batch:n,size:count},`Dropped ${count} frames: GPU queue would exceed ${COST.queue} ms.`); continue; }
    // budget is available GPU milliseconds per wall-clock second.
    const end=start+required*1000/c.budget; gpu=end; work+=required; processed+=count; if(detect) inferred+=count;
    push(Math.max(0,b.release-COST.decode),'decode','decode',{batch:n,size:count},`${count} frames decoded at ${COST.decode} ms each on a serial decoder.`);
    push(start,'infer','infer',{batch:n,size:count,detect,cost:infer,queue:queued},detect ? `Detector: ${COST.alpha} + ${COST.beta} × ${count} = ${infer.toFixed(1)} GPU ms.` : `Detector skipped batch ${n+1}; tracker supplies positions.`);
    const snapshots=[]; let added=0;
    for(const f of b.frames) {
      const s=trackers[f.camera], truth=objectsAt(f.capture); let output=[];
      if(detect) {
        const result=associate(c.tracker?s.tracks:[],truth,f.capture,s.nextId); s.tracks=result.tracks; s.nextId=result.nextId;
        output=s.tracks.map(t=>({...t,box:{...t.box}}));
        truth.forEach((o,i)=> { const id=output[i].id; if(s.lastTruth.has(o.truth) && s.lastTruth.get(o.truth)!==id) switches++; s.lastTruth.set(o.truth,id); });
      } else if(c.tracker) output=s.tracks.map(t=>({...t,box:{...t.box,x:t.box.x+t.vx*(f.capture-t.time),y:t.box.y+t.vy*(f.capture-t.time)}}));
      for(const t of output) {
        const side=t.box.x+t.box.w/2>=50; const old=s.sides.get(t.id);
        if(old!==undefined && old!==side) { crossings++; added++; }
        s.sides.set(t.id,side);
      }
      const latency=end+COST.analytics*count+COST.metadata*count-f.capture; maxLatency=Math.max(maxLatency,latency);
      const meta={source_id:f.camera,frame_num:f.frame,batch_id:n,inferred:detect,objects:output.map(t=>({object_id:t.id,...t.box})),crossings};
      metadata.push(meta); if(f.camera===1) snapshots.push(meta);
    }
    push(end,'track','track',{batch:n,snapshots,switches},`IoU tracker: ${switches} ID switches so far; ${c.tracker?'prediction between detector runs':'tracker disabled'}.`);
    push(end+COST.analytics*count,'analytics','analytics',{batch:n,crossings,added},`${added} new line crossings; ${crossings} counted so far.`);
    push(end+(COST.analytics+COST.metadata)*count,'metadata','metadata',{batch:n,processed,dropped,crossings,record:snapshots.at(-1)||metadata.at(-1)},`Metadata for ${count} frames fans out to display, store and message broker.`);
  }
  const truth=(c.cameras-(c.down?1:0))*2;
  const totals={captured:frames.length,processed,dropped,batches:batches.length,inferred,crossings,truth,switches,work,demand,utilization:demand/2/c.budget,maxLatency,maxWait,maxQueue,throughput:processed/2,active:c.cameras-(c.down?1:0),duration:2000,clock:Math.max(2000,gpu),timeouts:batches.filter(b=>b.timeout).length};
  push(Math.max(totals.clock,...events.map(e=>e.clock))+10,'exit','metadata',{...totals},`Finished: ${processed} frames, ${dropped} drops, ${crossings}/${truth} crossings, ${switches} ID switches.`);
  events.sort((a,b)=>a.clock-b.clock); events.forEach((e,index)=>e.index=index);
  return {config,events,totals,metadata};
}
export const MISSIONS=[
 {id:'real-time',title:'Real time on 8 cameras',goal:'Process 8 cameras at 30 fps with zero frame drops.',hint:'Amortize the detector’s 5 ms setup across a batch, then skip detector batches.',try:{cameras:8,fps:30,batch:8,interval:2},check:r=>r.config.cameras===8&&r.config.fps===30&&!r.config.down&&r.totals.dropped===0&&r.totals.processed===480&&r.totals.utilization<=1},
 {id:'camera-down',title:'Break a camera',goal:'Lose camera 8 and release partial batches with at most 40 ms mux wait.',hint:'Use 8 cameras, batch 8, timeout 10 ms and interval 2; switch Camera down on.',try:{cameras:8,fps:30,batch:8,interval:2,timeout:10,down:true},check:r=>r.config.down&&r.config.cameras===8&&r.config.batch===8&&r.config.timeout<=40&&r.totals.timeouts>0&&r.totals.processed>0&&r.totals.dropped===0&&r.totals.maxWait<=r.config.timeout+1e-6},
 {id:'safe-skip',title:'Skip frames safely',goal:'Skip at least two detector batches while keeping every object ID.',hint:'Tracker on, interval 2, batch 8; the two separated paths are easy to associate.',try:{cameras:8,fps:30,batch:8,interval:2,tracker:true},check:r=>r.config.interval>=2&&r.config.tracker&&r.totals.switches===0&&r.totals.dropped===0&&r.totals.inferred>0&&r.totals.crossings===r.totals.truth},
 {id:'crossings',title:'Count the crossings',goal:'Match every scripted crossing with no frame drops or ID switches.',hint:'The script has two crossings per live camera; stable IDs prevent double counts.',try:{cameras:4,fps:30,batch:4,interval:1,tracker:true},check:r=>r.totals.truth>0&&r.totals.crossings===r.totals.truth&&r.totals.switches===0&&r.totals.dropped===0}
];
