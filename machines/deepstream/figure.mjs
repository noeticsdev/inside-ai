import * as K from '../../kit/iso-kit.mjs';
import * as Ink from '../../kit/ink.mjs';
import { OPTIONS } from './model.mjs';

// Parts plan, Hero tier: base/feet/fasteners 10; conveyor 15; camera rack 22;
// decode roller assembly 8; cassette/ribs/timer 13; detector gantry 15;
// tracker and rule gate 15; output printer/display/drawer/broker 18;
// GPU gauge 5; 16 frame tiles and 2 tracked subjects. ~139 parts.
// Coordinates below are the parts list: one put() = one solid or line set.
export function figure() {
 const W=1000,H=430, plate={x:-172,y:-63,w:350,d:132,r:7};
 const STOPS={decode:-125,batch:-73,infer:-12,track:48,analytics:100,metadata:147};
 const EXPLODE={base:[0,0,0],rail:[0,0,0],decode:[-4,-5,12],batch:[-3,0,14],infer:[0,-8,16],track:[0,0,12],analytics:[3,2,10],metadata:[4,0,8],source:[-5,-3,8],gauge:[0,0,0],tiles:[0,0,0]};
 const P=K.fitProjection([...K.boxCorners(plate,-9,0),[-152,-55,65],[0,-40,80],[160,45,42]],W,H,{pad:28,azimuth:72});
 const items=[]; const put=(id,asm,p,svg,bias=0)=>items.push({id,asm,key:K.depthOf(p,P)+bias,svg});
 const solid=(x,y,z,w,d,h,tone='mid',sil=false)=>{const plan={x,y,w,d,r:Math.min(1,w/5,d/5)};return Ink.inkSolid(K.slabOf(plan,z,h,P,3,.25),{tone})+(sil?Ink.silhouetteSvg(K.boxCorners(plan,z,z+h),P):'');};
 const box=(id,asm,x,y,z,w,d,h,tone='mid',bias=0,sil=false)=>put(id,asm,[x+w/2,y+d/2,z+h/2],solid(x,y,z,w,d,h,tone,sil),bias);
 const cyl=(id,asm,x,y,z,r,h,tone='lo',bias=0)=>put(id,asm,[x,y,z+h/2],Ink.inkSolid(K.cylinder(x,y,r,z,h,P,32),{tone}),bias);
 const line=(id,asm,p,d,bias=0)=>put(id,asm,p,K.lineSvg(d,{tone:'lo'}),bias);
 box('plate','base',-172,-63,-7,350,132,7,'lo',-1000,true);
 put('shadows','base',[0,0,-1],Object.entries(STOPS).map(([asm,x])=>Ink.castShadowSvg(K.boxCorners({x:x-13,y:-17,w:26,d:34,r:0},0,asm==='infer'?47:25),P)).join(''),-950);
 for(const x of [-157,162])for(const y of [-49,55]){cyl(`foot${x}${y}`,'base',x,y,-11,5,4);cyl(`screw${x}${y}`,'base',x,y,0,1.6,.8,'hi');}
 // Raised roller bed, end stops and guide strips.
 box('bed','rail',-151,-7,0,317,17,7,'lo',-500,true);
 for(const y of [-9,10])box(`guide${y}`,'rail',-152,y,6,319,2,3,'hi',-450);
 for(let i=0;i<10;i++)box(`roller${i}`,'rail',-146+i*33,-6,7,2,15,1.4,'lo',-420);
 box('leftstop','rail',-153,-10,0,3,24,9);box('rightstop','rail',166,-10,0,3,24,9);
 // Sixteen camera posts share a supported intake rack and feed rail.
 box('source-case','source',-164,-55,0,55,32,9,'mid',0,true);
 box('source-lid','source',-164,-55,9,55,32,2,'hi',3);
 box('feed-rail','source',-137,-24,0,6,17,5,'lo');
 for(let i=0;i<16;i++){
  const x=-160+(i%8)*6.3,y=-50+Math.floor(i/8)*13;
  const lamp=K.iso([x+2,y+1,24],P);
  const feed=K.lineSvg(K.segment([x+2,y+2,11],[-134,-21,5],P),{tone:'lo'});
  const body=solid(x,y,11,1.5,1.5,8,'lo')+solid(x-1,y-1,19,5,4,5,'mid',true)+solid(x+3,y,20,1.3,2,2,'lo');
  put(`camera${i}`,'source',[x,y,18],`<g data-camera="${i}"><g class="ds-feed">${feed}</g>${body}<circle class="ds-lamp" cx="${lamp[0]}" cy="${lamp[1]}" r="2"/></g>`,5);
 }
 // Decode: supported paired rollers and a slotted feed shoe.
 for(const y of [-16,12])box(`decode-ped${y}`,'decode',-137,y,0,24,4,18,'mid',0,true);
 box('decode-beam','decode',-138,-16,18,26,32,4,'hi',5);
 for(let i=0;i<4;i++)box(`decode-fin${i}`,'decode',-136+i*6,-16,22,2,32,3,'lo',7);
 box('decode-shoe','decode',-133,-5,12,17,12,3,'hi',8);
 // Batch cassette, divided into 16 slots; the timer releases incomplete trays.
 box('cassette-floor','batch',-94,-18,0,43,36,8,'mid',0,true);
 for(const y of [-20,17])box(`cassette-wall${y}`,'batch',-95,y,7,45,3,11,'mid',4);
 for(let i=0;i<5;i++)box(`cassette-slot${i}`,'batch',-92+i*10,-17,8,1,34,2,'lo',5);
 box('cassette-stop','batch',-51,-17,8,2,34,7,'hi',6);
 cyl('timer-ring','batch',-75,-33,0,9,3,'lo');cyl('timer-face','batch',-75,-33,3,7.5,.8,'hi',4);
 const timer=[-75,-33,4];
 line('timer-ticks','batch',timer,Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return K.lineOnTop([-75+Math.cos(a)*6,-33+Math.sin(a)*6],[-75+Math.cos(a)*7.4,-33+Math.sin(a)*7.4],4,P);}).join(''),7);
 put('timer-needle','batch',timer,K.lineSvg(K.segment(timer,[-75,-39,4],P),{tone:'mid',free:'end'}),9);
 // Infer: four guide pillars, broad cooling crown, a travelling press head.
 box('infer-foot','infer',-33,-23,0,42,46,4,'lo',0,true);
 for(const x of [-30,3])for(const y of [-20,17]){box(`pillar${x}${y}`,'infer',x,y,4,3,3,38,'lo');box(`collar${x}${y}`,'infer',x-1,y-1,30,5,5,5,'hi',4);}
 box('infer-crown','infer',-34,-24,42,44,48,5,'mid',7,true);
 for(let i=0;i<4;i++)box(`heat-fin${i}`,'infer',-31+i*11,-23,47,3,46,3,'lo',9);
 box('press','infer',-24,-12,27,25,26,9,'hi',10,true);
 cyl('ram','infer',-12,0,36,3,6,'lo',9);
 // Tracker has a glass observation deck, sliding ID probe and two subjects.
 box('track-deck','track',29,-23,0,39,46,8,'mid',0,true);
 put('track-glass','track',[48,0,10],Ink.glassSvg(30,-21,8,66,21,10,P),5);
 for(const y of [-24,22])box(`track-rail${y}`,'track',27,y,8,43,2,4,'lo',7);
 box('track-crossbar','track',44,-24,12,5,48,3,'hi',8);
 box('id-probe','track',43,-3,15,7,6,5,'hi',10);
 for(let i=0;i<2;i++)box(`subject${i}`,'track',33,-13+i*23,10,5,8,2,'hi',8);
 // Count gate: the fixed line sits on the rules deck, with a mechanical dial.
 box('rules-bed','analytics',81,-19,0,35,38,8,'mid',0,true);
 for(const y of [-20,17])box(`gate-leg${y}`,'analytics',97,y,8,3,3,22,'lo');
 box('gate-beam','analytics',96,-20,30,5,40,3,'hi',5);
 box('tripwire','analytics',98,-16,8,1,32,.7,'hi',6);
 cyl('count-case','analytics',102,33,0,10,4);cyl('count-face','analytics',102,33,4,8,.8,'hi',5);
 const countPos=K.iso([102,33,5],P);put('count-value','analytics',[102,33,5],`<text class="ds-counter" x="${countPos[0]}" y="${countPos[1]+3}" text-anchor="middle">0</text>`,12);
 // Output printer plus display and a cabinet, connected by solid branch runners.
 box('printer-body','metadata',129,-18,0,29,36,18,'mid',0,true);
 box('printer-slot','metadata',132,-13,18,23,4,1,'lo',5);
 box('paper','metadata',134,-9,18,19,24,.5,'hi',8);
 line('paper-lines','metadata',[142,2,19],Array.from({length:5},(_,i)=>K.lineOnTop([136,-6+i*4],[150,-6+i*4],18.6,P)).join(''),10);
 box('display-stem','metadata',135,-46,0,4,11,13,'lo');
 box('display-case','metadata',123,-51,13,29,5,21,'lo',3,true);
 box('display-screen','metadata',125,-45.9,15,25,.5,17,'hi',8);
 box('store-runner','metadata',143,18,0,4,14,2,'lo');
 box('store-case','metadata',131,32,0,29,20,15,'mid',0,true);
 box('drawer','metadata',133,48,3,25,3,9,'hi',6);
 box('drawer-handle','metadata',141,51,6,8,2,2,'lo',9);
 box('broker-port','metadata',161,-18,0,10,10,12,'lo',0,true);
 box('broker-connector','metadata',158,-15,4,3,4,4,'hi',5);
 // Budget meter: pointer follows requested work / available GPU milliseconds.
 cyl('gpu-plinth','gauge',12,43,0,15,3);cyl('gpu-face','gauge',12,43,3,13,.8,'hi',4);
 const gauge=[12,43,4];
 line('gpu-scale','gauge',gauge,Array.from({length:17},(_,i)=>{const a=-Math.PI*.8+i*Math.PI*1.6/16;return K.lineOnTop([12+Math.sin(a)*10.5,43-Math.cos(a)*10.5],[12+Math.sin(a)*12.5,43-Math.cos(a)*12.5],4,P);}).join(''),6);
 put('gpu-needle','gauge',gauge,K.lineSvg(K.segment(gauge,[12,32.5,4],P),{free:'end'}),8);
 cyl('gpu-hub','gauge',12,43,4,1.4,.7,'lo',10);
 // Raised crates travel together as a batch; marks appear as processing proceeds.
 for(let i=0;i<16;i++){
  const x=-10+(i%4)*5.2,y=-9+Math.floor(i/4)*5.2;
  const p=K.iso([x+2,y+2,13],P);
  const crate=solid(x,y,9,4.5,4.5,3,'hi',true);
  put(`tile${i}`,'tiles',[x+2,y+2,11],`${crate}<g class="ds-stamp"><circle cx="${p[0]}" cy="${p[1]}" r="2" fill="none" stroke="#b5483c" stroke-width="1.3"/></g><g class="ds-tag"><rect x="${p[0]+1}" y="${p[1]-5}" width="5" height="3" fill="#f4b829" stroke="#1b2340" stroke-width=".6"/></g>`,3);
 }
 const labels=[
  {asm:'decode',at:[-125,-1,26],dx:-30,dy:-75,text:'DECODE'},
  {asm:'batch',at:[-73,0,19],dx:0,dy:85,text:'BATCH'},
  {asm:'infer',at:[-12,0,51],dx:0,dy:-53,text:'INFER'},
  {asm:'track',at:[48,0,20],dx:0,dy:-100,text:'TRACK'},
  {asm:'analytics',at:[100,0,33],dx:35,dy:-68,text:'RULES'},
  {asm:'metadata',at:[145,0,20],dx:15,dy:95,text:'METADATA'}];
 const sorted=items.sort((a,b)=>a.key-b.key);
 const svg=K.figureSvg({width:W,height:H,label:'A video analytics bench: camera intake, decode rollers, timed batch cassette, inference press, IoU tracking carriage, crossing gate and metadata printer with display, storage drawer and broker output. A GPU budget dial shows overload.',body:`${Ink.wobbleFilter()}<g data-layer filter="url(#iso-hand)">${sorted.map(i=>`<g data-i="${i.id}" data-asm="${i.asm}">${i.svg}</g>`).join('')}</g><g data-pills>${labels.map(l=>Ink.pillSvg(K.iso(l.at,P),l.dx,l.dy,l.text,false,14)).join('')}</g>`}).replace('<svg ','<svg data-ie-svg ');
 const select=(key,title,suffix='')=>`<label class="ia-field">${title}<select class="ia-select" data-config="${key}" aria-label="${title}">${OPTIONS[key].map(v=>`<option value="${v}">${v}${suffix}</option>`).join('')}</select></label>`;
 const controls=`<div class="ds-transport"><button class="ia-btn" type="button" data-ie-run>Run</button><button class="ia-btn" type="button" data-ie-step>Step</button><button class="ia-btn" type="button" data-ie-explode>Explode</button><button class="ia-btn" type="button" data-ie-reset>Reset</button></div><div class="ds-settings">${select('cameras','Cameras')}${select('fps','FPS')}${select('batch','Batch')}${select('timeout','Timeout ms')}${select('interval','Infer interval')}${select('budget','GPU budget')}<label class="ia-toggle"><input type="checkbox" data-config="down"> Last camera down</label><label class="ia-toggle"><input type="checkbox" data-config="tracker"> Tracker</label></div><div class="ds-status" data-ds-status hidden></div><details class="ds-inspect"><summary>Costs, metadata and tracking · inspect the arithmetic</summary><p>Decode 0.35 ms/frame · Infer 5 + 1.2 × frames GPU ms/batch · Tracker 0.08 GPU ms/object. Interval N skips N detector batches. Queued GPU work above 180 ms drops a batch. Small batches with skipping can starve a source.</p><p>Fixed script: two objects cross x = 50 per live camera. Predicted boxes are matched by IoU ≥ 0.2. The tracker never reads the script’s identity.</p><pre data-ds-meta>Run to inspect a frame’s metadata.</pre></details>`;
 const readouts=[{key:'gpu',label:'GPU demand / budget'},{key:'throughput',label:'Frames/s · 2 s input'},{key:'drops',label:'Frames dropped'},{key:'latency',label:'Max latency'},{key:'wait',label:'Max mux wait'},{key:'ids',label:'ID switches'},{key:'count',label:'Crossings / truth'},{key:'infer',label:'Inferred / processed'}];
 const css=`[data-slug="deepstream"] .ia-controls{display:block}.ds-transport,.ds-settings{display:contents}.ia-controls{display:flex!important;gap:7px;flex-wrap:wrap;align-items:center}.ds-settings .ia-field{font-size:11px;gap:3px}.ds-settings .ia-select{min-height:36px;padding:5px;max-width:115px}.ds-honesty{font-size:11px;color:var(--ia-muted);margin:8px 0 4px}.ds-status[hidden]{display:none}.ds-inspect{font-size:11px;max-width:100%;margin:0}.ds-inspect summary{cursor:pointer;min-height:24px}.ds-inspect p{max-width:75ch;margin:8px 0}.ds-inspect pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;max-height:180px;overflow:auto}.ds-counter{font:700 10px sans-serif;fill:var(--ink)}.ds-lamp{fill:#43c25c;stroke:#1b2340;stroke-width:.7}.ds-down .ds-lamp{fill:#e2483d}.ds-down .ds-feed,.ds-inactive{opacity:.16}.ds-stamp,.ds-tag{display:none}.ds-stamped .ds-stamp,.ds-tracked .ds-tag{display:inline}.ds-overload{color:#be453c!important}[data-slug="deepstream"] .ia-stage{min-height:320px}[data-slug="deepstream"] .ia-readouts{grid-template-columns:repeat(4,minmax(0,1fr))}@media(max-width:600px){[data-slug="deepstream"] .ia-stage{min-height:210px;padding:0}[data-slug="deepstream"] .ia-stage svg{height:240px}[data-slug="deepstream"] .ia-readouts{grid-template-columns:repeat(2,minmax(0,1fr))}[data-slug="deepstream"] .ia-controls{gap:6px}.ds-settings .ia-field{flex:1 1 29%;min-width:0}.ds-settings .ia-select{width:100%;max-width:none;min-width:0}.ds-transport .ia-btn{flex:1 1 auto;padding-inline:9px}.ds-inspect{flex-basis:100%}.ds-status{font-size:11px}}`;
 return {svg,controls,readouts,css,data:{P,STOPS,EXPLODE,LABELS:labels,gauge,timer,V:[K.depthOf([1,0,0],P),K.depthOf([0,1,0],P),K.depthOf([0,0,1],P)],parts:items.length,items:items.map(({svg,...i})=>i)}};
}
