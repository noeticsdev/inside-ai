export default {
  slug: 'attention', title: 'Build one attention head', short: 'One attention head',
  subtitle: 'Q · K · V · scale · mask · softmax', layout: 'guide',
  hook: 'Build a causal attention head, one matrix operation at a time.',
  level: 'core', minutes: 25, order: 4, track: 'models',
  bigIdea: 'Each token scores itself and earlier tokens with dot products, turns those scores into weights, and takes a weighted average of their values.',
  objectives: [
    'Derive Q, K and V from X and three projection matrices.',
    'Compute a score, scale it, mask future tokens and normalize one row.',
    'Write causal attention in Python lists and verify the output.',
    'Calculate head width, projection weights and dense score storage.',
  ],
  quiz: [
    { stage:'pre', question:'When a causal head processes “sat”, which tokens can contribute to its output?', options:['Only the token with the largest score','“The”, “cat” and “sat”, in different proportions','Every token, including later ones','Only tokens strictly before “sat”'], correct:1, explanation:'The causal mask hides later tokens. The diagonal stays visible, so “sat” can also use its own value.' },
    { stage:'check', question:'X has shape [5, 8] and W_Q has shape [8, 4]. What is Q’s shape?', options:['[8, 4]','[5, 8]','[5, 4]','[4, 5]'], correct:2, explanation:'The inner dimension 8 is summed over. The board keeps one row per token and four query features.' },
    { stage:'check', question:'Why divide a dot product by √d_k?', options:['To keep score variance from growing with head width','To force every score into the interval zero to one','To remove the need for a causal mask','To make every attention weight equal'], correct:0, explanation:'The scale step divided the score by two for four features. With independent unit-variance components, dot-product variance grows with d_k; scaling helps keep softmax from saturating.' },
    { stage:'check', question:'Where does the causal mask act?', options:['On V after taking the average','On X before the projections','On the output after concatenating heads','On scores before row-wise softmax'], correct:3, explanation:'The board replaces future scores with −∞ before softmax. Their exponentials and weights become zero.' },
    { stage:'post', question:'If all visible scores in one row are equal, what does that row output?', options:['A vector of zeroes','The mean of the visible value vectors','The value of the first token only','The mean of the query vectors'], correct:1, explanation:'Equal exponentials get equal weights. The Python uniform-score check mixes the values equally.' },
    { stage:'post', question:'What does FlashAttention avoid materializing in GPU high-bandwidth memory?', options:['Every query and key projection','The model’s learned weight matrices','The complete T × T attention matrix','Every dot product between tokens'], correct:2, explanation:'The memory step counts a dense score matrix. FlashAttention tiles the computation and uses online softmax instead of storing the full attention matrix; it still computes exact attention.' },
  ],
  sources: [
    { label:'Vaswani et al. (2017), Attention Is All You Need, §3.2', url:'https://arxiv.org/abs/1706.03762' },
    { label:'Dao et al. (2022), FlashAttention', url:'https://arxiv.org/abs/2205.14135' },
    { label:'PyTorch: scaled_dot_product_attention', url:'https://docs.pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html' },
    { label:'PyTorch: MultiheadAttention', url:'https://docs.pytorch.org/docs/stable/generated/torch.nn.MultiheadAttention.html' },
  ],
  notes:'This is a simulation with fixed, untrained example embeddings and projections, not a trained language model. Scores, weights, outputs and storage sizes are computed. Positions are numbered from 1. Dropout, biases, batching and positional encodings are omitted from the teaching head. Independent lesson, not affiliated with PyTorch.',
};
