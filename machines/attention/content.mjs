// Inside an attention head: scaled dot-product attention as a weaving loom.
export default {
  slug: "attention",
  title: "Inside an attention head",
  hook: "One word listens to the rest, then mixes what it heard.",
  level: "core",
  minutes: 12,
  order: 3,
  track: "language",
  bigIdea: "A query scores every key, softmax turns the scores into shares of one, and the output is the weighted mix of the values.",
  machine: "A shuttle carries the query token along a row of key posts, threads as thick as each attention weight run to a mixing funnel, and that weave is the weighted mix.",
  stations: [
    { id: "query", concept: "QUERY", does: "Carries the focus token to the front of its post.", fails: "No question is asked, so nothing is scored." },
    { id: "score", concept: "SCORE", does: "Scores the query against every key post.", fails: "Without scores every thread pulls equally." },
    { id: "weigh", concept: "WEIGH", does: "Softmax turns scores into weights that sum to 1.", fails: "Without softmax the mix has no proportions." },
    { id: "mix", concept: "MIX", does: "Blends the value ingots into the output cup.", fails: "No mix, no output vector." },
  ],
  quiz: [
    { stage: "pre", question: "The word “it” sits in “The cat sat … because it was tired”. Which word should an attention head link it to?", options: ["sat", "mat", "cat", "because"], correct: 2, explanation: "You saw head A give “it” most of its weight to “cat”: the pronoun borrows meaning from its noun." },
    { stage: "check", question: "What do the ten weights from one query always add up to?", options: ["One", "The temperature", "The square root of d", "The number of tokens"], correct: 0, explanation: "The readout shows the weight sum pinned at 1.000: softmax divides by its own total." },
    { stage: "check", question: "Why is the score divided by √d before the softmax?", options: ["To make every weight equal", "To mask future tokens", "To keep big scores from freezing softmax onto one winner", "To add the values faster"], correct: 2, explanation: "You watched the saturate mission: unscaled scores collapse onto one thread, and a frozen head stops learning." },
    { stage: "check", question: "What does the causal mask do to a token at position 3?", options: ["It doubles its weight on token 3", "It cuts every thread to tokens after position 3", "It swaps head A for head B", "It cools the temperature to zero"], correct: 1, explanation: "With the mask on, the threads past the focus post are cut and drop: position 3 gives later tokens exactly zero." },
    { stage: "post", question: "Head B gives each token its biggest weight to the token right before it. What did head B learn?", options: ["Which noun a pronoun means", "A positional habit, not a meaning", "The whole sentence at once", "Nothing: its weights are random"], correct: 1, explanation: "Head B attends to the previous token whatever the words are, as the positional mission showed: different heads learn different relations." },
    { stage: "post", question: "The temperature slider is turned near zero and one thread takes all the weight. What breaks?", options: ["The weights no longer sum to 1", "The output copies one value and ignores the rest", "The mask stops working", "The query moves to another post"], correct: 1, explanation: "A saturated mix is just one ingot: the output copies a single value token, which is why cold, unscaled heads learn nothing new." },
  ],
  sources: [{ label: "Vaswani et al. 2017: Attention Is All You Need", url: "https://arxiv.org/abs/1706.03762" }],
  notes: "Hand-set 4-dimensional vectors; real models learn thousands of dimensions. Scores, scaling, masking, softmax and the mix are the real arithmetic.",
};
