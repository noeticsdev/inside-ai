import * as k from '../../kit/iso-kit.mjs';
import * as ink from '../../kit/ink.mjs';
export function figure() {
 const W=720,H=440, plate={x:-80,y:-45,w:160,d:90,r:3};
 const P=k.fitProjection([...k.boxCorners(plate,-5,0),[-80,-45,55],[80,45,55]],W,H,{pad:25,azimuth:60});
 const solid=(x,y,z,w,d,h,tone='mid')=>ink.inkSolid(k.slabOf({x,y,w,d,r:.5},z,h,P,3),{tone});
 const items=[]; const put=(id,asm,ref,svg,bias=0)=>items.push({id,asm,key:k.depthOf(ref,P)+bias,svg});
 put('shadow','base',[0,0,-99],ink.castShadowSvg(k.boxCorners({x:-65,y:-30,w:130,d:60},0,35),P),-999);
 put('base','base',[0,0,-90],ink.inkSolid(k.slabOf(plate,-5,5,P,5),{material:'board'})+ink.silhouetteSvg(k.boxCorners(plate,-5,0),P),-998);
 // Queue: card guides, feet, eight stacked request cards.
 put('queuebase','queue',[-57,0,1],solid(-72,-24,0,28,48,3,'lo'));
 for(let i=0;i<8;i++) put('card'+i,'queue',[-58,-19+i*5,5],`<g data-card="${i}">${solid(-68,-20+i*5,3,19,3,3,'hi')}</g>`);
 for(let i=0;i<2;i++) put('guide'+i,'queue',[-71+i*25,0,7],solid(-73+i*27,-25,3,2,50,7));
 // Prefill: ribbed engine with a hopper and a moving plunger.
 put('engine','prefill',[-28,-12,12],solid(-42,-27,0,27,30,20));
 for(let i=0;i<7;i++) put('fin'+i,'prefill',[-40+i*4,-10,22],solid(-41+i*4,-25,20,2,26,3,'hi'));
 for(let i=0;i<4;i++) put('bolt'+i,'prefill',[-38+i*6,3,3],ink.inkSolid(k.cylinder(-38+i*6,3,1.2,3,2,P,12),{tone:'hi'}));
 put('plunger','prefill',[-28,-9,30],solid(-31,-14,24,6,8,12,'hi'));
 // KV warehouse: posts, shelves and sixteen individually illuminated cells.
 for(let i=0;i<4;i++) {let x=0+(i%2)*25,y=-28+Math.floor(i/2)*26; put('post'+i,'memory',[x,y,16],solid(x,y,0,2,2,37,'lo'));}
 for(let j=0;j<4;j++) {put('shelf'+j,'memory',[13,-15,5+j*8],solid(0,-28,4+j*8,27,28,1.5)); for(let i=0;i<4;i++) put(`cell${j*4+i}`,'memory',[4+i*6,-14,7+j*8],`<g data-cell="${j*4+i}">${solid(3+i*6,-24,6+j*8,4,18,5,'hi')}</g>`,2);}
 // Decode press: two uprights, rails, head and output tokens.
 put('pressbase','batch',[50,-10,2],solid(35,-29,0,31,42,4,'lo'));
 for(let i=0;i<2;i++) put('upright'+i,'batch',[37+i*25,-22,20],solid(35+i*27,-28,4,4,5,36));
 put('beam','batch',[50,-25,40],solid(35,-29,38,31,7,4,'hi'));
 put('head','batch',[50,-15,28],solid(40,-22,26,21,14,7,'hi'),5);
 for(let i=0;i<8;i++) {put('slot'+i,'batch',[38+i*3.2,4,5],solid(37+i*3.2,-3,4,2,12,2)); put('token'+i,'batch',[38+i*3.2,8,8],`<g data-token="${i}">${solid(37+i*3.2,5,6,2,4,2,'hi')}</g>`,3);}
 for(let i=0;i<5;i++) put('press-rib'+i,'batch',[41+i*4,-22,35],solid(40+i*4,-22,33,1,14,2,'lo'),6);
 for(let i=0;i<4;i++) put('queue-fastener'+i,'queue',[-70,-20+i*13,10],ink.inkSolid(k.cylinder(-70,-20+i*13,1,10,1,P,10),{tone:'hi'}),3);
 // Gauge: a row of 16 segments and retaining frame.
 put('gauge','memory',[10,32,2],solid(-10,25,0,42,12,3,'lo'));
 for(let i=0;i<16;i++) put('bar'+i,'memory',[-8+i*2.4,30,4],`<g data-bar="${i}">${solid(-8+i*2.4,27,3,1.7,8,2,'hi')}</g>`,3);
 for(let i=0;i<4;i++) put('gauge-mark'+i,'memory',[-7+i*10,34,5],solid(-7+i*10,34,3,0.6,2,1,'lo'),5);
 for(let i=0;i<8;i++) put('rivet'+i,'base',[-65+i*18,38,1],ink.inkSolid(k.cylinder(-65+i*18,38,1,0,.8,P,10),{tone:'hi'}));
 const labels=[{asm:'queue',at:[-58,-20,10],dx:-60,dy:-45,text:'QUEUE'},{asm:'prefill',at:[-28,-20,30],dx:-30,dy:-65,text:'PREFILL'},{asm:'memory',at:[13,-25,38],dx:0,dy:-48,text:'KV CACHE'},{asm:'batch',at:[51,-26,42],dx:38,dy:-40,text:'DECODE'}];
 const body=items.sort((a,b)=>a.key-b.key).map(i=>`<g data-i="${i.id}" data-asm="${i.asm}">${i.svg}</g>`).join('');
 const svg=k.figureSvg({width:W,height:H,label:'Request cards queue for a prefill engine, KV warehouse, memory gauge and decode press.',body:`${ink.wobbleFilter()}<g data-layer filter="url(#iso-hand)">${body}</g><g data-pills>${labels.map(l=>ink.pillSvg(k.iso(l.at,P),l.dx,l.dy,l.text,false)).join('')}</g>`}).replace('<svg ','<svg data-ie-svg ');
 const select=(name,label,opts)=>`<label class="ia-field">${label}<select class="ia-select" id="ls-${name}">${opts.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`;
 const controls=`<button class="ia-btn" data-run>Run</button><button class="ia-btn" data-step>Step</button><button class="ia-btn" data-reset>Reset</button>${select('requests','Requests',Array.from({length:16},(_,i)=>[i+1,i+1]))}${select('prompt','Prompt tokens',[[1024,'1,024'],[8192,'8,192'],[32768,'32,768']])}${select('output','Long output tokens',[[16,'16'],[32,'32'],[64,'64']])}${select('batching','Batching', [['static','Static'],['continuous','Continuous']])}${select('memory','KV budget',[[24,'24 GB'],[48,'48 GB'],[80,'80 GB']])}<label class="ia-toggle"><input type="checkbox" id="ls-cache"> KV cache</label>`;
 return {svg,data:{P,labels},css:'[data-cell], [data-token], [data-bar] { opacity:.15 } [data-lit="yes"] { opacity:1 } [data-red="yes"] .iso-top, [data-red="yes"] .iso-shade { fill: #d24736 !important; }',controls,readouts:[{key:'throughput',label:'Simulated tokens/s'},{key:'ttft',label:'Max first token'},{key:'latency',label:'p50 latency'},{key:'kv',label:'Peak KV / budget'},{key:'preemptions',label:'Memory deferrals'},{key:'compute',label:'Compute token work'}]};
}
