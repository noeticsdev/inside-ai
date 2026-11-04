import {test, expect} from 'bun:test';
import * as M from './model.mjs';
import content from './content.mjs';
import walk from './walk.mjs';
import {V as legacyV} from '../../machines/attention/model.mjs';

test('kit dimensions and the fixed input are pinned',()=>{
  expect(M.TOKENS).toEqual(['The','cat','sat','on','the']);
  expect([M.X.length,M.X[0].length,M.D_MODEL,M.D_K,M.FOCUS]).toEqual([5,8,8,4,2]);
  M.X.forEach((row,i)=>expect(row).toEqual(Array.from({length:8},(_,j)=>+(i===j))));
});
test('each actual projection is [8,4] and produces [5,4]',()=>{
  for(const key of ['Q','K','V']){
    expect(M[`W_${key}`].length).toBe(8);
    expect(M[`W_${key}`].every((row)=>row.length===4)).toBe(true);
    expect(M.EXAMPLE[key]).toEqual(M[`W_${key}`].slice(0,5));
  }
});
test('real value vectors are reused from the legacy model',()=>expect(M.V).toEqual(legacyV.slice(0,5)));
test('projection arithmetic: selected row and column really produce Q[3,1]',()=>{
  expect(M.EXAMPLE.Q[2]).toEqual([2,0,2,0]);
  expect(M.transpose(M.W_Q)[0]).toEqual([1,0,2,0,1,0,0,0]);
  expect(M.dot(M.X[2],M.transpose(M.W_Q)[0])).toBe(2);
});
test('dot product includes both nonzero products; score grid is pinned',()=>{
  expect(M.EXAMPLE.K[0]).toEqual([1,0,1,0]);
  expect(M.EXAMPLE.raw).toEqual([[1,0,1,0,1],[0,1,1,0,0],[4,0,2,2,2],[1,1,0,1,1],[1,1,2,0,1]]);
  expect(M.ANSWERS.dot).toBe(4);
});
test('scaling uses sqrt(4), giving [2,0,1] in the visible row',()=>{
  expect(Math.sqrt(M.D_K)).toBe(2);
  expect(M.EXAMPLE.scaled[2]).toEqual([2,0,1,1,1]);
  expect(M.ANSWERS.scaled).toBe(2);
});
test('mask counts exclude the diagonal for both learner choices',()=>{
  expect(M.maskedCells(5)).toBe(10);expect(M.maskedCells(4)).toBe(6);expect(M.maskedCells(1)).toBe(0);
  for(const tokens of [4,5]){
    const r=M.simulate({tokens});
    expect(r.masked.flat().filter((v)=>v===-Infinity).length).toBe(M.maskedCells(tokens));
    r.masked.forEach((row,i)=>row.forEach((v,j)=>expect(v===-Infinity).toBe(j>i)));
  }
});
test('softmax hand calculation pins every displayed exponential and weight',()=>{
  expect([2,0,1].map((v)=>Math.exp(v).toFixed(4))).toEqual(['7.3891','1.0000','2.7183']);
  expect((Math.exp(2)+1+Math.exp(1)).toFixed(4)).toBe('11.1073');
  expect(M.EXAMPLE.weights[2].map((v)=>v.toFixed(4))).toEqual(['0.6652','0.0900','0.2447','0.0000','0.0000']);
  expect(M.ANSWERS.weight).toBeCloseTo(0.6652409557748218,14);
});
test('drawn dot products and value contributions use the same row arithmetic',()=>{
  for(const tokens of [4,5]) {
    const work=M.rowWork({tokens});
    expect(work.products).toEqual([2,0,2,0]);
    expect(work.scores).toEqual([2,0,1]);
    expect(work.exponentials.map((v)=>v.toFixed(4))).toEqual(['7.3891','1.0000','2.7183']);
    expect(work.denominator.toFixed(4)).toBe('11.1073');
    expect(work.contributions.map((v)=>v.toFixed(4))).toEqual(['0.1330','0.0810','0.0245']);
    expect(work.contributions.reduce((a,b)=>a+b,0)).toBe(M.ANSWERS.mix);
  }
});
test('FP16 byte groups, row size and doubled-context comparison are pinned',()=>{
  expect(M.SCALE.bytes*8).toBe(16);
  expect(M.SCALE.context*M.SCALE.bytes).toBe(16384);
  expect(M.scoreBytes(M.SCALE.context*2)/2**20).toBe(512);
  expect(M.SCALE.dModel**2).toBe(262144);
});
test('output values and the full row printed on the page are pinned',()=>{
  expect(M.ANSWERS.mix).toBeCloseTo(0.23854855411378653,12);
  expect(M.EXAMPLE.output[2].map((v)=>v.toFixed(3))).toEqual(['0.239','0.305','0.058','0.224']);
  expect(M.EXAMPLE.output[2].map((v)=>v.toFixed(6))).toEqual(['0.238549','0.304786','0.057949','0.224045']);
});
test('every rounded weight and output cell on the finished board is pinned',()=>{
  const rounded=(grid)=>grid.map((row)=>row.map((v)=>Number(v.toFixed(2))));
  expect(rounded(M.EXAMPLE.weights)).toEqual([
    [1,0,0,0,0], [0.38,0.62,0,0,0], [0.67,0.09,0.24,0,0],
    [0.28,0.28,0.17,0.28,0], [0.19,0.19,0.31,0.12,0.19],
  ]);
  expect(rounded(M.EXAMPLE.output)).toEqual([
    [0.2,0.1,0,0.3], [0.64,0.16,0.06,0.11], [0.24,0.3,0.06,0.22],
    [0.32,0.32,0.31,0.16], [0.28,0.41,0.2,0.13],
  ]);
  expect(M.V.slice(0,3).reduce((sum,row)=>sum+row[0],0)/3).toBeCloseTo(0.4,14);
});
test('all rows sum to one, future keys weigh zero, diagonal stays visible',()=>{
  for(const tokens of [4,5])for(const heads of [4,8]){
    const r=M.simulate({tokens,heads});
    r.weights.forEach((row,i)=>{
      expect(row.reduce((a,b)=>a+b,0)).toBeCloseTo(1,14);
      expect(row[i]).toBeGreaterThan(0);
      expect(row.slice(i+1).every((v)=>v===0)).toBe(true);
    });
  }
});
test('causal output is invariant to changed future keys and values',()=>{
  const r=M.EXAMPLE;
  const K=r.K.map((row,i)=>i>2?row.map(()=>999):row);
  const V=r.V.map((row,i)=>i>2?row.map(()=>-999):row);
  expect(M.attention(r.Q,K,V).output.slice(0,3)).toEqual(r.output.slice(0,3));
  expect(M.attention(r.Q,K,V,false).output[2]).not.toEqual(r.output[2]);
});
test('stable softmax survives large scores and shift invariance',()=>{
  expect(M.softmax([1002,1000,1001,-Infinity])).toEqual(M.softmax([2,0,1,-Infinity]));
  expect(M.softmax([0,0])).toEqual([0.5,0.5]);
});
test('one token and uniform noncausal cases match Python fixtures',()=>{
  expect(M.attention([[2,0]],[[1,0]],[[3,4]]).output).toEqual([[3,4]]);
  expect(M.attention([[0,0],[0,0]],[[1,0],[0,1]],[[2,4],[4,8]],false).output).toEqual([[3,6],[3,6]]);
});
test('outputs are component-wise convex combinations of visible values',()=>{
  M.EXAMPLE.output.forEach((row,i)=>row.forEach((v,c)=>{
    const visible=M.V.slice(0,i+1).map((r)=>r[c]);
    expect(v).toBeGreaterThanOrEqual(Math.min(...visible)-1e-12);
    expect(v).toBeLessThanOrEqual(Math.max(...visible)+1e-12);
  }));
});
test('head widths and bias-free Q/K/V/O parameter count are pinned',()=>{
  expect(M.headWidth(512,8)).toBe(64);expect(M.headWidth(512,4)).toBe(128);
  expect(M.projectionParameters(512)).toBe(1048576);
  expect(M.ANSWERS.parameters).toBe(1048576);
});
test('dense FP16 memory count is bytes, with a quadratic context cost',()=>{
  expect(M.SCALE).toEqual({dModel:512,heads:8,context:8192,bytes:2});
  expect(8192**2).toBe(67108864);
  expect(M.scoreBytes(8192)).toBe(134217728);
  expect(M.ANSWERS.memory/2**20).toBe(128);
  expect(M.scoreBytes(16384)).toBe(4*M.scoreBytes(8192));
});
test('all allowed configurations are deterministic and reject garbage settings',()=>{
  for(const tokens of [4,5])for(const heads of [4,8]) expect(M.simulate({tokens,heads})).toEqual(M.simulate({tokens,heads}));
  expect(M.configOf({tokens:99,heads:'8'})).toEqual(M.DEFAULTS);
});
test('every numeric task rejects the common wrong answer and accepts the model answer',()=>{
  const c=Object.fromEntries(M.MISSIONS.map((m)=>[m.id,m.check]));
  expect(M.MISSIONS.length).toBe(9);
  for(const [id,right,wrong] of [['score',4,2],['scale',2,1],['mask',10,12.5],['softmax',M.ANSWERS.weight,1/3],['mix',0.239,0.2],['heads',64,512],['memory',134217728,67108864]]){
    expect(c[id]({value:right})).toBe(true);expect(c[id]({value:wrong})).toBe(false);
    for(const value of [NaN,Infinity,undefined,'4'])expect(c[id]({value})).toBe(false);
  }
  expect(c.project({choice:'5x4'})).toBe(true);expect(c.project({choice:'8x4'})).toBe(false);
  expect(c.project({tokens:4,choice:'4x4'})).toBe(true);
  expect(c.mask({tokens:4,value:6})).toBe(true);
  expect(c.heads({heads:4,value:128})).toBe(true);
  expect(c.python({passed:true})).toBe(true);expect(c.python({passed:false})).toBe(false);
});
test('decimal tolerances accept rounding and reject nearby wrong weights or sums',()=>{
  const c=Object.fromEntries(M.MISSIONS.map((m)=>[m.id,m.check]));
  expect(c.softmax({value:0.66})).toBe(true);expect(c.softmax({value:0.65})).toBe(false);
  expect(c.mix({value:0.239})).toBe(true);expect(c.mix({value:0.241})).toBe(false);
});
test('artifact reflects both reader choices and distinguishes teaching/full-size shapes',()=>{
  const a=M.artifact({tokens:4,heads:4});
  expect(a).toContain('T = 4');expect(a).toContain('num_heads=4');expect(a).toContain('d_k = 128');
  expect(a).toContain('X: [T, 8]');expect(a).toContain('output = weights @ V');expect(a).toContain('bias=False');
  expect(M.artifact()).toContain('num_heads=8');
});
test('Python has exactly five named checks and supplies the complete computed fixture',()=>{
  expect(M.PY_TESTS.match(/check\('/g).length).toBe(5);
  expect(M.pythonData({tokens:4})).toEqual({Q:M.simulate({tokens:4}).Q,K:M.simulate({tokens:4}).K,V:M.simulate({tokens:4}).V,output:M.simulate({tokens:4}).output,weights:M.simulate({tokens:4}).weights});
});
test('guide metadata, checkpoint and walkthrough follow the lesson contract',()=>{
  expect(content.layout).toBe('guide');expect(content.minutes).toBe(25);
  expect(content.quiz.map((q)=>q.stage)).toEqual(['pre','check','check','check','post','post']);
  for(const q of content.quiz){expect(q.options.length).toBe(4);expect(q.correct).toBeGreaterThanOrEqual(0);expect(q.correct).toBeLessThan(4);expect(q.explanation.length).toBeGreaterThan(20);}
  expect(new Set(content.quiz.map((q)=>q.correct)).size).toBe(4);
  expect(walk.length).toBe(10);expect(walk.flatMap((s)=>s.actions).filter((a)=>a.do==='python').length).toBe(1);
  expect(walk.slice(1).every((w)=>w.actions.some((a)=>a.expect)&&w.actions.some((a)=>a.solves))).toBe(true);
});
