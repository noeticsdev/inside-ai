import * as M from './model.mjs';
import { PYTHON_DATA, PYTHON_STARTER, PYTHON_TESTS, PYTHON_SOLUTION } from './python.mjs';
import { createGuide, h, s, T_, fmt, pyCell, metricsRow } from '../../platform/shell/guide-runtime.js';
let G;
const CHECK = Object.fromEntries(M.MISSIONS.map((m) => [m.id, m.check]));
const solved = (id) => G?.solved(id);
const config = () => M.configOf(G?.settings.loop);
const run = () => M.simulate(config());
const json = (value) => JSON.stringify(value, null, 2);
const pre = (value) => h('pre', { class: 'cu-json al-json', text: typeof value === 'string' ? value : json(value) });
const pair = (leftTitle, left, rightTitle, right) => h('div', { class: 'al-pair' },
  h('div', {}, h('b', { class: 'al-close-label', text: leftTitle }), pre(left)),
  h('div', {}, h('b', { class: 'al-close-label', text: rightTitle }), pre(right)));
const compactCall = (call) => `id: ${call.id}\ntype: ${call.type}\nfunction.name: ${call.function.name}\nfunction.arguments (JSON string):\n${call.function.arguments}`;
const compactResult = (result) => `role: ${result.role}\ntool_call_id: ${result.tool_call_id}\ncontent (JSON string):\n${result.content}`;
const caption = (text) => h('p', { class: 'cu-cap', text });
const part = (glyph, name, runs, conf) => ({ glyph, name, runs, conf });
function table(head, rows) {
  return h('div', { class: 'dt-wrap' }, h('table', { class: 'dt al-table' },
    h('thead', {}, h('tr', {}, head.map((x) => h('th', { text: x })))),
    h('tbody', {}, rows.map((row) => h('tr', {}, row.map((x) => h('td', { text: String(x) })))))));
}
function transcriptFor(ctx) {
  if (ctx.built < 1) return [];
  if (ctx.built < 3) return M.initialMessages();
  if (ctx.built < 5) return M.FIRST_TURN.messages;
  if (ctx.step.id === 'error') return M.ERROR_RUN.turns[2].after;
  return run().messages;
}
function summary(message) {
  if (message.tool_calls) return message.tool_calls[0].function.name + '()';
  if (message.role === 'system') return 'Use tools; ask to delete';
  if (message.role === 'user') return 'Find % of Q3 revenue';
  if (message.role === 'assistant') return message.content.replace('18% of Q3 revenue is ', 'answer: ');
  const value = JSON.parse(message.content);
  if (value.paths) return value.paths.join(', ');
  if (value.text) return 'Q3 revenue: ' + fmt(M.FIXTURE.revenue);
  if (value.error) return 'ERROR: expected a * b';
  if ('value' in value) return 'value: ' + fmt(value.value);
  return message.content;
}
function readouts() {
  const c = config();
  return [
    ['messages', 'seed messages', '2'], ['schema', 'tool schemas', String(M.TOOLS.length)],
    ['loop', 'first result', M.FIXTURE.path], ['context', 'after search tokens', fmt(M.ANSWERS.context)],
    ['error', 'error observations', '1'], ['stop', 'turn limit', String(c.max_steps)],
    ['python', 'call-id cache', 'enabled'], ['approval', 'deletion', 'denied'],
    ['cost', 'scale input tokens', fmt(M.ANSWERS.cost)],
  ];
}
function board(ctx) {
  const { built, fresh, step } = ctx;
  const messages = transcriptFor(ctx);
  const svg = s('svg', { viewBox: '0 0 1000 660', role: 'img', 'aria-label': 'A tool-using agent: growing messages, a scripted model, JSON arguments, validation, router, local tools, appended results, context and step budgets.' });
  svg.append(s('defs', {}, s('marker', { id: 'al-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, s('path', { d: 'M1 1L9 5L1 9', class: 'al-arrow' }))));
  svg.append(T_(126, 32, 'AGENT / ONE REQUEST', 'al-title'), T_(126, 56, 'Fixed script · in-memory tools · simulation', 'al-muted'));
  const box = (x, y, w, hh, title, lines, addAt, id) => {
    const group = s('g', { class: `al-node ${fresh === addAt || ctx.on?.includes(id) ? 'is-new' : ''}` }, s('rect', { x, y, width: w, height: hh, rx: 7 }), T_(x + 14, y + 24, title, 'al-label'));
    lines.forEach((text, i) => group.append(T_(x + 14, y + 46 + i * 19, text, 'al-muted')));
    svg.append(group);
    return group;
  };
  const route = (d) => svg.append(s('path', { class: 'al-route', d, 'marker-end': 'url(#al-arrow)' }));
  box(24, 84, 305, 88, 'user task', [`${config().percent}% of Q3 revenue`, `in ${M.FIXTURE.path}`], 0);
  const rows = readouts();
  svg.append(s('rect', { x: 690, y: 84, width: 286, height: 248, rx: 8, class: 'al-panel' }), T_(704, 108, 'ONE TASK, STAGE BY STAGE', 'al-small'));
  rows.forEach(([id, label, value], i) => {
    const available = solved(id);
    svg.append(T_(704, 132 + i * 22, label, fresh === 9 && id === 'cost' ? 'al-value' : 'al-muted'), T_(962, 132 + i * 22, available ? value : '?', available ? 'al-value' : 'al-muted', 'end'));
  });
  if (built === 0) {
    svg.append(T_(355, 245, 'EXAMPLE WORKSPACE', 'al-small'));
    box(355, 265, 309, 104, 'report.txt', [`Q3 revenue: ${fmt(M.FIXTURE.revenue)} USD`, 'In-memory example'], 0);
    box(355, 398, 309, 104, 'the request', ['Find and read the report,', `then calculate ${M.FIXTURE.percent}% of revenue.`], 0);
  }
  if (built >= 1) {
    route('M176 172V197');
    const panelHeight = built < 3 ? 140 : 353;
    svg.append(s('rect', { x: 24, y: 199, width: 305, height: panelHeight, rx: 8, class: `al-panel ${fresh === 1 ? 'al-fresh' : ''}` }), T_(38, 224, `messages[${messages.length}]`, 'al-label'));
    const pitch = Math.min(27, (panelHeight - 66) / Math.max(1, messages.length));
    messages.forEach((message, i) => {
      const y = 235 + i * pitch;
      const isError = message.role === 'tool' && JSON.parse(message.content).error;
      svg.append(s('rect', { x: 36, y, width: 281, height: Math.min(24, pitch - 2), rx: 3, class: `al-message ${isError ? 'is-error' : ''} ${i === messages.length - 1 ? 'is-last' : ''}` }), T_(44, y + 17, message.role === 'assistant' ? 'asst' : message.role, 'al-role'), T_(99, y + 17, summary(message), 'al-message-text'));
    });
    svg.append(T_(38, 199 + panelHeight - 10, 'tool_call_id links each result', 'al-muted'));
    if (built < 3) {
      svg.append(T_(38, 385, 'EACH EXCHANGE ADDS:', 'al-small'), T_(38, 417, 'assistant  →  tool call', 'al-label'), T_(38, 445, 'tool       →  result', 'al-label'), T_(38, 483, 'Both stay in the transcript', 'al-muted'));
    }
  }
  if (built >= 2) box(355, 84, 309, 88, 'tools: JSON Schema', ['type: function · strict: true', 'read_file(path: string)'], 2, 'schema');
  if (built >= 3) {
    route('M329 255H345V217H355');
    route('M510 172V188');
    box(355, 190, 309, 70, 'model(messages, tools)', ['fixed script → assistant reply'], 3, 'model');
    route('M510 260V280');
    const shown = messages.findLast((m) => m.tool_calls).tool_calls[0];
    const args = JSON.parse(shown.function.arguments), key = Object.keys(args)[0];
    box(355, 282, 309, 103, 'tool call JSON', [`${shown.id} · ${shown.function.name}`, `arguments.${key}:`, JSON.stringify(args[key])], 3, 'call');
    route('M510 385V404');
    box(355, 406, 309, 60, 'parse → schema validator', ['JSON.parse · required · type'], 3, 'validator');
    route('M510 466V484');
    box(355, 486, 309, 66, 'router: tools[name](args)', [built >= 7 ? 'cache call id before running' : 'lookup an allowed function'], built >= 7 ? 7 : 3, 'router');
    ['search_docs', 'read_file', 'calculator'].forEach((name, i) => box(690, 350 + i * 52, 286, 43, name, [], 3));
    route('M664 510H677V371H688');
    route('M677 423H688');
    route('M677 475H688');
    route('M976 371H988V517H835V526');
    route('M976 423H988');
    route('M976 475H988');
    box(690, 528, 286, 62, built >= 5 ? 'append result OR error' : 'append tool result', ['role: tool · tool_call_id'], built >= 5 ? 5 : 3, 'result');
    route('M690 558H676V650H342V515H329');
  }
  if (built >= 4) {
    const used = M.countTokens(messages) + M.TOKEN.schemas;
    box(24, 569, 305, 75, 'context window · estimated', [`${fmt(used)} / ${fmt(M.TOKEN.window)} tokens`], 4, 'context');
    svg.append(s('rect', { x: 38, y: 625, width: 277, height: 6, rx: 2, class: 'meter-track' }), s('rect', { x: 38, y: 625, width: Math.min(1, used / M.TOKEN.window) * 277, height: 6, rx: 2, class: 'meter-fill' }));
  }
  if (built >= 6) box(355, 569, 309, 56, `budget: ${run().totals.steps} of ${config().max_steps}`, ['stop on final OR max_steps'], 6, 'budget');
  if (built >= 8) {
    box(690, 603, 286, 47, 'delete_file → deny', [], 8, 'approval');
    route('M664 540H680V626H688');
    route('M835 603V592');
  }
  return svg;
}
function cuMessages() {
  const example = M.FIRST_TURN.messages;
  return h('div', {}, table(['role', 'content / link'], example.map((m) => [m.role, m.tool_calls ? 'call_1 → search_docs({query: "Q3"})' : m.tool_call_id ? 'call_1 ← {paths: ["report.txt"]}' : m.content])), caption('A complete exchange. The system and user start the conversation; the assistant call must precede its tool result.'));
}
function cuSchema() {
  const t = M.TOOLS[1];
  return h('div', {}, pre(`{ "type": "${t.type}", "function": {\n  "name": "${t.function.name}",\n  "description": "${t.function.description}",\n  "parameters": {\n    "type": "object",\n    "properties": {"path": {"type": "string"}},\n    "required": ["path"], "additionalProperties": false\n  }, "strict": true\n}}`), caption('One OpenAI Chat Completions tools entry. Validate the parsed object; the call carries arguments as a JSON string.'));
}
function cuFirst() {
  return h('div', {}, pair('ASSISTANT · PROPOSAL', compactCall(M.FIRST_TURN.messages[2].tool_calls[0]), 'TOOL · OBSERVATION', compactResult(M.FIRST_TURN.messages[3])), caption('One model invocation, one tool execution, two appended messages. The next model call will see this file path.'));
}
function cuContext() {
  const messages = M.FIRST_TURN.messages;
  return h('div', {}, h('div', { class: 'al-token-bars' }, messages.map((m) => h('div', { class: 'al-token-block' }, h('b', { text: m.tool_call_id ? 'tool · call_1' : m.role }), h('span', { text: `${M.TOKEN.perMessage} tokens` })))), caption(`Simulation: four message blocks × ${M.TOKEN.perMessage} tokens. The tools add a separate fixed ${M.TOKEN.schemas}-token estimate on every model request.`));
}
function cuError() {
  return h('div', {}, pair('ASSISTANT · CALL', compactCall(M.ERROR_RUN.messages[6].tool_calls[0]), 'TOOL · ERROR OBSERVATION', compactResult(M.ERROR_RUN.messages[7])), caption('The string passes the schema. The calculator rejects its grammar. On the next turn the script reads the error and asks for a * b.'));
}
function cuBudget() {
  const c = config();
  const runs = ['recover', 'loop'].map((scenario) => M.simulate({ ...c, scenario }));
  return h('div', {}, table(['fixed script', 'model turns', 'stop reason', 'tool executions'], runs.map((r) => [r.config.scenario, r.totals.steps, r.totals.status, r.totals.toolsCalled])), caption('Simulation: recovery includes one rejected calculation. Choose the smallest budget that lets it finish; a final answer consumes a model turn too.'));
}
function cuApproval() {
  const denied = M.simulate({ scenario: 'danger', approval: 'deny' });
  return h('div', {}, pair('ASSISTANT · DESTRUCTIVE CALL', compactCall(denied.messages[2].tool_calls[0]), 'TOOL · DENIAL', compactResult(denied.messages[3])), metricsRow([['delete executions', denied.totals.toolsCalled], ['file after denial', denied.files[M.FIXTURE.path] ? 'present' : 'missing']]), caption('A valid schema is not permission. This is a simulated approval decision, with no real file deletion.'));
}
function cuCost() {
  const cost = M.growingCost(M.SCALE_TURNS);
  return h('div', {}, h('div', { class: 'al-cost-chart', 'aria-label': 'Estimated input tokens by model call' }, cost.inputs.map((n, i) => h('div', { class: 'al-cost-row' }, h('b', { text: `call ${i + 1}` }), h('span', { class: 'al-cost-track' }, h('span', { class: 'al-cost-bar', style: `width:${n / cost.inputs.at(-1) * 100}%` })), h('b', { text: fmt(n) })))), caption(`Simulation: input starts at 2 × ${M.TOKEN.perMessage} + ${M.TOKEN.schemas} = ${cost.inputs[0]}; each tool exchange adds ${2 * M.TOKEN.perMessage}. Output is ${M.TOKEN.perMessage} per call and is separate.`));
}
const STEPS = [
  {
    id: 'kit', phase: 'kit', kicker: 'Before you start', title: 'Check your kit', minutes: 1, view: 'board',
    lead: `Find ${M.FIXTURE.path}, read its Q3 revenue, then calculate ${M.FIXTURE.percent}%. You will assemble a caller that keeps a transcript, runs tools and knows when to stop. <b>This is a simulation; the model follows a fixed script.</b>`,
    parts: () => [
      { title: 'Local functions', n: M.TOOLS.length }, ...M.TOOLS.map((t) => part('tool', t.function.name, t.function.name === 'calculator' ? 'Multiply numbers written as a * b' : t.function.name === 'read_file' ? 'Read the in-memory report.txt' : 'Find the report in a local index')),
      part('key', 'max_steps + approval', 'Bound model calls; require approval for delete_file'),
    ],
    closeLabel: 'YOUR REQUEST', closeHint: 'no API key needed', close: () => h('div', {}, pre(M.TASK), caption('The tools are local functions. The model policy is a scripted stand-in for an LLM, so you can inspect every decision.')), task: 'predict', nextLabel: 'Start building',
  },
  {
    id: 'messages', phase: 'build', kicker: 'Conversation state', title: 'Write the messages', minutes: 2, view: 'board', mission: 'messages',
    lead: 'Add the <code>messages</code> array. Start with instructions and the user task; later, keep the assistant call and its tool result together. A result needs the id of the call it answers.',
    adds: [part('doc', 'messages[]', 'Owned by your application', 'role: system | user | assistant | tool')],
    closeLabel: 'CLOSE-UP · A COMPLETE EXCHANGE', closeHint: 'the order you will build', close: cuMessages,
    task: (ui) => ui.order({ prompt: 'Order a complete exchange: instructions, request, tool call, then its result.', items: [['tool', 'tool · result for call_1'], ['assistant', 'assistant · call_1'], ['user', 'user · revenue question'], ['system', 'system · instructions']], order: M.MESSAGE_ORDER, check: (order) => CHECK.messages({ order }), why: { user: 'The system instructions come before this user request in our conversation.', assistant: 'The assistant needs a user task before it can ask for a tool.', tool: 'The result must follow the assistant call so tool_call_id has a matching id.' } }),
    after: () => 'System → user → assistant call → tool result. The initial array has <b>2 messages</b>; each tool exchange adds another 2. The result is data from your code, so its role is <code>tool</code>.',
  },
  {
    id: 'schema', phase: 'build', kicker: 'Interface', title: 'Declare a tool', minutes: 2, view: 'board', mission: 'schema',
    lead: 'Add the <code>read_file</code> tool definition to <code>tools</code>. Its JSON Schema requires a string called <code>path</code> and rejects extra fields. Parsing JSON and validating its shape are separate checks.',
    adds: [part('tool', 'tools[].function', 'OpenAI Chat Completions format', 'name: "read_file"\nparameters: {type: "object", ...}\nstrict: true')], closeLabel: 'CLOSE-UP · THE CONTRACT', closeHint: 'validate after parsing', close: cuSchema,
    task: (ui) => ui.choice({ prompt: 'Which parsed arguments object validates against read_file?', options: [
      ['path-number', '{"path": 4200000}', 'The path has type number. The schema requires a string, even when the JSON parses.'],
      ['path-string', '{"path": "report.txt"}', null],
      ['filename', '{"filename": "report.txt"}', 'Missing required field: path. filename is also an unexpected property.'],
      ['extra', '{"path": "report.txt", "force": true}', 'additionalProperties is false. force is not a declared property.'],
    ], check: (choice) => CHECK.schema({ choice }) }),
    after: () => '<code>{"path":"report.txt"}</code> has the required key, the right type and no extra fields. The model proposes arguments; your caller still checks them before routing. A correct shape does not prove the file exists.',
  },
  {
    id: 'loop', phase: 'build', kicker: 'Caller', title: 'Run the loop once', minutes: 3, view: 'board', mission: 'loop',
    lead: 'Add the caller that connects the model to your functions. It parses and validates a proposed call, dispatches it, and appends the result. The fixed script first asks <code>search_docs</code> where the report is.',
    adds: [part('loop', 'one caller iteration', 'Your code executes the function', 'model(messages, tools)\nJSON.parse(arguments) → validate\ntools[name](args) → messages.push(result)')],
    closeLabel: 'CLOSE-UP · CALL AND OBSERVATION', closeHint: 'the function found a path', close: cuFirst,
    task: (ui) => ui.order({ prompt: 'Order the operations between this request and the next model invocation. Assume the JSON and arguments are valid.', items: [['execute', 'execute function'], ['model', 'model · first call'], ['append', 'append result'], ['validate', 'validate schema'], ['model-again', 'model · next call'], ['parse', 'parse arguments']], order: M.LOOP_ORDER, check: (order) => CHECK.loop({ order }), why: {
      parse: 'The model must produce a call before there are arguments to parse.', validate: 'Parse the arguments string into a JSON value before checking its schema.', execute: 'Execute only after parsing and schema validation have succeeded.', append: 'There is no result to append until the tool has executed.', 'model-again': 'Append the result first. Otherwise the next model call cannot see what happened.',
    } }),
    after: () => `search_docs returns <code>${M.FIXTURE.path}</code>. Your code appends the assistant call and a <code>tool</code> message linked by <code>call_1</code>. The array now has <b>${M.FIRST_TURN.messages.length} messages</b>; the model did not execute the search itself.`,
  },
  {
    id: 'context', phase: 'build', kicker: 'Request budget', title: 'Grow the context', minutes: 2, view: 'board', mission: 'context',
    lead: `Add the context counter before each model invocation. This simulation charges a fixed <b>${M.TOKEN.perMessage} tokens per message</b>, including calls and results. The next request resends every message, not only the newest result.`,
    adds: [part('chart', 'context guard', 'Reserve space for the next reply', `message_tokens = len(messages) * ${M.TOKEN.perMessage}\ninput_tokens = message_tokens + ${M.TOKEN.schemas}\ncontext_window = ${M.TOKEN.window}`)],
    closeLabel: 'CLOSE-UP · NEXT REQUEST', closeHint: 'message estimates only', close: cuContext,
    task: (ui) => ui.number({ prompt: 'After the first search exchange, how many estimated message tokens are in context? Exclude the separately counted tool schemas.', placeholder: 'message tokens', check: (value) => CHECK.context({ value }), hint: (v) => v === 80 ? 'That counts only the initial system and user messages. Add the assistant call and tool result.' : v === 40 ? 'That counts only the newest result. The model also receives the earlier messages.' : v === 280 ? 'That includes the separate 120-token tools estimate. This question asks for message tokens only.' : 'There are 4 messages at a fixed 40 tokens each. Multiply, rather than counting only tool calls.' }),
    after: () => `4 × ${M.TOKEN.perMessage} = <b>${M.ANSWERS.context} message tokens</b>. Add ${M.TOKEN.schemas} for the tool schemas: the next input is ${M.ANSWERS.context + M.TOKEN.schemas}. The context guard also reserves ${M.TOKEN.perMessage} for the model reply within the ${M.TOKEN.window}-token example window.`,
  },
  {
    id: 'error', phase: 'build', kicker: 'Failure path', title: 'Handle a tool error', minutes: 2, view: 'board', mission: 'error',
    lead: `Add error serialization to the result appender. After reading revenue of <b>${fmt(M.FIXTURE.revenue)}</b>, the fixed script sends the calculator <code>"18% of 4,200,000"</code>. It is a valid string, but the tool accepts only a multiplication such as <code>0.18 * 4200000</code>.`,
    adds: [part('doc', 'error observation', 'Return failure as data to the next model turn', 'role: "tool"\ntool_call_id: "call_3"\ncontent: JSON.stringify({error: ...})')],
    closeLabel: 'CLOSE-UP · REJECTED EXPRESSION', closeHint: 'schema success ≠ tool success', close: cuError,
    task: (ui) => ui.choice({ prompt: 'What should the caller append after this calculator error?', options: [
      ['guess', 'An assistant answer with a guessed revenue percentage', 'A guessed answer hides the tool failure. The caller must preserve the actual error.'],
      ['retry-same', 'Nothing; execute the same call until it works', 'The same unsupported prose will fail again. Without a result the model cannot correct its request.'],
      ['tool-error', 'A tool result with the error and tool_call_id: call_3', null],
      ['system', 'A new system instruction saying the calculation succeeded', 'A tool error is an observation, not a system instruction or evidence of success.'],
    ], check: (choice) => CHECK.error({ choice }) }),
    after: () => `The error goes back under <code>call_3</code>. The script reads it and proposes a new call: 0.18 × 4,200,000 = <b>${fmt(M.ANSWERS.result)}</b>. Error handling made a corrected request possible; it did not guarantee an LLM would recover.`,
  },
  {
    id: 'stop', phase: 'build', kicker: 'Termination', title: 'Stop the loop', minutes: 3, view: 'board', mission: 'stop',
    lead: 'Add a model-turn budget and a final-answer stop. The recovery script needs a turn to report its answer after the corrected calculation. A second fixed script keeps searching forever unless your caller stops it.',
    adds: () => [part('loop', 'max_steps + stop rule', 'Checked around every model invocation', `max_steps=${config().max_steps}\nstop_rule="${config().stopRule}"`)],
    closeLabel: 'CLOSE-UP · TWO SCRIPTED RUNS', closeHint: 'updates with your settings', close: cuBudget,
    onReveal: (g) => Object.assign(g.settings.loop, { max_steps: M.ANSWERS.max_steps, stopRule: M.ANSWERS.stopRule }),
    task: (ui, g) => ui.selects({ prompt: 'Choose the smallest model-call budget that finishes recovery, and a stop rule that also bounds the repeating search.', selects: [
      { label: 'max_steps', options: [2, 3, 4, 5, 6, 8].map((n) => [n, `max_steps=${n}`]), get: () => config().max_steps, set: (v) => g.settings.loop.max_steps = v, parse: Number },
      { label: 'stop rule', options: [['first-result', 'first tool result'], ['budget-only', 'budget only'], ['final', 'final answer or budget']], get: () => config().stopRule, set: (v) => g.settings.loop.stopRule = v },
    ], check: () => M.budgetCheck(config()) }),
    after: () => `The recovery script answers on model turn <b>${M.ERROR_RUN.totals.steps}</b>: search, read, failed calculation, corrected calculation, final answer. Your repeating search is cut off at ${config().max_steps}. A tool result is not a final answer, and a budget is not evidence of task completion.`,
  },
  {
    id: 'python', phase: 'build', kicker: 'Implementation', title: 'Write the bounded caller', minutes: 5, view: 'bench', where: 'your application', mission: 'python',
    lead: 'Add a call-id cache while you implement <code>run_agent</code>. Stop on a final reply, append tool results with matching ids, and enforce the model-call budget. This cell assumes a schema-validation adapter and registered safe tools; you add the approval gate next.',
    adds: [part('loop', 'run_agent(policy, tools, task, max_steps)', 'Returns the transcript · Python stdlib', 'handled[call_id] = (signature, result)')],
    bench: (host, g) => {
      host.append(h('div', { class: 'fg' }, h('div', { class: 'fg-head' }, h('span', { class: 'fg-label', text: 'THE CALLER CONTRACT' })), h('div', { class: 'fg-body' }, pre('policy(messages) → assistant message\ncall.function.arguments → JSON string\ntools[name](**json.loads(arguments)) → result\nreturn messages  # including the final reply'), caption('Treat one loop iteration as one model invocation. Cache a handled call id and its result; a repeated id must never execute again. This in-memory cache lasts for one run.'))));
      const cell = h('div'); host.append(cell);
      pyCell(cell, { id: 'agent-loop-caller', title: 'Python · implement run_agent', prompt: 'Use range(max_steps), append every assistant response, break when it has no tool_calls, then append one role=tool observation per call. Return unknown tools as errors. Replay a cached result for a repeated id; reject changed arguments. The six checks use safe local functions.', starter: PYTHON_STARTER, data: PYTHON_DATA, tests: PYTHON_TESTS, solution: PYTHON_SOLUTION, onPass: () => g.pass('python', { passed: true }) });
    },
    task: (ui) => ui.code({ prompt: 'Write and run the caller on the left. All 6 checks must pass.', fallback: [
      ['Bound model calls; stop on final; append linked results; cache call ids', true],
      ['Keep calling policy until a tool returns text', false, 'A tool result is not a final answer. Without a budget a searching policy can run forever.'],
      ['Run every tool proposal, even if its id was handled already', false, 'Repeated ids must replay the cached result. Executing again can duplicate side effects.'],
      ['Drop unknown tools from the transcript', false, 'Append an error with the call id. Otherwise policy cannot see that the tool was unavailable.'],
    ] }),
    after: () => 'You now have a bounded caller with linked results and a per-run call-id cache. A repeated id reuses its saved result; changed arguments under that id get an error. This prevents duplicate execution inside this run; a production caller also needs durable idempotency across restarts.',
  },
  {
    id: 'approval', phase: 'build', kicker: 'Permission', title: 'Gate a dangerous call', minutes: 2, view: 'board', mission: 'approval', on: ['approval'],
    lead: 'Add <code>delete_file</code> behind an approval gate in the router. A separate fixed script asks to delete the report with valid JSON and a valid path. Your application must require permission before it executes that function.',
    adds: [part('key', 'approval_required', 'Application policy; not a model decision', 'approval_required=["delete_file"]\non_deny: append error; do not execute')],
    closeLabel: 'CLOSE-UP · DENY THE REQUEST', closeHint: 'a separate destructive-call script', close: cuApproval,
    task: (ui, g) => ui.choice({ prompt: 'The user denies deletion. What must the router do?', options: [
      ['execute', 'Execute because the call passed its JSON Schema', 'The schema checks shape, not permission. Denial must prevent execution.'],
      ['deny', 'Do not execute; append a denial with the matching call id', null],
      ['ask-model', 'Let the model decide whether to override the denial', 'Approval belongs to the user and application. The model cannot grant itself permission.'],
      ['erase', 'Erase the call and pretend the model never requested it', 'Erasing the call hides what happened. Preserve the request and its denial in the transcript.'],
    ], check: (choice) => { const good = CHECK.approval({ choice }); if (good) { g.settings.loop.approval = choice; g.saveSettings(); } return good; } }),
    after: () => 'The router executes <b>0 deletions</b> and appends an error under <code>call_1</code>. The file remains present, and the danger script reports the denial. The main revenue task can still use read-only tools.',
  },
  {
    id: 'cost', phase: 'scale', kicker: 'Cumulative usage', title: 'Count the cost', minutes: 3, view: 'board', mission: 'cost',
    lead: `Add a cumulative usage ledger for ${M.SCALE_TURNS} calls of the repeating-search script. Every request resends the growing transcript and the same tool definitions. This is a fixed token-estimate simulation, with no prices or timing measurements.`,
    adds: [part('chart', 'usage ledger', 'Accumulate input separately from output', `initial_input=2*${M.TOKEN.perMessage}+${M.TOKEN.schemas}\ngrowth=2*${M.TOKEN.perMessage}\ninput_total=sum(input_per_call)`) ],
    closeLabel: 'CLOSE-UP · RESEND THE WHOLE CONTEXT', closeHint: 'six model invocations', close: cuCost,
    task: (ui) => ui.number({ prompt: 'Sum the estimated input tokens over all 6 model calls in the ledger. Do not add model output tokens.', placeholder: 'total input tokens', check: (value) => CHECK.cost({ value }), hint: (v) => v === 600 ? '600 is only the last request. Earlier requests also consumed input tokens; sum all six rows.' : v === 240 ? '240 is the model output total: 6 × 40. The question asks for all input requests.' : v === 2640 ? 'You added 240 output tokens. Keep input and output totals separate.' : v === 1200 ? 'That assumes every request stays at 200. Each completed tool exchange adds 80 tokens to the next request.' : 'Add 200 + 280 + 360 + 440 + 520 + 600. Count the schemas on every request.' }),
    after: () => `${M.growingCost(M.SCALE_TURNS).inputs.map(fmt).join(' + ')} = <b>${fmt(M.ANSWERS.cost)} input tokens</b>. Output is ${M.SCALE_TURNS} × ${M.TOKEN.perMessage} = ${M.growingCost(M.SCALE_TURNS).output}. For N turns: 200N + 80N(N−1)/2. Input grows quadratically when history grows at a constant rate; summaries reduce history, while prefix caching can reduce repeated-prefix computation or billing without removing the logical context.`,
  },
  {
    id: 'done', phase: 'done', kicker: 'Done', title: 'Keep your agent loop', minutes: 0, view: 'board', task: 'done',
    lead: 'You built the caller around the model: messages, schemas, results, errors, limits and approval. Keep the tool definitions, your chosen limits and the final transcript below. The model decisions remain a fixed script.',
    closeLabel: 'YOUR FINAL TRANSCRIPT', closeHint: 'from the recovery run', close: () => h('div', {}, pre(run().messages), caption('Copy the artifact on the right to keep the JSON schemas, loop config, transcript and token estimates.')),
  },
];
createGuide({ M, steps: STEPS, board,
  init(g) { G = g; g.settings.loop = { max_steps: 2, stopRule: 'first-result', approval: 'deny', ...(g.settings.loop || {}) }; },
  done: { stats: () => [['model turns', run().totals.steps], ['input tokens (est.)', fmt(run().totals.inputTokens)], ['tool executions', run().totals.toolsCalled]], artifactTitle: 'Your tools, loop config and transcript', artifact: () => json(M.artifact(config())) },
});
