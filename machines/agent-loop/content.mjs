export default {
 slug:'agent-loop', title:'Inside an AI agent', hook:'Watch a tool result change the next turn.', level:'advanced', minutes:12, order:7, track:'systems',
 bigIdea:'An agent repeats model turns and tool calls while its context grows, until it answers or a guard stops it.',
 machine:'A context train collects message cars as it passes a model signal box, tool workshop and guard post; each car changes what the next turn can see.',
 stations:[
 {id:'context',concept:'CONTEXT',does:'Carries the request and each new message.',fails:'The model cannot see earlier results.'},
 {id:'model',concept:'MODEL',does:'Proposes a tool call or an answer.',fails:'No next action is proposed.'},
 {id:'tools',concept:'TOOLS',does:'Runs allowed calls and returns results or errors.',fails:'The next turn receives an error instead of a result.'},
 {id:'guard',concept:'GUARD',does:'Checks limits and blocks the dangerous call.',fails:'A loop or unsafe call can continue.'}],
 quiz:[
 {stage:'pre',question:'After a tool returns a result, what can the next model turn see?',options:['Only the original request','The request and the appended result','Only the tool name','Nothing until a new user request'],correct:1,explanation:'The result car joins the request on the context train before the next turn.'},
 {stage:'check',question:'Who actually runs a proposed tool call?',options:['The harness, after its checks','The model inside its weights','The user on every turn','The context token counter'],correct:0,explanation:'The tool workshop runs calls after the model signal box proposes them.'},
 {stage:'check',question:'What does the token budget guard check here?',options:['The number of tool names','The age of the request','Context size before each model turn','The length of the tool label'],correct:2,explanation:'The guard checks the growing context against the selected budget before a turn.'},
 {stage:'check',question:'What does retry change after a transient tool error?',options:['It erases the request','It increases the turn limit','It disables the approval gate','It lets the harness try once more'],correct:3,explanation:'The workshop makes a second attempt when Retry is on.'},
 {stage:'post',question:'Why does the research train collect more cars than weather?',options:['It has more tool calls and results','It uses a larger model housing','It skips the original request','It starts with no token budget'],correct:0,explanation:'Each research call adds a proposal and a result before the answer.'},
 {stage:'post',question:'What happens when the approval gate blocks deletion?',options:['The file is deleted anyway','The entire context is erased','A denial returns and the script can recover','The token budget becomes unlimited'],correct:2,explanation:'The guard sends a denial car back; the fixed script then tries a lookup.'}],
 sources:[{label:'ReAct: Synergizing Reasoning and Acting in Language Models',url:'https://arxiv.org/abs/2210.03629'},{label:'Model Context Protocol specification',url:'https://modelcontextprotocol.io/specification'}],
 notes:'This is a simulation. Model decisions follow a fixed script; message token sizes are fixed examples, not tokenizer measurements. The approval gate blocks the dangerous call; it does not request a real approval.'
};
