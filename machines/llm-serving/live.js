const root=document.querySelector('[data-ia-machine]'), stage=root.querySelector('[data-ia-stage]'), svg=root.querySelector('[data-ie-svg]');
const $=s=>root.querySelector(s), still=matchMedia('(prefers-reduced-motion: reduce)');
const state={config:M.decode(location.search),sim:null,index:-1,playing:false,done:false};
let frame=0,last=0,visible=true;
function draw(ev) {
 const used=ev?.kv||0, ratio=Math.min(1,used/state.sim.totals.budget), n=ev?.active.length||0;
 svg.querySelectorAll('[data-card]').forEach((el,i)=>el.setAttribute('data-lit',i<(ev?.waiting??state.config.requests)?'yes':'no'));
 svg.querySelectorAll('[data-cell]').forEach((el,i)=>el.setAttribute('data-lit',i<Math.ceil(ratio*16)?'yes':'no'));
 svg.querySelectorAll('[data-bar]').forEach((el,i)=>{el.setAttribute('data-lit',i<Math.ceil(ratio*16)?'yes':'no');el.setAttribute('data-red',(ratio>.8||ev?.type==='defer')?'yes':'no');});
 svg.querySelectorAll('[data-token]').forEach((el,i)=>el.setAttribute('data-lit',i<n?'yes':'no'));
 const head=svg.querySelector('[data-i="head"]'); head.setAttribute('transform',K.translateAlong(D.P,[0,0,ev?.type==='decode'?-3:0]));
 svg.querySelectorAll('[data-asm]').forEach(el=>el.toggleAttribute('data-hot',!!ev && el.dataset.asm===ev.station));
 const t=state.sim.totals, done=state.done;
 $('[data-ro="throughput"]').textContent=done?t.throughput.toFixed(1):'—';
 $('[data-ro="ttft"]').textContent=done?`${t.ttft.toFixed(1)} ms`:'—';
 $('[data-ro="latency"]').textContent=done?`${t.p50.toFixed(1)} ms`:'—';
 $('[data-ro="kv"]').textContent=`${((done?t.kvPeak:used)/1e9).toFixed(2)} / ${state.config.memory} GB`;
 $('[data-ro="preemptions"]').textContent=done?String(t.preemptions):'—';
 $('[data-ro="compute"]').textContent=done?t.compute.toLocaleString():'—';
 $('[data-run]').textContent=state.playing?'Pause':state.done?'Run again':'Run';
}
function load(config) {state.config=M.configOf(config);state.sim=M.simulate(state.config);state.index=-1;state.playing=false;state.done=false;for(const k of ['requests','prompt','output','batching','memory']) $('#ls-'+k).value=state.config[k];$('#ls-cache').checked=state.config.cache;const q=M.encode(state.config);history.replaceState(null,'',location.pathname+(q?'?'+q:'')+location.hash);draw(null);}
function next(){if(state.done)return;const ev=state.sim.events[++state.index];if(ev){IA.trace(ev.trace);draw(ev);}if(state.index>=state.sim.events.length-1){state.done=true;state.playing=false;draw(ev);$('[data-ia-live]').textContent=`Finished: ${state.sim.totals.tokens} output tokens.`;IA.ran(state.sim);}}
function tick(now){if(!visible||!state.playing){frame=0;last=0;return;}if(!last||now-last>(still.matches?2:120)){next();last=now;}if(state.playing)frame=requestAnimationFrame(tick);else {frame=0;last=0;}}
function play(){if(state.done)load(state.config);state.playing=true;draw(state.sim.events[state.index]);if(visible&&!frame)frame=requestAnimationFrame(tick);}
function pause(){state.playing=false;draw(state.sim.events[state.index]);}
$('[data-run]').addEventListener('click',()=>{IA.event('run',{});state.playing?pause():play();});
$('[data-step]').addEventListener('click',()=>{IA.event('step',{});pause();if(state.done)load(state.config);next();});
$('[data-reset]').addEventListener('click',()=>load(M.DEFAULTS));
for(const k of ['requests','prompt','output','batching','memory','cache']) $('#ls-'+k).addEventListener('change',e=>{const value=k==='cache'?e.target.checked:['requests','prompt','output','memory'].includes(k)?Number(e.target.value):e.target.value;IA.event('control',{name:k,value});load({...state.config,[k]:value});});
IA.onLoad(config=>load(config));
stage.addEventListener('keydown',e=>{if(e.target!==stage)return;if(e.key===' '){e.preventDefault();state.playing?pause():play();}else if(e.key==='ArrowRight'){e.preventDefault();pause();next();}});
new IntersectionObserver(entries=>{visible=entries.at(-1).isIntersecting;if(visible&&state.playing&&!frame)frame=requestAnimationFrame(tick);}).observe(stage);
window.__machine={state,load,finish:()=>{while(!state.done)next();}};
load(state.config);
