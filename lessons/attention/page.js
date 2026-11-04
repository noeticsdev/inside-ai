import * as M from './model.mjs';
import { createGuide, h, s, T_, fmt, pyCell, svgBox } from '../../platform/shell/guide-runtime.js';
let G;
const checks = Object.fromEntries(M.MISSIONS.map((m) => [m.id, m.check]));
const cfg = () => M.configOf(G?.settings);
const run = () => M.simulate(cfg());
const solved = (id) => Boolean(G?.solved(id));
const projection = (settings) => ['Q','K','V'].includes(settings.projection) ? settings.projection : 'Q';
const n = (v, digits=3) => v === -Infinity ? '−∞' : Number.isInteger(v) ? String(v) : v.toFixed(digits);
const vec = (row, digits=3) => `[${row.map((v) => n(v,digits)).join(', ')}]`;
function selectControl(label, values, key, g) {
  const sel = h('select', {class:'gd-select','aria-label':label}, values.map((v) => h('option',{value:v, selected:cfg()[key]===v, text:String(v)})));
  sel.onchange = () => { g.settings[key] = Number(sel.value); g.saveSettings(); g.rerender(); g.refreshParts(); };
  return h('label', {class:'at-control'}, label, sel);
}

// Draw only the operands and result of the current operation. The footer retains
// computed progress; full tensors stay legible instead of shrinking as we build.
function matrix(svg, {x,y,a,title,shape,hot=false,hide,selectedRow=-1,selectedCol=-1,cell=48,cw=cell,digits=2,masked=false}) {
  const group = s('g',{class:`at-matrix ${hot?'is-fresh':''}`});
  group.append(T_(x,y-42,title,'at-title'),T_(x,y-18,shape,'at-sub'));
  a.forEach((row,i) => row.forEach((v,j) => {
    const cx=x+j*cw, cy=y+i*cell;
    group.append(s('rect',{x:cx,y:cy,width:cw,height:cell,class:`at-cell ${i===selectedRow||j===selectedCol?'is-row':''} ${masked && v===-Infinity?'is-masked':''}`}),T_(cx+cw/2,cy+cell/2+6,hide?.(i,j)?'?':n(v,digits),'at-value','middle'));
  }));
  svg.append(group);
}
const label = (svg,x,y,text,cls='at-sub',anchor='start') => svg.append(T_(x,y,text,cls,anchor));
function readouts(svg, rows) {
  rows.forEach(([key,value],i)=>{
    const x=12+i*326;
    svg.append(s('rect',{class:'at-readout',x,y:532,width:312,height:58,rx:6}));
    label(svg,x+14,554,key); label(svg,x+14,578,String(value),'at-read-value');
  });
}
function headBoard(svg,ctx) {
  const c=M.configOf(ctx.settings), count=c.heads, width=M.headWidth(M.SCALE.dModel,count), ready=ctx.solved('heads');
  label(svg,24,120,'Combined Q, K or V: one row per token, 512 features','at-title');
  const left=40, span=920, cw=span/count;
  for(let row=0;row<c.tokens;row++)for(let j=0;j<count;j++) svg.append(s('rect',{x:left+j*cw,y:142+row*20,width:cw-4,height:16,class:'at-cell is-row'}));
  label(svg,24,88,`Split the feature axis; keep all ${c.tokens} token rows.`);
  for(let j=0;j<count;j++) {
    const x=left+j*cw;
    svg.append(s('path',{class:'at-arrow',d:`M${x+cw/2} 246v52`}));
    label(svg,x+cw/2,324,`head ${j+1}`,'at-sub','middle');
    svg.append(s('rect',{x,y:340,width:cw-8,height:76,class:'at-cell is-row'}));
    label(svg,x+(cw-8)/2,370,`${c.tokens} rows`,'at-sub','middle');
    label(svg,x+(cw-8)/2,397,ready?`${width} wide`:'? wide','at-read-value','middle');
  }
  label(svg,24,452,'Concatenate the head outputs along features, then apply W_O.','at-title');
  for(let j=0;j<count;j++)svg.append(s('rect',{x:left+j*cw,y:470,width:cw-4,height:16,class:'at-cell'}));
  label(svg,500,515,`[${c.tokens}, 512] @ W_O [512, 512] → [${c.tokens}, 512]`,'at-value','middle');
  readouts(svg,[['head count',count],['features per head',ready?width:'?'],['Q + K + V + O · no biases',fmt(M.ANSWERS.parameters)]]);
}
function memoryBoard(svg,ctx) {
  const t=M.SCALE.context, x=94,y=136,w=336, ready=ctx.solved('memory');
  label(svg,x+w/2,112,`${fmt(t)} key columns`,'at-title','middle');
  // Schematic subdivisions show the two sequence axes, not individual cells.
  for(let i=0;i<8;i++)for(let j=0;j<8;j++)svg.append(s('rect',{x:x+j*w/8,y:y+i*w/8,width:w/8,height:w/8,class:`at-cell ${i===2?'is-row':''}`}));
  svg.append(T_(52,y+w/2,`${fmt(t)} query rows`,'at-title','middle'));
  svg.lastChild.setAttribute('transform',`rotate(-90 52 ${y+w/2})`);
  label(svg,x,501,'Dense score buffer · schematic grid');
  label(svg,500,154,'One FP16 element','at-title');
  // Sixteen bits grouped into two real bytes.
  for(let bit=0;bit<16;bit++)svg.append(s('rect',{x:500+bit*27,y:180,width:25,height:42,class:`at-cell ${bit<8?'is-row':''}`}));
  label(svg,608,247,'byte 1 · 8 bits','at-sub','middle');label(svg,824,247,'byte 2 · 8 bits','at-sub','middle');
  label(svg,500,300,'Each row','at-sub');label(svg,500,328,`${fmt(t)} × ${M.SCALE.bytes} = ${fmt(t*M.SCALE.bytes)} B`,'at-title');
  label(svg,500,376,'All rows','at-sub');label(svg,500,404,`${fmt(t)} × ${fmt(t*M.SCALE.bytes)} B`,'at-title');
  label(svg,500,465,ready?`${fmt(M.ANSWERS.memory)} B`:'? bytes','at-large');
  readouts(svg,[['score elements',fmt(t*t)],['bytes per element',M.SCALE.bytes],['one head · one layer',ready?`${M.ANSWERS.memory/2**20} MiB`:'? MiB']]);
}
function board(ctx) {
  const r=M.simulate(ctx.settings), t=r.config.tokens, id=ctx.step.id;
  const svg=s('svg',{viewBox:'0 0 1000 600',role:'img','aria-label':`Causal attention: ${ctx.step.title}. Actual matrix values; highlighted row is token 3, sat. Positions are numbered from 1.`});
  label(svg,16,28,id==='heads'?'MULTI-HEAD SHAPES':id==='memory'?'DENSE SCORE STORAGE':'ONE CAUSAL HEAD','at-title');
  label(svg,16,56,id==='heads'?'Separate model · d_model = 512':id==='memory'?'FP16 example · one head · one layer':`${M.TOKENS.slice(0,t).map((v,i)=>`${i+1}:${v}`).join('  ')} · untrained simulation`);
  if(id==='heads') { headBoard(svg,ctx); return svg; }
  if(id==='memory') { memoryBoard(svg,ctx); return svg; }
  const hidden=(mission)=>(i,j)=>i===2&&j===0&&!ctx.solved(mission);
  if(ctx.built===0) {
    matrix(svg,{x:240,y:155,a:r.X,title:'X · example embeddings',shape:`[${t} × ${M.D_MODEL}] · columns are input features`,cell:65,selectedRow:2});
    M.TOKENS.slice(0,t).forEach((token,i)=>label(svg,36,194+i*65,`${i+1}: ${token}`,i===2?'at-read-value':'at-title'));
    readouts(svg,[['rows · tokens',t],['input features',M.D_MODEL],['projection width',M.D_K]]);
  } else if(id==='project') {
    const p=projection(ctx.settings), w=M[`W_${p}`];
    matrix(svg,{x:10,y:174,a:r.X,title:'X · input',shape:`[${t} × 8]`,cell:36,selectedRow:2});
    matrix(svg,{x:374,y:132,a:w,title:`W_${p}`,shape:'[8 × 4]',cell:40,cw:48,digits:1,hot:true,selectedRow:2});
    matrix(svg,{x:706,y:174,a:r[p],title:p,shape:ctx.solved('project')?`[${t} × 4]`:'[? × ?]',cell:50,cw:63,digits:1,hot:true,selectedRow:2});
    label(svg,332,278,'×','at-large','middle');label(svg,636,278,'=','at-large','middle');
    ['Q','K','V'].forEach((key,i)=>{
      const btn=s('g',{class:`at-tab ${p===key?'is-active':''}`,tabindex:0,role:'button','aria-label':`Inspect ${key} projection`},s('rect',{x:365+i*84,y:468,width:72,height:48,rx:5}),T_(401+i*84,499,key,'at-title','middle'));
      const pick=()=>{ctx.settings.projection=key;ctx.g.saveSettings();ctx.g.rerender();};
      btn.onclick=pick;btn.onkeydown=(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}};svg.append(btn);
    });
    readouts(svg,[['input features',M.D_MODEL],['output features',M.D_K],['one row per token',ctx.solved('project')?`${t} × 4`:'? × ?']]);
  } else if(id==='score') {
    matrix(svg,{x:18,y:164,a:r.Q,title:'Q · queries',shape:`[${t} × 4]`,cell:50,cw:55,selectedRow:2});
    matrix(svg,{x:332,y:164,a:M.transpose(r.K),title:'Kᵀ · keys transposed',shape:`[4 × ${t}]`,cell:50,selectedCol:0});
    matrix(svg,{x:704,y:164,a:r.raw,title:'QKᵀ · scores',shape:`[${t} × ${t}]`,cell:50,selectedRow:2,hide:hidden('score'),hot:true});
    label(svg,279,275,'×','at-large','middle');label(svg,646,275,'=','at-large','middle');
    label(svg,18,464,'Row 3 of Q × column 1 of Kᵀ → score [3,1].','at-title');
    readouts(svg,[['query · sat',vec(r.Q[2])],['key · The',vec(r.K[0])],['score · q₃ · k₁',ctx.solved('score')?n(r.raw[2][0]):'?']]);
  } else if(id==='scale'||id==='mask'||id==='softmax') {
    const scale=id==='scale', mask=id==='mask', weights=id==='softmax';
    matrix(svg,{x:50,y:164,a:scale?r.raw:mask?r.scaled:r.masked,title:scale?'QKᵀ · raw scores':mask?'Scaled scores':'Masked scores',shape:`[${t} × ${t}]`,cell:58,cw:weights?62:58,selectedRow:2,masked:weights});
    matrix(svg,{x:590,y:164,a:scale?r.scaled:mask?r.masked:r.weights,title:scale?'÷ √d_k · scaled':mask?'Causal mask':'Softmax · weights',shape:`[${t} × ${t}]${weights?' · row sums = 1':''}`,cell:58,cw:weights?76:58,selectedRow:2,masked:mask,hot:true,hide:scale?hidden('scale'):weights?hidden('softmax'):undefined});
    label(svg,476,267,scale?`÷ ${Math.sqrt(M.D_K)}`:mask?'j > i':'exp','at-large','middle');
    label(svg,476,298,scale?'√4 = 2':mask?'→ −∞':'÷ sum','at-sub','middle');
    label(svg,50,493,scale?'Every score is halved; this is not a probability yet.':mask?'Above the diagonal: future keys. On the diagonal: the token itself.':'Each query gets its own distribution; future weights are zero.','at-sub');
    readouts(svg,scale?[['raw · row 3, key 1',n(r.raw[2][0])],['divisor · √d_k',Math.sqrt(M.D_K)],['scaled · row 3, key 1',ctx.solved('scale')?n(r.scaled[2][0]):'?']]:mask?[['visible keys for sat','1:The · 2:cat · 3:sat'],['future keys in row 3',t-3],['all masked cells',ctx.solved('mask')?M.maskedCells(t):'?']]:[['visible scores',vec(r.masked[2].slice(0,3))],['weight · row 3, key 1',ctx.solved('softmax')?n(r.weights[2][0],4):'?'],['row 3 sum',ctx.solved('softmax')?'1':'?']]);
  } else {
    // The finish view retains the actual learned computation, at readable size.
    matrix(svg,{x:36,y:158,a:[r.weights[2]],title:'Weights · query 3 (“sat”)',shape:`[1 × ${t}] · only the visible keys contribute`,cell:58,cw:86,digits:4,selectedRow:0});
    matrix(svg,{x:612,y:158,a:r.V,title:'V · values',shape:`[${t} × 4]`,cell:48,cw:76,digits:1});
    label(svg,531,197,'×','at-large','middle');
    label(svg,36,278,'Weighted contributions · feature 1','at-title');
    M.rowWork(ctx.settings).contributions.forEach((v,j)=>{
      const y=306+j*50;
      label(svg,36,y+20,M.TOKENS[j]);svg.append(s('rect',{x:105,y,width:v*2000,height:28,class:'at-cell is-row'}));
      label(svg,405,y+20,n(v,4),'at-value');
    });
    label(svg,36,482,'Bar length = weight × value','at-sub');
    matrix(svg,{x:612,y:466,a:[r.output[2]],title:'Output · row 3',shape:'[1 × 4] · weighted sum',cell:52,cw:86,digits:3,hot:id==='mix',selectedRow:0,hide:(i,j)=>j===0&&!ctx.solved('mix')});
    readouts(svg,[['raw → scaled',`${M.ANSWERS.dot} ÷ √${M.D_K} = ${M.ANSWERS.scaled}`],['visible weights',vec(r.weights[2].slice(0,3),3)],['output · feature 1',ctx.solved('mix')?n(r.output[2][0],3):'?']]);
  }
  return svg;
}

// Small drawn calculations align each term with the feature or key it belongs to.
function strips(rows, caption, result) {
  const svg=svgBox(760,rows.length*42+74,caption), x=170, count=rows[0][1].length, cw=550/count;
  rows.forEach(([name,values],i)=>{
    label(svg,4,27+i*42,name,'at-sub');
    values.forEach((v,j)=>{
      svg.append(s('rect',{x:x+j*cw,y:6+i*42,width:cw,height:36,class:`at-cell ${v!==0?'is-row':''}`}));
      label(svg,x+(j+.5)*cw,29+i*42,typeof v==='number'?n(v,4):v,'at-value','middle');
    });
  });
  label(svg,4,rows.length*42+33,result,'at-title');
  return svg;
}
function cuProjection() {
  const r=run(), p=projection(G.settings), col=M.transpose(M[`W_${p}`])[0];
  return strips([['X · row 3',r.X[2]],[`W_${p} · col 1`,col],['products',r.X[2].map((v,i)=>v*col[i])]],'Eight matching feature products',`Sum = ${n(r[p][2][0])} → ${p} row 3 = ${vec(r[p][2])}`);
}
function cuDot() {
  return strips([['q₃ · sat',run().Q[2]],['k₁ · The',run().K[0]],['products',M.rowWork(cfg()).products]],'Match four features then add the products',`2×1 + 0×0 + 2×1 + 0×0 = ${solved('score')?M.ANSWERS.dot:'?'}`);
}
function cuScale() {
  const svg=svgBox(760,150,'The same score before and after division by square root of head width');
  const vals=[M.ANSWERS.dot,M.ANSWERS.scaled];
  vals.forEach((v,i)=>{
    label(svg,6,35+i*52,i?'scaled':'raw','at-sub');
    svg.append(s('rect',{x:110,y:12+i*52,width:v*90,height:34,class:`at-cell ${i?'is-row':''}`}));
    label(svg,120+v*90,35+i*52,i&&!solved('scale')?'?':n(v),'at-title');
  });
  label(svg,6,138,`${M.ANSWERS.dot} ÷ √${M.D_K} = ${M.ANSWERS.dot} ÷ ${Math.sqrt(M.D_K)} = ${solved('scale')?M.ANSWERS.scaled:'?'}`,'at-title');
  return svg;
}
function cuMask() {
  const t=cfg().tokens, svg=svgBox(760,60+t*30,'Visible and blocked keys for every query');
  const x=130,cw=90;
  M.TOKENS.slice(0,t).forEach((token,j)=>label(svg,x+(j+.5)*cw,20,`${j+1}:${token}`,'at-sub','middle'));
  M.TOKENS.slice(0,t).forEach((token,i)=>{
    label(svg,4,52+i*30,`${i+1}:${token}`,'at-sub');
    for(let j=0;j<t;j++){
      svg.append(s('rect',{x:x+j*cw,y:30+i*30,width:cw,height:30,class:`at-cell ${j>i?'is-masked':'is-row'}`}));
      label(svg,x+(j+.5)*cw,51+i*30,j>i?'−∞':'visible','at-value','middle');
    }
    label(svg,610,52+i*30,`${t-i-1} blocked`,'at-sub');
  });
  return svg;
}
function cuSoftmax() {
  const work=M.rowWork(cfg()), svg=svgBox(760,196,'Row 3 exponentials become a probability distribution');
  const xs=[12,260,508];
  work.scores.forEach((score,j)=>{
    const x=xs[j];
    label(svg,x,22,`${j+1}:${M.TOKENS[j]} · score ${score}`,'at-title');
    svg.append(s('rect',{x,y:38,width:work.exponentials[j]/work.exponentials[0]*210,height:25,class:'at-cell is-row'}));
    label(svg,x,87,`exp = ${n(work.exponentials[j],4)}`);
    label(svg,x,115,`weight = ${solved('softmax')?n(run().weights[2][j],4):'?'}`,'at-title');
  });
  label(svg,12,148,`Divide each bar by their sum: ${n(work.denominator,4)}. Future keys add 0.`);
  let x=12;
  run().weights[2].slice(0,3).forEach((w,j)=>{
    svg.append(s('rect',{x,y:165,width:w*720,height:24,class:`at-cell ${j===0?'is-row':''}`}));
    label(svg,x+w*360,183,String(j+1),'at-value','middle');x+=w*720;
  });
  return svg;
}
function cuMix() {
  const w=run().weights[2].slice(0,3), v=run().V.slice(0,3).map((row)=>row[0]);
  return strips([['key',M.TOKENS.slice(0,3)],['weight',w],['V · feature 1',v],['weight × value',M.rowWork(cfg()).contributions]],'Three weighted contributions add to output feature 1',`Sum = ${solved('mix')?n(M.ANSWERS.mix,3):'?'} · future contributions = 0`);
}
function cuHeads(g) {
  const svg=svgBox(760,160,'Four projection matrices, with equal parameter counts');
  ['Q','K','V','O'].forEach((key,i)=>{
    const x=10+i*185;
    svg.append(s('rect',{x,y:10,width:170,height:86,class:'at-cell is-row'}));
    label(svg,x+85,37,`W_${key} · 512²`,'at-title','middle');
    label(svg,x+85,73,fmt(M.SCALE.dModel**2),'at-value','middle');
  });
  label(svg,10,132,`4 × 512² = ${fmt(M.ANSWERS.parameters)} weights · no biases`,'at-title');
  return h('div',{},selectControl('heads',[4,8],'heads',g),svg);
}
function cuMemory() {
  const svg=svgBox(760,156,'Doubling context doubles both axes of the dense buffer');
  const base=M.ANSWERS.memory/2**20;
  [1,2].forEach((factor,i)=>{
    const y=16+i*64;
    label(svg,4,y+20,`T = ${fmt(M.SCALE.context*factor)}`,'at-title');
    svg.append(s('rect',{x:240,y,width:factor**2*90,height:34,class:'at-cell is-row'}));
    label(svg,255+factor**2*90,y+23,solved('memory')?`${base*factor**2} MiB`:'? MiB','at-title');
  });
  label(svg,4,151,'2 × the rows and 2 × the columns → 4 × the bytes.');
  return svg;
}

function benchPython(host, g) {
  host.append(strips([['Q · sat',run().Q[2]],['expected output',run().output[2]]],'Python input query and expected output','Projected Q, K and V are in DATA; return output and weights.'));
  // The shared runtime remounts the bench after a pass. Keep the verified result visible.
  if (g.settings.pythonChecks?.length && g.solved('python')) {
    host.append(h('p', {class:'at-python-pass', text:`${g.settings.pythonChecks.length}/5 Python checks passed · ${g.settings.pythonChecks.join(' · ')}`}));
  }
  const cell = h('div');
  host.append(cell);
  pyCell(cell, {
    id:'attention-head',
    title:'Python · causal attention',
    prompt:'Five checks cover row sums, the mask, every output cell, one token, and uniform scores with causal=False. Use math.exp after subtracting each row’s maximum.',
    data:M.pythonData(cfg()),
    starter:'import math\n\ndef attention(Q, K, V, causal=True):\n    # 1. Dot products divided by sqrt(len(Q[0])).\n    # 2. Block j > i when causal is True.\n    # 3. Stable softmax within each row.\n    # 4. Mix V using these weights.\n    return [], []\n',
    tests:M.PY_TESTS,
    solution:M.PY_SOLUTION,
    onPass(results) {
      g.settings.pythonChecks = results.map((result) => result.name);
      g.saveSettings();
      g.pass('python', {passed:true});
    },
  });
}

const STEPS=[
  {id:'kit',phase:'kit',kicker:'Before you start',title:'Choose your input',minutes:1,view:'board',
    lead:'Build an attention head for a short sentence, from embeddings to an output vector. This is a simulation with fixed, untrained matrices; every operation uses the numbers on the board.',
    parts:()=>[{title:'Your kit',n:3},{glyph:'text',name:'Token sequence',runs:'One row per token; positions start at 1.'},{glyph:'matrix',name:`X · d_model = ${M.D_MODEL}`,runs:'Example embeddings, before projection.'},{glyph:'matrix',name:`W_Q, W_K, W_V · d_k = ${M.D_K}`,runs:'Separate matrices for queries, keys and values.'}],
    closeLabel:'YOUR INPUT',closeHint:'choose a length; both use row 3',
    close:(g)=>h('div',{},selectControl('tokens',[4,5],'tokens',g),h('div',{class:'at-token-list'},M.TOKENS.slice(0,cfg().tokens).map((token,i)=>h('span',{class:i===2?'is-focus':'',text:`${i+1}: ${token}`}))),h('p',{class:'cu-cap',text:'One-hot rows select the matching projection row. These embeddings are untrained.'})),
    task:'predict',nextLabel:'Start projecting'},
  {id:'project',phase:'build',kicker:'X → Q, K, V',title:'Project to queries',minutes:2,view:'board',mission:'project',
    lead:'Add three linear projections: <code>Q = X @ W_Q</code>, <code>K = X @ W_K</code> and <code>V = X @ W_V</code>. Queries ask what to look for, keys are compared with queries, and values are the data to mix.',
    adds:[{glyph:'matrix',name:'Three bias-free projections',runs:'Each maps the feature axis from 8 to 4.',conf:'W_Q, W_K, W_V: [8, 4]\nQ, K, V = X @ W_Q, X @ W_K, X @ W_V'}],
    closeLabel:'CLOSE-UP · MATRIX MULTIPLICATION',closeHint:'tap Q / K / V above to inspect each projection',
    close:cuProjection,
    task:(ui)=>ui.choice({prompt:`X is [${cfg().tokens} × 8] and W_Q is [8 × 4]. What is the shape of Q?`,options:[[`${cfg().tokens}x8`,`[${cfg().tokens} × 8]`,'That is X’s shape. W_Q replaces eight input features with four query features.'],['8x4','[8 × 4]','That is the projection matrix. Keep one output row per token, not per input feature.'],[`${cfg().tokens}x4`,`[${cfg().tokens} × 4]`,null],['4x5','[4 × 5]','The token axis stays first. The inner dimensions disappear, without transposing the result.']],check:(choice)=>checks.project({...cfg(),choice})}),
    after:()=>`[${cfg().tokens} × 8] @ [8 × 4] → <b>[${cfg().tokens} × 4]</b>. Each cell sums eight products; our one-hot input selects one row of W. K and V have the same shape but use different weights.`},
  {id:'score',phase:'build',kicker:'Q @ K.T',title:'Score one pair',minutes:2,view:'board',mission:'score',
    lead:'Add the query–key matrix product. Row i compares query i with every key, so the score matrix has one row and one column per token.',
    adds:[{glyph:'matrix',name:'Dot-product scores',runs:'Rows are queries; columns are keys.',conf:'scores = Q @ K.T   # [T, T]'}],
    closeLabel:'CLOSE-UP · ROW 3, COLUMN 1',closeHint:'multiply matching features, then sum',
    close:cuDot,
    task:(ui)=>ui.number({prompt:'What is q₃ · k₁? Use the vectors in the close-up.',check:(value)=>checks.score({value}),hint:(v)=>v===2?'You counted one nonzero product. Both the first and third features contribute.':v===8?'Do not square the query. Multiply each query feature by the matching key feature.':'Multiply matching features, then add all four products.'}),
    after:()=>`2×1 + 0×0 + 2×1 + 0×0 = <b>${M.ANSWERS.dot}</b>. Repeating this for every query–key pair builds a [${cfg().tokens} × ${cfg().tokens}] matrix. These scores are not probabilities.`},
  {id:'scale',phase:'build',kicker:'scores / √d_k',title:'Scale the scores',minutes:2,view:'board',mission:'scale',
    lead:'Add the scale factor <code>1 / sqrt(d_k)</code>. With four query features, each dot product is divided by two before softmax.',
    adds:[{glyph:'vector',name:'Square-root scaling',runs:'Head width, not sequence length.',conf:'scores = scores / math.sqrt(4)'}],
    closeLabel:'CLOSE-UP · ONE SCALED SCORE',closeHint:'the same pair, before and after scaling',
    close:cuScale,
    task:(ui)=>ui.number({prompt:`Scale the score ${M.ANSWERS.dot} using d_k = ${M.D_K}. What is the result?`,check:(value)=>checks.scale({value}),hint:(v)=>v===1?'You divided by d_k. Divide by its square root: √4 = 2.':v===8?'Scaling divides by √d_k; multiplying makes the logits larger.':'Use the head width: √4 = 2. The number of tokens does not enter this division.'}),
    after:()=>`${M.ANSWERS.dot} / √${M.D_K} = <b>${M.ANSWERS.scaled}</b>. If query and key components are independent with unit variance, the dot-product variance grows with d_k. Dividing by √d_k keeps the variance near one and helps prevent softmax from becoming nearly one-hot.`},
  {id:'mask',phase:'build',kicker:'scores.masked_fill',title:'Mask the future',minutes:2,view:'board',mission:'mask',
    lead:'Add a causal mask before softmax. Replace scores above the diagonal with <code>−∞</code>, so a token can use itself and earlier tokens while future positions receive zero weight.',
    adds:[{glyph:'matrix',name:'Strictly upper-triangular mask',runs:'Block column j when j > row i.',conf:'future = torch.ones(T, T).triu(1).bool()\nscores = scores.masked_fill(future, -torch.inf)'}],
    closeLabel:'CLOSE-UP · VISIBILITY',closeHint:'the diagonal stays visible',
    close:cuMask,
    task:(ui)=>ui.number({prompt:`How many cells are masked across all ${cfg().tokens} rows?`,check:(value)=>checks.mask({...cfg(),value}),hint:(v)=>v===cfg().tokens**2/2?'T²/2 includes half of the diagonal. The diagonal is visible; count only j > i.':v===cfg().tokens*(cfg().tokens+1)/2?'That includes the diagonal. Tokens can see their own values.':`Count ${Array.from({length:cfg().tokens},(_,i)=>cfg().tokens-i-1).join(' + ')} future cells, one row at a time.`}),
    after:()=>`${Array.from({length:cfg().tokens},(_,i)=>cfg().tokens-i-1).join(' + ')} = <b>${M.maskedCells(cfg().tokens)} masked cells</b>, or T(T−1)/2. In row 3 the visible scores are ${vec(run().masked[2].slice(0,3))}; the remaining scores are −∞. exp(−∞) = 0.`},
  {id:'softmax',phase:'build',kicker:'softmax(scores, dim=-1)',title:'Normalize one row',minutes:3,view:'board',mission:'softmax',
    lead:'Add row-wise softmax to turn the visible scores into weights. Exponentiate each score, sum within the row, then divide each exponential by that sum.',
    adds:[{glyph:'matrix',name:'Row-wise softmax',runs:'One probability distribution per query.',conf:'weights = torch.softmax(scores, dim=-1)'}],
    closeLabel:'CLOSE-UP · ROW 3',closeHint:'bar lengths show unshifted exponentials',
    close:cuSoftmax,
    task:(ui)=>ui.number({prompt:'Row 3 has visible scores [2, 0, 1]. What weight goes to token 1? Give a decimal within 0.01.',check:(value)=>checks.softmax({value}),hint:(v)=>v>1?'Enter a probability between zero and one, not an exponential or a percentage.':Math.abs(v-0.333)<0.02?'Uniform weights require equal scores. Here exp(2) is larger than exp(0) and exp(1).':'Divide exp(2) by exp(2) + exp(0) + exp(1). The future keys add zero.'}),
    after:()=>`exp(2) / (exp(2) + exp(0) + exp(1)) = <b>${n(M.ANSWERS.weight,4)}</b>. The visible weights are ${vec(run().weights[2].slice(0,3),4)} and sum to 1 before rounding. Code subtracts the row maximum before exp to avoid overflow; that leaves the weights unchanged.`},
  {id:'mix',phase:'build',kicker:'weights @ V',title:'Mix the values',minutes:2,view:'board',mission:'mix',
    lead:'Add the weighted value sum. Each output feature mixes the matching feature from every visible value vector; the weights choose proportions, not a single winner.',
    adds:[{glyph:'matrix',name:'Output matrix',runs:'One mixed vector per token.',conf:'output = weights @ V   # [T, 4]'}],
    closeLabel:'CLOSE-UP · OUTPUT ROW 3, FEATURE 1',closeHint:'multiply each weight by its own value',
    close:cuMix,
    task:(ui)=>ui.number({prompt:'Compute feature 1 of output row 3. Round to three decimal places (tolerance 0.001).',check:(value)=>checks.mix({value}),hint:(v)=>v===0.2?'That is the first value alone. Even the smaller weights contribute to the output.':Math.abs(v-0.4)<0.01?'An unweighted mean ignores the attention weights. Multiply each value by its own weight first.':'Sum 0.6652×0.2 + 0.0900×0.9 + 0.2447×0.1. Future tokens contribute zero.'}),
    after:()=>`${run().weights[2].slice(0,3).map((w,j)=>`${n(w,4)}×${run().V[j][0]}`).join(' + ')} ≈ <b>${n(M.ANSWERS.mix,3)}</b>. Row 3’s full output is ${vec(run().output[2])}. It has four features, the same width as each value vector.`},
  {id:'python',phase:'build',kicker:'Python lists',title:'Implement the head',minutes:6,view:'bench',mission:'python',where:'your browser · Python',
    lead:'Put the operations into <code>attention(Q, K, V, causal=True)</code> using Python lists and the standard library. Return <code>(output, weights)</code>; Q, K and V have already been projected.',
    adds:[{glyph:'doc',name:'attention()',runs:'Score → scale → mask → softmax → mix.',conf:'return output, weights'}],
    bench:benchPython,
    task:(ui)=>ui.code({prompt:'Write the function on the left and pass all five checks. If Python cannot load, choose the complete computation below.',fallback:[['softmax(mask(Q @ K.T / √d_k), rows) @ V',true],['softmax(Q @ K.T, columns) @ V',false,'This omits scaling and the causal mask, and normalizes columns instead of rows.'],['softmax(Q @ K.T / √d_k, rows) @ V; then zero future outputs',false,'Mask the scores before softmax. Zeroing outputs later cannot undo information mixed in from the future.']]}),
    after:()=>`You assembled the same operations as scaled dot-product attention, with no dropout. The board uses ${cfg().tokens} tokens and four features per head. The uniform-score check also verifies that causal=False uses every key.`},
  {id:'heads',phase:'scale',kicker:'Concatenate → W_O',title:'Split into heads',minutes:3,view:'board',mission:'heads',
    lead:'Move to a separate model with <code>d_model=512</code> and choose a head count. Standard multi-head attention splits the projected feature axis across heads, concatenates their outputs, then applies <code>W_O</code>.',
    adds:(g)=>[{glyph:'matrix',name:'Head split and output projection',runs:'Sequence length stays the same in every head.',conf:`num_heads=${cfg().heads}\nhead_dim = embed_dim // num_heads\noutput = concat(head_outputs) @ W_O`}],
    closeLabel:'CLOSE-UP · MULTI-HEAD SHAPES',closeHint:'change head count; watch the feature split above',
    close:cuHeads,
    task:(ui)=>ui.number({prompt:'Using the head count you chose on the left, what is d_k for d_model = 512?',check:(value)=>checks.heads({...cfg(),value}),hint:(v)=>v===512?'That is the combined width. Divide it evenly among the chosen heads.':v===M.D_K?'Four is the teaching head’s width. This separate model has 512 features.':`Each of the ${cfg().heads} heads gets 512 / ${cfg().heads} features.`}),
    after:()=>`512 / ${cfg().heads} = <b>${M.headWidth(512,cfg().heads)} features per head</b>. Q, K, V and W_O each contribute 512² weights: ${fmt(M.ANSWERS.parameters)} total without biases. Splitting into heads does not multiply this standard projection count by the number of heads.`},
  {id:'memory',phase:'scale',kicker:'Dense attention storage',title:'Count the memory',minutes:2,view:'board',mission:'memory',
    lead:'Add a storage budget for a long context. A dense implementation materializes a square score matrix per head and layer; here the storage example uses FP16, with two bytes per element.',
    adds:[{glyph:'matrix',name:'One dense score buffer',runs:'This is a storage calculation, not a measured allocation.',conf:'T = 8192\nscore_bytes = T * T * 2   # FP16'}],
    closeLabel:'CLOSE-UP · DENSE BUFFER',closeHint:'one head · one layer · one matrix',
    close:cuMemory,
    task:(ui)=>ui.number({prompt:'How many bytes does one 8192 × 8192 FP16 score matrix occupy?',check:(value)=>checks.memory({value}),hint:(v)=>v===M.SCALE.context**2?'That counts elements. Each FP16 element takes two bytes.':v===M.SCALE.context*2?'That is one row. There are 8192 rows as well as 8192 columns.':v===128?'128 is the size in MiB. The question asks for bytes; multiply 8192 × 8192 × 2.':'Multiply both sequence dimensions by two bytes. This asks for one head and one layer.'}),
    after:()=>`8192 × 8192 × 2 = <b>${fmt(M.ANSWERS.memory)} B (${M.ANSWERS.memory/2**20} MiB)</b>. Doubling context quadruples this dense buffer. FlashAttention uses tiled computation and online softmax to avoid storing the full attention matrix in GPU high-bandwidth memory; exact dense attention still has quadratic arithmetic. Other buffers and kernel dtypes affect real memory use.`},
  {id:'done',phase:'done',kicker:'Done',title:'Keep your attention recipe',minutes:0,view:'board',task:'done',
    lead:'You built a causal head from projections to a weighted value sum, then sized a multi-head configuration. Keep the shapes and the PyTorch example below; the checkpoint asks you to apply the same rules.',
    closeLabel:'YOUR RESULT',closeHint:'row 3 · four output features',close:()=>strips([['output · sat',run().output[2]]],'The completed output vector',`Teaching head: [${cfg().tokens}, ${M.D_K}] · separate model: ${cfg().heads} heads × ${M.headWidth(512,cfg().heads)} features`)},
];
createGuide({M,steps:STEPS,board,
  init(g){G=g;Object.assign(g.settings,M.configOf(g.settings));},
  done:{stats:()=>[['tokens · T',cfg().tokens],['example · d_k',M.D_K],['full-size · heads',cfg().heads]],artifactTitle:'Your shapes and PyTorch config',artifact:()=>M.artifact(cfg())}});
