const root=document.querySelector('[data-ia-machine]'), stage=root.querySelector('[data-ia-stage]'), $=s=>root.querySelector(s), reduced=matchMedia('(prefers-reduced-motion: reduce)');
const state={config:M.decode(location.search),sim:null,index:-1,playing:false,done:false};
let timer=0,visible=true;
function render() {
 const ev=state.sim.events[state.index], t=ev||{turns:0,tokens:M.TASKS[state.config.task].request,attempts:0,messages:1};
 $('[data-ro="turns"]').textContent=`${t.turns} / ${state.config.maxSteps}`;
 $('[data-ro="tokens"]').textContent=`${t.tokens} / ${state.config.budget}`;
 $('[data-ro="calls"]').textContent=String(t.attempts);
 $('[data-ro="status"]').textContent=state.done?state.sim.totals.status:'ready';
 root.querySelectorAll('[data-car]').forEach((node,i)=>{node.style.display=i<t.messages?'':'none'; const shift=ev ? ({context:0,model:2,tools:4,guard:1}[ev.station]||0) : 0; node.setAttribute('transform',K.translateAlong(D.P,[shift,0,0]));});
 root.querySelectorAll('[data-asm]').forEach(node=>node.toggleAttribute('data-hot',!!ev && node.dataset.asm===ev.station));
 $('[data-run]').textContent=state.playing?'Pause':state.done?'Run again':state.index>=0?'Resume':'Run';
 $('[data-run]').setAttribute('aria-pressed',String(state.playing));
}
function load(config) {
 clearTimeout(timer); timer=0; state.config=M.configOf(config); state.sim=M.simulate(state.config); state.index=-1; state.playing=false; state.done=false;
 root.querySelectorAll('[data-control]').forEach(el=>{const v=state.config[el.dataset.control]; if(el.type==='checkbox') el.checked=v; else el.value=String(v);});
 const q=M.encode(state.config); history.replaceState(null,'',location.pathname+(q?'?'+q:'')+location.hash); render();
}
function advance() {
 if(state.done)return;
 const ev=state.sim.events[++state.index]; IA.trace(ev.trace);
 if(state.index===state.sim.events.length-1) { state.done=true;state.playing=false;IA.ran(state.sim); $('[data-ia-live]').textContent=`Run finished: ${state.sim.totals.status}, ${ev.tokens} context tokens.`; }
 render();
}
function schedule() { if(state.playing&&visible&&!timer) timer=setTimeout(()=>{timer=0;advance();schedule();},reduced.matches?15:550); }
function play() { if(state.done)load(state.config);state.playing=true;render();schedule(); }
function pause(){state.playing=false;clearTimeout(timer);timer=0;render();}
function step(){pause();if(state.done)load(state.config);advance();}
$('[data-run]').addEventListener('click',()=>{if(state.playing)pause();else{IA.event('run');play();}});
$('[data-step]').addEventListener('click',()=>{IA.event('step');step();});
$('[data-reset]').addEventListener('click',()=>load(M.DEFAULTS));
root.querySelectorAll('[data-control]').forEach(el=>el.addEventListener('change',()=>{const value=el.type==='checkbox'?el.checked:el.value;IA.event('control',{name:el.dataset.control,value});load({...state.config,[el.dataset.control]:value});}));
IA.onLoad(config=>load(config));
stage.addEventListener('keydown',e=>{if(e.target!==stage)return;if(e.key===' '){state.playing?pause():play();e.preventDefault();}else if(e.key==='ArrowRight'){step();e.preventDefault();}});
new IntersectionObserver(entries=>{visible=entries.at(-1).isIntersecting;if(!visible){clearTimeout(timer);timer=0;}else schedule();}).observe(stage);
window.__machine={state,load,finish:()=>{pause();while(!state.done)advance();}};
load(state.config);
