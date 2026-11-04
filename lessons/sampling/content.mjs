export default {
 slug:'sampling', title:'Build a token sampler', short:'Token sampler', subtitle:'logits · temperature · top-k · top-p · draw', layout:'guide',
 hook:'Turn model scores into a token, then build the generation loop.', level:'core', minutes:25, order:8, track:'models',
 bigIdea:'The model outputs scores; the sampler turns them into one token with a temperature, a cut-off and one random number.',
 objectives:['Compute softmax and see how temperature changes probabilities.','Apply top-k and nucleus filters, renormalize, and draw from a CDF.','Tune a seeded generation loop and implement a sampler in Python.'],
 quiz:[
 {stage:'pre',question:'What does a sampler use to select the next token?',options:['The model scores and sampling settings','Only the prompt length','A fixed dictionary order','The training loss'],correct:0,explanation:'The build converts logits to probabilities, filters them and draws a token.'},
 {stage:'check',question:'What does raising temperature generally do to unequal logits?',options:['Ends the generation','Makes the probabilities more even','Deletes the lowest token','Changes the vocabulary'],correct:1,explanation:'Dividing logits by a larger temperature brings the scaled scores closer together.'},
 {stage:'check',question:'What does top-p keep?',options:['Every token above probability p','Exactly p tokens','The smallest leading set reaching cumulative mass p','Only the highest-scoring token'],correct:2,explanation:'The nucleus contains the leading tokens until their cumulative mass reaches p.'},
 {stage:'check',question:'After filtering, why renormalize?',options:['To change the logits','To remove the seed','To add an EOS token','To make the remaining probabilities sum to one'],correct:3,explanation:'The remaining mass is divided by its sum before drawing.'},
 {stage:'post',question:'With a fixed distribution, what happens at a CDF boundary?',options:['The next segment owns the boundary','The previous segment owns the boundary','The draw is invalid','All tokens are equally likely'],correct:0,explanation:'The example uses half-open intervals: choose the first cumulative probability strictly greater than u.'},
 {stage:'post',question:'What must stay fixed to reproduce a seeded simulation?',options:['Only the prompt','The seed, settings and model outputs','Only the temperature','Only the maximum length'],correct:1,explanation:'The same random sequence reproduces a result only when the distributions and settings also match.'}
 ],
 sources:[{label:'Holtzman et al. · The Curious Case of Neural Text Degeneration',url:'https://arxiv.org/abs/1904.09751'},{label:'Hugging Face · GenerationConfig',url:'https://huggingface.co/docs/transformers/main/en/main_classes/text_generation'},{label:'Keskar et al. · CTRL',url:'https://arxiv.org/abs/1909.05858'}],
 notes:'This is a simulation with fixed example logits and a hand-written continuation table (fixed script), not a language model. The probabilities, filtering, seeded draws and repetition penalty are computed. The seed belongs to this simulation; it does not reproduce these draws in PyTorch.'
};
