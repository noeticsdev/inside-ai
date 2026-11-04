import { PYTHON_SOLUTION } from './python.mjs';
export default [
  { step: 'kit', actions: [{ do: 'click', selector: '[data-ia-predict] .ia-option' }] },
  { step: 'messages', actions: [
    { do: 'tap', text: 'tool', expect: 'matching id', solves: false },
    { do: 'tap', text: 'system' }, { do: 'tap', text: 'user' }, { do: 'tap', text: 'assistant' }, { do: 'tap', text: 'tool', solves: true },
  ] },
  { step: 'schema', actions: [{ do: 'choose', text: '{"path": 4200000}', expect: 'requires a string', solves: false }, { do: 'choose', text: '{"path": "report.txt"}', solves: true }] },
  { step: 'loop', actions: [
    { do: 'tap', text: 'execute', expect: 'schema validation', solves: false },
    { do: 'tap', text: 'model · first' }, { do: 'tap', text: 'parse' }, { do: 'tap', text: 'validate' }, { do: 'tap', text: 'execute' }, { do: 'tap', text: 'append' }, { do: 'tap', text: 'model · next', solves: true, expectStage: 'report.txt' },
  ] },
  { step: 'context', actions: [{ do: 'answer', value: 80, expect: 'assistant call', solves: false }, { do: 'answer', value: 280, expect: 'separate', solves: false }, { do: 'answer', value: 160, solves: true }] },
  { step: 'error', actions: [{ do: 'choose', text: 'Nothing; execute', expect: 'unsupported prose', solves: false }, { do: 'choose', text: 'A tool result with the error', solves: true, expectStage: 'call_3' }] },
  { step: 'stop', actions: [
    { do: 'select', label: 'max_steps', value: 4, expect: 'not the final answer', solves: false },
    { do: 'select', label: 'stop rule', value: 'final', expect: 'needs 5 model turns', solves: false },
    { do: 'select', label: 'max_steps', value: 8, expect: 'smallest sufficient', solves: false },
    { do: 'select', label: 'max_steps', value: 5, solves: true, expectStage: 'answered' },
  ] },
  { step: 'python', actions: [{ do: 'fallback', index: 2, expect: 'Repeated ids', solves: false }, { do: 'python', code: PYTHON_SOLUTION, solves: true }] },
  { step: 'approval', actions: [{ do: 'choose', text: 'Execute because', expect: 'not permission', solves: false }, { do: 'choose', text: 'Do not execute', solves: true, expectStage: 'file unchanged' }] },
  { step: 'cost', actions: [{ do: 'answer', value: 600, expect: 'last request', solves: false }, { do: 'answer', value: 240, expect: 'output total', solves: false }, { do: 'answer', value: 2400, solves: true }] },
];
