import * as M from './model.mjs';
import { createGuide, h, s, T_, svgBox, pyCell } from '../../platform/shell/guide-runtime.js';
let G;
const CHECK = Object.fromEntries(M.MISSIONS.map(m => [m.id, m.check]));
const f = (v, d = 5) => Number(v.toFixed(d)).toString();
const vec = a => `[${a.map(v => f(v)).join(', ')}]`;
const solved = id => Boolean(G?.solved(id));
const tryRate = (g, v) => { g.settings.tried = [...new Set([...(g.settings.tried || []), v])]; };
const run = () => M.train(G?.settings || M.DEFAULTS);
const pre = text => h('pre', { class: 'tr-data', text });
const adds = (name, conf, runs) => [{ glyph: 'matrix', name, conf, runs }];
const numeric = (id, prompt, hint, unit) => ui => ui.number({ prompt, placeholder: 'your answer', unit,
  check: value => CHECK[id]({ value }), hint });

// The board grows from real tensors into the complete forward/backward graph.
function board(ctx) {
  const { built, fresh, solved: yes } = ctx;
  const display = M.displayState(ctx.settings, built >= 9, yes('update') && built >= 7);
  const current = display.forward;
  const gradients = built >= 9 ? M.backward(M.EXAMPLE.x, M.EXAMPLE.t, display.params) : M.B;
  const changed = display.params !== M.INIT;
  const small = v => Math.abs(v) >= 100 ? v.toExponential(0) : Math.abs(v) >= 10 ? f(v, 2) : f(v, 3);
  const gf = v => Math.abs(v) >= 100 ? v.toExponential(2) : f(v), lf = v => v >= 1000 ? v.toExponential(3) : f(v, 6);
  const sv = s('svg', { viewBox: matchMedia('(max-width:900px)').matches ? '0 95 1000 572' : '0 18 1000 646', role: 'img', 'aria-label': 'Two inputs, Linear 1 with a 3 by 2 weight matrix, ReLU, Linear 2 and squared loss. Backward paths carry derivatives to SGD. Below: XOR decision map, loss curve and the hand-example ledger.' });
  sv.append(s('defs', {}, s('marker', { id: 'tr-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0L10 5L0 10z', class: 'tr-arrowhead' }))));
  const text = (x,y,t,cls='tr-t',anchor) => T_(x,y,t,cls,anchor);
  const box = (x,y,w,hh,cls='tr-box') => s('rect',{x,y,width:w,height:hh,rx:7,class:cls});
  const path = (d,back=false) => s('path',{d,class:back?'tr-back':'tr-route','marker-end':'url(#tr-arrow)'});
  const component = (n,x,y,w,hh,title,...kids) => s('g',{class:`tr-part ${(fresh===n || fresh===5 && n===4 || fresh===6 && n===3 || fresh===9 && n===7)?'tr-fresh':''}`},box(x,y,w,hh),text(x+12,y+24,title,'tr-title'),kids);
  const val = (id,v) => yes(id) ? v : '?';
  sv.append(text(130,40,'2 → 3 → 1 · A TRAINABLE COMPUTE GRAPH','tr-heading'),text(130,65,built >= 9 ? 'Your trained values and gradients / Ledger: the initial hand pass' : changed ? 'Forward: updated values / Backward arrows: initial gradients' : 'Forward: values   /   Backward: derivatives','tr-sub'),text(130,85,'Display values rounded; arithmetic uses full precision.','tr-small'));
  if (!built) {
    sv.append(box(24,98,950,250), text(52,136,'Start with four labeled examples. Build the calculation above them.','tr-title'));
    const rows = [['x₁','x₂','target'], ...M.DATASET.map(p => [...p.x,p.t])];
    rows.forEach((r,i) => r.forEach((v,j) => sv.append(text(84+j*115,178+i*30,String(v),i===0?'tr-sub': 'tr-t'))));
    sv.append(text(480,186,'Fixed init · different weights per neuron','tr-title'),text(480,220,`${M.PARAMS} trainable parameters, including biases`),text(480,252,'Linear scores; classify at ŷ ≥ 0.5'),text(480,284,'Goal: fit XOR, then export your training config.','tr-sub'));
  }
  if (built >= 1) {
    sv.append(component(1,24,105,102,150,'Input',text(36,164,'x₁ = 1'),text(36,196,'x₂ = −1'),text(36,232,'t = 1','tr-sub')));
    const p = display.params;
    const cells = [];
    p.W1.forEach((row,i) => {
      row.forEach((v,j) => cells.push(s('rect',{x:168+j*64,y:160+i*27,width:64,height:27,class:'tr-cell'}),text(200+j*64,179+i*27,small(v),'tr-small','middle')));
      cells.push(text(337,179+i*27,small(p.b1[i]),'tr-small','middle'));
    });
    sv.append(path('M126 180H150'),component(1,150,105,225,150,'Linear 1',text(180,149,'W1','tr-sub'),text(324,149,'b1','tr-sub'),cells));
    sv.append(text(152,278,`z = ${val('z',`[${current.z.map(small).join(', ')}]` )}`,'tr-gs'));
  }
  if (built >= 2) sv.append(path('M375 180H402'),component(2,402,105,126,150,'ReLU',...current.h.map((v,i)=>text(417,161+i*29,`h${i+1} = ${val('relu',small(v))}`,'tr-small'))),text(417,244,'max(0, z)','tr-sub'));
  if (built >= 3) {
    const p = display.params;
    sv.append(path('M528 180H557'),component(3,557,105,194,150,'Linear 2',text(569,151,'W2','tr-sub'),...p.W2.map((v,i)=>s('g',{},s('rect',{x:569+i*56,y:162,width:56,height:28,class: i===0 && yes('update')?'tr-cell tr-updated':'tr-cell'}),text(597+i*56,181,small(v),'tr-small','middle'))),text(569,213,`b2 = ${small(p.b2)}`),text(569,243,`ŷ = ${val('output',small(current.y))}`,'tr-t')));
  }
  // The early graph leaves room to inspect the actual dataset, before more layers occupy it.
  if (built > 0 && built < 3) {
    sv.append(box(557,105,417,285),text(573,131,'XOR · FOUR INPUTS, TWO CLASSES','tr-title'));
    const X = v => 660 + v * 60, Y = v => 244 - v * 60;
    sv.append(s('line',{x1:X(-1.4),y1:Y(0),x2:X(1.4),y2:Y(0),class:'tr-grid'}),s('line',{x1:X(0),y1:Y(-1.4),x2:X(0),y2:Y(1.4),class:'tr-grid'}));
    M.DATASET.forEach(({x,t},i)=>sv.append(s('circle',{cx:X(x[0]),cy:Y(x[1]),r:i===2?9:6,class:t?'tr-point-one':'tr-point-zero'}),text(X(x[0])+14,Y(x[1])+5,String(t),'tr-t')));
    sv.append(text(752,248,'x₁','tr-sub'),text(653,150,'x₂','tr-sub'),text(790,184,'1: inputs differ'),text(790,214,'0: inputs match'),text(790,259,'large: hand example','tr-sub'),text(790,289,'x = [1, −1]','tr-t'),text(573,367,'Labels above; network scores in the map below.','tr-small'));
  }
  if (built >= 4) sv.append(path('M751 180H784'),component(4,784,105,190,150,'Squared loss',text(796,162,'L = (ŷ − t)²'),text(796,198,val('loss',lf(M.loss(current.y,M.EXAMPLE.t))),'tr-number'),text(796,230,'one example','tr-sub')));
  if (built >= 5) sv.append(path('M877 255V310H680V255',true),text(870,303,`dL/dŷ ${val('dy',gf(gradients.dy))}`,'tr-grad','end'));
  if (built >= 6) {
    sv.append(path('M617 255V316H465V255',true),text(608,303,`dL/dh₁ ${val('weight',gf(gradients.dh[0]))}`,'tr-grad','end'),path('M423 255V316H388V226H375',true),text(156,303,`dL/dW1₀₀ ${val('weight',gf(gradients.W1[0][0]))}`,'tr-grad'));
    sv.append(text(568,337,`dL/dW2₀ = ${val('weight',gf(gradients.W2[0]))}`,'tr-grad'));
  }
  if (built >= 7) {
    sv.append(component(7,150,350,601,40,'SGD · w ← w − lr × g',text(732,376,built >= 9 ? `lr = ${ctx.settings.lr} · full batch` : `lr = ${M.HAND_LR} · hand pass`,'tr-sub','end')),path('M150 370H137V92H250V105',true));
  }
  if (built >= 8) sv.append(text(785,365,`backward(x,t,params)`,'tr-grad'),text(785,388,ctx.settings.pythonVerified?'6 Python checks ✓':yes('python')?'rule selected ✓':'gradient checks ?','tr-sub'));

  // Decision map: actual model scores sampled on a regular 2-D grid.
  const training = built >= 9;
  const r = display.run;
  const params = display.params;
  sv.append(box(24,412,262,244),text(38,438,training?'XOR · YOUR TRAINED SCORES':'XOR · CURRENT NETWORK SCORES','tr-title'));
  const px = 55, py = 459, size = 155, n = 20;
  M.mapGrid(params,n).forEach(c=>sv.append(s('rect',{x:px+c.col*size/n,y:py+c.row*size/n,width:size/n+.1,height:size/n+.1,class:c.label?'tr-map-one':'tr-map-zero'})));
  sv.append(s('rect',{x:px,y:py,width:size,height:size,class:'tr-map-border'}));
  M.DATASET.forEach(({x,t},i)=>{
    const cx=px+(x[0]+1.25)/2.5*size, cy=py+(1.25-x[1])/2.5*size;
    sv.append(s('circle',{cx,cy,r:i===2?9:6,class:t?'tr-point-one':'tr-point-zero'}),text(cx+11,cy+5,String(t),'tr-t'));
  });
  sv.append(text(px+size/2,636,'x₁  −1 → +1','tr-sub','middle'),text(228,480,'x₂','tr-sub'),text(228,502,'+1','tr-sub'),text(228,610,'−1','tr-sub'),text(38,650,'dots: t · tint: ŷ ≥ 0.5','tr-small'));

  if (training) lossCurve(sv, r, text, box); else batchPanel(sv, ctx, text, box);
  if (['scale','done'].includes(ctx.step.phase)) memoryPanel(sv, ctx, text, box);
  else {
    const rows = [ ['x','[1, −1]',null], ['z',vec(M.F.z),'z'], ['h',vec(M.F.h),'relu'], ['ŷ',f(M.F.y),'output'], ['L',f(M.ANSWERS.loss,6),'loss'], ['dL/dŷ',f(M.B.dy),'dy'], ['dL/dW2₀',f(M.B.W2[0]),'weight'], ['new W2₀',f(M.UPDATED.W2[0]),'update'] ];
    sv.append(box(674,412,300,244),text(690,438,'ONE EXAMPLE, STAGE BY STAGE','tr-title'));
    rows.forEach(([a,v,id],i)=>sv.append(text(690,464+i*22,a,'tr-sub'),text(959,464+i*22,id?val(id,v):v,id&&yes(id)?'tr-read':'tr-t','end')));
    // The hand ledger stays anchored to the initial pass, even as SGD changes parameters.
    sv.append(text(690,646,'hand pass: init → first update','tr-small'));
  }
  return sv;
}

// Bottom-middle panel before training: the four examples the batch loss averages.
function batchPanel(sv, ctx, text, box) {
  const { built, solved: yes } = ctx;
  const hand = built >= 7 && yes('update'), showY = built >= 3 && yes('output'), showL = built >= 4 && yes('loss');
  const b = hand ? M.BATCH_HAND : M.BATCH_INIT;
  sv.append(box(307,412,345,244),text(322,438,showL ? 'BATCH · SQUARED ERROR EACH' : 'BATCH · ŷ VERSUS TARGET','tr-title'),
    text(322,458,hand ? 'bars: ŷ after the hand step · dots: t' : 'bars: score ŷ · dots: target t','tr-small'));
  const left = 340, col = 77, bot = 566, Y = v => bot - v * 92;
  sv.append(s('line',{x1:left-6,y1:Y(1),x2:left+4*col-10,y2:Y(1),class:'tr-target'}),s('line',{x1:left-6,y1:bot,x2:left+4*col-10,y2:bot,class:'tr-grid'}));
  b.rows.forEach((row,i) => {
    const x = left + i * col, cx = x + 30;
    if (i === 2) sv.append(s('rect',{x:x-6,y:Y(1)-14,width:col-4,height:bot-Y(1)+82,rx:5,class:'tr-hand'}));
    if (hand) { const y0 = M.BATCH_INIT.rows[i].y; sv.append(s('rect',{x:cx-20,y:Y(y0),width:40,height:bot-Y(y0),class:'tr-ghost'})); }
    if (showY) sv.append(s('rect',{x:cx-20,y:Y(row.y),width:40,height:bot-Y(row.y),class:i===2&&hand?'tr-cell tr-updated':'tr-bar'}));
    else sv.append(text(cx,Y(.5),'?','tr-t','middle'));
    sv.append(s('circle',{cx,cy:Y(row.t),r:6,class:row.t?'tr-point-one':'tr-point-zero'}));
    sv.append(text(cx,586,row.x.map(v=>v>0?'+1':'−1').join(','),'tr-small','middle'),
      text(cx,606,showY ? f(row.y,3) : 'ŷ ?','tr-small','middle'),
      text(cx,626,showL ? f(row.l,4) : 'L ?',showL?'tr-gs':'tr-small','middle'));
  });
  sv.append(text(322,648,!showL ? 'mean of these 4 losses: next steps' : hand ? `mean ${f(M.BATCH_INIT.mean,4)} → ${f(b.mean,4)} ↑` : `mean L = ${f(b.mean,6)}`, hand ? 'tr-gs' : 'tr-small'));
}

function lossCurve(sv, r, text, box) {
  sv.append(box(307,412,345,244),text(322,438,'FULL-BATCH MEAN SQUARED ERROR','tr-title'));
  const left=362, top=462, w=265, hh=140;
  const log = v => Math.log10(Math.max(1e-7,v));
  const low = Math.min(-3, ...r.curve.map(log)), high = Math.max(-1, ...r.curve.map(log));
  const Y = v => top+hh-(log(v)-low)/(high-low)*hh;
  const ticks = [-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6].filter(v=>v>=low && v<=high), every = Math.ceil(ticks.length/5);
  ticks.filter((_,i)=>i%every===0).forEach(v=>sv.append(s('line',{x1:left,y1:Y(10**v),x2:left+w,y2:Y(10**v),class:'tr-grid'}),text(left-8,Y(10**v)+5,`1e${v}`,'tr-small','end')));
  sv.append(s('line',{x1:left,y1:Y(M.TARGET),x2:left+w,y2:Y(M.TARGET),class:'tr-target'}),text(left+w,Y(M.TARGET)-6,`target ${M.TARGET}`,'tr-small','end'));
  sv.append(s('path',{class:'tr-curve',d:r.curve.map((v,i)=>`${i?'L':'M'}${left+i/r.config.steps*w} ${Y(v)}`).join(' ')}));
  if (r.divergedAt) { const x = left + r.steps / r.config.steps * w; sv.append(s('line',{x1:x,y1:top,x2:x,y2:top+hh,class:'tr-stop'}),text(Math.min(x+6,left+w-150),top+16,`diverged · step ${r.divergedAt}`,'tr-bad')); }
  sv.append(text(left,624,'0','tr-small'),text(left+w,624,`${r.config.steps} updates`,'tr-small','end'),
    text(322,648,`lr ${r.config.lr} · ${r.divergedAt ? `stopped at step ${r.divergedAt}` : `final ${f(r.finalLoss,6)}`}`, r.divergedAt ? 'tr-bad' : r.finalLoss < M.TARGET ? 'tr-gs' : 'tr-small'));
}

// Scale step: approximate mixed-precision Adam state for a 7B model, to scale in bytes per parameter.
function memoryPanel(sv, ctx, text, box) {
  const yes = ctx.solved('memory'), per = 268 / M.bytesPerParam();
  sv.append(box(674,412,300,244,ctx.step.id==='memory'?'tr-box tr-fresh-box':'tr-box'),text(690,438,'7B MODEL · ADAM STATE','tr-title'),text(690,458,'≈ bytes per parameter','tr-small'));
  let x = 690;
  M.MEMORY_ROWS.forEach((row,i) => {
    const w = row.bytes * per;
    sv.append(s('rect',{x,y:468,width:w,height:30,class:['tr-cell','tr-bar','tr-bar','tr-cell tr-updated'][i]}),text(x+w/2,488,`${row.bytes}`,'tr-t','middle'));
    sv.append(text(690,524+i*22,row.label,'tr-sub'),text(959,524+i*22,yes ? `${row.gb} GB` : '?',yes?'tr-read':'tr-t','end'));
    x += w;
  });
  sv.append(s('line',{x1:690,y1:604,x2:959,y2:604,class:'tr-grid'}),text(690,624,'total, approx.','tr-t'),text(959,624,yes ? `≈ ${M.memoryGB()} GB` : '? GB',yes?'tr-read':'tr-t','end'),
    text(690,646,'no activations or buffers','tr-small'));
}

// ---------- close-ups: small drawn figures with the real numbers ----------
const CW = 840;
const fig = (hh, label, ...kids) => { const v = svgBox(CW, hh, label); v.append(...kids.flat(Infinity).filter(Boolean)); return v; };
const cap = text => h('p', { class: 'cu-cap', text });
const R = (x, y, w, hh, cls = 'cu-slot') => s('rect', { x, y, width: w, height: hh, rx: 4, class: cls });
const L = (x1, y1, x2, y2, cls = 'cu-axis') => s('line', { x1, y1, x2, y2, class: cls });
const A = (d, cls = 'tr-route') => s('path', { d, class: cls, 'marker-end': 'url(#tr-cu-arrow)' });
const arrowDefs = () => s('defs', {}, s('marker', { id: 'tr-cu-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0L10 5L0 10z', class: 'tr-arrowhead' })));

// a sum of products drawn as term boxes: [[expression, value]], then the result box
function sumFigure(label, terms, [name, value], open) {
  const kids = [];
  [...terms, [name, value]].forEach(([top, v], i) => {
    const x = 6 + i * 168, last = i === terms.length;
    kids.push(R(x, 14, 130, 70, last ? (open ? 'cu-slot-on' : 'cu-slot-empty') : 'cu-slot'), T_(x + 65, 42, top, last ? 'cu-t-b' : 'cu-t', 'middle'),
      T_(x + 65, 68, last ? (open ? f(v) : '?') : open ? `= ${f(v)}` : '= ?', last || open ? 'cu-t-a' : 'cu-t-m', 'middle'));
    if (i < terms.length) kids.push(T_(x + 149, 56, i === terms.length - 1 ? '=' : '+', 'cu-t-b', 'middle'));
  });
  return fig(96, label, kids);
}

const closeKit = () => h('div', {}, fig(112, 'The training loop: forward, loss, backward, SGD, repeat.', arrowDefs(),
  [['forward', 'ŷ = net(x)'], ['loss', 'L = (ŷ − t)²'], ['backward', `dL/dw · all ${M.PARAMS}`], ['SGD step', 'w ← w − lr·g']].map(([a, b], i) => {
    const x = 10 + i * 210;
    return [R(x, 10, 170, 54), T_(x + 85, 32, a, 'cu-t-b', 'middle'), T_(x + 85, 52, b, 'cu-t', 'middle'), i < 3 ? A(`M${x + 170} 37H${x + 206}`) : null];
  }), A('M770 64V92H95V68'), T_(420, 86, `repeat · ${M.DEFAULTS.steps} full-batch updates on ${M.DATASET.length} examples`, 'cu-t-m', 'middle')),
  cap('A teaching simulation with real arithmetic, not a timing benchmark.'));

const closeLinear = () => sumFigure('Row zero of W1 times x plus the bias.', [['0.5 × 1', .5], ['(−0.5) × (−1)', .5], ['bias b1[0]', .25]], ['z₁', M.ANSWERS.z], solved('z'));
const closeOutput = () => sumFigure('W2 times h plus the output bias.', [['0.5 × 1.25', .625], ['0.5 × 0', 0], ['−0.25 × 0', 0], ['bias b2', M.INIT.b2]], ['ŷ', M.F.y], solved('output'));

function closeRelu() {
  const open = solved('relu'), X = z => 40 + (z + 1) * 150, Y = v => 140 - v * 80;
  const kids = [L(30, 140, 420, 140), L(X(0), 10, X(0), 150), s('path', { d: `M${X(-1)} ${Y(0)}L${X(0)} ${Y(0)}L${X(1.5)} ${Y(1.5)}`, class: 'tr-curve' }),
    T_(414, 160, 'z', 'cu-t-m', 'end'), T_(X(0) + 6, 20, 'h = max(0, z)', 'cu-t-m'), T_(X(-1), 160, '−1', 'cu-t-m', 'middle'), T_(X(1), 160, '+1', 'cu-t-m', 'middle')];
  M.F.z.forEach((z, i) => {
    kids.push(s('circle', { cx: X(z), cy: open ? Y(M.relu(z)) : 140, r: 6, class: open ? 'tr-point-one' : 'tr-point-zero' }), T_(X(z), open && z > 0 ? Y(z) - 12 : 128, `z${'₁₂₃'[i]}`, 'cu-t-b', 'middle'));
    kids.push(T_(460, 40 + i * 40, `z${'₁₂₃'[i]} = ${f(z)}`, 'cu-t'), T_(600, 40 + i * 40, `h ${open ? f(M.F.h[i]) : '?'}`, open ? 'cu-t-a' : 'cu-t-m'), T_(700, 40 + i * 40, `slope ${open ? (z > 0 ? 1 : 0) : '?'}`, open ? 'cu-t-a' : 'cu-t-m'));
  });
  return fig(168, 'ReLU applied to the three preactivations, with each local slope.', kids);
}

function closeLoss() {
  const open = solved('loss'), X = v => 40 + v * 400, y0 = 130, side = (M.EXAMPLE.t - M.F.y) * 400;
  return fig(160, 'Prediction and target on a number line; the squared error is the square on the gap.',
    L(30, y0, 540, y0), [0, .5, 1].map(v => [L(X(v), y0 - 4, X(v), y0 + 4), T_(X(v), y0 + 22, String(v), 'cu-t-m', 'middle')]),
    R(X(M.F.y), y0 - side, side, side, open ? 'cu-slot-on' : 'cu-slot-empty'), T_(X(M.F.y) + side / 2, y0 - side / 2 + 5, open ? f(M.ANSWERS.loss, 6) : 'L ?', 'cu-t-a', 'middle'),
    s('circle', { cx: X(M.F.y), cy: y0, r: 6, class: 'tr-point-zero' }), T_(X(M.F.y) - 10, y0 - 8, `ŷ ${f(M.F.y)}`, 'cu-t-b', 'end'),
    s('circle', { cx: X(1), cy: y0, r: 6, class: 'tr-point-one' }), T_(X(1) + 10, y0 - 8, 't 1', 'cu-t-b'),
    T_(600, 40, `error  ŷ − t = ${f(M.F.y - M.EXAMPLE.t)}`, 'cu-t'), T_(600, 68, 'L = error × error', 'cu-t'), T_(600, 96, open ? `  = ${f(M.ANSWERS.loss, 6)}` : '  = ?', 'cu-t-a'),
    T_(600, 124, 'side 0.275, area L', 'cu-t-m'));
}

function closeSlope() {
  const open = solved('dy'), X = v => 40 + (v - .4) * 450, Y = v => 140 - v * 330, yy = M.F.y, ly = M.ANSWERS.loss;
  const curve = Array.from({ length: 41 }, (_, i) => { const v = .4 + i * .025; return `${i ? 'L' : 'M'}${X(v).toFixed(1)} ${Y(M.loss(v, 1)).toFixed(1)}`; }).join('');
  const t0 = .5, t1 = .86;
  return fig(168, 'Squared loss as a function of the prediction, with the tangent at the current prediction.', arrowDefs(),
    L(30, 140, 500, 140), L(40, 10, 40, 146), s('path', { d: curve, class: 'tr-curve' }),
    L(X(t0), Y(ly + M.B.dy * (t0 - yy)), X(t1), Y(ly + M.B.dy * (t1 - yy)), 'cu-mark'),
    s('circle', { cx: X(yy), cy: Y(ly), r: 6, class: 'tr-point-one' }), T_(X(yy) + 12, Y(ly) - 14, 'ŷ = 0.725', 'cu-t-b'),
    s('circle', { cx: X(1), cy: 140, r: 4, class: 'tr-point-zero' }), T_(X(1), 162, 't = 1', 'cu-t-m', 'middle'), T_(50, 22, 'L = (ŷ − 1)²', 'cu-t-m'),
    A(`M${X(yy)} 156H${X(yy) + 50}`, 'tr-back'), T_(X(yy) - 8, 162, 'raise ŷ', 'cu-t-m', 'end'),
    T_(560, 40, 'dL/dŷ = 2(ŷ − t)', 'cu-t'), T_(560, 68, '      = 2 × (−0.275)', 'cu-t'), T_(560, 96, open ? `      = ${f(M.B.dy)}` : '      = ?', 'cu-t-a'),
    T_(560, 124, 'dashed: tangent, slope < 0', 'cu-t-m'));
}

function closeChain() {
  const open = solved('weight');
  const node = (x, y, t) => [R(x, y, 70, 34), T_(x + 35, y + 22, t, 'cu-t-b', 'middle')];
  return fig(176, 'Two backward paths from the loss: to W2[0], and through h1 and z1 to W1[0].', arrowDefs(),
    node(10, 24, 'L'), node(230, 24, 'ŷ'), node(450, 24, 'W2[0]'),
    A('M80 41H226', 'tr-back'), T_(153, 16, `× ${f(M.B.dy)}`, 'cu-t-a', 'middle'), T_(153, 74, 'dL/dŷ', 'cu-t-m', 'middle'),
    A('M300 41H446', 'tr-back'), T_(373, 16, `× h₁ = ${f(M.F.h[0])}`, 'cu-t', 'middle'), T_(373, 74, 'dŷ/dW2[0]', 'cu-t-m', 'middle'),
    T_(540, 46, open ? `dL/dW2[0] = ${f(M.B.W2[0])}` : 'dL/dW2[0] = ?', open ? 'cu-t-a' : 'cu-t-b'),
    node(230, 112, 'h₁'), node(450, 112, 'z₁'), node(670, 112, 'W1[0]'),
    A('M265 58V108', 'tr-back'), T_(256, 92, `× W2[0] = ${f(M.INIT.W2[0])}`, 'cu-t', 'end'),
    A('M300 129H446', 'tr-back'), T_(373, 120, "× ReLU' = 1", 'cu-t', 'middle'), T_(265, 166, `dh₁ = ${f(M.B.dh[0])}`, 'cu-t-m', 'middle'),
    A('M520 129H666', 'tr-back'), T_(593, 120, '× x = [1, −1]', 'cu-t', 'middle'), T_(485, 166, `dz₁ = ${f(M.B.dz[0])}`, 'cu-t-m', 'end'),
    T_(836, 166, `dW1[0] = ${vec(M.B.W1[0])}`, 'cu-t-m', 'end'));
}

function closeUpdate() {
  const open = solved('update'), X = v => 40 + (v - .4) * 2000, old = M.INIT.W2[0], nw = M.UPDATED.W2[0];
  const after = M.BATCH_HAND.rows[2].l, before = M.ANSWERS.loss, bar = v => v / before * 220;
  return fig(150, 'W2[0] before and after one SGD step, and this example’s loss before and after.', arrowDefs(),
    L(30, 100, 560, 100), [.4, .45, .5, .55, .6, .65].map(v => [L(X(v), 96, X(v), 104), T_(X(v), 122, String(v), 'cu-t-m', 'middle')]),
    s('circle', { cx: X(old), cy: 100, r: 6, class: 'tr-point-zero' }), T_(X(old), 80, 'old 0.5', 'cu-t-b', 'middle'),
    open ? [A(`M${X(old) + 8} 90H${X(nw) - 6}`, 'tr-back'), s('circle', { cx: X(nw), cy: 100, r: 6, class: 'tr-point-one' }), T_(X(nw) + 4, 80, `new ${f(nw)}`, 'cu-t-a'),
      T_(X(old), 40, '−lr × g = −0.1 × (−0.6875) = +0.06875', 'cu-t')] : [T_(X(old), 40, 'step = −lr × g = ?', 'cu-t'), T_(X(old), 60, 'which way does it move?', 'cu-t-m')],
    T_(600, 20, 'loss on example 3', 'cu-t-b'),
    T_(600, 42, 'before', 'cu-t-m'), T_(824, 42, f(before, 6), 'cu-t', 'end'), R(600, 49, bar(before), 12, 'cu-slot'),
    T_(600, 82, 'after', 'cu-t-m'), T_(824, 82, open ? f(after, 6) : '?', open ? 'cu-t-a' : 'cu-t', 'end'), open ? R(600, 89, bar(after), 12, 'cu-slot-on') : null,
    T_(600, 125, 'batch mean rises:', 'cu-t-m'), T_(600, 145, open ? `${f(M.BATCH_INIT.mean, 4)} → ${f(M.BATCH_HAND.mean, 4)}` : 'all 13 parameters update', 'cu-t-m'));
}

// learning-rate sweep: only the rates this reader has tried, from the real 50-update runs (two columns, log bars)
function closeSweep() {
  const tried = [...new Set([...(G.settings.tried || []), G.settings.lr])], rows = M.sweep(tried), lo = -7, hi = 1;
  const kids = [];
  [0, 1].forEach(c => {
    const x0 = c * 428, X = v => x0 + 92 + (Math.log10(Math.max(v, 1e-7)) - lo) / (hi - lo) * 220;
    kids.push(L(X(M.TARGET), 18, X(M.TARGET), 110, 'cu-mark'), T_(X(M.TARGET), 12, `target ${M.TARGET}`, 'cu-t-m', 'middle'));
    M.RATES.slice(c * 4, c * 4 + 4).forEach((lr, i) => {
      const y = 34 + i * 24, r = rows.find(o => o.lr === lr), me = lr === G.settings.lr;
      kids.push(T_(x0 + 6, y + 4, `lr ${lr}`, me ? 'cu-t-a' : r ? 'cu-t' : 'cu-t-m'));
      if (!r) kids.push(T_(x0 + 92, y + 4, 'not tried', 'cu-t-m'));
      else if (r.divergedAt) kids.push(T_(x0 + 408, y + 4, `diverged at step ${r.divergedAt}`, 'cu-t-bad', 'end'));
      else kids.push(R(x0 + 92, y - 7, Math.max(3, X(r.finalLoss) - x0 - 92), 14, r.ok ? 'cu-slot-on' : 'cu-slot'), T_(x0 + 408, y + 4, `${f(r.finalLoss, 6)}${r.ok ? ' ✓' : ''}`, r.ok ? 'cu-t-a' : 'cu-t', 'end'));
    });
  });
  kids.push(T_(420, 128, 'bar length: final mean loss after 50 updates, log scale (shorter is better)', 'cu-t-m', 'middle'));
  return h('div', {}, fig(134, 'Final mean loss after 50 updates for each learning rate tried, log scale.', kids), cap(M.verdict(run())));
}

function closeMemory() {
  const open = solved('memory'), per = 44;
  let x = 10;
  const kids = M.MEMORY_ROWS.map(row => { const w = row.bytes * per, [fmt, ...name] = row.label.split(' '), k = [R(x, 20, w, 44, row.key === 'moments' ? 'cu-slot-on' : 'cu-slot'), T_(x + w / 2, 38, name.join(' ').replace('Adam ', ''), 'cu-t-b', 'middle'), T_(x + w / 2, 56, `${fmt} ${row.bytes} B`, 'cu-t', 'middle')]; x += w; return k; });
  return fig(150, 'Bytes per parameter for mixed-precision Adam, to scale, and what the budget leaves out.',
    kids, R(x + 8, 20, 836 - x - 8, 44, 'cu-slot-empty'), T_((x + 844) / 2, 38, 'activations', 'cu-t-m', 'middle'), T_((x + 844) / 2, 56, 'not counted', 'cu-t-m', 'middle'),
    T_(10, 90, `≈ ${M.bytesPerParam()} bytes per parameter  ×  7,000,000,000 parameters  ÷  10⁹`, 'cu-t'),
    T_(10, 116, open ? `≈ ${M.memoryGB()} GB of training state (approximate)` : '≈ ? GB of training state', open ? 'cu-t-a' : 'cu-t-b'),
    R(10, 128, M.MEMORY.weights * per, 14, 'cu-slot'), T_(10 + M.MEMORY.weights * per + 8, 140, 'the FP16 weight file alone: 2 B per parameter', 'cu-t-m'));
}

function pythonBench(host,g) {
  host.append(h('div',{class:'tr-py-summary'},h('b',{text: g.settings.pythonVerified ? '6/6 PYTHON CHECKS PASSED · FINITE DIFFERENCES AGREE' : 'BACKWARD · RETURN GRADIENTS, KEEP THE WEIGHTS'}),pre(`x = ${vec(M.EXAMPLE.x)}   t = ${M.EXAMPLE.t}\nW1: 3×2   b1: 3   W2: 3   b2: scalar\ndy = ${f(M.B.dy)}   dW2 = ${vec(M.B.W2)}\ndz = ${vec(M.B.dz)}   dW1[0] = ${vec(M.B.W1[0])}`)));
  pyCell(host,{ id:'training-backward',title:'Python · manual backpropagation',
    prompt:'Write backward(x, t, params). Return a dict with W1, b1, W2 and b2 gradients, with the same shapes as params. Use lists and the chain rule. Six checks compare your gradients with the hand pass and central finite differences.',
    data:M.PY_DATA, tests:M.PY_TESTS, solution:M.PY_SOLUTION,
    starter:`def backward(x, t, params):\n    # Forward: z = W1 @ x + b1; h = ReLU(z); y = W2 @ h + b2\n    # Backward: dy, dW2, dh, dz, dW1, db1, db2\n    return {'W1': [[0,0] for _ in params['W1']],\n            'b1': [0]*len(params['b1']),\n            'W2': [0]*len(params['W2']), 'b2': 0}\n\nprint(backward(DATA['x'], DATA['t'], DATA['params']))\n`,
    onPass:()=>{ g.settings.pythonVerified=true; g.saveSettings(); g.pass('python',{passed:true}); } });
}
const STEPS = [
  { id:'kit',phase:'kit',kicker:'Before you start',title:'Check your training kit',minutes:1,view:'board',
    lead:'Build a tiny network that learns XOR: the target is one when the two inputs differ. You will follow one example by hand, write backward, then train on the whole dataset.',
    parts:()=>[{title:'Your kit',n:3},{glyph:'db',name:'Four XOR examples',runs:'two inputs each · targets 0 or 1'},
      {glyph:'matrix',name:'2 → 3 → 1 network',runs:`Linear → ReLU → Linear · ${M.PARAMS} parameters`},
      {glyph:'loop',name:'Fixed initialization + SGD',runs:'squared error · no momentum · no weight decay'}],
    closeLabel:'THE LOOP YOU BUILD', close:closeKit, task:'predict' },
  { id:'linear',phase:'build',kicker:'Forward · Linear 1',title:'Compute one neuron',minutes:2,view:'board',
    lead:'Add <code>torch.nn.Linear(2, 3)</code>: each row of W1 makes one hidden preactivation. The board shows a fixed initialization; use row zero and the highlighted example.',
    adds:adds('Linear 1','z = W1 @ x + b1','W1: three rows, two columns · b1: three biases'),
    closeLabel:'CLOSE-UP · ROW ZERO',closeHint:'x = [1, −1] · W1[0] = [0.5, −0.5] · b1[0] = 0.25',close:closeLinear,mission:'z',
    task:numeric('z','What is z₁ for the first hidden neuron?',v=>v===1?'That leaves out the bias. Add b1[0] = 0.25.':v===.25?'The second product is positive: a negative weight times a negative input.':'Multiply each input by its own weight, add the products, then add the bias.'),
    after:()=>`0.5 × 1 + (−0.5) × (−1) + 0.25 = <b>${f(M.ANSWERS.z)}</b>. The other rows give ${f(M.F.z[1])} and ${f(M.F.z[2])}. Each row has its own weights and bias.` },
  { id:'relu',phase:'build',kicker:'Forward · activation',title:'Gate the hidden values',minutes:2,view:'board',
    lead:'Add <code>torch.nn.ReLU()</code> after the first linear layer. It keeps positive preactivations and replaces negative ones with zero; that bend lets the network fit XOR.',
    adds:adds('ReLU','h = max(0, z)','one operation per hidden neuron'),closeLabel:'CLOSE-UP · VALUE AND LOCAL SLOPE',
    closeHint:'slope 1 for z > 0, 0 for z < 0 (0 at z = 0)',close:closeRelu,mission:'relu',
    task:ui=>ui.choice({prompt:'For z = [1.25, −0.75, −0.25], which values and local slopes reach backward?',
      options:[['gate','h = [1.25, 0, 0]; slopes = [1, 0, 0]',null],['abs','h = [1.25, 0.75, 0.25]; slopes = [1, −1, −1]','That is absolute value. ReLU drops negative values instead of reflecting them.'],['pass','h = [1.25, 0, 0]; slopes = [1, 1, 1]','A negative ReLU branch is flat. Its local slope is zero, so it blocks the upstream gradient.']],check:choice=>CHECK.relu({choice})}),
    after:()=>`max(0, 1.25) = 1.25; max(0, −0.75) = max(0, −0.25) = 0, so h = <b>${vec(M.F.h)}</b>. Only the first hidden unit passes a gradient to Linear 1 on this example. A blocked unit may still activate on a different example.` },
  { id:'output',phase:'build',kicker:'Forward · Linear 2',title:'Combine the hidden activations',minutes:2,view:'board',
    lead:'Add <code>torch.nn.Linear(3, 1)</code> as the output layer. It combines the hidden activations into a linear score; there is no sigmoid or probability normalization here.',
    adds:adds('Linear 2','y = W2 @ h + b2','three output weights · one output bias'),closeLabel:'CLOSE-UP · OUTPUT ROW',
    closeHint:'h = [1.25, 0, 0] · W2 = [0.5, 0.5, −0.25] · b2 = 0.1',close:closeOutput,mission:'output',
    task:numeric('output','What score ŷ does the network predict?',v=>v===.625?'That is the weighted sum. Add the output bias of 0.1.':v===1?'One is the target, not the prediction. Evaluate W2 @ h + b2.':'The two zero activations contribute nothing. Multiply 0.5 by 1.25, then add 0.1.'),
    after:()=>`0.625 + 0.1 = <b>${f(M.F.y)}</b>. For classification we compare this score with 0.5, but the loss uses the score itself, not a rounded class.` },
  { id:'loss',phase:'build',kicker:'Forward · objective',title:'Measure the prediction error',minutes:2,view:'board',
    lead:'Add squared error, <code>L = (ŷ − t)²</code>. On one example this matches <code>torch.nn.MSELoss()</code>; when we train the batch we average the four example losses.',
    adds:adds('Squared error','L = (y - t) ** 2','one scalar objective'),closeLabel:'CLOSE-UP · PREDICTION VERSUS TARGET',
    close:closeLoss,mission:'loss',
    task:numeric('loss','What is this example’s squared loss? Keep all six decimal places.',v=>v===-.275?'That is the signed error. Square it to get the loss.':v===.275?'That is the absolute error. Squared error multiplies it by itself.':Math.abs(v-.0378125)<1e-7?'This loss has no factor of one-half. Use (ŷ − t)².':'Multiply −0.275 by −0.275. The result must be nonnegative.'),
    after:()=>`(−0.275)² = <b>${f(M.ANSWERS.loss,6)}</b>. The loss says how far off the prediction is. Its derivative will tell us which way to move.` },
  { id:'slope',phase:'build',kicker:'Backward · loss',title:'Start the backward pass',minutes:2,view:'board',
    lead:'Add the loss derivative at the output: <code>dL/dŷ = 2(ŷ − t)</code>. A gradient is a local slope, so it can be negative even though squared loss is nonnegative.',
    adds:adds('Loss backward','dy = 2 * (y - t)','the first link in the chain rule'),closeLabel:'CLOSE-UP · LOSS SLOPE',
    close:closeSlope,mission:'dy',
    task:numeric('dy','What is dL/dŷ, including its sign?',v=>v===.55?'The prediction is below the target. Raising it reduces loss, so this slope is negative.':v===-.275?'That is the error. Differentiating the square adds a factor of two.':'Use 2 × (0.725 − 1). Loss and gradient are different quantities.'),
    after:()=>`2 × (0.725 − 1) = <b>${f(M.B.dy)}</b>. Moving ŷ up a little moves L down. Backward carries this slope toward each parameter.` },
  { id:'chain',phase:'build',kicker:'Backward · Linear 2',title:'Carry the slope to a weight',minutes:3,view:'board',
    lead:'Add the linear-layer backward rule. The output changes by h₁ for each unit change in W2[0], so the chain rule multiplies the incoming loss slope by h₁.',
    adds:adds('Linear backward','dW2[i] = dy * h[i]\ndh[i] = dy * W2[i]','continue through ReLU: dz[i] = dh[i] * (z[i] > 0)'),
    closeLabel:'CLOSE-UP · FOLLOW BOTH PATHS',close:closeChain,mission:'weight',
    task:numeric('weight','What is the gradient dL/dW2[0]?',v=>v===-.55?'That is dL/dŷ. Multiply by the activation h₁ = 1.25.':v===-.275?'That is dh₁, which multiplies by W2[0]. The weight gradient multiplies by h₁.':v===.6875?'Keep the negative sign from dy. The activation is positive.':'Follow L → ŷ → W2[0]: −0.55 × 1.25.'),
    after:()=>`−0.55 × 1.25 = <b>${f(M.B.W2[0])}</b>. The other path gives dh₁ = −0.275, then dW1[0] = ${vec(M.B.W1[0])}. Opposite input signs create opposite weight gradients.` },
  { id:'update',phase:'build',kicker:'Optimizer · SGD',title:'Subtract the scaled gradient',minutes:3,view:'board',
    lead:'Add <code>torch.optim.SGD</code> with learning rate 0.1 and no momentum. Compute gradients at the old parameters first, then update every weight and bias together.',
    adds:adds('SGD','w = w - lr * gradient','hand pass: lr=0.1 · one example'),closeLabel:'CLOSE-UP · ONE UPDATE',
    close:closeUpdate,mission:'update',
    task:numeric('update','What is the new value of W2[0]?',v=>Math.abs(v-.43125)<1e-7?'That adds the gradient. SGD subtracts it; subtracting a negative value increases the weight.':v===1.1875?'That uses learning rate one. Scale the gradient by 0.1.':'0.1 × (−0.6875) = −0.06875. Subtract that from 0.5.'),
    after:()=>`0.5 − 0.1 × (−0.6875) = <b>${f(M.UPDATED.W2[0])}</b>. Updating all ${M.PARAMS} parameters reduces this example’s loss from ${f(M.ANSWERS.loss,6)} to ${f(M.loss(M.forward(M.EXAMPLE.x,M.UPDATED).y,1),6)}. This is one local step, not a guarantee for every rate.` },
  { id:'python',phase:'build',kicker:'Implement · manual backward',title:'Write the backward function',minutes:7,view:'bench',where:'lists · Python stdlib',bench:pythonBench,
    lead:'Implement the two-layer backward pass using lists. Return gradients in the same shapes as the parameters; six checks compare your answers with the board and finite differences.',
    adds:adds('backward(x, t, params)','dy = 2 * (y - t)\ndz = dy * W2 * (z > 0)\ndW1 = outer(dz, x)','no autograd here · in PyTorch, loss.backward() fills .grad'),mission:'python',
    task:ui=>ui.code({prompt:'Fill the Python cell and run it. A central finite difference checks each gradient by perturbing one parameter in both directions.',fallback:[
      ['dy=2*(y-t); dW2=dy*h; dz=dy*W2*(z>0); dW1=outer(dz,x)',true,null],
      ['dy=2*(y-t); dW2=dy*h; dz=dy*W2; dW1=outer(dz,x)',false,'This misses the ReLU gate. Negative preactivations must receive zero gradient.'],
      ['dy=(y-t)**2; dW2=dy*h; dz=dy*W2*(z>0); dW1=outer(dz,x)',false,'That uses the loss as dy. The derivative of the square is 2*(y-t).']]}),
    after:()=>`The weight and bias shapes match the forward pass. Central differences use [L(w + ε) − L(w − ε)] / (2ε); the checks use ε = 0.000001 and stay away from ReLU’s kink. Bias gradients equal their incoming slopes.` },
  { id:'rate',phase:'build',kicker:'Train · full-batch loop',title:'Find a learning rate that fits',minutes:4,view:'board',
    lead:'Add the training loop and start again from the fixed initialization. Each update averages the four example gradients, then applies SGD; change lr to redraw the real loss curve and decision map.',
    adds:()=>adds('Full-batch training',`optimizer = torch.optim.SGD(model.parameters(), lr=${G.settings.lr})\noptimizer.zero_grad()\nloss.backward()\noptimizer.step()`,`batch=${M.DATASET.length} · ${M.DEFAULTS.steps} updates · mean squared error`),closeLabel:'CLOSE-UP · YOUR RUN',
    closeHint:'your sweep · 50 updates from INIT each',close:closeSweep,mission:'lr',
    onReveal:g=>{ g.settings.lr=M.ANSWERS.lr; tryRate(g,M.ANSWERS.lr); },
    task:(ui,g)=>ui.selects({prompt:`Reach mean loss below ${M.TARGET} in ${M.DEFAULTS.steps} updates without crossing the divergence guard. Try a slow rate and a large rate to compare.`,selects:[{label:'learning rate',options:M.RATES.map(v=>[v,`lr = ${v}`]),get:()=>g.settings.lr,set:v=>{ g.settings.lr=v; tryRate(g,v); },parse:Number}],check:()=>CHECK.lr(g.settings)||M.verdict(run())}),
    after:()=>{ const r = run(), b = M.batchRows(r.params); return `At the last retained parameters, mean L = (${b.rows.map(row=>f(row.l,6)).join(' + ')}) ÷ ${b.rows.length} ≈ <b>${f(b.mean,6)}</b>. Each update uses w ← w − ${r.config.lr} × (g₁ + g₂ + g₃ + g₄) / 4; the curve evaluates the mean again after each update. Your chosen lr and final loss go into the exported config.`; } },
  { id:'memory',phase:'scale',kicker:'Scale · optimizer state',title:'Budget memory for a big model',minutes:2,view:'board',
    lead:'Add a memory ledger for an approximate mixed-precision Adam setup, separate from the tiny SGD run. Count the master copy, weights, gradients and both moments; this simulation budget excludes activations and temporary buffers.',
    adds:[{glyph:'db',name:'Mixed-precision Adam state',runs:'unsharded · decimal GB · parameter state only',conf:'FP32 master: 4 B\nFP16 weights: 2 B\nFP16 gradients: 2 B\nFP32 m + v: 8 B'}],closeLabel:'CLOSE-UP · BYTES PER PARAMETER',
    closeHint:'approximate · unsharded',close:closeMemory,mission:'memory',
    task:numeric('memory','About how many decimal GB does this ledger give for 7 billion parameters?',v=>v===14?'14 GB counts FP16 weights only. Training also needs master weights, gradients and Adam’s two moments.':v===16?'16 is bytes per parameter. Multiply by 7 billion, then convert bytes to decimal GB.':v===56?'That is only the two moments (8 bytes per parameter). Add the master copy, weights and gradients.':'Add 4 + 2 + 2 + 8 bytes per parameter, then multiply by 7 to get decimal GB.','GB'),
    after:()=>`4 + 2 + 2 + 8 = <b>${M.bytesPerParam()} bytes per parameter</b>. 7 billion × 16 = 112 billion bytes ≈ <b>${M.memoryGB()} GB</b>, against 14 GB for the FP16 weight file. Treat 16 bytes as an approximation for one unsharded setup: activations and temporary buffers come on top, and sharding (ZeRO, FSDP) splits the state across GPUs.` },
  { id:'done',phase:'done',kicker:'Done',title:'Keep your training config',minutes:0,view:'board',
    lead:'You assembled forward, loss, backward and update, then tuned a full-batch run. Copy your fixed initialization, dataset and chosen learning rate to reproduce the result.',
    closeLabel:'YOUR LEARNING-RATE SWEEP',close:closeSweep,task:'done' },
];
createGuide({ M, steps:STEPS, board, onBoard(svg,ctx) {
  if (matchMedia('(max-width:900px)').matches) {
    const target = ({ kit:0, linear:0, relu:340, output:520, loss:650, slope:620, chain:490, update:130, rate:280, memory:640, done:280 })[ctx.step.id] || 0;
    svg.parentElement.scrollLeft = target;
  }
}, init(g) { G=g; Object.assign(g.settings,M.configOf(g.settings)); },
  done:{stats:()=>[['parameters',M.PARAMS],['steps',run().steps],['final loss',f(run().finalLoss,6)]],artifactTitle:'Your training config · JSON',artifact:()=>M.artifact(G.settings)} });
