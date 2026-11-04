import { test, expect } from 'bun:test';
import * as M from './model.mjs';
import content from './content.mjs';
import walk from './walk.mjs';

const sumE = M.EXAMPLE.logits.map(Math.exp).reduce((a, b) => a + b, 0);

test('softmax of [2, 1, 0, -1]: P(dragon) = 0.644, sum of e^z = 11.475', () => {
  expect(sumE).toBeCloseTo(11.4752, 4);
  expect(M.ANSWERS.softmax).toBeCloseTo(0.64391, 5);
  expect(M.WORK.probs.map((p) => +p.toFixed(3))).toEqual([0.644, 0.237, 0.087, 0.032]);
});
test('temperature 0.5 gives P(dragon) = 0.865; T = 2 gives 0.455', () => {
  expect(M.ANSWERS.temperature).toBeCloseTo(0.86495, 5);
  expect(M.softmax(M.EXAMPLE.logits, 2)[0]).toBeCloseTo(0.455054, 6);
});
test('top-k = 3 cuts boy, kept mass 0.968, P(dragon) renormalized to 0.665', () => {
  expect(M.WORK.topk.kept).toEqual([0, 1, 2]);
  expect(M.WORK.topk.mass).toBeCloseTo(0.96794, 5);
  expect(M.ANSWERS.topk).toBeCloseTo(0.66524, 5);
});
test('top-p = 0.9 keeps 2: 0.665 + 0.245 = 0.910, renormalized 0.731 / 0.269', () => {
  expect(M.ANSWERS.nucleus).toBe(2);
  expect(M.WORK.topk.final[0] + M.WORK.topk.final[1]).toBeCloseTo(0.91, 3);
  expect(M.WORK.nucleus.final[0]).toBeCloseTo(0.73106, 5);
  expect(M.WORK.nucleus.final[1]).toBeCloseTo(0.26894, 5);
});
test('u = 0.70 draws dragon after renormalizing, castle against raw boundaries', () => {
  expect(M.ANSWERS.draw).toBe(0);
  expect(M.NAMES[M.ANSWERS.draw]).toBe('dragon');
  expect(M.EXAMPLE.u > M.WORK.probs[0]).toBe(true); // raw dragon ends at 0.644 < 0.70
});
test('entropy: 1.367 bits at T = 1, 1.201 after top-k, 0.840 after top-p', () => {
  expect(M.ANSWERS.entropy).toBeCloseTo(1.36701, 5);
  expect(M.entropyBits(M.WORK.topk.final)).toBeCloseTo(1.20089, 5);
  expect(M.entropyBits(M.WORK.nucleus.final)).toBeCloseTo(0.83994, 5);
});
test('temperature zero chooses the first maximum', () => expect(M.softmax([1, 2, 2], 0)).toEqual([0, 1, 0]));
test('a boundary belongs to the next segment', () => expect(M.sample([0, 0], 1, 0, 1, 0.5)).toBe(1));
test('top-k before top-p, renormalized', () => expect(M.distribution([2, 1, 0, -1], 1, 2, 0.9).kept).toEqual([0, 1]));
test('greedy run loops on "in a castle" and is cut at max_new_tokens = 20', () => {
  const r = M.generate({});
  expect(r.reason).toBe('max_tokens');
  expect(r.tokens.length).toBe(20);
  expect(r.repeated3).toBe(true);
  expect(r.text).toContain('in a castle in a castle in a castle');
});
test('greedy with repetition_penalty 1.5 ends the sentence at EOS after 10 tokens', () => {
  const r = M.generate({ repetition_penalty: 1.5 });
  expect(r.text).toBe('Once upon a time there was a dragon who lived in a castle by the sea.');
  expect(r.reason).toBe('EOS');
  expect(r.tokens.length).toBe(10);
  expect(r.steps.length).toBe(11);
  expect(M.loopSolved(r)).toBe(true);
});
test('at draw 7 the penalty turns the logit of "in" from 3 into 2, below 2.5 for "by"', () => {
  const r = M.generate({ repetition_penalty: 1.5 });
  const at = r.steps.find((x) => x.row === M.CASTLE_ROW);
  expect(at.n + 1).toBe(7);
  expect(at.logits).toEqual([2, 2.5, 1]);
  expect(at.token).toBe(' by');
});
test('seed 7: the loop task is solved exactly when the penalty is on', () => {
  for (const t of M.LOOP_OPTIONS.temperature) for (const p of M.LOOP_OPTIONS.top_p) for (const rp of M.LOOP_OPTIONS.repetition_penalty) {
    const r = M.generate({ temperature: t, top_p: p, repetition_penalty: rp });
    expect(r.tokens[0]).toBe(' dragon');
    expect(M.loopSolved(r)).toBe(rp > 1);
  }
});
test('the walk path: temperature 1 alone still repeats; adding penalty 1.5 solves', () => {
  expect(M.MISSIONS.find((m) => m.id === 'loop').check({ ...M.DEFAULTS, temperature: 1 })).toBe(false);
  expect(M.MISSIONS.find((m) => m.id === 'loop').check({ ...M.DEFAULTS, temperature: 1, repetition_penalty: 1.5 })).toBe(true);
});
test('the same seed and settings reproduce the run', () => {
  expect(M.generate({ temperature: 1.5, seed: 7 })).toEqual(M.generate({ temperature: 1.5, seed: 7 }));
});
test('stop string and max_tokens terminate', () => {
  expect(M.generate({ max_tokens: 2 }).reason).toBe('max_tokens');
  expect(M.generate({ stop: [' castle'] }).reason).toBe('stop string');
});
test('missions accept the answers the copy quotes', () => {
  const c = Object.fromEntries(M.MISSIONS.map((m) => [m.id, m.check]));
  expect(c.softmax(0.644)).toBe(true);
  expect(c.softmax(0.665)).toBe(false);
  expect(c.temperature(0.865)).toBe(true);
  expect(c.topk(0.665)).toBe(true);
  expect(c.nucleus(2)).toBe(true);
  expect(c.draw('dragon')).toBe(true);
  expect(c.draw('castle')).toBe(false);
  expect(c.entropy(1.367)).toBe(true);
});
test('quiz has 6 items in stage order with valid answers', () => {
  expect(content.quiz.map((q) => q.stage)).toEqual(['pre', 'check', 'check', 'check', 'post', 'post']);
  for (const q of content.quiz) expect(q.correct).toBeLessThan(q.options.length);
});

test('exponential weights, temperature weights and entropy contributions match the close-ups', () => {
  const rounded = (xs) => xs.map((x) => +x.toFixed(3));
  expect(rounded(M.EXAMPLE.logits.map(Math.exp))).toEqual([7.389, 2.718, 1, 0.368]);
  expect(M.EXAMPLE.logits.map((x) => Math.exp(x / 0.5)).reduce((a, b) => a + b)).toBeCloseTo(63.122541, 6);
  expect(rounded(M.softmax(M.EXAMPLE.logits, 2))).toEqual([0.455, 0.276, 0.167, 0.102]);
  expect(rounded(M.WORK.probs.map((p) => -p * Math.log2(p)))).toEqual([0.409, 0.492, 0.307, 0.159]);
});

test('the CDF before top-p rescaling has boundaries 0.665 and 0.910, not the raw softmax', () => {
  const [a, b] = M.WORK.topk.final;
  expect(a).toBeCloseTo(0.665241, 6);
  expect(a + b).toBeCloseTo(0.909969, 6);
  expect(a / (a + b)).toBeCloseTo(M.WORK.nucleus.final[0], 12);
  expect(M.EXAMPLE.u).toBeGreaterThan(a);
  expect(M.EXAMPLE.u).toBeLessThan(a + b);
});

test('the repetition penalty includes the prompt and handles both logit signs', () => {
  expect(M.penalise(3, true, 1.5)).toBe(2);
  expect(M.penalise(-2, true, 1.5)).toBe(-3);
  expect(M.penalise(3, false, 1.5)).toBe(3);
  const run = M.generate({ repetition_penalty: 1.5 });
  expect(run.steps.find((s) => s.token === ' a').logits).toEqual([2]);
  expect(run.steps.length).toBe(11);
  expect(run.config.max_tokens - run.steps.length).toBe(9);
});

test('the walkthrough rejects each wrong answer and accepts its model-computed solution', () => {
  const checks = Object.fromEntries(M.MISSIONS.map((m) => [m.id, m.check]));
  const settings = { ...M.DEFAULTS };
  for (const step of walk) for (const action of step.actions) {
    if (!checks[step.step] || action.do === 'python') continue;
    let answer = action.value ?? action.text;
    if (step.step === 'stop') answer = { 'max_new_tokens': 'length', 'EOS token': 'eos' }[action.text];
    if (action.do === 'select') { settings[action.label] = action.value; answer = settings; }
    if (action.expect) expect(checks[step.step](answer)).toBe(false);
    if (action.solves) expect(checks[step.step](answer)).toBe(true);
  }
});
