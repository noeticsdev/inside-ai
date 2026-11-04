export default {
 slug:'llm-serving', title:'Inside LLM serving', hook:'Fit more conversations into one GPU.', level:'advanced', minutes:12, order:8, track:'systems',
 bigIdea:'Serving many requests means balancing batch efficiency, waiting time and KV memory.',
 machine:'Request cards board a batch press, fill KV shelves, and leave as stamped tokens; their motion shows how a server shares memory and compute.',
 stations:[
  {id:'queue',concept:'QUEUE',does:'Holds requests until a batch slot and KV space are free.',fails:'Requests must wait when memory is full.'},
  {id:'prefill',concept:'PREFILL',does:'Processes each prompt and prepares its keys and values.',fails:'A long prompt delays the first token.'},
  {id:'memory',concept:'KV CACHE',does:'Keeps keys and values for reuse at each decode step.',fails:'Without it, the whole context is recomputed.'},
  {id:'batch',concept:'DECODE',does:'Stamps one token per active request each step.',fails:'Finished requests leave unused slots in a static batch.'},
 ],
 quiz:[
 {stage:'pre',question:'What happens when a short request finishes in a continuous batch?',options:['The whole batch waits for it','A waiting request can take its slot','Every request starts over','The KV pool doubles in size'],correct:1,explanation:'The queue feeds an open slot as soon as a request leaves the batch press.'},
 {stage:'check',question:'What does prefill process?',options:['The incoming prompt tokens','Only the final answer token','The next user’s response','Only the model weights'],correct:0,explanation:'The prefill station processes the prompt before the first decode stamp.'},
 {stage:'check',question:'What does the KV cache save?',options:['A copy of the final answer','The next request in the queue','Keys and values from earlier tokens','The time on the wall clock'],correct:2,explanation:'The shelves hold keys and values so later decode steps can reuse them.'},
 {stage:'check',question:'What happens when the KV pool has no room?',options:['The prompt becomes shorter','All output tokens appear at once','The GPU gains extra memory','A request waits for space'],correct:3,explanation:'The memory gauge fills and the queue holds a deferred request.'},
 {stage:'post',question:'Why can continuous batching improve throughput?',options:['It removes every prefill cost','It fills slots when requests finish','It makes every answer the same length','It stores weights in the queue'],correct:1,explanation:'The batch press can take another card when a short request finishes.'},
 {stage:'post',question:'What can a larger queue do to first-token latency?',options:['Increase it while requests wait','Always reduce it to zero','Leave it exactly unchanged','Remove the need for memory'],correct:0,explanation:'Queued cards wait for the press and their first token arrives later.'},
 ],
 sources:[{label:'PagedAttention (Kwon et al., 2023)',url:'https://arxiv.org/abs/2309.06180'},{label:'Orca (Yu et al., OSDI 2022)',url:'https://www.usenix.org/conference/osdi22/presentation/yu'}],
 notes:'This is a simulation. Times are fixed costs, not measurements. The example has 32 layers, 8 KV heads, 128 dimensions per head and fp16 KV values; the selected budget is for KV alone. Requests arrive together with alternating short and long outputs. A full pool defers requests; the preemption count records these deferrals once each. No vendor affiliation.'
};
