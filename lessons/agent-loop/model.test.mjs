import { test, expect } from 'bun:test';
import * as M from './model.mjs';
import C from './content.mjs';
import walk from './walk.mjs';
import { PYTHON_TESTS, PYTHON_DATA } from './python.mjs';
const policy = (replies) => (messages) => structuredClone(replies[Math.min(replies.length - 1, messages.filter((m) => m.role === 'assistant').length)]);
const final = { role: 'assistant', content: 'Done.' };
const checks = Object.fromEntries(M.MISSIONS.map((m) => [m.id, m.check]));

test('the report, percentage and calculation are pinned', () => {
  expect(M.FIXTURE).toEqual({ path: 'report.txt', revenue: 4200000, percent: 18 });
  expect(M.ANSWERS.result).toBe(756000);
  expect(M.executeTool('calculator', { expression: '0.18 * 4200000' }, {})).toEqual({ value: 756000 });
});
test('initial conversation is system then user, and the tool exchange keeps ids', () => {
  const r = M.FIRST_TURN;
  expect(r.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
  expect(r.messages[2].tool_calls[0].id).toBe(r.messages[3].tool_call_id);
  expect(JSON.parse(r.messages[3].content)).toEqual({ paths: ['report.txt'] });
});
test('three safe tools and a separate gated function use strict Chat Completions definitions', () => {
  expect(M.TOOLS.map((t) => t.function.name)).toEqual(['search_docs', 'read_file', 'calculator']);
  for (const t of [...M.TOOLS, M.DANGEROUS_TOOL]) {
    expect(t.type).toBe('function'); expect(t.function.strict).toBe(true);
    expect(t.function.parameters.required).toEqual(Object.keys(t.function.parameters.properties));
    expect(t.function.parameters.additionalProperties).toBe(false);
  }
});
test('schema accepts a string path and rejects number, missing, array, null and extra properties', () => {
  const s = M.TOOLS[1].function.parameters;
  expect(M.validate(s, { path: 'report.txt' })).toBe(null);
  for (const args of [{ path: 4200000 }, {}, [], null, { filename: 'report.txt' }, { path: ['report.txt'] }, { path: 'report.txt', force: true }]) expect(M.validate(s, args)).toBeString();
});
test('router parses string arguments and checks the envelope before dispatch', () => {
  const call = M.toolCall('x', 'read_file', { path: 'report.txt' }).tool_calls[0];
  expect(M.parseCall(call)).toEqual({ name: 'read_file', args: { path: 'report.txt' } });
  expect(M.parseCall({ ...call, function: { ...call.function, arguments: 'not JSON' } }).error).toContain('valid JSON');
  expect(M.parseCall({ ...call, function: { ...call.function, arguments: {} } }).error).toContain('valid JSON');
  for (const bad of [null, {}, { ...call, id: '' }, { ...call, type: 'shell' }]) expect(M.parseCall(bad).error).toContain('envelope');
});
test('unregistered tools are errors', () => {
  expect(M.parseCall(M.toolCall('x', 'shell', {}).tool_calls[0]).error).toContain('Unknown tool');
});
test('the document index searches the actual example file data', () => {
  const files = { 'report.txt': 'Q3 revenue: 4200000 USD', 'notes.txt': 'Q2 notes' };
  expect(M.executeTool('search_docs', { query: 'q3' }, files)).toEqual({ paths: ['report.txt'] });
  expect(M.executeTool('search_docs', { query: 'absent' }, files)).toEqual({ paths: [] });
});
test('read_file observes the selected data and reports missing files', () => {
  expect(M.executeTool('read_file', { path: 'a' }, { a: 'bytes' })).toEqual({ text: 'bytes' });
  expect(M.executeTool('read_file', { path: '../secret' }, {})).toEqual({ error: 'File not found: ../secret.' });
});
test('calculator performs signed decimal multiplication without eval', () => {
  expect(M.executeTool('calculator', { expression: ' -.5 * 12 ' }, {})).toEqual({ value: -6 });
  expect(M.executeTool('calculator', { expression: '0.1 * 0.2' }, {})).toEqual({ value: 0.02 });
  for (const expression of ['18% of 4,200,000', '2+3', 'fetch("secret")', '1 * Infinity']) expect(M.executeTool('calculator', { expression }, {})).toHaveProperty('error');
});
test('normal script reads, computes and answers in four model turns', () => {
  const r = M.simulate({ scenario: 'normal' });
  expect(r.totals).toEqual({ steps: 4, toolsCalled: 3, inputTokens: 1280, outputTokens: 160, contextTokens: 360, status: 'answered' });
  expect(r.messages.at(-1).content).toBe('18% of Q3 revenue is 756,000.');
});
test('recovery script appends an error, corrects arguments under a new id, and answers', () => {
  const r = M.simulate();
  expect(r.totals).toEqual({ steps: 5, toolsCalled: 4, inputTokens: 1800, outputTokens: 200, contextTokens: 440, status: 'answered' });
  expect(r.messages).toHaveLength(11);
  expect(JSON.parse(r.messages[7].content).error).toContain('not prose');
  expect(r.messages[6].tool_calls[0].id).toBe('call_3');
  expect(r.messages[8].tool_calls[0].id).toBe('call_4');
  expect(JSON.parse(r.messages[9].content)).toEqual({ value: 756000 });
});
test('policy uses the transcript observations rather than a hidden counter', () => {
  const messages = M.initialMessages();
  messages.push(M.toolCall('a', 'search_docs', { query: 'Q3' }), { role: 'tool', tool_call_id: 'a', content: '{"paths":["custom.txt"]}' });
  expect(JSON.parse(M.scriptedPolicy(messages).tool_calls[0].function.arguments)).toEqual({ path: 'custom.txt' });
  messages.push(M.toolCall('b', 'read_file', { path: 'custom.txt' }), { role: 'tool', tool_call_id: 'b', content: '{"text":"Q3 revenue: 1000 USD"}' });
  expect(JSON.parse(M.scriptedPolicy(messages, { scenario: 'normal' }).tool_calls[0].function.arguments)).toEqual({ expression: '0.18 * 1000' });
});
test('the policy and caller never mutate their input messages or tool definitions', () => {
  const initial = M.initialMessages(), saved = structuredClone(initial), defs = structuredClone(M.TOOLS);
  M.scriptedPolicy(initial); M.simulate();
  expect(initial).toEqual(saved); expect(M.TOOLS).toEqual(defs);
});
test('each request contains all earlier observations; four messages estimate 160 tokens', () => {
  expect(M.TOKEN).toEqual({ perMessage: 40, schemas: 120, destructiveSchema: 40, window: 800 });
  expect(M.countTokens(M.FIRST_TURN.messages)).toBe(160);
  expect(M.simulate().turns.map((t) => t.inputTokens)).toEqual([200, 280, 360, 440, 520]);
  for (const turn of M.simulate().turns) expect(turn.after.slice(0, turn.before.length)).toEqual(turn.before);
});
test('max_steps is a model-call budget, including zero and the final response', () => {
  expect(M.simulate({ max_steps: 0 }).totals.steps).toBe(0);
  expect(M.simulate({ max_steps: 4 }).totals.status).toBe('max_steps');
  expect(M.simulate({ max_steps: 5 }).totals.status).toBe('answered');
  for (let max_steps = 0; max_steps <= 6; max_steps++) {
    const r = M.simulate({ scenario: 'loop', max_steps });
    expect(r.totals.steps).toBe(max_steps); expect(r.totals.status).toBe('max_steps');
  }
});
test('stop policies distinguish a tool result from an answer', () => {
  expect(M.simulate({ stopRule: 'first-result' }).totals.status).toBe('first_result');
  expect(M.simulate({ stopRule: 'first-result' }).totals.steps).toBe(1);
  expect(M.simulate({ stopRule: 'budget-only', max_steps: 6 }).totals.steps).toBe(6);
  expect(M.simulate({ stopRule: 'budget-only', max_steps: 6 }).totals.status).toBe('max_steps');
});
test('the smallest sufficient budget finishes recovery and bounds the repeating search', () => {
  expect(M.budgetCheck({ max_steps: 5, stopRule: 'final' })).toBe(true);
  expect(M.budgetCheck({ max_steps: 6, stopRule: 'final' })).toContain('smallest sufficient');
  expect(M.budgetCheck({ max_steps: 4, stopRule: 'final' })).toContain('needs 5');
  expect(M.budgetCheck({ max_steps: 8, stopRule: 'final' })).toContain('smallest sufficient');
  expect(M.budgetCheck({ max_steps: 5, stopRule: 'budget-only' })).toContain('final answer');
  expect(M.budgetCheck({ max_steps: 5, stopRule: 'first-result' })).toContain('file path');
});
test('context guard reserves response space and stops before invoking policy', () => {
  expect(M.simulate({ contextWindow: 239 }).totals.steps).toBe(0);
  expect(M.simulate({ contextWindow: 240 }).totals.steps).toBe(1);
  expect(M.simulate({ contextWindow: 240 }).totals.status).toBe('context_limit');
  expect(M.simulate({ scenario: 'loop', max_steps: 10 }).totals.steps).toBe(8);
  expect(M.simulate({ scenario: 'loop', max_steps: 10 }).totals.status).toBe('context_limit');
});
test('unknown tools and schema failures append linked errors without execution', () => {
  for (const call of [M.toolCall('x', 'missing', {}), M.toolCall('x', 'read_file', { path: 123 })]) {
    const r = M.runAgent(policy([call, final]));
    expect(r.totals.toolsCalled).toBe(0);
    expect(r.messages[3].tool_call_id).toBe('x');
    expect(JSON.parse(r.messages[3].content)).toHaveProperty('error');
    expect(r.totals.status).toBe('answered');
  }
});
test('invalid JSON is an observation, not execution', () => {
  const call = M.toolCall('bad-json', 'read_file', {}); call.tool_calls[0].function.arguments = '{';
  const r = M.runAgent(policy([call, final]));
  expect(r.totals.toolsCalled).toBe(0); expect(JSON.parse(r.messages[3].content).error).toContain('valid JSON');
});
test('repeated call ids replay the result without duplicate execution', () => {
  const call = M.toolCall('same', 'read_file', { path: 'report.txt' });
  const r = M.runAgent(policy([call, call, call, final]));
  expect(r.totals.toolsCalled).toBe(1);
  expect(r.events.filter((e) => e.type === 'duplicate')).toHaveLength(2);
  const results = r.messages.filter((m) => m.role === 'tool');
  expect(results).toHaveLength(3); expect(new Set(results.map((m) => m.content)).size).toBe(1);
});
test('reusing a call id with changed arguments returns an error', () => {
  const r = M.runAgent(policy([M.toolCall('same', 'read_file', { path: 'report.txt' }), M.toolCall('same', 'read_file', { path: 'other.txt' }), final]));
  expect(r.totals.toolsCalled).toBe(1);
  expect(JSON.parse(r.messages[5].content).error).toContain('different arguments');
});
test('denied or pending deletion cannot mutate the example workspace', () => {
  for (const approval of ['deny', 'pending']) {
    const r = M.simulate({ scenario: 'danger', approval });
    expect(r.files['report.txt']).toBe('Q3 revenue: 4200000 USD');
    expect(r.totals.toolsCalled).toBe(0); expect(r.totals.steps).toBe(2);
    expect(r.messages[3].tool_call_id).toBe('call_1');
    expect(JSON.parse(r.messages[3].content)).toHaveProperty('error');
  }
  expect(M.simulate({ scenario: 'danger' }).totals.inputTokens).toBe(560);
});
test('explicit approval deletes only the run-local file; the next run is isolated', () => {
  const r = M.simulate({ scenario: 'danger', approval: 'allow' });
  expect(r.files).toEqual({}); expect(r.totals.toolsCalled).toBe(1);
  expect(M.simulate().files['report.txt']).toBe('Q3 revenue: 4200000 USD');
});
test('the growing-series cost is 2400 input versus 240 output, not final context size', () => {
  const c = M.growingCost(6);
  expect(c.inputs).toEqual([200, 280, 360, 440, 520, 600]);
  expect(c.input).toBe(2400); expect(c.output).toBe(240); expect(c.formula).toBe(c.input);
  expect(M.simulate({ scenario: 'loop', max_steps: 6 }).totals.inputTokens).toBe(2400);
  expect(M.growingCost(0)).toEqual({ inputs: [], input: 0, output: 0, formula: 0 });
  for (let n = 1; n < 20; n++) expect(M.growingCost(n).formula).toBe(M.growingCost(n).input);
});
test('each mission accepts its intended answer and rejects a wrong one', () => {
  for (const [id, right, wrong] of [
    ['messages', { order: M.MESSAGE_ORDER }, { order: [...M.MESSAGE_ORDER].reverse() }],
    ['schema', { choice: 'path-string' }, { choice: 'filename' }],
    ['loop', { order: M.LOOP_ORDER }, { order: [...M.LOOP_ORDER].reverse() }],
    ['context', { value: 160 }, { value: 80 }], ['error', { choice: 'tool-error' }, { choice: 'guess' }],
    ['stop', { max_steps: 5, stopRule: 'final' }, { max_steps: 4, stopRule: 'final' }],
    ['python', { passed: true }, { passed: false }], ['approval', { choice: 'deny' }, { choice: 'execute' }],
    ['cost', { value: 2400 }, { value: 600 }],
  ]) { expect(checks[id](right)).toBe(true); expect(checks[id](wrong)).toBe(false); }
  expect(M.MISSIONS).toHaveLength(9);
});
test('artifact preserves chosen turn budget, schema list, approval and final transcript', () => {
  const a = M.artifact({ max_steps: 6, stopRule: 'final', percent: 25 });
  expect(a.tools).toHaveLength(4); expect(a.loop.max_steps).toBe(6);
  expect(a.loop.approval_required).toEqual(['delete_file']); expect(a.loop.approval_decision).toBe('deny');
  expect(a.transcript.at(-1).content).toBe('25% of Q3 revenue is 1,050,000.');
  expect(a.totals.status).toBe('answered');
  expect(M.simulate({ percent: 12 }).messages.at(-1).content).toBe('12% of Q3 revenue is 504,000.');
});
test('garbage config falls back to defaults', () => {
  expect(M.configOf({ max_steps: -1, stopRule: 'forever', approval: false, scenario: 'bad', percent: 99, contextWindow: -2 })).toEqual(M.DEFAULTS);
});
test('simulation is deterministic across every offered budget and stop rule', () => {
  for (const max_steps of [2, 3, 4, 5, 6, 8]) for (const stopRule of ['final', 'first-result', 'budget-only']) for (const scenario of ['normal', 'recover', 'loop', 'danger']) {
    const c = { max_steps, stopRule, scenario };
    expect(M.simulate(c)).toEqual(M.simulate(c));
  }
});
test('event indices, traces and call-result links are consistent', () => {
  for (const scenario of ['normal', 'recover', 'loop', 'danger']) {
    const r = M.simulate({ scenario });
    r.events.forEach((e, i) => { expect(e.index).toBe(i); expect(e.trace.length).toBeGreaterThan(0); });
    const ids = new Set();
    for (const m of r.messages) {
      for (const c of m.tool_calls || []) ids.add(c.id);
      if (m.role === 'tool') expect(ids.has(m.tool_call_id)).toBe(true);
    }
  }
});
test('content uses guide format, six valid quiz items and primary source links', () => {
  expect(C.layout).toBe('guide'); expect(C.minutes).toBe(25); expect(C.order).toBe(7);
  expect(C.quiz.map((q) => q.stage)).toEqual(['pre', 'check', 'check', 'check', 'post', 'post']);
  expect(new Set(C.quiz.map((q) => q.correct)).size).toBe(4);
  for (const q of C.quiz) { expect(q.options).toHaveLength(4); expect(q.correct).toBeGreaterThanOrEqual(0); expect(q.correct).toBeLessThan(4); expect(q.explanation.length).toBeGreaterThan(20); }
  expect(C.sources).toHaveLength(4); expect(C.notes).toContain('fixed script');
});
test('walk covers kit and every mission, with a wrong answer before solving each task', () => {
  expect(walk.map((w) => w.step)).toEqual(['kit', ...M.MISSIONS.map((m) => m.id)]);
  for (const w of walk.slice(1)) { expect(w.actions[0].solves).toBe(false); expect(w.actions.at(-1).solves).toBe(true); }
});
test('exactly one required Python cell has six checks and shared call fixtures', () => {
  expect((PYTHON_TESTS.match(/check\('/g) || [])).toHaveLength(6);
  expect(walk.flatMap((w) => w.actions).filter((a) => a.do === 'python')).toHaveLength(1);
  expect(PYTHON_DATA.read.tool_calls[0].id).toBe('read-1');
});
