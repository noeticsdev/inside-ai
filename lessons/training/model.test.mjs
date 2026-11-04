import { test, expect } from 'bun:test';
import * as M from './model.mjs';
import content from './content.mjs';
import walk from './walk.mjs';
const near = (a,b) => expect(a).toBeCloseTo(b,10);

test('architecture, dataset and parameter count',()=>{
  expect(M.SHAPE).toEqual([2,3,1]); expect(M.PARAMS).toBe(13);
  expect(M.DATASET).toEqual([{x:[-1,-1],t:0},{x:[-1,1],t:1},{x:[1,-1],t:1},{x:[1,1],t:0}]);
  expect(M.PATHS.length).toBe(M.PARAMS); expect(M.INIT.W1).toEqual([[.5,-.5],[-.5,.5],[.5,.5]]);
  expect(M.INIT.b1).toEqual([.25,.25,-.25]); expect(M.INIT.W2).toEqual([.5,.5,-.25]); expect(M.INIT.b2).toBe(.1);
});
test('forward values quoted in the hand pass',()=>{
  expect(M.F.z).toEqual([1.25,-.75,-.25]); expect(M.F.h).toEqual([1.25,0,0]); near(M.F.y,.725);
  near(M.dot(M.INIT.W1[0],M.EXAMPLE.x),1); near(M.dot(M.INIT.W2,M.F.h),.625);
});
test('ReLU values and its chosen zero subgradient',()=>{
  expect([-3,0,2].map(M.relu)).toEqual([0,0,2]);
  const p=M.clone(M.INIT); p.b1[0]=0; p.W1[0]=[0,0];
  expect(M.backward([1,-1],1,p).b1[0]).toBe(0);
});
test('squared loss and first gradient',()=>{
  near(M.F.y-1,-.275); near(M.loss(M.F.y,1),.075625); near(M.B.dy,-.55);
  near(M.loss(M.F.y,1)/2,.0378125); // the half-MSE distractor
});
test('chain rule: output weights, hidden slopes, ReLU gate',()=>{
  expect(M.B.dh).toEqual([-.275,-.275,.1375]); expect(M.B.dz).toEqual([-.275,0,0]);
  M.B.W2.forEach((v,i)=>near(v,[-.6875,0,0][i])); near(M.B.b2,-.55);
});
test('chain rule: input weights and biases',()=>{
  M.B.W1.flat().forEach((v,i)=>near(v,[-.275,.275,0,0,0,0][i]));
  expect(M.B.b1).toEqual([-.275,0,0]);
});
test('every parameter gradient agrees with central differences on all examples',()=>{
  for(const {x,t} of M.DATASET) {
    const b=M.backward(x,t),fd=M.finiteDifferences(x,t);
    M.PATHS.forEach((p,i)=>expect(M.at(b,p)).toBeCloseTo(fd[i],7));
  }
});
test('changed weights and off-dataset targets also agree with finite differences',()=>{
  for(const c of M.PY_DATA.cases.slice(4)) {
    const b=M.backward(c.x,c.t,c.params);
    M.PATHS.forEach((p,i)=>expect(M.at(b,p)).toBeCloseTo(c.expected[i],7));
  }
});
test('the average gradient differentiates the mean loss',()=>{
  const g=M.batchGradient(M.INIT);
  for(const p of M.PATHS) {
    const fd=(M.meanLoss(M.perturbed(M.INIT,p,1e-6))-M.meanLoss(M.perturbed(M.INIT,p,-1e-6)))/2e-6;
    expect(M.at(g,p)).toBeCloseTo(fd,7);
  }
});
test('SGD updates every parameter at the old gradient',()=>{
  expect(M.HAND_LR).toBe(.1); near(M.UPDATED.W2[0],.56875);
  expect(M.UPDATED.W1[0]).toEqual([.5275,-.5275]); near(M.UPDATED.b1[0],.2775); near(M.UPDATED.b2,.155);
  for(const p of M.PATHS) near(M.at(M.UPDATED,p),M.at(M.INIT,p)-.1*M.at(M.B,p));
});
test('one-example update lowers loss by the displayed amount',()=>{
  near(M.forward(M.EXAMPLE.x,M.UPDATED).y,.912859375);
  near(M.loss(M.forward(M.EXAMPLE.x,M.UPDATED).y,1),.00759348852539062);
  expect(M.loss(M.forward(M.EXAMPLE.x,M.UPDATED).y,1)).toBeLessThan(M.ANSWERS.loss);
});
test('initial batch predictions and mean loss are pinned',()=>{
  expect(M.DATASET.map(({x})=>M.forward(x).y)).toEqual([.35,.725,.725,.1625]);
  near(M.meanLoss(M.INIT),.0750390625);
});
test('50-step losses across the full learning-rate control range',()=>{
  const expected=[.07472321772842216,.07193461526344236,.04795108525651983,.0003943604555090889,8.78857601900429e-7,7.511449094418162,110351.4410312551,52329.1691892897];
  M.RATES.forEach((lr,i)=>near(M.train({lr}).finalLoss,expected[i]));
});
test('training histories have one true evaluation per completed update',()=>{
  for(const lr of M.RATES) {
    const r=M.train({lr}); expect(r.curve.length).toBe(r.steps+1); near(r.curve[0],.0750390625);
    near(r.finalLoss,M.meanLoss(r.params)); expect(r.curve.every(v=>Number.isFinite(v)&&v>=0)).toBe(true);
    r.predictions.forEach((v,i)=>near(v,M.forward(M.DATASET[i].x,r.params).y));
  }
});
test('divergence records the first failed step and retains last finite parameters',()=>{
  expect(M.train({lr:3}).divergedAt).toBe(6); expect(M.train({lr:3}).steps).toBe(5);
  expect(M.train({lr:10}).divergedAt).toBe(3); expect(M.train({lr:10}).steps).toBe(2);
  expect(M.verdict(M.train({lr:3}))).toContain('1,000,000 guard');
});
test('a too-large finite run may stall instead of fitting XOR',()=>{
  const r=M.train({lr:1}); expect(r.divergedAt).toBeNull(); expect(r.finalLoss).toBeGreaterThan(r.curve[0]);
  expect(new Set(r.predictions).size).toBe(1);
});
test('the target is reachable and the default fails',()=>{
  expect(M.TARGET).toBe(.01); expect(M.DEFAULTS).toEqual({lr:.001,steps:50});
  const m=M.MISSIONS.find(m=>m.id==='lr');
  expect(m.check(M.DEFAULTS)).toBe(false);
  expect(M.RATES.filter(lr=>m.check({lr}))).toEqual([.1,.3]);
  expect(M.train({lr:.1}).predictions.map(v=>Number(v>=.5))).toEqual(M.DATASET.map(e=>e.t));
});
test('verdicts explain slow and divergent runs with computed numbers',()=>{
  expect(M.verdict(M.train({lr:.0001}))).toContain('0.07472 after 50 steps');
  expect(M.verdict(M.train({lr:3}))).toContain('Diverged at step 6');
  expect(M.verdict(M.train({lr:.1}))).toContain('0.00039 after 50 steps');
});
test('config normalization rejects garbage and caps run length',()=>{
  expect(M.configOf({lr:'garbage',steps:-2})).toEqual(M.DEFAULTS);
  expect(M.configOf({lr:'0.1',steps:200})).toEqual({lr:.1,steps:200});
  expect(M.configOf({steps:201})).toEqual(M.DEFAULTS);
});
test('all model operations preserve initialization and inputs',()=>{
  const before=JSON.stringify(M.INIT),data=JSON.stringify(M.DATASET);
  M.forward(M.EXAMPLE.x); M.backward(M.EXAMPLE.x,1); M.batchGradient(M.INIT); M.update(M.INIT,M.B,.1);
  M.finiteDifferences(M.EXAMPLE.x,1); M.RATES.forEach(lr=>M.train({lr}));
  expect(JSON.stringify(M.INIT)).toBe(before); expect(JSON.stringify(M.DATASET)).toBe(data);
});
test('training is deterministic for every rate and several step budgets',()=>{
  for(const lr of M.RATES) for(const steps of [1,10,50,200]) expect(M.train({lr,steps})).toEqual(M.train({lr,steps}));
});
test('the decision map samples real predictions and uses threshold 0.5',()=>{
  const grid=M.mapGrid(M.INIT); expect(grid.length).toBe(400);
  for(const c of grid) { near(c.score,M.forward(c.x).y); expect(c.label).toBe(Number(c.score>=.5)); }
});
test('mixed precision Adam ledger: all quoted byte and GB counts',()=>{
  expect(M.MEMORY).toEqual({master:4,weights:2,grads:2,moments:8,parameters:7e9});
  expect(M.bytesPerParam()).toBe(16); expect(M.memoryGB()).toBe(112);
  expect(M.MEMORY.weights*M.MEMORY.parameters/1e9).toBe(14);
  expect(M.MEMORY.moments*M.MEMORY.parameters/1e9).toBe(56);
});
test('all numeric mission answers accept correct and reject wrong answers',()=>{
  const expected={z:1.25,output:.725,loss:.075625,dy:-.55,weight:-.6875,update:.56875,memory:112};
  for(const [id,value] of Object.entries(expected)) {
    near(M.ANSWERS[id],value); const m=M.MISSIONS.find(m=>m.id===id);
    expect(m.check({value})).toBe(true); expect(m.check({value:value+1})).toBe(false); expect(m.check({value:NaN})).toBe(false);
  }
  expect(M.MISSIONS.find(m=>m.id==='relu').check({choice:'pass'})).toBe(false);
  expect(M.MISSIONS.find(m=>m.id==='relu').check({choice:'gate'})).toBe(true);
  expect(M.MISSIONS.find(m=>m.id==='python').check({passed:true})).toBe(true);
});
test('Python data covers all parameters and six checks',()=>{
  expect((M.PY_TESTS.match(/^check\(/gm)||[]).length).toBe(6);
  expect(M.PY_DATA.cases.length).toBe(6);
  M.PY_DATA.cases.forEach(c=>{expect(c.expected.length).toBe(13); expect(c.expected.every(Number.isFinite)).toBe(true);});
});
test('the artifact preserves the reader rate and reproduces final loss',()=>{
  for(const lr of [.1,.3]) {
    const a=JSON.parse(M.artifact({lr})); expect(a.lr).toBe(lr); expect(a.model.shape).toEqual([2,3,1]);
    expect(a.optimizer).toBe('SGD'); expect(a.batch).toBe(4); expect(a.steps).toBe(50); expect(a.completed_steps).toBe(50);
    expect(a.model.init).toEqual(M.INIT); expect(a.dataset).toEqual(M.DATASET); near(a.final_loss,M.train({lr}).finalLoss);
  }
});
test('quiz and walkthrough follow the guided lesson contract',()=>{
  expect(content.layout).toBe('guide'); expect(content.quiz.map(q=>q.stage)).toEqual(['pre','check','check','check','post','post']);
  for(const q of content.quiz) {expect(q.options.length).toBe(4); expect(q.correct>=0&&q.correct<4).toBe(true); expect(q.explanation.length).toBeGreaterThan(20);}
  expect(walk.map(w=>w.step)).toEqual(['kit','linear','relu','output','loss','slope','chain','update','python','rate','memory']);
  expect(walk.filter(w=>w.actions.some(a=>a.do==='python')).length).toBe(1);
  expect(M.MISSIONS.length).toBe(10);
});
test('graph selection uses the same parameters as the decision map',()=>{
  expect(M.displayState({},false,false).params).toBe(M.INIT);
  expect(M.displayState({},false,true).params).toBe(M.UPDATED);
  for(const lr of M.RATES) {
    const d=M.displayState({lr},true,true); expect(d.params).toEqual(M.train({lr}).params);
    expect(d.forward).toEqual(M.forward(M.EXAMPLE.x,d.params));
  }
});
test('batch panel: per-example losses at init and after the one-example hand step',()=>{
  expect(M.BATCH_INIT.rows.map(r=>r.y)).toEqual([.35,.725,.725,.1625]);
  M.BATCH_INIT.rows.forEach((r,i)=>near(r.l,[.1225,.075625,.075625,.02640625][i]));
  near(M.BATCH_INIT.mean,.0750390625); near(M.BATCH_INIT.mean,M.meanLoss(M.INIT));
  near(M.BATCH_HAND.rows[2].l,.0075934885); near(M.BATCH_HAND.mean,.0775877814);
  expect(M.BATCH_HAND.mean).toBeGreaterThan(M.BATCH_INIT.mean); // helps example 3, hurts the batch
});
test('memory rows and the learning-rate sweep the close-ups draw',()=>{
  expect(M.MEMORY_ROWS.map(r=>[r.bytes,r.gb])).toEqual([[4,28],[2,14],[2,14],[8,56]]);
  expect(M.MEMORY_ROWS.reduce((n,r)=>n+r.gb,0)).toBe(M.memoryGB());
  const s=M.sweep(M.RATES); expect(s.map(r=>r.lr)).toEqual(M.RATES);
  expect(s.filter(r=>r.ok).map(r=>r.lr)).toEqual([.1,.3]);
  expect(s.filter(r=>r.divergedAt).map(r=>[r.lr,r.divergedAt])).toEqual([[3,6],[10,3]]);
  expect(M.sweep([1,.001]).map(r=>r.lr)).toEqual([.001,1]);
  expect(M.sweep([1])[0].finalLoss).toBeCloseTo(7.5114,3);
});
