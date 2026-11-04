import * as k from '../../kit/iso-kit.mjs';
import * as ink from '../../kit/ink.mjs';
export function figure() {
 const W=900,H=520, plate={x:-85,y:-45,w:170,d:90,r:3};
 const P=k.fitProjection([...k.boxCorners(plate,-6,0),[-75,-38,44],[75,-38,44]],W,H,{pad:35,azimuth:60});
 const solid=(p,s={})=>ink.inkSolid(p,{tone:'mid',...s});
 const box=(x,y,z,w,d,h,s={})=>solid(k.slabOf({x,y,w,d,r:.6},z,h,P,3),s);
 const cyl=(x,y,r,z,h,s={})=>solid(k.cylinder(x,y,r,z,h,P,24),s);
 const items=[]; const put=(id,asm,ref,svg,bias=0)=>items.push({id,asm,key:k.depthOf(ref,P)+bias,svg});
 put('shadow','base',[0,0,-100],ink.castShadowSvg(k.boxCorners({x:-77,y:-34,w:152,d:64},0,22),P),-1000);
 put('bench','base',[0,0,-100],box(-85,-45,-6,170,90,6,{material:'board'})+ink.silhouetteSvg(k.boxCorners(plate,-6,0),P),-900);
 // Two input levers, six weighted carriages, gearbox cams, gauge and recorder.
 for(let i=0;i<2;i++){let x=-72+i*9;put('lever'+i,'input',[x,12,8],box(x-3,7,0,6,10,2)+cyl(x,12,2,2,2,{tone:'lo'})+box(x-.7,11.3,4,1.4,1.4,15,{tone:'hi'})+cyl(x,12,2,19,2,{tone:'hi'}));}
 for(let i=0;i<6;i++){
  const x=-48+i*15;
  put('carriage'+i,'hidden',[x,-4,3],box(x-6,-15,0,12,25,3)+box(x-5,-13,3,10,20,2,{tone:'lo'})+cyl(x,-4,4,5,2,{tone:'hi'})+cyl(x,-4,2.6,7,1,{tone:'lo'})+`<g data-dial="${i}">${k.lineSvg(k.lineOnTop([x,-4],[x+2,-4],8.1,P),{tone:'hi'})}</g>`);
  for(let j=0;j<4;j++) put(`bolt${i}-${j}`,'hidden',[x-4+j*2,-13,5],cyl(x-4+j*2,-13,.45,5,.5,{tone:'hi'}),2);
  put('gear'+i,'hidden',[x,-25,7],box(x-5,-30,0,10,10,9)+cyl(x,-25,3.5,9,1,{tone:'hi'})+cyl(x,-25,1,10,1,{tone:'lo'}));
 }
 // Forward rods and return belt have supports at both ends.
 for(let j=0;j<3;j++){let y=15+j*4;put('rod'+j,'input',[0,y,5],box(-59,y,4,120,1,1,{tone:'hi'})+cyl(-59,y+.5,1.4,2,3)+cyl(60,y+.5,1.4,2,3));}
 put('belt','backprop',[0,32,3],box(-55,29,1,111,5,2,{tone:'lo'})+cyl(-55,31.5,3,3,1)+cyl(56,31.5,3,3,1));
 for(let i=0;i<12;i++) put('beltmark'+i,'backprop',[-48+i*9,31,3],box(-48+i*9,30,3,2,3,.4,{tone:'hi'}),2);
 put('pulse','input',[-59,19,7],`<g data-pulse>${cyl(-59,19,2.2,6,2,{tone:'hi'})}</g>`,10);
 put('token','backprop',[55,31,6],`<g data-token>${cyl(55,31,2,4,2,{tone:'hi'})}</g>`,10);
 put('gauge','loss',[64,-13,10],box(57,-20,0,15,15,4)+cyl(64,-13,7,4,3,{tone:'hi'})+cyl(64,-13,5.5,7,.6,{tone:'lo'})+`<g data-needle>${k.lineSvg(k.lineOnTop([64,-13],[64,-8.5],7.8,P),{tone:'hi'})}</g>`+cyl(64,-13,.8,8,1,{tone:'hi'}));
 // Chart paper is a top surface; the plotted path changes with real loss.
 put('chart','loss',[18,-35,12],box(-15,-42,0,70,13,4)+box(-13,-40,4,66,9,1,{tone:'hi'})+cyl(-12,-35.5,2,5,2)+cyl(52,-35.5,2,5,2)+`<path data-chart class="iso-line" data-tone="lo" fill="none" d=""/>`);
 for(let i=0;i<8;i++) put('charttick'+i,'loss',[-8+i*8,-40,5],k.lineSvg(k.lineOnTop([-8+i*8,-40],[-8+i*8,-39],5.2,P),{tone:'lo'}),3);
 const labels=[{asm:'input',at:[-67,12,20],dx:-65,dy:-48,text:'INPUT'}, {asm:'hidden',at:[-8,-25,11],dx:-22,dy:-64,text:'HIDDEN'}, {asm:'loss',at:[64,-13,10],dx:42,dy:-45,text:'LOSS'}, {asm:'backprop',at:[15,31,4],dx:5,dy:38,text:'GRADIENT'}];
 const body=items.sort((a,b)=>a.key-b.key).map(i=>`<g data-i="${i.id}" data-asm="${i.asm}">${i.svg}</g>`).join('');
 const svg=k.figureSvg({width:W,height:H,label:'A calculating bench with input levers, hidden gearboxes and weight dials, a loss gauge, a return belt and a loss chart.',body:`${ink.wobbleFilter()}<g data-layer filter="url(#iso-hand)">${body}</g><g data-pills></g>`}).replace('<svg ','<svg data-ie-svg ');
 const options=(vals,selected)=>vals.map(v=>`<option value="${v}" ${v===selected?'selected':''}>${v}</option>`).join('');
 const controls=`<button class="ia-btn" data-run>Run</button><button class="ia-btn" data-step>Train 1 step</button><button class="ia-btn" data-reset>Reset</button><label class="ia-field">Learning rate <input class="ia-range" data-rate type="range" min="0" max="9" step="1" value="4"><output data-rate-value>0.2</output></label><label class="ia-field">Hidden units <select class="ia-select" data-hidden>${options([2,3,4,5,6],4)}</select></label><label class="ia-field">Activation <select class="ia-select" data-activation>${options(['tanh','relu','none'],'tanh')}</select></label><label class="ia-field">Steps per run <select class="ia-select" data-steps>${options([10,50,200],50)}</select></label><label class="ia-field">Seed <select class="ia-select" data-seed>${options([1,2,3,4,5,6,7,8,9,10],1)}</select></label>`;
 return {svg,data:{P,labels},css:'',controls,readouts:[{key:'step',label:'Step'},{key:'loss',label:'MSE loss'},{key:'accuracy',label:'Accuracy'},{key:'gradient',label:'Largest gradient'},{key:'change',label:'Weight change norm'}]};
}
