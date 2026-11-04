export default {
 slug:'tokenizer', title:'Build a BPE tokenizer', short:'BPE tokenizer', subtitle:'byte-level BPE · merges · vocab · encode/decode', layout:'guide',
 hook:'Build a tokenizer from UTF-8 bytes and ranked merges.', level:'starter', minutes:25, order:1, track:'foundations',
 bigIdea:'A tokenizer is a byte encoder plus an ordered list of merges learned from counts; the order is the model.',
 objectives:['Trace UTF-8 bytes through pre-tokenization, ranked merges and token IDs.','Train a small byte-level BPE vocabulary and decode its bytes safely.','Explain how a training corpus affects token counts.'],
 quiz:[
 {stage:'pre',question:'What happens to a Hindi word when a byte-level tokenizer was trained only on English?',options:['It cannot represent the word','Its bytes remain valid, but may need many tokens','It always becomes one token','Its characters are removed'],correct:1,explanation:'The base vocabulary covers every byte; English training may not learn Hindi byte pairs.'},
 {stage:'check',question:'What can a BPE merge join?',options:['Any two distant characters','Tokens from separate pre-tokens','An adjacent pair inside a pre-token','Two arbitrary token IDs'],correct:2,explanation:'Pair counting and merging happen inside each pre-token.'},
 {stage:'check',question:'Which available pair is merged first during encoding?',options:['The pair with the lowest learned rank','The rightmost pair in the text','The pair with the longest spelling','The pair with the highest byte value'],correct:0,explanation:'The learned merge order determines priority.'},
 {stage:'check',question:'What does a token ID identify?',options:['A position in a sentence','A Unicode code point','An embedding dimension','A byte sequence in the vocabulary'],correct:3,explanation:'The vocabulary maps each byte sequence to an ID.'},
 {stage:'post',question:'Why buffer token bytes during streaming decode?',options:['Token IDs are too large','A token can end inside a UTF-8 character','Every token is a whole word','UTF-8 requires a space between tokens'],correct:1,explanation:'A multi-byte character may span token boundaries.'},
 {stage:'post',question:'Why might two languages use different token counts?',options:['Unicode forbids merges in Hindi','Token IDs always count characters','Training counts and byte sequences differ','The decoder deletes unfamiliar words'],correct:2,explanation:'The English-only example learns English pairs, while Hindi bytes remain unmerged.'}
 ],
 sources:[{label:'Sennrich et al.: Neural Machine Translation of Rare Words with Subword Units',url:'https://arxiv.org/abs/1508.07909'},{label:'GPT-2 encoder and regex',url:'https://github.com/openai/gpt-2/blob/master/src/encoder.py'},{label:'RFC 3629: UTF-8',url:'https://www.rfc-editor.org/rfc/rfc3629'},{label:'Hugging Face Tokenizers documentation',url:'https://huggingface.co/docs/tokenizers/index'}],
 notes:'This simulation trains a small byte-level BPE tokenizer on a fixed English corpus. It uses GPT-2-style splitting, not the GPT-2 vocabulary or token IDs.'
};
