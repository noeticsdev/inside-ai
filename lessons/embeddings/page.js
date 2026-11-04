import * as M from './model.mjs';
import {createGuide,s,T_,fmt,pyCell,svgBox} from '../../platform/shell/guide-runtime.js';
let G; const rank=M.rank(M.QUERIES.puppy); const state={threshold:M.THRESHOLD_START};
const show = x => x.toFixed(3);
const val = x => x.toFixed(2);
const doc = id => M.DOCS.find(d=>d.id===id);
const W = M.thresholdWindow();
// Board part ids and the build steps that add or change them (1-based build index).
const FRESH={matrix:[1,2,4],query:[3],scores:[5],results:[6,7,8]};
const active=(ctx,id)=>(FRESH[id]||[]).includes(ctx.fresh) || (ctx.on||[]).includes(id);
// Label placement for the 2-D view: [dx, dy, anchor]. Hand-placed so no label crosses a point or the query arrow.
const LBL={pizza:[-8,4,'end'],bread:[8,4,'start'],laptop:[-8,16,'end'],encyclopedia:[-6,-10,'end'],bank:[0,-11,'middle'],stocks:null,puppy:[-8,5,'end'],kitten:[-8,-6,'end'],dog:[-8,4,'end'],server:[-8,4,'end'],beach:[-8,4,'end'],mountain:[-8,4,'end']};
function board(ctx){
 const svg=s('svg',{viewBox:'0 0 1000 600',role:'img','aria-label':'Document matrix, query vector and cosine scores, a two-dimensional view of the vectors, ranked results and a readout'});
 const rect=(x,y,w,h,cls='hw-part')=>s('rect',{class:cls,x,y,width:w,height:h,rx:5});
 const group=(id,...children)=>s('g',{class:`hw-grp ${active(ctx,id)?'is-on':''}`},children);
 const scale=ctx.step.id==='scale'||ctx.step.phase==='done';
 svg.append(rect(5,5,990,590,'hw-chassis'),T_(22,30,'VECTOR SEARCH · SIMULATION · HAND-SET 6-D VECTORS','hw-chassis-label'));
 // Document matrix: one row per document, one column per axis.
 svg.append(group('matrix',rect(20,48,452,410),T_(32,72,ctx.built>=2?'NORMALIZED INDEX  ·  12 × 6':ctx.built>=1?'EMBEDDINGS  ·  12 × 6':'DOCUMENTS  ·  12 ROWS','hw-label')));
 M.AXES.forEach((a,j)=>svg.append(T_(184+j*46,101,a.slice(0,4),'hw-sub','middle')));
 M.DOCS.forEach((d,i)=>{
  const y=112+i*26; const v=ctx.built>=2?M.normalize(d.v):d.v;
  svg.append(T_(31,y+17,d.id,'ro-t'));
  v.forEach((x,j)=>{svg.append(rect(162+j*46,y,43,23,ctx.built>=1?'hw-detail-fill':'hw-chassis')); if(ctx.built>=1)svg.append(T_(183.5+j*46,y+16,val(x),'emb-cell','middle'));});
 });
 const idx=scale&&ctx.solved('scale')?`FP32 ${M.ANSWERS.indexFp32} B · INT8 ${M.ANSWERS.indexInt8} B (example)`:ctx.built>=4?`IndexFlatIP(6) · ntotal 12 · float32 · ${ctx.solved('store')?M.ANSWERS.indexFp32:'?'} B`:'not indexed yet';
 svg.append(T_(32,444,idx,(ctx.fresh===4||ctx.step.id==='scale')?'ro-a':ctx.built>=4?'ro-t':'hw-sub'));
 // Query column, then the scores it produces against every row.
 if(ctx.built>=3){
  svg.append(group('query',rect(492,48,80,250),T_(532,72,'QUERY','hw-label','middle'),T_(532,94,'“puppy”','hw-sub','middle')));
  M.normalize(M.QUERIES.puppy.v).forEach((v,j)=>svg.append(rect(503,108+j*28,58,23,'hw-detail-fill'),T_(532,124+j*28,val(v),'ro-v','middle')));
  svg.append(T_(532,286,'q · 6-D','hw-sub','middle'));
 }
 if(ctx.built>=5){
  svg.append(T_(482,180,'×','hw-label','middle'),T_(582,180,'=','hw-label','middle'));
  svg.append(group('scores',rect(592,48,92,410),T_(638,72,'SCORES','hw-label','middle'),T_(638,94,'cos(q,row)','hw-sub','middle')));
  M.DOCS.forEach((d,i)=>{const sc=M.cosine(d.v,M.QUERIES.puppy.v);svg.append(T_(638,129+i*26,ctx.solved('search')?show(sc):'?',ctx.solved('search')&&M.relevant.includes(d.id)?'ro-a':'ro-v','middle'));});
 }
 // 2-D view: a fixed linear projection (first two principal components). Drawing only.
 const px=ctx.built<5?606:700, pw=978-px;
 svg.append(group('projection',rect(px,48,pw,286),T_(px+14,72,'2-D VIEW · SCORES USE 6-D','hw-label')));
 const ox=ctx.built<5?846:878,oy=208,k=ctx.built<5?190:152,P=v=>{const [x,y]=M.project2(M.normalize(v));return [ox+x*k,oy-y*k];};
 svg.append(s('line',{class:'hw-detail',x1:ox-10,y1:oy,x2:ox+10,y2:oy}),s('line',{class:'hw-detail',x1:ox,y1:oy-10,x2:ox,y2:oy+10}));
 if(ctx.built>=1){
  M.DOCS.forEach(d=>{const [px,py]=P(d.v);svg.append(s('circle',{class:ctx.built>=3&&M.relevant.includes(d.id)?'emb-point-relevant':'emb-point',cx:px,cy:py,r:4.5}));const l=LBL[d.id];if(l)svg.append(T_(px+l[0],py+l[1],d.id==='bank'?'bank, stocks':d.id,'emb-lbl',l[2]));});
 }
 if(ctx.built>=3){const [qx,qy]=P(M.QUERIES.puppy.v);svg.append(s('line',{class:'emb-arrow',x1:ox,y1:oy,x2:qx,y2:qy}),s('circle',{class:'emb-q',cx:qx,cy:qy,r:6}),T_(qx-10,qy+17,'query','ro-a','end'));}
 if(ctx.built<3) svg.append(T_(px+14,322,'one dot per document','hw-sub')); 
 // Results: keyword baseline (step 6), then sorted top-k with a threshold (steps 7 and 8).
 if(ctx.built>=6){
  svg.append(group('results',rect(700,346,278,212)));
  if(ctx.built>=7){
   svg.append(T_(714,370,'TOP-K  ·  SORTED','hw-label'));
   const th=ctx.built>=8?state.threshold:null,bx=914,bw=54;
   rank.slice(0,4).forEach((d,i)=>{const y=396+i*24;svg.append(T_(714,y,`${i+1}. ${d.id}`,M.relevant.includes(d.id)?'ro-v':'ro-t'),T_(902,y,show(d.score),'ro-t','end'),s('rect',{class:th!==null&&d.score<th?'emb-bar-muted':'emb-bar',x:bx,y:y-10,width:Math.max(2,d.score*bw),height:9,rx:2}));});
   if(th!==null){const st=M.thresholdStats(th);svg.append(s('line',{class:'cu-mark',x1:bx+th*bw,y1:378,x2:bx+th*bw,y2:474}),T_(714,500,`threshold ${th.toFixed(2)} · ${st.selected.length} pass`,st.fp||st.missed?'ro-v':'ro-a'));}
   svg.append(T_(714,526,'keyword finds 1 of 3','hw-sub'),T_(714,546,'relevant: puppy only','hw-sub'));
  } else {
   const kw=M.rank(M.QUERIES.puppy,'keyword');
   svg.append(T_(714,370,'KEYWORD vs COSINE','hw-label'),T_(714,394,'shared words','hw-sub'),T_(850,394,'cosine','hw-sub'));
   [0,1,2].forEach(i=>{const y=420+i*24;svg.append(T_(714,y,`${kw[i].id} ${kw[i].score}`,i===0?'ro-v':'ro-t'),T_(850,y,ctx.solved('keyword')?`${rank[i].id}`:'?',ctx.solved('keyword')?'ro-a':'ro-v'));});
   svg.append(T_(714,504,'ties at 0 sort by ID','hw-sub'),T_(714,530,'keyword misses dog, kitten','hw-sub'));
  }
 }
 // Readout: two rows of four fields, "?" until the step that produces each value is solved.
 svg.append(rect(20,472,664,104,'hw-fill'),T_(34,494,'QUERY READOUT','hw-label'));
 
 const fields=[['TOKENS','[puppy]','embed'],['VECTOR','[1,0,0,0,0,0]','compare'],['NORM',show(M.norm(M.QUERIES.puppy.v)),'normalize'],['SCORES','12 cosine','search'],['TOP 3','puppy, dog, kitten','python'],['THRESHOLD',`${state.threshold.toFixed(2)} · ${M.thresholdStats(state.threshold).selected.length} pass`,'threshold']];
 fields.forEach(([label,v,id],i)=>{const x=34+(i%3)*210,y=i<3?516:556;const ready=ctx.solved(id);svg.append(T_(x,y-1,label,'hw-sub'),T_(x,y+17,ready?v:'?',ready&&ctx.step.id===id?'ro-a':'ro-v'));});
 return svg;
}
// ---------- close-ups: drawn at the data's real shape ----------
function figure(kind,g){
 const solved=id=>Boolean(g&&g.solved(id));
 const H={kit:226,embed:200,normalize:200,compare:220,store:160,scale:200,search:190,keyword:200,threshold:232,done:140}[kind]||200;
 const svg=svgBox(700,H,`Embedding lesson close-up: ${kind}`);
 const t=(x,y,str,cls='cu-t',anchor='start')=>svg.append(T_(x,y,str,cls,anchor));
 const box=(x,y,w,h,cls='cu-slot')=>svg.append(s('rect',{class:cls,x,y,width:w,height:h,rx:4}));
 const line=(x1,y1,x2,y2,cls='cu-axis')=>svg.append(s('line',{class:cls,x1,y1,x2,y2}));
 const arrow=(x1,y1,x2,y2,cls='emb-arrow')=>{line(x1,y1,x2,y2,cls);const a=Math.atan2(y2-y1,x2-x1),L=9;svg.append(s('path',{class:cls==='emb-arrow'?'emb-head':'emb-head-muted',d:`M${x2} ${y2} L${x2-L*Math.cos(a-0.4)} ${y2-L*Math.sin(a-0.4)} L${x2-L*Math.cos(a+0.4)} ${y2-L*Math.sin(a+0.4)} Z`}));};
 // Quarter unit circle: origin at (ox, oy), radius r. Every vector here has non-negative coordinates.
 const quarter=(ox,oy,r)=>{svg.append(s('path',{class:'cu-axis',d:`M${ox+r} ${oy} A${r} ${r} 0 0 0 ${ox} ${oy-r}`}));line(ox,oy,ox+r+18,oy,'cu-grid');line(ox,oy,ox,oy-r-14,'cu-grid');t(ox+r,oy+15,'1','cu-t-m','middle');t(ox-8,oy-r+4,'1','cu-t-m','end');};
 if(kind==='kit'){
  t(0,16,'12 DOCUMENTS · THE TEXT EACH ROW STANDS FOR','cu-t-b');
  M.DOCS.forEach((d,i)=>{const col=i%2,row=Math.floor(i/2),x=col*355,y=28+row*33;box(x,y,345,27);t(x+8,y+18,d.text);});
 } else if(kind==='embed'){
  const a=[1,2,0,0],b=[2,1,0,0],ok=solved('embed');
  t(0,16,'DOT PRODUCT · ALIGN COORDINATES, MULTIPLY, THEN ADD','cu-t-b');
  a.forEach((v,i)=>{const x=140+i*105;box(x,32,74,30,'cu-slot-on');t(x+37,52,String(v),'cu-t-b','middle');box(x,70,74,30);t(x+37,90,String(b[i]),'cu-t-b','middle');t(x+37,126,`${v} × ${b[i]}${ok?` = ${v*b[i]}`:''}`,'cu-t-a','middle');if(i)t(x-15,126,'+','cu-t-b','middle');});
  t(0,52,'vector a');t(0,90,'vector b');t(0,126,'products');
  line(140,142,529,142,'cu-grid');t(0,166,'sum');t(140,166,ok?'2 + 2 + 0 + 0 = 4':'? + ? + ? + ? = ?','cu-t-b');
  t(0,192,'Each pair of coordinates gives one product; zeros add nothing.','cu-t-m');
 } else if(kind==='normalize'){
  const ok=solved('normalize'),ox=30,oy=180,r=130,L=1.3;quarter(ox,oy,r);
  arrow(ox,oy,ox+0.6*r*L,oy-0.8*r*L,'emb-arrow-muted');t(ox+0.6*r*L+8,oy-0.8*r*L+4,'[3, 4] (drawn short)','cu-t-m');
  arrow(ox,oy,ox+0.6*r,oy-0.8*r);if(ok)t(ox+0.6*r+10,oy-0.8*r+18,'[0.6, 0.8]','cu-t-a');
  t(330,36,'BEFORE  v = [3, 4, 0, 0]','cu-t-b');t(330,60,`|v| = √(3² + 4² + 0² + 0²) = ${ok?'√25 = 5':'?'}`);
  t(330,100,'AFTER  v / |v|','cu-t-a');t(330,124,ok?'= [0.6, 0.8, 0, 0]':'= [3/?, 4/?, 0, 0]');t(330,148,'same direction · length 1 · on the circle');
  t(330,180,'The last two coordinates are zero.','cu-t-m');
 } else if(kind==='compare'){
  const ok=solved('compare'),ox=30,oy=190,r=150;quarter(ox,oy,r);
  arrow(ox,oy,ox+r,oy);t(ox+r+10,oy+4,'q','cu-t-a');
  ['puppy','dog','kitten','bread'].forEach(id=>{const c=M.cosine(M.QUERIES.puppy.v,doc(id).v),a=Math.acos(Math.min(1,c)),x=ox+r*Math.cos(a),y=oy-r*Math.sin(a);arrow(ox,oy,x,y,'emb-arrow-muted');t(x+(id==='bread'?15:8),y+(id==='bread'?-4:4),`${id}${ok?`  ${show(c)}`:''}`,'cu-t-b');});
  t(330,36,'COSINE = q · d / (|q| |d|)','cu-t-b');t(330,60,'= cos of the angle between them');
  t(330,94,'q = [1, 0, 0, 0, 0, 0] points along “anim”,');t(330,114,'so cos = the anim value of a normalized row.');
  t(330,148,ok?`puppy ${show(rank[0].score)} · dog ${show(rank[1].score)} · kitten ${show(rank[2].score)}`:'Read the anim column on the board.',ok?'cu-t-a':'cu-t-m');
  t(330,172,'Smaller angle → higher cosine.','cu-t-m');
 } else if(kind==='store'||kind==='scale'){
  const okF=solved('store'),okI=solved('scale'),wF=440;
  t(0,16,'RAW VECTOR STORAGE · 1,000,000 ROWS × 768 DIMENSIONS · BARS TO SCALE','cu-t-b');
  t(0,48,'one row');for(let i=0;i<32;i++)box(110+i*13.6,34,12,20,i<4?'cu-slot-on':'cu-slot');t(110,72,'768 values × 4 bytes (FP32) = 3,072 B per row','cu-t-m');
  t(0,106,'FP32');box(110,92,wF,24,'cu-slot-on');t(110+wF+10,109,okF?`${fmt(M.ANSWERS.fp32)} B`:'? B','cu-t-b');
  if(kind==='scale'){t(0,146,'INT8');box(110,132,wF/4,24,'cu-slot');t(110+wF/4+10,149,okI?`${fmt(M.ANSWERS.int8)} B`:'? B · 1 byte per value','cu-t-b');}
  t(0,kind==='scale'?186:146,'Raw vectors only: IDs, index overhead and quantization scales are extra.','cu-t-m');
 } else if(kind==='search'){
  const ok=solved('search');
  t(0,16,'EXACT SEARCH · ONE MULTIPLY-ADD PER MATRIX CELL','cu-t-b');
  for(let i=0;i<6;i++)for(let j=0;j<12;j++)box(10+j*28,32+i*21,25,18,i===2?'cu-slot-on':'cu-slot');
  t(10,176,'one row · q = one score (6 of N rows drawn)','cu-t-m');
  t(390,52,'N = 1,000,000 rows','cu-t-b');t(390,80,'d = 768 dimensions','cu-t-b');t(390,112,`N × d = ${ok?fmt(M.ANSWERS.ops):'?'}`,'cu-t-a');t(390,136,'multiply-adds per query');
  t(390,168,'arithmetic count, not latency','cu-t-m');
 } else if(kind==='keyword'){
  const ok=solved('keyword'),q=M.QUERIES.canine,kw=M.rank(q,'keyword'),sem=M.rank(q);
  t(0,16,'QUERY “dog” · same vector as “puppy”: [1, 0, 0, 0, 0, 0]','cu-t-b');t(0,48,'KEYWORD · shared words','cu-t-b');t(355,48,'COSINE · same scores as the board','cu-t-b');
  [0,1,2].forEach(i=>{const y=60+i*36;box(0,y,330,29,i===0?'cu-slot-on':'cu-slot');box(355,y,330,29,ok&&i===0?'cu-slot-on':'cu-slot');t(10,y+20,`${i+1}. ${kw[i].text} · ${kw[i].score}`);t(365,y+20,ok?`${i+1}. ${sem[i].text} · ${show(sem[i].score)}`:`${i+1}. ?`);});
  t(0,186,'Only one document contains the word “dog”. Ties at 0 sort by ID.','cu-t-m');
 } else if(kind==='threshold'){
  const th=state.threshold,st=M.thresholdStats(th),x=130,w=470;
  t(0,16,`SCORE FILTER · keep score ≥ ${th.toFixed(2)}`,'cu-t-b');
  rank.slice(0,5).forEach((d,i)=>{const y=32+i*29,rel=M.relevant.includes(d.id);t(0,y+14,d.id,rel?'cu-t-a':'cu-t');box(x,y,w*d.score,19,d.score>=th?'cu-slot-on':'cu-slot');t(x+w+12,y+14,show(d.score),'cu-t-b');});
  line(x+w*th,26,x+w*th,180,'cu-mark');t(x,198,'0','cu-t-m');t(x+w,198,'1','cu-t-m','end');
  t(0,224,`${st.selected.length} pass · ${st.fp} not relevant · ${st.missed} relevant missed · relevant names in accent`,st.fp||st.missed?'cu-t-bad':'cu-t-a');
 } else {
  const items=[['QUERY','“puppy”'],['VECTOR','[1,0,0,0,0,0]'],['SCORES','12 cosine'],[`TOP 3 · ≥ ${state.threshold.toFixed(2)}`,'puppy, dog, kitten']];
  t(0,16,'THE QUERY PATH YOU BUILT','cu-t-b');
  items.forEach(([a,b],i)=>{const x=i*178;box(x,34,158,62,i===3?'cu-slot-on':'cu-slot');t(x+10,56,a,'cu-t-m');t(x+10,82,b,'cu-t-b');if(i<3)arrow(x+160,65,x+176,65,'emb-arrow-muted');});
  t(0,126,'model.encode → index.search(q, k) → keep score ≥ threshold','cu-t-m');
 }
 return svg;
}
const close = kind => g => figure(kind,g);
const numeric=(id,prompt,hint)=>ui=>ui.number({prompt,placeholder:'answer',check:v=>v===M.ANSWERS[id],hint});
const choice=(prompt,options,answer)=>ui=>ui.choice({prompt,options,check:id=>id===answer});
const part=(name,runs,conf)=>[{glyph:'model',name,runs,conf}];
const ON={embed:['matrix'],normalize:['matrix'],compare:['query','projection'],store:['matrix'],search:['scores'],keyword:['results'],python:['results'],threshold:['results'],scale:['matrix']};
const step=(id,title,lead,adds,task,after,phase='build')=>({id,phase,on:ON[id]||[],kicker:phase==='scale'?'Scale the index':'Build the index',title,lead,minutes:2,view:'board',adds,closeLabel:'CLOSE-UP · DATA',closeHint:'simulation · hand-set vectors',close:close(id),mission:id,task,after:()=>after});
const pythonSolution=`import math\ndef cosine(a, b):\n    dot = sum(x*y for x,y in zip(a,b))\n    na = math.sqrt(sum(x*x for x in a))\n    nb = math.sqrt(sum(x*x for x in b))\n    return dot / (na*nb) if na and nb else 0.0\n\ndef top_k(query, index, k):\n    return [id for id, vec in sorted(index.items(), key=lambda item: (-cosine(query, item[1]), item[0]))[:k]]\n`;
function benchPython(host){pyCell(host,{id:'embeddings-topk',title:'Python · cosine and top-k',prompt:'Implement cosine(a, b) and top_k(query, index, k). The index maps IDs to vectors. Break score ties by ascending ID; return 0 for a zero vector.',starter:'def cosine(a, b):\n    return 0.0\n\ndef top_k(query, index, k):\n    return []\n',data:{index:{b:[1,0],a:[1,0],c:[0,1]}},tests:["check('cosine identical', abs(cosine([3,4],[3,4])-1)<1e-9, 'identical directions score 1')","check('cosine orthogonal', abs(cosine([1,0],[0,1]))<1e-9, 'orthogonal directions score 0')","check('zero guard', cosine([0,0],[1,0]) == 0, 'zero vectors return 0')","check('ties by ID', top_k([1,0], DATA['index'], 2) == ['a','b'], 'equal scores sort by ID')","check('k above N', top_k([1,0], DATA['index'], 9) == ['a','b','c'], 'return all IDs in score order')"].join('\n'),solution:pythonSolution,onPass:()=>G.pass('python',{passed:true})});}
// Names the document that breaks the filter and the score to move past.
const thresholdCheck=()=>{
 const x=M.thresholdStats(state.threshold);
 if(x.fp){const extra=x.selected.filter(d=>!M.relevant.includes(d.id));return `${extra.map(d=>`${d.id} (${show(d.score)})`).join(', ')} passes but is not relevant. Raise the threshold above ${show(extra[0].score)}.`;}
 if(x.missed){const miss=rank.filter(d=>M.relevant.includes(d.id)&&d.score<state.threshold);return `${miss.map(d=>`${d.id} (${show(d.score)})`).join(', ')} is relevant but falls below the threshold. Lower it to ${show(miss[miss.length-1].score)} or less.`;}
 return true;
};
const steps=[
 {id:'kit',phase:'kit',kicker:'Before you start',title:'Check your kit',lead:'Build a searchable index from twelve short documents. This simulation uses a hand-set six-dimensional table in place of a trained embedding model.',minutes:1,view:'board',parts:()=>[{title:'Data and model',n:3},{glyph:'tag',name:'12 documents',runs:M.DOCS.map(d=>d.id).join(' · ')},{glyph:'tag',name:'Query set',runs:Object.values(M.QUERIES).map(q=>q.text).join(' · ')},{glyph:'model',name:'Fixed embedding table',runs:'6 named axes · teaching stand-in for a real model'}],closeLabel:'THE DOCUMENTS',closeHint:'simulation · fixed example',close:close('kit'),task:'predict',nextLabel:"Everything's here"},
 step('embed','Embed a document','Add a tokenizer and an embedding model. Real models learn vectors; this simulation looks them up in a fixed table. Search compares vectors with a dot product.',part('sentence-transformers','encode the input text','model.encode(texts)'),numeric('dot','What is the dot product of [1, 2, 0, 0] and [2, 1, 0, 0]?',v=>v===2?'2 is one product. Multiply each pair of coordinates, then add all four products.':v===3?'3 adds the coordinates of one vector. Multiply pairs first: 1×2 and 2×1.':'Multiply corresponding coordinates, then add the four products.'),'1×2 + 2×1 + 0×0 + 0×0 = 2 + 2 = <b>4</b>. A dot product sums coordinate-wise products.'),
 step('normalize','Normalize the vectors','Add L2 normalization after the embedder. Dividing by length keeps direction and makes nonzero vectors unit length.',part('sentence-transformers','return unit-length embeddings','model.encode(texts, normalize_embeddings=True)'),numeric('length','What is the length of [3, 4, 0, 0]?',v=>v===25?'25 is the sum of squares. Take its square root.':v===7?'7 adds the coordinates. Length squares them first: √(3² + 4²).':'Square each coordinate, add, then take the square root.'),'√(3² + 4²) = √(9 + 16) = √25 = <b>5</b>. Divide each coordinate by 5: [0.6, 0.8, 0, 0].'),
 step('compare','Compare by cosine','Embed the query with the same model and compare directions. Cosine is the dot product divided by both lengths, so it ignores vector length.',part('sentence-transformers','encode the query with the same model','model.encode([query], normalize_embeddings=True)'),choice('Which document has the highest cosine with the query “puppy”?', [['puppy','puppy',null],['dog','dog','Dog is close: its normalized anim value is 0.90. Puppy’s is 0.98, and with q on the anim axis cosine equals that value.'],['kitten','kitten','Kitten is relevant, but its normalized anim value is only 0.71: part of it points along place and feeling.'],['bread','bread','Bread has 0.00 on the anim axis, so its cosine with q is 0.']],'puppy'),`q = [1, 0, 0, 0, 0, 0], so q · row is the row’s anim value. Puppy ${show(rank[0].score)} beats dog ${show(rank[1].score)} and kitten ${show(rank[2].score)}.`),
 step('store','Store the index','Add an index that holds one vector per document. A real embedding model uses hundreds or thousands of dimensions; this capacity example uses 768.',part('FAISS IndexFlatIP','store normalized FP32 vectors for exact cosine search','index = faiss.IndexFlatIP(768)\nindex.add(x)  # x: float32 [N, 768]'),numeric('fp32','How many bytes do 1,000,000 FP32 vectors of 768 dimensions take?',v=>v===768000000?'That counts values, but each FP32 value takes 4 bytes.':v===24576000000?'That is bits. Divide by 8 for bytes.':v===3072?'That is one row. Multiply by 1,000,000 rows.':'Multiply rows × dimensions × 4 bytes.'),`1,000,000 × 768 × 4 = <b>3,072,000,000 bytes</b> (about 3.1 GB), excluding IDs and metadata. The 12-row board index is 12 × 6 × 4 = ${M.ANSWERS.indexFp32} B.`),
 step('search','Search by brute force','Add a matrix–vector product that scores every row. Exact search computes one multiply-add per dimension of each row.',part('FAISS search','compare the query with every indexed row','scores, ids = index.search(q, k)'),numeric('ops','How many multiply-adds per query for 1,000,000 rows × 768 dimensions?',v=>v===3072000000?'That is the FP32 byte count; each value needs one multiply-add, not four.':v===1000000?'That is one score per row; each score takes 768 multiply-adds.':'Multiply the number of rows by the dimensions.'),'1,000,000 × 768 = <b>768,000,000 multiply-adds</b> per query. This counts arithmetic, not latency.'),
 step('keyword','Compare keyword and meaning','Add a keyword baseline beside vector search. It counts the distinct words a document shares with the query. Run the query “dog” through both.',part('keyword baseline','count distinct words shared with the query','len(set(query_words) & set(doc_words))'),choice('“dog” embeds to the same vector as “puppy”. Which document does cosine rank first, though it shares no word with “dog”?', [['dog','young dog runs meadow','It shares the word “dog”, so it leads keyword search. Its cosine is 0.902, second.'],['puppy','puppy chases ball park',null],['kitten','kitten naps sunny rug','Kitten is relevant but ranks third by cosine (0.714).'],['bread','fresh bread bakery morning','Bread has 0 on the anim axis, so its cosine is 0.']],'puppy'),'Keyword overlap puts <b>young dog runs meadow</b> first: 1 shared word. Cosine puts <b>puppy chases ball park</b> first: 0.985 against 0.902, with no shared word.'),
 {...step('python','Implement top-k','Add a top-k operator to order the scores. Write the cosine and ranking functions using Python’s standard library.',part('top-k','sort descending and break ties by ID','sorted(scores, key=lambda x: (-x.score, x.id))[:k]'),ui=>ui.code({prompt:'Write both functions and run all five checks.',fallback:[['Divide the dot product by both lengths, sort descending, break ties by ID',true],['Sort ascending by score',false,'The highest similarity belongs first.'],['Divide by the dot product',false,'Cosine divides the dot product by the two lengths.']]}),'Cosine returns 0 for a zero vector, and sorting by (−score, id) makes ties reproducible: [1, 0] ties a and b at 1.0, so a comes first.'),view:'bench',bench:benchPython},
 {...step('threshold','Set a score threshold','Add a minimum score filter after ranking. The labeled set treats dog, puppy and kitten as relevant for the query “puppy”.',part('score filter','keep scores at or above the chosen threshold','keep = scores >= threshold  # NumPy mask'),ui=>ui.sliders({prompt:'Set a threshold that keeps all three relevant documents and nothing else.',sliders:[{label:'threshold',min:0,max:1,step:0.01,get:()=>state.threshold,set:v=>state.threshold=v,format:v=>v.toFixed(2)}],check:thresholdCheck}),`Any threshold above encyclopedia’s ${show(W.above)} and at or below kitten’s ${show(W.atMost)} works: 3 pass, 0 irrelevant, 0 missed. Precision = 3/3 and recall = 3/3.`),onReveal:()=>state.threshold=0.6},
 step('scale','Shrink the index','Add an INT8 storage option for the large example. This is a simulation of raw storage: quantization can change scores and recall.',part('FAISS IndexScalarQuantizer','one byte per value · approximate scores','faiss.IndexScalarQuantizer(768,\n  faiss.ScalarQuantizer.QT_8bit,\n  faiss.METRIC_INNER_PRODUCT)'),numeric('int8','How many raw bytes does INT8 use for the same 1,000,000 × 768 vectors?',v=>v===3072000000?'That is the FP32 size. INT8 uses one byte per value.':v===6144000000?'That is eight bits per value, not eight bytes.':v===384000000?'That would be 4 bits per value. INT8 uses 8 bits, one byte.':'Multiply the number of values by one byte.'),'1,000,000 × 768 × 1 = <b>768,000,000 bytes</b>, a quarter of FP32. Quantization rounds values, so nearest neighbors can change.','scale'),
 {id:'done',phase:'done',kicker:'Done',title:'Keep your index configuration',lead:'You built a small exact semantic search. Your threshold carries into the configuration below.',minutes:0,view:'board',closeLabel:'THE QUERY PATH',closeHint:'simulation · fixed example',close:close('done'),task:'done'}
];
createGuide({M,steps,board,init(g){G=g;Object.defineProperty(state,'threshold',{get:()=>g.settings.threshold??M.THRESHOLD_START,set:v=>{g.settings.threshold=v;},configurable:true});},done:{stats:()=>[['documents',String(M.DOCS.length)],['dimensions',String(M.AXES.length)],['raw bytes',String(M.ANSWERS.indexFp32)]],artifactTitle:'Your index config',artifact:()=>`# simulation: hand-set 6-D vectors\nmodel.encode(texts, normalize_embeddings=True)\nindex: faiss.IndexFlatIP(${M.AXES.length})\nmetric: inner product on unit vectors (cosine)\ndtype: float32  # ${M.ANSWERS.indexFp32} B for 12 rows\nk: 3\nthreshold: ${state.threshold.toFixed(2)}  # keep score >= threshold\n`}});
