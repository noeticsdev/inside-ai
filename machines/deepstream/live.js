const root=document.querySelector('[data-ia-machine]');
const $=s=>root.querySelector(s), svg=$('[data-ie-svg]'),layer=svg.querySelector('[data-layer]'),stage=$('[data-ia-stage]');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const nodes=Object.fromEntries(D.items.map(i=>[i.id,svg.querySelector(`[data-i="${i.id}"]`)]));
const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
const state={config:M.decode(location.search),sim:null,beats:[],bi:0,elapsed:0,playing:false,done:false,shown:-1,traceIndex:-1,pose:{x:D.STOPS.decode,head:0,size:1,station:'',objects:[],batch:-1,stamped:false,tracked:false,crossings:0},explode:{target:0,shares:{}}};
for(const asm of Object.keys(D.EXPLODE))state.explode.shares[asm]={x:0,v:0};
function beatsFor(run){
 const ids=run.events.filter(e=>e.type==='batch').map(e=>e.batch);
 const samples=new Set([ids[0],ids[1],ids[2],ids[Math.floor(ids.length/3)],ids[Math.floor(ids.length*2/3)],ids.at(-1)]);
 const firstDrop=run.events.find(e=>e.type==='drop');if(firstDrop)samples.add(firstDrop.batch);
 const crossing=run.events.find(e=>e.type==='analytics'&&e.added>0);if(crossing)samples.add(crossing.batch);
 return run.events.filter(e=>e.type==='exit'||samples.has(e.batch)).map(e=>({event:e,to:{x:D.STOPS[e.station]??D.STOPS.metadata,head:e.station==='infer'&&e.detect?-12:0},duration:.24}));
}
function updateUrl(){const p=new URLSearchParams(M.encode(state.config));if(document.documentElement.classList.contains('iso-nolabels'))p.set('labels','0');const q=p.toString();history.replaceState(null,'',location.pathname+(q?'?'+q:'')+location.hash);}
function load(input){
 state.config=M.configOf(input);state.sim=M.simulate(state.config);state.beats=beatsFor(state.sim);
 Object.assign(state,{bi:0,elapsed:0,playing:false,done:false,shown:-1,traceIndex:-1,pose:{x:D.STOPS.decode,head:0,size:Math.min(state.config.batch,16),station:'',objects:[],batch:-1,stamped:false,tracked:false,crossings:0}});
 root.querySelectorAll('[data-config]').forEach(el=>{const v=state.config[el.dataset.config];if(el.type==='checkbox')el.checked=v;else el.value=String(v);});
 updateUrl();showReadouts(false);$('[data-ds-status]').textContent='Predict, then Run. Motion follows sampled batches; totals include every frame.';$('[data-ds-meta]').textContent='Run to inspect a frame’s metadata.';draw();sync();
}
function showReadouts(done){const t=state.sim.totals;const values={gpu:`${(t.utilization*100).toFixed(1)}%`,throughput:done?`${t.throughput} / ${state.config.cameras*state.config.fps}`:'—',drops:done?String(t.dropped):'—',latency:done?`${t.maxLatency.toFixed(1)} ms`:'—',wait:done?`${t.maxWait.toFixed(1)} ms`:'—',ids:done?String(t.switches):'—',count:done?`${t.crossings} / ${t.truth}`:'—',infer:done?`${t.inferred} / ${t.processed}`:'—'};for(const[k,v]of Object.entries(values))$(`[data-ro="${k}"]`).textContent=v;$('[data-ro="gpu"]').classList.toggle('ds-overload',t.utilization>1);}
function begin(beat){const ev=beat.event;beat.from={x:state.pose.x,head:state.pose.head};state.pose.station=ev.station;state.shown=ev.index;state.pose.batch=ev.batch??state.pose.batch;
 if(ev.size)state.pose.size=ev.size;
 if(ev.type==='decode'||ev.type==='batch'){state.pose.stamped=false;state.pose.tracked=false;}
 if(ev.type==='infer')state.pose.stamped=Boolean(ev.detect);
 if(ev.type==='track')state.pose.tracked=Boolean(ev.snapshots?.some(s=>s.objects.length));
 if(typeof ev.crossings==='number')state.pose.crossings=ev.crossings;
 for(let i=state.traceIndex+1;i<=ev.index;i++)IA.trace(state.sim.events[i].trace);state.traceIndex=ev.index;
 if(ev.snapshots?.length)state.pose.objects=ev.snapshots.at(-1).objects;
 if(ev.record)$('[data-ds-meta]').textContent=JSON.stringify(ev.record,null,2);
 $('[data-ds-status]').textContent=ev.trace;
}
function complete(){state.done=true;state.playing=false;showReadouts(true);const t=state.sim.totals;const text=`${t.processed} frames processed · ${t.dropped} dropped · ${t.crossings}/${t.truth} crossings · ${t.switches} ID switches.`;$('[data-ds-status]').textContent=text;$('[data-ia-live]').textContent=text;IA.ran(state.sim);sync();}
function advance(dt,single=false){let left=dt;while(left>0&&state.bi<state.beats.length){const b=state.beats[state.bi];if(!state.elapsed)begin(b);const used=Math.min(left,b.duration-state.elapsed);state.elapsed+=used;left-=used;const t=state.elapsed/b.duration,e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;state.pose.x=b.from.x+(b.to.x-b.from.x)*e;state.pose.head=b.from.head+(b.to.head-b.from.head)*e;if(state.elapsed>=b.duration-1e-9){state.bi++;state.elapsed=0;if(single){state.playing=false;break;}}}
 if(state.bi>=state.beats.length&&!state.done)complete();}
let lastOrder='',pills='';
function draw(){
 const offset={};const pose=state.pose;
 for(const item of D.items){let t=mul(D.EXPLODE[item.asm],state.explode.shares[item.asm].x);if(item.asm==='tiles')t=add(t,[pose.x,0,0]);if(item.id==='press')t=add(t,[0,0,pose.head]);if(item.id==='ram')t=add(t,[0,0,pose.head/2]);
 if(item.id==='id-probe')t=add(t,[Math.max(-10,Math.min(10,(pose.objects[0]?.x??45)/3-15)),0,0]);
 if(item.id.startsWith('subject')){const i=Number(item.id.slice(7)),obj=pose.objects[i];if(obj)t=add(t,[obj.x*.32-7,0,0]);nodes[item.id].style.display=obj?'':'none';}
 offset[item.id]=t;nodes[item.id].setAttribute('transform',K.translateAlong(D.P,t));
 const hot=item.asm===pose.station&&item.asm!=='tiles';nodes[item.id].toggleAttribute('data-hot',hot);nodes[item.id].toggleAttribute('data-off',item.asm==='track'&&!state.config.tracker);
 if(item.id.startsWith('tile')){nodes[item.id].style.display=Number(item.id.slice(4))<pose.size?'':'none';nodes[item.id].classList.toggle('ds-stamped',pose.stamped);nodes[item.id].classList.toggle('ds-tracked',pose.tracked);}
 if(item.id.startsWith('camera')){const i=Number(item.id.slice(6));nodes[item.id].classList.toggle('ds-inactive',i>=state.config.cameras);nodes[item.id].classList.toggle('ds-down',state.config.down&&i===state.config.cameras-1);}
 }
 nodes['count-value'].querySelector('text').textContent=String(pose.crossings);
 // Needles rotate their already-built geometry about their projected hub.
 const gauge=K.iso(D.gauge,D.P),timer=K.iso(D.timer,D.P);const share=Math.min(state.sim.totals.utilization/2,1);
 nodes['gpu-needle'].setAttribute('transform',`rotate(${-130+share*260} ${gauge[0]} ${gauge[1]})`);nodes['gpu-needle'].classList.toggle('ds-overload',state.sim.totals.utilization>1);
 const timerT=mul(D.EXPLODE.batch,state.explode.shares.batch.x);const timerAngle=state.pose.station==='batch'?260:0;
 nodes['timer-needle'].setAttribute('transform',`${K.translateAlong(D.P,timerT)} rotate(${timerAngle} ${timer[0]} ${timer[1]})`);
 const order=D.items.map(i=>[i.id,i.key+dot(offset[i.id],D.V)]).sort((a,b)=>a[1]-b[1]).map(a=>a[0]);if(order.join()!==lastOrder){const f=document.createDocumentFragment();order.forEach(id=>f.append(nodes[id]));layer.append(f);lastOrder=order.join();}
 const p=D.LABELS.map(l=>Ink.pillSvg(K.iso(add(l.at,mul(D.EXPLODE[l.asm],state.explode.shares[l.asm].x)),D.P),l.dx,l.dy,l.text,l.asm===pose.station,14)).join('');if(p!==pills)svg.querySelector('[data-pills]').innerHTML=pills=p;
}
function spring(dt){let moving=false;Object.values(state.explode.shares).forEach((s,i)=>{if(reduced.matches){s.x=state.explode.target;s.v=0;return;}if(s.goal!==state.explode.target)Object.assign(s,{goal:state.explode.target,wait:i*.04});if(s.wait>0){s.wait-=dt;moving=true;return;}for(let n=0;n<4;n++){s.v+=(64*(s.goal-s.x)-14.2*s.v)*dt/4;s.x+=s.v*dt/4;}if(Math.abs(s.goal-s.x)<.0005&&Math.abs(s.v)<.0005){s.x=s.goal;s.v=0;}else moving=true;});return moving;}
let frame=0,last=0,visible=true;
function tick(now){frame=0;const dt=last?Math.min((now-last)/1000,.05):1/60;last=now;if(state.playing)advance(dt*(reduced.matches?40:1));const moving=spring(dt);draw();sync();if(visible&&!document.hidden&&(state.playing||moving))frame=requestAnimationFrame(tick);else last=0;}
function wake(){if(!frame&&visible&&!document.hidden)frame=requestAnimationFrame(tick);}
new IntersectionObserver(entries=>{visible=entries.at(-1).isIntersecting;if(visible)wake();},{rootMargin:'120px 0px'}).observe(stage);
document.addEventListener('visibilitychange',()=>{last=0;if(!document.hidden)wake();});
function sync(){$('[data-ie-run]').textContent=state.playing?'Pause':state.done?'Run again':state.bi?'Resume':'Run';$('[data-ie-run]').setAttribute('aria-pressed',String(state.playing));$('[data-ie-explode]').setAttribute('aria-pressed',String(Boolean(state.explode.target)));}
function play(){if(state.done)load(state.config);state.explode.target=0;state.playing=true;IA.event('run');sync();wake();}
function pause(){state.playing=false;sync();}
function step(){if(state.done)load(state.config);state.explode.target=0;state.playing=false;IA.event('step');advance(100,true);draw();sync();wake();}
function explode(){state.playing=false;state.explode.target=state.explode.target?0:1;IA.event('explode');sync();wake();}
$('[data-ie-run]').addEventListener('click',()=>state.playing?pause():play());$('[data-ie-step]').addEventListener('click',step);$('[data-ie-explode]').addEventListener('click',explode);$('[data-ie-reset]').addEventListener('click',()=>{state.explode.target=0;load(M.DEFAULTS);wake();});
root.querySelectorAll('[data-config]').forEach(el=>el.addEventListener('change',()=>{const key=el.dataset.config,value=el.type==='checkbox'?el.checked:Number(el.value);IA.event('control',{name:key,value});if(key==='down'&&value)IA.event('break');load({...state.config,[key]:value});wake();}));
IA.onLoad(config=>{state.explode.target=0;load(config);wake();});
stage.addEventListener('keydown',e=>{if(e.target!==stage)return;const key=e.key.toLowerCase();if(key===' '||key==='enter')state.playing?pause():play();else if(key==='arrowright')step();else if(key==='e')explode();else if(key==='b'){IA.event('break');load({...state.config,down:true});}else if(key==='r'){load({...state.config,down:false});}else return;e.preventDefault();});
window.__machine={state,load,play,pause,step,toggleExplode:explode,seek:n=>{load(state.config);while(state.bi<state.beats.length&&state.beats[state.bi].event.index<=n)advance(100,true);draw();sync();},finish:()=>{state.playing=false;advance(1e6);draw();sync();}};
load(state.config);
