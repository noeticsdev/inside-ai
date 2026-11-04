// Inside a tokenizer: copy, quiz and sources. See AGENTS.md, "content.mjs fields".
export default {
  slug: "tokenizer",
  title: "Inside a tokenizer",
  hook: "Why “the” costs one token and Hindi costs dozens.",
  level: "starter",
  minutes: 8,
  order: 1,
  track: "language",
  bigIdea: "A tokenizer chops text into pieces from a learned list, and frequent letter pairs earn their own single piece.",
  machine:
    "A press slides along a stick of single-letter type sorts and fuses every copy of the most frequent pair into one wider sort, so the row shortens and each new piece files into its own cabinet drawer — and that motion is byte-pair encoding.",
  stations: [
    { id: "stick", concept: "SORTS", does: "Holds the input as one type sort per piece.", fails: "No text enters the machine." },
    { id: "press", concept: "MERGE", does: "Fuses every copy of the top pair into one wider sort.", fails: "Pieces never join, so nothing is ever saved." },
    { id: "case", concept: "VOCAB", does: "Files each new piece into its own labelled drawer.", fails: "New pieces have nowhere to live." },
    { id: "dial", concept: "COUNT", does: "Counts the sorts left on the stick.", fails: "The savings stay invisible." },
  ],
  quiz: [
    {
      stage: "pre",
      question: "The bench learned its pairs from English stories. You load a Hindi sentence it never saw. What will the stick look like after 30 merges?",
      options: ["A few wide sorts covering whole words", "Almost one sort per character, barely fused", "One single sort for the whole sentence", "An empty stick with no sorts"],
      correct: 1,
      explanation: "Unseen letters form no frequent pairs, so the press strikes air and the row stays near one sort per character — run the Hindi preset and watch.",
    },
    {
      stage: "check",
      question: "What does one merge do on this bench?",
      options: ["Deletes the rarest letter everywhere", "Shuffles the row into alphabetical order", "Splits the longest sort into two halves", "Fuses every copy of the most frequent pair into one wider sort"],
      correct: 3,
      explanation: "Each press run fuses all copies of one pair, for example “t” + “he” → “the”, and the row visibly shortens by the count you saw in the trace.",
    },
    {
      stage: "check",
      question: "Why does the Python line stay near one character per token while English reaches two?",
      options: ["Its pairs almost never appeared in the training stories, so little fuses", "The press is switched off for code", "Code letters are wider than story letters", "Python forbids multi-letter tokens"],
      correct: 0,
      explanation: "Merges only fuse pairs the bench counted during training. Code punctuation and names were never counted, so the row barely shortens.",
    },
    {
      stage: "check",
      question: "What does one drawer of the cabinet hold?",
      options: ["The slowest sort on the stick", "One learned piece, labelled with the pair that made it", "A spare copy of the whole sentence", "The space sorts removed from words"],
      correct: 1,
      explanation: "Each merge files its new piece — “he”, “ing”, “engine” — into the next drawer, which is why the cabinet grows exactly one drawer per merge.",
    },
    {
      stage: "post",
      question: "A model charges by the token. Why does unseen text cost more than familiar text of the same length?",
      options: ["Unseen text uses bigger letters", "Unseen text splits into many more one-character tokens", "Unseen text repeats the prompt twice", "Unseen text disables the discount drawer"],
      correct: 1,
      explanation: "You watched Hindi hold 30 sorts for 30 characters while English fused 50 characters into 24 — more tokens for the same text means more cost and more context used.",
    },
    {
      stage: "post",
      question: "No token on this bench ever holds a space. Why?",
      options: ["Spaces are deleted before training", "The press melts spaces down first", "Text is pre-split on spaces, so pairs are only counted inside words", "Spaces are too wide for the sorts"],
      correct: 2,
      explanation: "The bench pre-splits text into words before counting, so a merge never reaches across a word boundary and each space stays its own sort. GPT-2 also pre-splits, but it keeps the leading space on the word, so “ the” is one GPT-2 token.",
    },
  ],
  sources: [
    { label: "Sennrich et al. 2016: Neural Machine Translation of Rare Words with Subword Units", url: "https://arxiv.org/abs/1508.07909" },
    { label: "Radford et al. 2019: Language Models are Unsupervised Multitask Learners (GPT-2)", url: "https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf" },
  ],
  notes:
    "A tiny honest model: 5 short English paragraphs and 40 merges, starting from characters. Real tokenizers train on billions of words, often start from the 256 UTF-8 bytes, and hold roughly 32,000–256,000 pieces.",
};
