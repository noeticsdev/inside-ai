import { SYSTEM, TASK, toolCall } from './model.mjs';
export const PYTHON_DATA = {
  system: SYSTEM, task: TASK,
  read: toolCall('read-1', 'read_file', { path: 'report.txt' }),
  unknown: toolCall('missing-1', 'missing', {}),
  final: { role: 'assistant', content: 'Finished.' },
};
export const PYTHON_SOLUTION = `import json

def run_agent(policy, tools, task, max_steps):
    messages = [
        {'role': 'system', 'content': DATA['system']},
        {'role': 'user', 'content': task},
    ]
    handled = {}
    for _ in range(max_steps):
        reply = policy(messages)
        messages.append(reply)
        calls = reply.get('tool_calls', [])
        if not calls:
            break
        for call in calls:
            call_id = call['id']
            signature = json.dumps(call, sort_keys=True)
            if call_id in handled:
                old_signature, old_result = handled[call_id]
                result = old_result if signature == old_signature else {'error': 'Duplicate call id with different arguments.'}
            else:
                name = call['function']['name']
                try:
                    args = json.loads(call['function']['arguments'])
                    if name not in tools:
                        result = {'error': 'Unknown tool: ' + name}
                    else:
                        result = tools[name](**args)
                except Exception as exc:
                    result = {'error': str(exc)}
                handled[call_id] = (signature, result)
            messages.append({'role': 'tool', 'tool_call_id': call_id,
                             'content': json.dumps(result)})
    return messages
`;
export const PYTHON_STARTER = `import json

def run_agent(policy, tools, task, max_steps):
    messages = [
        {'role': 'system', 'content': DATA['system']},
        {'role': 'user', 'content': task},
    ]
    # policy(messages) returns a Chat Completions assistant message.
    # tools[name](**args) returns a JSON-serializable result.
    # Arguments are JSON strings; schemas were checked by an adapter.
    # Add a bounded loop, final-answer stop, results and a call-id cache.
    return messages
`;
export const PYTHON_TESTS = `import json, copy
calls = []
def final_policy(messages):
    calls.append(len(messages))
    return copy.deepcopy(DATA['final'])
r = run_agent(final_policy, {}, DATA['task'], 5)
check('stop on final answer', len(r) == 3 and r[-1] == DATA['final'] and calls == [2], 'Append the final assistant reply, then stop calling policy.')
def read_policy(messages):
    return copy.deepcopy(DATA['final'] if any(m['role'] == 'tool' for m in messages) else DATA['read'])
r = run_agent(read_policy, {'read_file': lambda path: {'text': path}}, DATA['task'], 5)
observed = [m for m in r if m['role'] == 'tool']
check('append results with matching ids', len(r) == 5 and r[0]['role'] == 'system' and r[1]['content'] == DATA['task'] and len(observed) == 1 and observed[0].get('tool_call_id') == 'read-1' and json.loads(observed[0]['content']) == {'text': 'report.txt'}, 'Keep the request, assistant call and role=tool result linked by tool_call_id.')
turns = []
def loop_policy(messages):
    turns.append(1)
    reply = copy.deepcopy(DATA['read'])
    reply['tool_calls'][0]['id'] = 'loop-' + str(len(turns))
    return reply
r = run_agent(loop_policy, {'read_file': lambda path: {'text': path}}, DATA['task'], 2)
zero = run_agent(loop_policy, {}, DATA['task'], 0)
check('enforce max_steps including zero', len(turns) == 2 and len(r) == 6 and len(zero) == 2, 'A step is one policy call. A zero budget must make no calls.')
def unknown_policy(messages):
    return copy.deepcopy(DATA['final'] if any(m['role'] == 'tool' for m in messages) else DATA['unknown'])
r = run_agent(unknown_policy, {}, DATA['task'], 3)
errors = [json.loads(m['content']) for m in r if m['role'] == 'tool']
check('unknown tool becomes an observation', len(errors) == 1 and 'unknown' in errors[0].get('error', '').lower() and r[-1] == DATA['final'], 'Return an error tool message, then let policy choose its next response.')
executed = []
def read_file(path):
    executed.append(path)
    return {'text': path}
def repeat_policy(messages):
    n = sum(m['role'] == 'assistant' for m in messages)
    return copy.deepcopy(DATA['read'] if n < 3 else DATA['final'])
r = run_agent(repeat_policy, {'read_file': read_file}, DATA['task'], 4)
results = [m for m in r if m['role'] == 'tool']
check('never execute the same call id twice', executed == ['report.txt'] and len(results) == 3 and all(m.get('tool_call_id') == 'read-1' for m in results) and all(json.loads(m['content']) == {'text': 'report.txt'} for m in results), 'Cache by call id. Replay the saved result for a repeated call.')
executed.clear()
def changed_policy(messages):
    reply = copy.deepcopy(DATA['read'])
    if any(m['role'] == 'tool' for m in messages):
        reply['tool_calls'][0]['function']['arguments'] = json.dumps({'path': 'other.txt'})
    return reply
r = run_agent(changed_policy, {'read_file': read_file}, DATA['task'], 2)
results = [json.loads(m['content']) for m in r if m['role'] == 'tool']
check('reject changed arguments under a repeated id', executed == ['report.txt'] and 'error' in results[-1], 'A reused id with different arguments is a conflict, not a new execution.')
`;
