import * as k from '../../kit/iso-kit.mjs';
import * as ink from '../../kit/ink.mjs';
export function figure() {
 const W=900,H=440, plate={x:-85,y:-45,w:170,d:90,r:3};
 const P=k.fitProjection([...k.boxCorners(plate,-6,0),[-28,-40,43],[59,-40,43]],W,H,{pad:24,azimuth:60});
 const solid=(p,s={})=>ink.inkSolid(p,{tone:'mid',...s});
 const box=(x,y,z,w,d,h,s={})=>solid(k.slabOf({x,y,w,d,r:.6},z,h,P,3),s);
 const cyl=(x,y,r,z,h,s={})=>solid(k.cylinder(x,y,r,z,h,P,24),s);
 const line=(a,b)=>{const A=k.iso(a,P),B=k.iso(b,P);return `M${A[0]} ${A[1]}L${B[0]} ${B[1]}`};
 const items=[]; const put=(id,asm,ref,svg,bias=0)=>items.push({id,asm,key:k.depthOf(ref,P)+bias,svg});
 put('shadow','base',[0,0,-100],ink.castShadowSvg(k.boxCorners({x:-77,y:-34,w:152,d:64},0,22),P),-1000);
 put('bench','base',[0,0,-100],box(-85,-45,-6,170,90,6,{material:'board'})+ink.silhouetteSvg(k.boxCorners(plate,-6,0),P),-900);
 // Two input levers, six weighted carriages, gearbox cams, gauge and recorder.
 for(let i=0;i<2;i++){let x=-72+i*9;put('lever'+i,'input',[x,12,8],box(x-3,7,0,6,10,2)+cyl(x,12,2,2,2,{tone:'lo'})+box(x-.7,11.3,4,1.4,1.4,15,{tone:'hi'})+cyl(x,12,2,19,2,{tone:'hi'}));}
 for(let i=0;i<6;i++){
  const x=-48+i*15;
  put('carriage'+i,'hidden',[x,-4,3],box(x-6,-15,0,12,25,3)+box(x-5,-13,3,10,20,2,{tone:'lo'})+cyl(x,-4,4,5,2,{tone:'hi'})+cyl(x,-4,2.6,7,1,{tone:'lo'})+`<path class="zero-mark" d="${k.lineOnTop([x,-8.2],[x,-9.2],8.2,P)}"/><path d="${k.radialTicks(x,-4,3.7,12,3,8.1,[.5,1],P).minor} ${k.radialTicks(x,-4,3.7,12,3,8.1,[.5,1],P).major}" class="dial-ticks"/><g data-dial="${i}"><path d="${k.lineOnTop([x,-4],[x,-7],8.2,P)}" class="dial-needle"/></g>`);
  for(let j=0;j<4;j++) put(`bolt${i}-${j}`,'hidden',[x-4+j*2,-13,5],cyl(x-4+j*2,-13,.45,5,.5,{tone:'hi'}),2);
  const face=[[-4,2],[4,2],[4,8],[-4,8]].map(([dx,z])=>k.iso([x+dx,-19.8,z],P).join(',')).join(' ');
  const curves={tanh:[[-3,3],[-2,3.2],[-1,3.6],[0,5],[1,6.4],[2,6.8],[3,7]],relu:[[-3,3],[0,3],[3,7]],none:[[-3,3],[3,7]]};
  put('gear'+i,'hidden',[x,-25,7],box(x-5,-30,0,10,10,9)+cyl(x,-25,2.5,9,1,{tone:'hi'})+`<polygon class="activation-plate" points="${face}"/>`+Object.entries(curves).map(([a,points])=>`<path data-activation-curve="${a}" class="activation-curve" d="${points.map(([dx,z],j)=>{const pt=k.iso([x+dx,-19.6,z],P);return `${j?'L':'M'}${pt[0]} ${pt[1]}`}).join(' ')}"/>`).join(''));

 }
 // Forward rods and return belt have supports at both ends.
 for(let j=0;j<3;j++){let y=15+j*4;put('rod'+j,'input',[0,y,5],box(-59,y,4,120,1,1,{tone:'hi'})+cyl(-59,y+.5,1.4,2,3)+cyl(60,y+.5,1.4,2,3));}
 put('belt','backprop',[0,32,3],box(-55,29,1,111,5,2,{tone:'lo'})+cyl(-55,31.5,3,3,1)+cyl(56,31.5,3,3,1));
 for(let i=0;i<12;i++) put('beltmark'+i,'backprop',[-48+i*9,31,3],box(-48+i*9,30,3,2,3,.4,{tone:'hi'}),2);
 put('pulse','input',[-59,19,7],`<g data-pulse>${cyl(-59,19,2.2,6,2,{tone:'hi'})}</g>`,10);
 put('token','backprop',[55,31,6],`<g data-token>${cyl(55,31,2,4,2,{tone:'hi'})}</g>`,10);
 put('gauge','loss',[64,-13,10],box(57,-20,0,15,15,4)+cyl(64,-13,7,4,3,{tone:'hi'})+cyl(64,-13,5.5,7,.6,{tone:'lo'})+`<g data-needle>${k.lineSvg(k.lineOnTop([64,-13],[64,-8.5],7.8,P),{tone:'hi'})}</g>`+cyl(64,-13,.8,8,1,{tone:'hi'}));
 // Upright strip-chart recorder: supported frame, paper, ruled logarithmic scale and moving pen.
 put('recorder-support','loss',[14,-40,10],box(-25,-43,0,4,5,32,{tone:'lo'})+box(54,-43,0,4,5,32,{tone:'lo'})+box(-25,-43,0,83,5,5,{tone:'lo'}));
 const paper=[[-23,-37,6],[56,-37,6],[56,-37,40],[-23,-37,40]].map(p=>k.iso(p,P));
 const poly=paper.map(p=>p.join(',')).join(' ');
 const zOf=n=>8+29*(Math.log10(n)+2)/2;
 let chart=`<polygon class="chart-paper" points="${poly}"/>`;
 for(const n of [1,.1,.01]) {const z=zOf(n),pt=k.iso([-21,-36.8,z],P);chart+=`<path class="chart-grid" d="${line([-14,-36.8,z],[53,-36.8,z])}"/><text class="chart-label" x="${pt[0]}" y="${pt[1]+3}">${n}</text>`;}
 for(let x=-14;x<=53;x+=11.1667) chart+=`<path class="chart-grid" d="${line([x,-36.8,8],[x,-36.8,37])}"/>`;
 chart+=`<path class="chart-solved" d="${line([-14,-36.6,zOf(.05)],[53,-36.6,zOf(.05)])}"/><text class="solved-label" x="${k.iso([43,-36.5,zOf(.05)],P)[0]}" y="${k.iso([43,-36.5,zOf(.05)],P)[1]-4}">0.05</text><path data-chart class="chart-trace" d=""/><g data-pen><path class="pen-arm" d="${line([52,-36.2,40],[52,-36.2,37])}"/><circle data-pen-tip r="3"/></g>`;
 put('chart','loss',[16,-40,22],box(-25,-43,39,83,5,3,{tone:'lo'})+box(-25,-43,3,83,5,3,{tone:'lo'})+chart,5);
 for(let x=-20;x<=50;x+=10) put('ruler'+x,'loss',[x,26,1],`<path class="detail-line" d="${line([x,25,0.2],[x,27,0.2])}"/>`,4);
 put('nameplate','base',[-66,36,1],box(-76,33,0,19,6,1,{tone:'hi'})+k.faceTextSvg(k.topMatrix([-74,37],1.2,P),'TRAIN',{size:3.1}),4);
 const labels=[{asm:'input',at:[-67,12,20],dx:-65,dy:-48,text:'INPUT'}, {asm:'hidden',at:[-32,-25,11],dx:-32,dy:-38,text:'HIDDEN'}, {asm:'loss',at:[12,-40,40],dx:12,dy:-25,text:'LOSS'}, {asm:'backprop',at:[15,31,4],dx:5,dy:38,text:'GRADIENT'}];
 const body=items.sort((a,b)=>a.key-b.key).map(i=>`<g data-i="${i.id}" data-asm="${i.asm}">${i.svg}</g>`).join('');
 const svg=k.figureSvg({width:W,height:H,label:'A calculating bench with input levers, hidden gearboxes and weight dials, a loss gauge, a return belt and a loss chart.',body:`${ink.wobbleFilter()}<g data-layer filter="url(#iso-hand)">${body}</g><g data-pills></g>`}).replace('<svg ','<svg data-ie-svg ');
 const options=(vals,selected)=>vals.map(v=>`<option value="${v}" ${v===selected?'selected':''}>${v}</option>`).join('');
 const controls=`<button class="ia-btn" data-run>Run</button><button class="ia-btn" data-step>Train 1 step</button><button class="ia-btn" data-reset>Reset</button><label class="ia-field">Learning rate <input class="ia-range" data-rate type="range" min="0" max="9" step="1" value="4"><output data-rate-value>0.2</output></label><label class="ia-field">Hidden units <select class="ia-select" data-hidden>${options([2,3,4,5,6],4)}</select></label><label class="ia-field">Activation <select class="ia-select" data-activation>${options(['tanh','relu','none'],'tanh')}</select></label><label class="ia-field">Steps per run <select class="ia-select" data-steps>${options([10,50,200],50)}</select></label><label class="ia-field">Seed <select class="ia-select" data-seed>${options([1,2,3,4,5,6,7,8,9,10],1)}</select></label><span class="chart-note">Chart clips loss outside 0.01–1.</span>`;
 return {svg,data:{P,labels},css:`.chart-note{font-size:12px;color:var(--ink-soft)}.chart-paper{fill:#f8f5e9;stroke:#263249;stroke-width:2}.chart-grid{fill:none;stroke:#9da9aa;stroke-width:.65}.chart-label{fill:#263249;font:700 10px monospace}.chart-solved{fill:none;stroke:#6646e8;stroke-width:2;stroke-dasharray:5 3}.solved-label{fill:#6646e8;font:700 9px monospace}.chart-trace{fill:none;stroke:#17213a;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}.pen-arm{fill:none;stroke:#273248;stroke-width:2}.dial-ticks,.detail-line{fill:none;stroke:var(--ink);stroke-width:1}.dial-needle{fill:none;stroke:var(--ink);stroke-width:2.4;stroke-linecap:round}.activation-plate{fill:var(--ceramic-l);stroke:var(--ink);stroke-width:.7}.activation-curve{fill:none;stroke:var(--ink);stroke-width:1.7}.zero-mark{fill:none;stroke:var(--ink);stroke-width:2}.plate-label{fill:var(--ink);font:700 7px monospace}[data-token] {color:#df7259} [data-token].negative {color:#588ee1} .iso-ink [data-token] .iso-top{fill:currentColor}`,controls,readouts:[{key:'step',label:'Step'},{key:'loss',label:'MSE loss'},{key:'accuracy',label:'Accuracy'},{key:'gradient',label:'Largest gradient'},{key:'change',label:'Weight change norm'}]};
}
