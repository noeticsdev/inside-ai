export default {
 slug:'rag', title:'Build a RAG pipeline', short:'RAG pipeline', subtitle:'chunk · embed · retrieve · pack · cite', layout:'guide', hook:'Build search into a question-answering prompt.', level:'core', minutes:25, order:8, track:'systems',
 bigIdea:'Retrieval-augmented generation combines search with a prompt budget; missing evidence can break an answer.',
 objectives:['Split documents into overlapping chunks and size a vector index.','Rank chunks, repair a retrieval miss, and fit evidence into a context window.','Cite supporting text and refuse when it is missing.'],
 quiz:[
 {stage:'pre',question:'What happens if the answer is absent from retrieved context?',options:['The model can always recover it','The answer may be unsupported','The context window grows','The index becomes smaller'],correct:1,explanation:'The scripted answer needs a whole supporting fact in a packed chunk.'},
 {stage:'check',question:'Why overlap chunks?',options:['To make vectors shorter','To remove all duplicate text','To keep facts near boundaries together','To increase the context window'],correct:2,explanation:'Overlap repeats boundary words, so a fact can remain whole in a chunk.'},
 {stage:'check',question:'What does cosine similarity rank?',options:['Vector direction similarity','Document publication date','The number of citations','The model output length'],correct:0,explanation:'The retriever compares the question and chunk vectors with cosine similarity.'},
 {stage:'check',question:'What must fit alongside retrieved chunks?',options:['Only vector IDs','Only the generated answer','Only the index','Instructions, question and answer reserve'],correct:3,explanation:'The packer accounts for instructions, question and reserved output space.'},
 {stage:'post',question:'A high score has no supporting sentence. What should you do?',options:['Invent a citation','State that evidence is missing','Treat the score as proof','Repeat the question'],correct:1,explanation:'A similarity score is not evidence that a chunk supports a claim.'},
 {stage:'post',question:'What does a citation identify?',options:['The source chunk supporting a claim','The model that wrote the answer','The query embedding dimensions','The output token price'],correct:0,explanation:'The citation points to the chunk containing the fact.'}
 ],
 sources:[{label:'Lewis et al. (2020), Retrieval-Augmented Generation',url:'https://arxiv.org/abs/2005.11401'},{label:'FAISS: similarity search',url:'https://faiss.ai/'},{label:'OpenAI: managing context',url:'https://platform.openai.com/docs/guides/conversation-state#managing-the-context-window'}],
 notes:'This is a simulation: embeddings use hashed word counts, tokens are estimates, prices are fixed examples, and answers follow a fixed script. Scores and costs are not measurements of a production service.'
};
