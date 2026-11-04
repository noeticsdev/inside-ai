export default {
  slug: 'agent-loop', title: 'Build a tool-using agent loop', short: 'Agent loop',
  subtitle: 'messages · tool schema · call · result · stop', layout: 'guide',
  hook: 'Build the loop that turns tool calls into an answer.', level: 'advanced', minutes: 25, order: 7, track: 'systems',
  bigIdea: 'An agent is a loop: the model reads the conversation, asks for a tool, your code appends its result, and the loop ends on an answer or a budget.',
  objectives: [
    'Build a messages array and match tool results to call ids.',
    'Parse arguments, validate a JSON Schema and route a call to a real function.',
    'Recover from a tool error and enforce step, context and approval limits.',
    'Write a bounded Python loop and compute the cost of resending its transcript.',
  ],
  quiz: [
    { stage: 'pre', question: 'A tool returns a revenue figure. How does the next model turn learn it?', options: ['The tool changes the model weights', 'Your code appends the result to the conversation', 'The model reads your filesystem directly', 'The tool schema gains a new parameter'], correct: 1, explanation: 'You appended a tool message with the matching tool_call_id, then sent the conversation again.' },
    { stage: 'check', question: 'read_file requires a string path. Which argument passes its schema?', options: ['{"path":"report.txt"}', '{"path":4200000}', '{"filename":"report.txt"}', '{"path":["report.txt"]}'], correct: 0, explanation: 'The schema step required path, gave it type string and rejected additional properties.' },
    { stage: 'check', question: 'The calculator rejects prose. What should the caller append?', options: ['A user message claiming success', 'An assistant message with a guessed value', 'A new system message deleting the request', 'A tool message with the error and matching call id'], correct: 3, explanation: 'The error became a tool observation. The fixed script then requested a corrected multiplication.' },
    { stage: 'check', question: 'Why does max_steps include the final model response?', options: ['A final answer executes the calculator again', 'Tool results count as extra model calls', 'The final answer needs another model invocation', 'Only successful tool calls count as steps'], correct: 2, explanation: 'The recovery run needed five model calls: search, read, rejected calculation, corrected calculation and final answer.' },
    { stage: 'post', question: 'Each model call resends a transcript that grows by a fixed amount. How does cumulative input grow?', options: ['It stays equal to the final context size', 'It grows quadratically with the number of calls', 'It shrinks after every tool observation', 'It equals the number of output tokens'], correct: 1, explanation: 'You added 200 + 280 + 360 + 440 + 520 + 600 = 2,400 estimated input tokens, while output was 240.' },
    { stage: 'post', question: 'A valid delete_file call is denied. What happens next?', options: ['The router deletes and then restores the file', 'The model may override the denial on its own', 'The schema makes the call safe to execute', 'No execution; append a denial with the call id'], correct: 3, explanation: 'The approval gate ran before the destructive tool. A denial returned to the model and the example file stayed intact.' },
  ],
  sources: [
    { label: 'Yao et al. (ICLR 2023): ReAct', url: 'https://arxiv.org/abs/2210.03629' },
    { label: 'OpenAI: function calling (Chat Completions examples)', url: 'https://developers.openai.com/api/docs/guides/function-calling' },
    { label: 'Anthropic: client tool use and tool results', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview' },
    { label: 'JSON Schema: object properties, required and additionalProperties', url: 'https://json-schema.org/understanding-json-schema/reference/object' },
  ],
  notes: 'This is a simulation. Model decisions follow a fixed script, a stand-in for an LLM. The tools run real local arithmetic over an in-memory example workspace; no external service or real file is accessed. Token counts are fixed estimates per message and tool schema, not tokenizer measurements or prices. Schemas and transcripts use the OpenAI Chat Completions format, with one tool call per model turn. The validator implements only the schema keywords used here. Independent lesson, not affiliated with OpenAI or Anthropic.',
};
