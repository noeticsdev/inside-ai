const root=document.querySelector('[data-ia-machine]'), svg=root.querySelector('[data-ie-svg]'), stage=root.querySelector('[data-ia-stage]');
const $=s=>root.querySelector(s), q=s=>svg.querySelector(s), reduced=matchMedia('(prefers-reduced-motion: reduce)');
const state={config:M.decode(location.search),sim:null,index:0,playing:false,frame:0,last:0,visible:true,phase:0,done:false};
const fmt=n=>!Number.isFinite(n)?'diverged':Math.abs(n)>=10000?n.toExponential(2):n.toFixed(4);
// The seeded generator consumes three values per unit.
function initialFirstWeights(){let seed=state.config.seed;const out=[];for(let i=0;i<state.config.hidden;i++)for(let j=0;j<3;j++){seed+=0x6D2B79F5;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);const n=((t^t>>>14)>>>0)/4294967296*2-1;if(j===0)out.push(n)}return out}
function render(){
 const t=state.sim.totals,e=state.sim.events[state.index-1], loss=e?e.loss:t.initialLoss;
 $('[data-ro="step"]').textContent=String(state.index);
 $('[data-ro="loss"]').textContent=state.done&&t.diverged?'diverged':fmt(loss);
 $('[data-ro="accuracy"]').textContent=e?`${e.accuracy} / 4`:'— / 4';
 $('[data-ro="gradient"]').textContent=e?fmt(e.maxGradient):'—';
 $('[data-ro="change"]').textContent=e?fmt(e.changeNorm):'—';
 for(let i=0;i<6;i++){for(const id of [`carriage${i}`,`gear${i}`])svg.querySelector(`[data-i="${id}"]`).style.opacity=i<state.config.hidden?'1':'0.22'}
 const gauge=K.iso([64,-13,7.8],D.P);q('[data-needle]').setAttribute('transform',`rotate(${Math.min(140,Math.log10(1+loss)*45)} ${gauge[0]} ${gauge[1]})`);
 const pos=Math.min(1,state.phase/0.5), back=Math.max(0,(state.phase-0.5)/0.5);
 q('[data-pulse]').setAttribute('transform',K.translateAlong(D.P,[119*pos,0,0]));
 const before=state.index?state.sim.events[state.index-1].weights.map(w=>w[0]):initialFirstWeights();
 const after=state.sim.events[state.index]?.weights.map(w=>w[0])||before;
 const tokenX=55-109*back;
 const dialIndex=Math.max(0,Math.min(state.config.hidden-1,Math.round((tokenX+48)/15)));
 const x=-48+dialIndex*15, drop=state.playing&&state.phase>=.5?Math.max(0,1-Math.abs(tokenX-x)/6):0;
 const token=q('[data-token]');token.setAttribute('transform',K.translateAlong(D.P,[tokenX-55,-35*drop,0]));
 token.classList.toggle('negative',(before[dialIndex]-after[dialIndex])<0);
 token.style.opacity=state.playing&&state.phase>=.5?'1':'0';
 svg.querySelectorAll('[data-dial]').forEach((node,i)=>{const xy=K.iso([-48+i*15,-4,8.1],D.P);let v=before[i]||0;if(state.playing&&state.phase>=.5&&i<state.config.hidden){const dialX=-48+i*15;const progress=Math.max(0,Math.min(1,(dialX+6-tokenX)/12));v+=(after[i]-v)*progress}const angle=Math.max(-3,Math.min(3,v))*40;node.setAttribute('transform',`rotate(${angle} ${xy[0]} ${xy[1]})`)});
 svg.querySelectorAll('[data-activation-curve]').forEach(node=>node.style.display=node.dataset.activationCurve===state.config.activation?'':'none');
 const curve=t.curve.slice(0,state.index+1), chartPoint=(n,i)=>K.iso([-14+67*i/Math.max(1,state.sim.config.steps),-36.4,8+29*(Math.log10(Math.max(.01,Math.min(1,n)))+2)/2],D.P);
 q('[data-chart]').setAttribute('d',curve.map((n,i)=>{const pt=chartPoint(n,i);return `${i?'L':'M'}${pt[0]} ${pt[1]}`}).join(' '));
 const tip=chartPoint(curve.at(-1),curve.length-1), mount=K.iso([52,-36.2,40],D.P);q('.pen-arm').setAttribute('d',`M${mount[0]} ${mount[1]}L${tip[0]} ${tip[1]}`);q('[data-pen-tip]').setAttribute('cx',tip[0]);q('[data-pen-tip]').setAttribute('cy',tip[1]);
 svg.querySelector('[data-pills]').innerHTML=D.labels.map(l=>Ink.pillSvg(K.iso(l.at,D.P),l.dx,l.dy,l.text,state.playing&&((state.phase<.5&&l.asm==='input')||(state.phase>=.5&&l.asm==='backprop')))).join('');
 $('[data-run]').textContent=state.playing?'Pause':state.done?'Run again':'Run';
}
function load(c){state.config=M.configOf(c);state.sim=M.simulate(state.config);state.index=0;state.phase=0;state.done=false;state.playing=false;for(const key of ['hidden','activation','steps','seed']) $(`[data-${key}]`).value=state.config[key];$('[data-rate]').value=M.RATES.indexOf(state.config.rate);$('[data-rate-value]').value=state.config.rate;const p=new URLSearchParams(M.encode(state.config));if(document.documentElement.classList.contains('iso-nolabels'))p.set('labels','0');history.replaceState(null,'',location.pathname+(p.toString()?'?'+p:'')+location.hash);render()}
function complete(){if(state.done)return;state.done=true;state.playing=false;const t=state.sim.totals;$('[data-ia-live]').textContent=t.diverged?'Training diverged.':`Training finished: loss ${fmt(t.loss)}, ${t.accuracy} of 4 correct.`;IA.ran(state.sim);render()}
function next(){if(state.index>=state.sim.events.length){complete();return}state.index++;IA.trace(state.sim.events[state.index-1].trace);if(state.index>=state.sim.events.length)complete()}
function tick(now){state.frame=0;if(!state.playing||!state.visible){state.last=0;return}const dt=state.last?Math.min((now-state.last)/1000,.05):.016;state.last=now;state.phase+=dt*(reduced.matches?40:state.single?1:8);if(state.phase>=1){state.phase=0;next();if(state.single)state.playing=false}render();if(state.playing)state.frame=requestAnimationFrame(tick);else state.last=0}
function wake(){if(!state.frame&&state.playing&&state.visible)state.frame=requestAnimationFrame(tick)}
function play(single=false){if(state.done)load(state.config);state.single=single;state.playing=true;wake();render()}
$('[data-run]').onclick=()=>{if(state.playing){state.playing=false;render()}else{IA.event('run',{});play()}};
$('[data-step]').onclick=()=>{IA.event('step',{});play(true)};
$('[data-reset]').onclick=()=>load(M.DEFAULTS);
for(const key of ['rate','hidden','activation','steps','seed']) $(`[data-${key}]`).addEventListener('change',e=>{const value=key==='rate'?M.RATES[Number(e.target.value)]:key==='activation'?e.target.value:Number(e.target.value);IA.event('control',{name:key,value});load({...state.config,[key]:value})});
IA.onLoad(c=>{load(c);play()});
stage.addEventListener('keydown',e=>{if(e.target!==stage)return;if(e.key===' '){e.preventDefault();state.playing?(state.playing=false,render()):play()}else if(e.key==='ArrowRight'){e.preventDefault();play(true)}});
new IntersectionObserver(entries=>{state.visible=entries.at(-1).isIntersecting;if(state.visible)wake()},{rootMargin:'120px'}).observe(stage);
window.__machine={state,load,finish:()=>{while(state.index<state.sim.events.length)next();complete();render()}};
load(state.config);
