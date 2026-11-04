// A small deterministic byte-level BPE trainer. Tokens are hexadecimal byte strings.
import { CORPUS } from '../../machines/tokenizer/model.mjs';
export { CORPUS };
export const SENTENCE = 'the नमस्ते';
export const SPLIT_EXAMPLE = "I don't like  it.";
export const HINDI = 'नमस्ते';
export const MAX_MERGES = 40;
export const PATTERN = "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+";
export const pretokenize = text => text.match(new RegExp(PATTERN, 'gu')) || [];
export const bytes = text => Array.from(new TextEncoder().encode(text));
export const hex = n => n.toString(16).padStart(2, '0');
export const byteTokens = text => bytes(text).map(hex);
export function fuse(tokens, a, b) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === a && tokens[i + 1] === b) { out.push(a + b); i++; } else out.push(tokens[i]);
  }
  return out;
}
export function pairCounts(words) {
  const m = new Map();
  for (const w of words) for (let i = 0; i + 1 < w.length; i++) { const k = w[i] + ' ' + w[i + 1]; m.set(k, (m.get(k) || 0) + 1); }
  return [...m].map(([pair, count]) => ({ pair, count })).sort((a,b) => b.count - a.count || (a.pair < b.pair ? -1 : a.pair > b.pair ? 1 : 0));
}
export const INITIAL = CORPUS.flatMap(pretokenize).map(byteTokens);
export const TOP = pairCounts(INITIAL);
let training = INITIAL.map(w => [...w]);
export const MERGES = [];
for (let i = 0; i < MAX_MERGES; i++) {
  const best = pairCounts(training)[0]; if (!best || best.count < 2) break;
  const [a,b] = best.pair.split(' '); MERGES.push({ rank: i, a, b, into: a+b, count: best.count });
  training = training.map(w => fuse(w,a,b));
}
export function encodeWord(word, merges = MERGES) {
  let pieces = Array.isArray(word) ? [...word] : byteTokens(word);
  for (const m of merges) pieces = fuse(pieces, m.a, m.b);
  return pieces;
}
export const encode = (text, n = MAX_MERGES) => pretokenize(text).flatMap(w => encodeWord(w, MERGES.slice(0,n)));
export const ids = (text, n = MAX_MERGES) => encode(text,n).map(t => t.length === 2 ? parseInt(t,16) : 256 + MERGES.findIndex(m => m.into === t));
export const corpusCount = n => CORPUS.reduce((sum, text) => sum + encode(text,n).length, 0);
export const TARGET = 21;
export const fewestMergesFor = (text, target) => Array.from({length: MERGES.length+1}, (_,n) => n).find(n => encode(text,n).length < target) ?? -1;
export const costRatio = n => encode(HINDI, n).length / encode('the', n).length;
export const UTF8_EXAMPLE = { char: 'न', codePoint: 'न'.codePointAt(0), bytes: bytes('न') };
export const ANSWERS = { hindiBytes: bytes(HINDI).length, split: pretokenize(SPLIT_EXAMPLE).length, top: TOP[0].pair, topChoice: 'st', firstCount: corpusCount(1), needed: fewestMergesFor(SENTENCE,TARGET), order: ['r0', 'r1', 'r3'], decode: 'buffer' };
export const MISSIONS = [
  { id: 'bytes', title: 'Count UTF-8 bytes', goal: 'Count every byte in the Hindi word.', check: a => a.value === ANSWERS.hindiBytes },
  { id: 'split', title: 'Count pre-tokens', goal: 'Include contractions, punctuation and whitespace.', check: a => a.value === ANSWERS.split },
  { id: 'pairs', title: 'Find the top pair', goal: 'Choose the most frequent adjacent pair.', check: a => a.choice === ANSWERS.topChoice },
  { id: 'first', title: 'Count after merging', goal: 'Subtract one token per replaced pair.', check: a => a.value === ANSWERS.firstCount },
  { id: 'learn', title: 'Find the smallest budget', goal: 'Use the fewest merges to reach the target.', check: a => a.merges === ANSWERS.needed },
  { id: 'order', title: 'Apply ranked merges', goal: 'Apply only available pairs, in rank order.', check: a => Array.isArray(a.order) && a.order.join() === ANSWERS.order.join() },
  { id: 'python', title: 'Implement encoding', goal: 'Pass the Python checks or explain the rule.', check: a => a.passed === true },
  { id: 'decode', title: 'Buffer token bytes', goal: 'Explain a token boundary inside a character.', check: a => a.choice === ANSWERS.decode },
  { id: 'cost', title: 'Compare token costs', goal: 'Divide Hindi tokens by English tokens.', check: a => a.value === costRatio(a.merges ?? ANSWERS.needed) },
];
