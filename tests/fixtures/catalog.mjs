// Development-only catalog. Never used by the production build.
const concepts = [
  ['tokenizer','Inside a tokenizer','Watch text become the pieces a model reads.','starter','language',8,'A model reads tokens, not whole words.'],
  ['embeddings','Inside embeddings','Find meaning by measuring the space between words.','starter','language',10,'Similar directions can encode similar meanings.'],
  ['attention','Inside attention','Follow the connections that give each word its context.','core','language',12,'Attention mixes information using learned relevance weights.'],
  ['sampling','Inside sampling','One probability table. A thousand possible next words.','starter','language',8,'Temperature changes the distribution you sample from.'],
  ['training','Inside training','Nudge the weights. Watch the error fall.','core','learning',12,'Gradients tell weights which way reduces the loss.'],
  ['rag','Inside retrieval','Give a model the evidence it needs to answer.','core','language',10,'Retrieval selects context before generation starts.'],
  ['agent-loop','Inside an agent loop','Make a plan, call a tool, and try again.','core','systems',12,'An agent uses tool results to choose its next step.'],
  ['llm-serving','Inside LLM serving','Keep requests moving without running out of memory.','advanced','systems',15,'Serving trades memory, throughput and response time.'],
  ['deepstream','Inside a video pipeline','Follow frames from camera to detection to output.','advanced','systems',15,'A pipeline turns video frames into useful events.'],
];
export const previewCatalog = concepts.map(([slug,title,hook,level,track,minutes,bigIdea],i)=>({
  slug,title,hook,level,track,minutes,bigIdea,order:i+1,preview:true,
  href:`/m/_template/?preview=${slug}`,thumbnail:'/m/_template/figure.svg',
  missions:['observe','tune','break',...(i===4?['recover']:[])].map(id=>({id,title:id[0].toUpperCase()+id.slice(1),goal:`${id} the machine.`})),
  quiz:['pre','check','check','check','post','post'].map((stage,n)=>({stage,question:`${title}: ${['What do you expect to happen when the input changes?','Which part of the machine moves first?','What changed when you adjusted the control?','Which setting reduces the error?','What happens with an unfamiliar input?','Which result matches the model?'][n]}`,options:['The first result','The second result','The third result','The fourth result'],correct:n%4}))
}));
