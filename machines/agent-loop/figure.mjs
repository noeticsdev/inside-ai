import * as k from '../../kit/iso-kit.mjs';
import * as ink from '../../kit/ink.mjs';
export function figure() {
 const W=760,H=470, plate={x:-80,y:-45,w:160,d:90,r:4};
 const P=k.fitProjection([...k.boxCorners(plate,-5,0),[-70,-38,46],[70,35,40]],W,H,{pad:30,azimuth:60});
 const depth=p=>k.depthOf(p,P), solid=(p,s={})=>ink.inkSolid(p,{tone:'mid',...s});
 const box=(x,y,z,w,d,h,s={})=>solid(k.slabOf({x,y,w,d,r:.7},z,h,P,3),s);
 const cyl=(x,y,z,r,h,s={})=>solid(k.cylinder(x,y,r,z,h,P,24),s);
 const items=[]; const put=(id,asm,at,svg,bias=0)=>items.push({id,asm,key:depth(at)+bias,svg});
 put('shadow','base',[0,0,-100],ink.castShadowSvg(k.boxCorners({x:-72,y:-38,w:145,d:76},0,25),P),-500);
 put('base','base',[0,0,-90],solid(k.slabOf(plate,-5,5,P,6),{material:'board'})+ink.silhouetteSvg(k.boxCorners(plate,-5,0),P),-1000);
 // A pair of rails with sleepers carries the growing context train.
 for(let y of [13,27]) put('rail'+y,'base',[0,y,0],box(-72,y,0,144,1.4,1.5,{tone:'lo'}));
 for(let x=-68;x<=68;x+=8) put('sleeper'+x,'base',[x,20,0],box(x,11,0,2,19,1,{tone:'lo'}));
 // Stops at both ends of the track hold the rolling stock on the bench.
 for (const x of [-73,72]) put('buffer'+x,'base',[x,20,2],box(x,11,1,2,18,4,{tone:'lo'})+box(x-1,14,5,4,12,2,{tone:'hi'}));
 // Signal box, reader head and a row of vents.
 put('modelbody','model',[-43,-23,13],box(-58,-36,0,30,23,27)+box(-61,-39,27,36,29,3,{tone:'hi'})+box(-53,-12,10,20,5,3,{tone:'hi'}));
 for(let i=0;i<7;i++) put('vent'+i,'model',[-56+i*4,-38,18],box(-56+i*4,-38,13,1.3,2,9,{tone:'lo'}));
 for(let i=0;i<3;i++) put('dial'+i,'model',[-54+i*9,-27,30],cyl(-54+i*9,-27,30,2.8,1,{tone:i===1?'hi':'lo'})+cyl(-54+i*9,-27,31,0.6,1,{tone:'hi'}));
 put('reader','model',[-43,2,17],box(-46,-12,19,6,20,4,{tone:'hi'})+box(-47,5,12,8,5,8,{tone:'lo'}));
 // Workshop: a lathe, spindle, three tool racks and flywheel.
 put('workbench','tools',[15,-24,5],box(-6,-38,0,43,25,6,{tone:'lo'})+box(-4,-36,6,39,21,2,{tone:'hi'}));
 put('workshop','tools',[15,-27,14],box(0,-34,8,10,15,13)+box(24,-34,8,9,15,13)+box(10,-30,13,14,6,5,{tone:'hi'}));
 for(let i=0;i<5;i++) put('rack'+i,'tools',[i*5-3,-18,8],box(i*5-3,-19,8,2,2,8,{tone:i%2?'hi':'lo'}));
 put('wheel','tools',[29,-27,22],cyl(29,-27,21,5,2,{tone:'lo'})+cyl(29,-27,23,2,1,{tone:'hi'}));
 // Guard post, barrier and calibrated dial.
 put('guard','guard',[56,-25,13],box(48,-34,0,17,18,24)+box(46,-36,24,21,22,3,{tone:'hi'})+box(52,-16,10,5,24,3,{tone:'hi'}));
 put('gauge','guard',[56,-27,27],cyl(56,-27,27,5,1,{tone:'lo'})+cyl(56,-27,28,3.5,.7,{tone:'hi'})+cyl(56,-27,29,0.7,1,{tone:'lo'}));
 for(let i=0;i<4;i++) put('bolt'+i,'guard',[50+i*4,-34,17],box(50+i*4,-35,12,1,1,8,{tone:'lo'}));
 // Mechanical fittings: posts, collars, rivets and an instrument panel.
 for(let i=0;i<5;i++) put('modelbolt'+i,'model',[-56+i*6,-36,30],cyl(-56+i*6,-36,30,0.8,0.7,{tone:'lo'}),10);
 for(let i=0;i<4;i++) put('toolbolt'+i,'tools',[-2+i*11,-35,8],cyl(-2+i*11,-35,8,0.8,0.7,{tone:'lo'}),10);
 put('panel','model',[-43,-30,31],box(-51,-34,30,16,9,1,{tone:'lo'})+box(-49,-32,31,12,5,1,{tone:'hi'}),12);
 for(let i=0;i<4;i++) put('panelpin'+i,'model',[-48+i*3,-30,32],cyl(-48+i*3,-30,32,.6,.7,{tone:'lo'}),15);
 for(let i=0;i<3;i++) put('post'+i,'base',[-65+i*63,4,0],cyl(-65+i*63,4,0,2,3,{tone:'lo'})+cyl(-65+i*63,4,3,1,5,{tone:'hi'}));
 // Locomotive and eight distinct message wagons; initially only request is visible.
 for(let i=0;i<9;i++) {
   const x=-66+i*15;
   const wagon=box(x,15,3,12,10,2,{tone:'lo'})+box(x+1,16,5,10,8,7,{tone:i===0?'hi':'mid'})+box(x+2,17,12,8,6,1,{tone:'hi'})+
   [x+2,x+10].map(wx=>[14,25].map(wy=>cyl(wx,wy,1,1.6,2,{tone:'lo'})).join('')).join('')+
   box(x+3,16,7,1,8,4,{tone:'lo'})+box(x+8,16,7,1,8,4,{tone:'lo'});
   put('car'+i,'context',[x+6,20,7],`<g data-car="${i}">${wagon}</g>`,10);
 }
 const labels=[{at:[-43,-25,31],dx:-68,dy:-54,text:'MODEL'}, {at:[15,-28,22],dx:-10,dy:-68,text:'TOOLS'}, {at:[56,-27,30],dx:38,dy:-50,text:'GUARD'}, {at:[0,21,12],dx:0,dy:66,text:'CONTEXT'}];
 const body=items.sort((a,b)=>a.key-b.key).map(i=>`<g data-i="${i.id}" data-asm="${i.asm}">${i.svg}</g>`).join('');
 const svg=k.figureSvg({width:W,height:H,label:'A context train collects message cars below a model signal box, tool workshop and guard post.',body:`${ink.wobbleFilter()}<g data-layer filter="url(#iso-hand)">${body}</g><g data-pills>${labels.map(l=>ink.pillSvg(k.iso(l.at,P),l.dx,l.dy,l.text,false)).join('')}</g>`}).replace('<svg ','<svg data-ie-svg ');
 const controls=`<button class="ia-btn" data-run>Run</button><button class="ia-btn" data-step>Step</button><button class="ia-btn" data-reset>Reset</button>
 <label class="ia-field">Task <select class="ia-select" data-control="task"><option value="weather">Weather</option><option value="research">Research</option><option value="error">Tool error</option></select></label>
 <label class="ia-field">Max model turns <select class="ia-select" data-control="maxSteps">${[1,2,3,4,5].map(n=>`<option>${n}</option>`).join('')}</select></label>
 <label class="ia-field">Context budget <select class="ia-select" data-control="budget">${[50,80,120,180].map(n=>`<option value="${n}">${n} tokens</option>`).join('')}</select></label>
 <label class="ia-toggle"><input type="checkbox" data-control="flaky"> Flaky tool</label><label class="ia-toggle"><input type="checkbox" data-control="retry"> Retry once</label><label class="ia-toggle"><input type="checkbox" data-control="approval"> Approval gate</label>`;
 return {svg,data:{P},css:'',controls,readouts:[{key:'turns',label:'Model turns'},{key:'tokens',label:'Context tokens'},{key:'calls',label:'Tool attempts'},{key:'status',label:'Outcome'}]};
}
