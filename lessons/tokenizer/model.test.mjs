import {test,expect} from 'bun:test';
import * as M from './model.mjs';
import content from './content.mjs';
test('Hindi has six code points',()=>expect(Array.from(M.HINDI).length).toBe(6));
test('Hindi has eighteen UTF-8 bytes',()=>expect(M.ANSWERS.hindiBytes).toBe(18));
test('Hindi byte patterns',()=>expect(M.bytes(M.HINDI).map(M.hex).join(' ')).toBe('e0 a4 a8 e0 a4 ae e0 a4 b8 e0 a5 8d e0 a4 a4 e0 a5 87'));
test('regex preserves spaces and contraction',()=>expect(M.pretokenize(M.SPLIT_EXAMPLE)).toEqual(['I',' don',"'t",' like',' ',' it','.']));
test('initial pair count',()=>expect(M.TOP[0]).toEqual({pair:'20 74',count:20}));
test('second pair count',()=>expect(M.TOP[1]).toEqual({pair:'68 65',count:17}));
test('initial corpus count',()=>expect(M.corpusCount(0)).toBe(468));
test('first merge count',()=>expect(M.ANSWERS.firstCount).toBe(448));
test('ranked merges',()=>expect(M.MERGES.slice(0,4).map(m=>m.into)).toEqual(['2074','6865','6e67','20746865']));
test('ranked encoding',()=>expect(M.encodeWord(' the',M.MERGES)).toEqual(['20746865']));
test('target minimum',()=>expect([M.ANSWERS.needed,M.encode(M.SENTENCE,34).length,M.encode(M.SENTENCE,35).length]).toEqual([35,21,20]));
test('language counts',()=>expect([M.encode('the',35).length,M.encode(M.HINDI,35).length]).toEqual([1,18]));
test('base IDs round trip',()=>expect(M.ids(M.HINDI,0)).toEqual(M.bytes(M.HINDI)));
test('encoding preserves bytes',()=>expect(M.encode(M.SENTENCE).join('')).toBe(M.bytes(M.SENTENCE).map(M.hex).join('')));
test('no merging across boundaries',()=>expect(M.encode('a b',40).join('')).toBe('612062'));
test('training deterministically selects each winning pair',()=>{
  let words = M.INITIAL.map(w => [...w]);
  expect(M.MERGES).toHaveLength(40);
  for (const [rank, merge] of M.MERGES.entries()) {
    const best = M.pairCounts(words)[0];
    expect(merge).toEqual({rank, a:best.pair.split(' ')[0], b:best.pair.split(' ')[1], into:best.pair.replace(' ',''), count:best.count});
    words = words.map(w => M.fuse(w, merge.a, merge.b));
  }
});
test('quiz stages',()=>expect(content.quiz.map(q=>q.stage)).toEqual(['pre','check','check','check','post','post']));
test('followed sentence readout',()=>expect([Array.from(M.SENTENCE).length,M.bytes(M.SENTENCE).length,M.pretokenize(M.SENTENCE).length]).toEqual([10,22,5]));
test('unseen pre-token follows the illustrated ranks',()=>expect(M.encodeWord(' them',M.MERGES.slice(0,35))).toEqual(['20746865','6d']));
test('vocabulary and byte ratio at target',()=>expect([256+M.ANSWERS.needed,(M.bytes(M.SENTENCE).length/M.encode(M.SENTENCE,M.ANSWERS.needed).length).toFixed(2)]).toEqual([291,'1.10']));
test('UTF-8 close-up puts the code-point payload in three bytes',()=>{
  expect(M.UTF8_EXAMPLE).toEqual({char:'न',codePoint:2344,bytes:[224,164,168]});
  expect(M.UTF8_EXAMPLE.codePoint.toString(2).padStart(16,'0')).toBe('0000100100101000');
  expect(M.UTF8_EXAMPLE.bytes.map(b=>b.toString(2))).toEqual(['11100000','10100100','10101000']);
});
test('kit and byte-accounting labels',()=>{
  expect([M.CORPUS.length,M.bytes(M.CORPUS.join('')).length,new Set(M.bytes(M.SENTENCE)).size]).toEqual([5,468,12]);
  expect([M.bytes('the ').length,M.bytes(M.HINDI).length]).toEqual([4,18]);
});
test('all seven pair bars pin their printed counts',()=>expect(M.TOP.slice(0,7).map(p=>[p.pair,p.count])).toEqual([
  ['20 74',20],['68 65',17],['6e 67',16],['69 6e',15],['74 68',15],['20 73',9],['6e 64',9]
]));
test('sentence chart pins every slider position',()=>{
  expect(Array.from({length:41},(_,n)=>M.encode(M.SENTENCE,n).length)).toEqual([22,22,...Array(33).fill(21),...Array(6).fill(20)]);
});
test('token IDs printed below the final strip',()=>expect(M.ids(M.SENTENCE,35)).toEqual([290,32,224,164,168,224,164,174,224,164,184,224,165,141,224,164,164,224,165,135]));
test('all merge budgets preserve bytes and map IDs back to the same sequence',()=>{
  for(let n=0;n<=M.MAX_MERGES;n++) for(const text of [M.SENTENCE,M.SPLIT_EXAMPLE,...M.CORPUS]) {
    const tokens = M.encode(text,n);
    expect(tokens.join('')).toBe(M.byteTokens(text).join(''));
    expect(M.ids(text,n).map(id=>id<256?M.hex(id):M.MERGES[id-256].into)).toEqual(tokens);
    expect(M.encode(text,n)).toEqual(tokens);
  }
});
test('cost comparison stays tied to the selected merge budget',()=>{
  expect([M.costRatio(0),M.costRatio(34),M.costRatio(35),M.costRatio(40)]).toEqual([6,9,18,18]);
});
test('incremental UTF-8 decoding waits for a complete character',()=>{
  const decoder = new TextDecoder();
  expect(M.UTF8_EXAMPLE.bytes.map(b=>decoder.decode(Uint8Array.of(b),{stream:true}))).toEqual(['','','न']);
  expect(M.UTF8_EXAMPLE.bytes.map(b=>new TextDecoder().decode(Uint8Array.of(b)))).toEqual(['�','�','�']);
});
test('rank wins over position and repeated pairs never overlap',()=>{
  expect(M.encodeWord('abc',[{a:'62',b:'63'},{a:'61',b:'62'}])).toEqual(['61','6263']);
  expect(M.fuse(['61','61','61','61','61'],'61','61')).toEqual(['6161','6161','61']);
});
test('every mission accepts the correct model answer and rejects a common mistake',()=>{
  const answers = {
    bytes:[{value:18},{value:6}], split:[{value:7},{value:4}], pairs:[{choice:'st'},{choice:'he'}],
    first:[{value:448},{value:428}], learn:[{merges:35},{merges:34}],
    order:[{order:['r0','r1','r3']},{order:['r0','r2','r3']}], python:[{passed:true},{passed:false}],
    decode:[{choice:'buffer'},{choice:'id'}], cost:[{value:18,merges:35},{value:6,merges:35}],
  };
  expect(M.MISSIONS).toHaveLength(9);
  for(const m of M.MISSIONS) {
    expect(m.check(answers[m.id][0])).toBe(true);
    expect(m.check(answers[m.id][1])).toBe(false);
  }
});
