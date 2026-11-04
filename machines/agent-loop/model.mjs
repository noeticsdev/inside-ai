export const DEFAULTS = { task: 'weather', maxSteps: 5, budget: 180, flaky: false, retry: false, approval: true };
export const TASKS = {
  weather: { request: 20, calls: [['weather', 12, 18]], answer: 14 },
  research: { request: 24, calls: [['search', 12, 20], ['read', 12, 24], ['compare', 12, 18]], answer: 16 },
  error: { request: 22, calls: [['delete_file', 12, 10], ['lookup', 12, 18]], answer: 15 },
};
export function configOf(c = {}) {
  return { task: Object.hasOwn(TASKS,c.task) ? c.task : DEFAULTS.task,
    maxSteps: [1,2,3,4,5].includes(Number(c.maxSteps)) ? Number(c.maxSteps) : DEFAULTS.maxSteps,
    budget: [50,80,120,180].includes(Number(c.budget)) ? Number(c.budget) : DEFAULTS.budget,
    flaky: typeof c.flaky === 'boolean' ? c.flaky : DEFAULTS.flaky,
    retry: typeof c.retry === 'boolean' ? c.retry : DEFAULTS.retry,
    approval: typeof c.approval === 'boolean' ? c.approval : DEFAULTS.approval };
}
export function simulate(input = {}) {
  const config = configOf(input), script = TASKS[config.task], events = [];
  let tokens = script.request, messages = 1, turns = 0, calls = 0, attempts = 0, blocked = 0, failures = 0, status = 'running';
  const push = (type, station, trace, extra = {}) => events.push({ index: events.length, type, station, trace, tokens, messages, turns, calls, attempts, blocked, failures, ...extra });
  const add = (size) => { tokens += size; messages++; };
  push('request','context',`Request enters context: ${tokens} tokens.`);
  let pos = 0;
  while (true) {
    if (turns >= config.maxSteps) { status = 'step limit'; push('stop','guard','Guard stops the loop at the model-turn limit.'); break; }
    if (tokens >= config.budget) { status = 'budget'; push('stop','guard',`Guard stops before the next model turn: ${tokens} / ${config.budget} tokens.`); break; }
    turns++;
    if (pos >= script.calls.length) {
      add(script.answer); status = 'answered'; push('answer','model',`Model answers; context grows by ${script.answer} tokens.`); break;
    }
    const [tool, proposal, result] = script.calls[pos];
    add(proposal); push('proposal','model',`Turn ${turns}: model proposes ${tool}; +${proposal} tokens.`, {tool});
    if (tool === 'delete_file' && config.approval) {
      blocked++; add(result); push('blocked','guard',`Approval gate blocks ${tool}; denial adds ${result} tokens.`, {tool}); pos++; continue;
    }
    calls++;
    let ok = true;
    // The error preset's lookup fails once; flaky makes the first ordinary call fail once.
    const fails = (config.task === 'error' && tool === 'lookup') || (config.flaky && attempts === 0);
    attempts++;
    if (fails) {
      failures++; push('failure','tools',`${tool} attempt ${attempts} returns an error.`, {tool});
      if (config.retry) { attempts++; push('retry','tools',`Harness retries ${tool} and it succeeds.`, {tool}); }
      else ok = false;
    }
    add(result); push('observation','tools',`${ok ? 'Result' : 'Error'} from ${tool} adds ${result} tokens.`, {tool, ok});
    if (!ok) { status = 'tool error'; break; }
    pos++;
  }
  return { config, events, totals: { tokens, messages, turns, calls, attempts, blocked, failures, status } };
}
export function encode(input) { const c = configOf(input), p = new URLSearchParams(); for (const k of Object.keys(DEFAULTS)) if (c[k] !== DEFAULTS[k]) p.set(k, String(c[k])); return p.toString(); }
export function decode(search) { const p = new URLSearchParams(search), c = {}; for (const k of Object.keys(DEFAULTS)) if (p.has(k)) { const v = p.get(k); c[k] = typeof DEFAULTS[k] === 'boolean' ? (v === 'true' ? true : v === 'false' ? false : DEFAULTS[k]) : v; } return configOf(c); }
export const MISSIONS = [
 {id:'first', title:'First tool call', goal:'Complete the weather lookup.', hint:'Choose Weather and give it two model turns.', try:{}, check:r=>r.config.task==='weather' && r.totals.status==='answered'},
 {id:'road', title:'Out of road', goal:'Stop research before it answers with a guard.', hint:'Choose Research and lower the turn limit.', try:{task:'research',maxSteps:2}, check:r=>r.config.task==='research' && ['step limit','budget'].includes(r.totals.status)},
 {id:'flaky', title:'Survive a flaky tool', goal:'Complete a run after a tool fails.', hint:'Switch on Flaky and Retry for Weather.', try:{flaky:true,retry:true}, check:r=>r.config.flaky && r.totals.failures>0 && r.totals.status==='answered'},
 {id:'gate', title:'Stop the bad call', goal:'Block the dangerous call and still answer.', hint:'Choose Tool error, keep the gate on, and enable Retry.', try:{task:'error',approval:true,retry:true}, check:r=>r.totals.blocked>0 && r.totals.status==='answered'},
];
