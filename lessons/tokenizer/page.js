import * as M from './model.mjs';
import { createGuide, s, T_, pyCell, svgBox } from '../../platform/shell/guide-runtime.js';

// Printable form of a token (hex byte string), GPT-2 style: Ġ is a space, a byte that is not a whole character shows as <e0>.
const display = t => {
  if (t === '20') return 'Ġ';
  const v = new TextDecoder().decode(Uint8Array.from(t.match(/../g).map(x => parseInt(x, 16))));
  return v.includes('�') ? `<${t}>` : v.replace(/ /g, 'Ġ');
};
const n = g => g.settings.merges ?? 0;
const count = k => M.encode(M.SENTENCE, k).length;
const ratio = k => (M.bytes(M.SENTENCE).length / count(k)).toFixed(2);
const CHECK = Object.fromEntries(M.MISSIONS.map(m => [m.id, m.check]));
const rect = (svg, x, y, w, h, cls = 'cu-slot', rx = 4) => svg.append(s('rect', { x, y, width: w, height: h, rx, class: cls }));
const txt = (svg, x, y, text, cls = 'cu-t', anchor) => svg.append(T_(x, y, text, cls, anchor));
const line = (svg, d, cls = 'cu-axis') => svg.append(s('path', { d, class: cls }));
function chip(svg, x, y, w, label, cls = 'cu-slot', tcls = 'cu-t-b', hh = 27) {
  rect(svg, x, y, w, hh, cls); txt(svg, x + w / 2, y + hh / 2 + 5, label, tcls, 'middle');
}
function chips(svg, items, x, y, maxWidth, opts = {}) {
  let px = x, py = y;
  for (const label of items) {
    const w = Math.max(32, Array.from(label).length * 8.5 + 16);
    if (px + w > x + maxWidth) { px = x; py += 33; }
    chip(svg, px, py, w, label, opts.active ? 'cu-slot-on' : 'cu-slot'); px += w + 5;
  }
  return py + 27;
}

// One column per UTF-8 byte of the followed sentence; a small extra gap separates characters.
const PITCH = 40.5, CHIP = 38, CHAR_GAP = 4;
const LAYOUT = (() => {
  const xs = [], groups = []; let x = 38;
  Array.from(M.SENTENCE).forEach(c => {
    const k = M.bytes(c).length; groups.push({ c, start: xs.length, k });
    for (let j = 0; j < k; j++) { xs.push(x); x += PITCH; }
    x += CHAR_GAP;
  });
  return { xs, groups };
})();
const span = (start, k) => [LAYOUT.xs[start], LAYOUT.xs[start + k - 1] + CHIP];

// Rows of the merge table to show: all of them when short, else ranks 0–3, a gap, and the newest two.
function mergeRows(level) {
  if (level <= 8) return Array.from({ length: level }, (_, i) => i);
  return [0, 1, 2, 3, null, level - 2, level - 1];
}

function board(ctx) {
  const svg = s('svg', { viewBox: `0 0 1000 ${ctx.built > 2 ? 670 : ctx.built ? 510 : 610}`, role: 'img', 'aria-label': 'The followed sentence as UTF-8 bytes, pre-tokens, tokens with their IDs, the learned merge table, the vocabulary and a readout' });
  const g = ctx.g, built = ctx.built, id = ctx.step.id;
  const level = built >= 5 ? n(g) : built >= 4 ? 1 : 0;
  const panel = (x, y, w, h, title, { on = false, ghost = null, note = '' } = {}) => {
    if (ghost) {
      rect(svg, x, y, w, h, 'tk-ghost', 7);
      txt(svg, x + 14, y + 22, title, 'tk-label-m'); txt(svg, x + w - 14, y + 22, ghost, 'hw-sub', 'end');
      return;
    }
    rect(svg, x, y, w, h, on ? 'tk-panel-on' : 'hw-fill', 7);
    txt(svg, x + 14, y + 22, title, on ? 'tk-label-a' : 'hw-label');
    if (note) txt(svg, x + w - 14, y + 22, note, 'hw-sub', 'end');
  };

  // input text
  rect(svg, 20, 8, 960, 54, 'hw-fill', 7);
  txt(svg, 34, 41, 'INPUT TEXT', 'hw-label');
  txt(svg, 158, 45, M.SENTENCE, 'tk-big');
  txt(svg, 966, 29, 'Ġ = space · hex = UTF-8 byte · <e0> = raw byte token', 'hw-sub', 'end');
  const decoded = built >= 8, nb = M.bytes(M.SENTENCE).length;
  txt(svg, 966, 51, decoded ? `decode(ids) → ${M.SENTENCE}  ·  ${nb}/${nb} bytes round-trip` : `${Array.from(M.SENTENCE).length} code points`, decoded ? (id === 'decode' ? 'ro-a' : 'ro-v') : 'hw-sub', 'end');

  if (built === 0) { kitBoard(svg); return svg; }
  if (built <= 2) { byteBoard(svg, ctx, panel); return svg; }

  // UTF-8 bytes
  const B = 70;
  panel(20, B, 960, 100, 'UTF-8 BYTES', { on: id === 'bytes', note: `${nb} bytes · text.encode("utf-8")` });
  LAYOUT.groups.forEach(gr => {
    const [x0, x1] = span(gr.start, gr.k);
    txt(svg, (x0 + x1) / 2, B + 50, gr.c === ' ' ? 'Ġ' : gr.c, gr.c === ' ' ? 'tk-char-m' : 'tk-char', 'middle');
    M.bytes(gr.c).forEach((b, j) => chip(svg, LAYOUT.xs[gr.start + j], B + 58, CHIP, M.hex(b), id === 'bytes' && gr.k > 1 ? 'cu-slot-on' : 'cu-slot', 'tk-chip', 28));
    if (gr.k > 1) line(svg, `M${x0} ${B + 90}v4H${x1}v-4`);
  });

  // pre-tokens
  const P = 178;
  if (built >= 2) {
    const pieces = M.pretokenize(M.SENTENCE);
    panel(20, P, 960, 64, 'PRE-TOKENS', { on: id === 'split', note: `${pieces.length} pieces · GPT-2 regex · merges never cross a boundary` });
    let bi = 0;
    pieces.forEach(p => {
      const k = M.bytes(p).length, [x0, x1] = span(bi, k), label = p.replace(/ /g, 'Ġ');
      chip(svg, x0, P + 31, x1 - x0, label, id === 'split' ? 'cu-slot-on' : 'cu-slot', 'tk-chip', 26);
      bi += k;
    });
  } else panel(20, P, 960, 64, 'PRE-TOKENS', { ghost: 'added in step 2 · regex split' });

  // tokens → ids
  const K = 250;
  if (built >= 4) {
    const ts = M.encode(M.SENTENCE, level), ids = M.ids(M.SENTENCE, level), cost = built >= 8 && id !== 'decode';
    const enN = M.encode('the', level).length, hiN = M.encode(M.HINDI, level).length;
    panel(20, K, 960, 146, `TOKENS → IDS · ${ts.length} tokens`, { on: id === 'first' || id === 'learn', note: cost ? `the = ${enN} token · नमस्ते = ${hiN} tokens` : `${level} learned merges · ID below each token` });
    // Wrap generously sized chips instead of squeezing raw-byte labels onto one line.
    // Merged tokens take one slot too, so the strip visibly shrinks with the slider.
    let bi = 0, px = 38, py = K + 32;
    ts.forEach((t, i) => {
      const k = t.length / 2, label = display(t), w = Math.max(62, Array.from(label).length * 10 + 18);
      if (px + w > 962) { px = 38; py += 55; }
      const cls = k > 1 ? 'cu-slot-on' : cost && bi >= 4 ? 'tk-cost' : 'cu-slot';
      chip(svg, px, py, w, label, cls, 'tk-chip', 29);
      txt(svg, px + w / 2, py + 47, String(ids[i]), 'tk-id', 'middle');
      px += w + 7;
      bi += k;
    });
  } else {
    panel(20, K, 960, 146, 'BASE TOKENS · BEFORE MERGING', { note: `${nb} bytes = ${nb} tokens · IDs are byte values` });
    M.byteTokens(M.SENTENCE).forEach((t, i) => {
      const x = 38 + (i % 13) * 69, y = K + 32 + Math.floor(i / 13) * 55;
      chip(svg, x, y, 62, display(t), 'cu-slot', 'tk-chip', 29);
      txt(svg, x + 31, y + 47, String(parseInt(t, 16)), 'tk-id', 'middle');
    });
  }

  // merge table, vocabulary, readout
  const R = 404, RH = 258;
  if (built >= 3 && level === 0) {
    panel(20, R, 400, RH, 'PAIR COUNTS · TRAINING CORPUS', { on: id === 'pairs' });
    txt(svg, 34, R + 46, 'adjacent pairs inside pre-tokens', 'hw-sub');
    const top = M.TOP.slice(0, 7), max = top[0].count;
    top.forEach((p, i) => {
      const y = R + 60 + i * 27, w = 220 * p.count / max;
      txt(svg, 104, y + 15, p.pair.split(' ').map(display).join(' + '), 'ro-v', 'end');
      rect(svg, 116, y, w, 20, i === 0 ? 'cu-slot-on' : 'cu-slot', 2);
      txt(svg, 124 + w, y + 15, String(p.count), 'ro-v');
    });
  } else if (built >= 3) {
    panel(20, R, 400, RH, `MERGES.TXT · ${level} RANK${level === 1 ? '' : 'S'}`, { on: id === 'first' || id === 'learn' || id === 'order' });
    txt(svg, 34, R + 46, 'rank  pair → new token', 'hw-sub'); txt(svg, 406, R + 46, 'bytes', 'hw-sub', 'end');
    const rows = mergeRows(level);
    const hot = id === 'order' ? [0, 1, 3] : id === 'first' ? [0] : id === 'learn' ? [level - 1] : [];
    rows.forEach((r, i) => {
      const y = R + 72 + i * 25;
      if (r === null) { txt(svg, 34, y, `⋮  ranks ${rows[i - 1] + 1}–${rows[i + 1] - 1}`, 'hw-sub'); return; }
      const m = M.MERGES[r], on = hot.includes(r);
      if (on) rect(svg, 28, y - 17, 384, 23, 'cu-slot-on', 3);
      txt(svg, 62, y, String(r), on ? 'ro-a' : 'ro-v', 'end');
      txt(svg, 76, y, `${display(m.a)} + ${display(m.b)} → ${display(m.into)}`, on ? 'ro-a' : 'ro-v');
      txt(svg, 406, y, m.into, 'tk-hex', 'end');
    });
  } else panel(20, R, 400, RH, 'MERGE TABLE', { ghost: 'step 3 · count pairs' });

  if (built >= 4) {
    panel(428, R, 262, RH, `VOCAB.JSON · ${256 + level} IDS`, { on: id === 'first' || id === 'learn' });
    txt(svg, 442, R + 46, 'token → id', 'hw-sub');
    txt(svg, 442, R + 72, '00 … ff  →  0 … 255', 'ro-t');
    mergeRows(level).forEach((r, i) => {
      const y = R + 97 + i * 25;
      if (r === null) { txt(svg, 442, y, '⋮', 'hw-sub'); return; }
      txt(svg, 442, y, `${display(M.MERGES[r].into)}  →  ${256 + r}`, 'ro-v');
    });
    if (level === 1) {
      txt(svg, 442, R + 125, 'base byte IDs stay unchanged', 'hw-sub');
      byteVocab(svg, R + 149, 19);
    }
  } else {
    panel(428, R, 262, RH, 'BASE VOCAB · 256 IDS');
    txt(svg, 442, R + 46, 'bytes used by the sentence', 'hw-sub');
    byteVocab(svg, R + 81, 29);
  }

  panel(698, R, 282, RH, 'READOUT');
  const rows = [
    ['UTF-8 bytes', nb, 'bytes'],
    ['pre-tokens', M.pretokenize(M.SENTENCE).length, 'split'],
    ['top pair', `Ġ + t × ${M.TOP[0].count}`, 'pairs'],
    ['corpus tokens', `${M.corpusCount(0)} → ${M.ANSWERS.firstCount}`, 'first'],
    ['sentence tokens', count(level), 'learn'],
    ['bytes / token', ratio(level), 'learn'],
    ['Ġthem', M.encodeWord(' them', M.MERGES.slice(0, level)).map(display).join(' · '), 'order'],
    ['decode', `${M.SENTENCE} ✓`, 'decode'],
    ['नमस्ते ÷ the', `${M.encode(M.HINDI, level).length / M.encode('the', level).length} ×`, 'cost'],
  ];
  rows.forEach(([label, val, sid], i) => {
    const required = { bytes: 1, split: 2, pairs: 3, first: 4, learn: 5, order: 6, decode: 8, cost: 9 };
    const y = R + 50 + i * 24.5, ok = ctx.solved(sid) && (sid === 'cost' ? ['cost', 'done'].includes(id) : built >= required[sid]);
    txt(svg, 712, y, label, 'ro-t');
    txt(svg, 966, y, ok ? String(val) : '?', ok ? (sid === id ? 'ro-a' : 'ro-v') : 'tk-q', 'end');
  });
  return svg;
}

function byteVocab(svg, y, pitch) {
  [...new Set(M.bytes(M.SENTENCE))].sort((a, b) => a - b).forEach((b, i) => {
    txt(svg, 442 + (i % 2) * 120, y + Math.floor(i / 2) * pitch, `${display(M.hex(b))} → ${b}`, 'ro-v');
  });
}

// Early steps expand the real byte data instead of reserving empty future panels.
function byteBoard(svg, ctx, panel) {
  const split = ctx.built === 2, solved = ctx.solved('bytes');
  panel(20, 70, 672, 360, 'UTF-8 BYTES', { on: !split, note: 'one card per code point' });
  Array.from(M.SENTENCE).forEach((c, i) => {
    const ascii = i < 4, j = ascii ? i : i - 4;
    const x = 36 + (ascii ? j * 161 : (j % 3) * 217);
    const y = ascii ? 109 : 205 + Math.floor(j / 3) * 106;
    const w = ascii ? 149 : 204;
    rect(svg, x, y, w, ascii ? 82 : 98, 'cu-slot', 5);
    txt(svg, x + 14, y + 29, c === ' ' ? 'Ġ' : c, 'tk-char');
    txt(svg, x + w - 12, y + 27, `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`, 'tk-hex', 'end');
    M.bytes(c).forEach((b, j) => chip(svg, x + 12 + j * 62, y + 43, 56, M.hex(b), ascii ? 'cu-slot' : 'cu-slot-on', 'tk-chip', 29));
    if (!ascii) line(svg, `M${x + 12} ${y + 79}v5h180v-5`);
  });
  panel(704, 70, 276, 360, 'BYTE ACCOUNTING');
  const english = M.bytes('the ').length, hindi = M.bytes(M.HINDI).length, total = english + hindi;
  txt(svg, 720, 125, 'the + space', 'ro-t'); txt(svg, 964, 125, `${english} B`, 'ro-v', 'end');
  txt(svg, 720, 164, M.HINDI, 'ro-t'); txt(svg, 964, 164, solved ? `${hindi} B` : '? B', solved ? 'ro-a' : 'ro-v', 'end');
  line(svg, 'M720 184H964');
  txt(svg, 720, 215, 'sentence', 'ro-t'); txt(svg, 964, 215, solved ? `${total} B` : '? B', 'ro-v', 'end');
  txt(svg, 720, 260, `${Array.from(M.HINDI).length} Hindi code points`, 'ro-v');
  txt(svg, 720, 286, '× 3 bytes per code point', 'ro-t');
  if (solved) {
    rect(svg, 720, 310, 244 * english / total, 28, 'cu-slot', 0);
    rect(svg, 720 + 244 * english / total, 310, 244 * hindi / total, 28, 'cu-slot-on', 0);
    txt(svg, 720, 365, `${english} + ${hindi} = ${total} bytes`, 'ro-v');
    txt(svg, 720, 395, 'bar widths count bytes', 'hw-sub');
  } else txt(svg, 720, 338, 'Count the grouped bytes.', 'hw-sub');
  if (split) {
    panel(20, 440, 960, 64, 'PRE-TOKENS', { on: true, note: `${M.pretokenize(M.SENTENCE).length} pieces · merges stay inside each box` });
    let bi = 0;
    for (const p of M.pretokenize(M.SENTENCE)) {
      const k = M.bytes(p).length, [x0, x1] = span(bi, k);
      chip(svg, x0, 471, x1 - x0, p.replace(/ /g, 'Ġ'), 'cu-slot-on', 'tk-chip', 26);
      bi += k;
    }
  } else {
    panel(20, 440, 960, 64, 'BYTE RULE', { note: 'next: split before learning merges' });
    txt(svg, 36, 487, 'ASCII: 0xxxxxxx     Devanagari here: 1110xxxx 10xxxxxx 10xxxxxx', 'ro-v');
  }
}

function kitBoard(svg) {
  rect(svg, 20, 70, 380, 532, 'hw-fill', 7);
  txt(svg, 34, 92, 'TRAINING CORPUS', 'hw-label');
  txt(svg, 386, 92, `${M.CORPUS.length} paragraphs · ${M.bytes(M.CORPUS.join('')).length} B`, 'hw-sub', 'end');
  const words = M.CORPUS.join(' / ').split(' '), lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 35) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  lines.push(cur);
  lines.slice(0, 19).forEach((l, i) => txt(svg, 34, 122 + i * 22.5, l, 'tk-corpus'));
  txt(svg, 34, 590, 'English only · "/" separates paragraphs', 'hw-sub');

  rect(svg, 408, 70, 572, 532, 'hw-fill', 7);
  txt(svg, 422, 92, 'BASE VOCABULARY · 256 BYTE IDS', 'hw-label');
  const used = new Set(M.bytes(M.SENTENCE));
  const gx = 460, gy = 116, cw = 31, ch = 27;
  for (let c = 0; c < 16; c++) txt(svg, gx + c * cw + 14, gy - 4, c.toString(16), 'tk-hex', 'middle');
  for (let r = 0; r < 16; r++) {
    txt(svg, gx - 10, gy + r * ch + 19, r.toString(16) + 'x', 'tk-hex', 'end');
    for (let c = 0; c < 16; c++) {
      const b = r * 16 + c, on = used.has(b);
      rect(svg, gx + c * cw, gy + r * ch, cw - 3, ch - 4, on ? 'cu-slot-on' : 'tk-cell', 2);
      if (on) txt(svg, gx + c * cw + 14, gy + r * ch + 17, M.hex(b), 'tk-cell-on', 'middle');
    }
  }
  txt(svg, 422, 566, `Lit: the ${used.size} byte values that "${M.SENTENCE}" uses.`, 'ro-t');
  txt(svg, 422, 590, `Training adds up to ${M.MAX_MERGES} merged tokens as IDs 256 and up.`, 'hw-sub');
}

// ---- close-ups ----
function bytesClose() {
  const svg = svgBox(700, 236, 'The code point of न split into 4, 6 and 6 bits and placed into the payload bits of three UTF-8 bytes');
  const bits = M.UTF8_EXAMPLE.codePoint.toString(2).padStart(16, '0'), cell = 17;
  const byteX = [160, 335, 510], pre = ['1110', '10', '10'], groups = [bits.slice(0, 4), bits.slice(4, 10), bits.slice(10)];
  txt(svg, 12, 20, `न  =  U+0928  =  0b ${bits.slice(0, 4)} ${bits.slice(4, 8)} ${bits.slice(8, 12)} ${bits.slice(12)}`, 'cu-t-b');
  txt(svg, 12, 64, 'code point', 'cu-t-m'); txt(svg, 12, 78, 'split 4 · 6 · 6', 'cu-t-m');
  txt(svg, 12, 152, 'UTF-8 bytes', 'cu-t-m'); txt(svg, 12, 166, 'prefix + payload', 'cu-t-m');
  groups.forEach((gb, i) => {
    const px = byteX[i] + pre[i].length * cell;
    for (let j = 0; j < gb.length; j++) { rect(svg, px + j * cell, 52, cell, 26, 'cu-bits-on', 0); txt(svg, px + j * cell + cell / 2, 70, gb[j], 'cu-t-a', 'middle'); }
    txt(svg, px + gb.length * cell / 2, 44, `${gb.length} bits`, 'cu-t-m', 'middle');
    line(svg, `M${px + gb.length * cell / 2} 80V136`, 'cu-grid');
    const full = pre[i] + gb;
    for (let j = 0; j < 8; j++) {
      const on = j >= pre[i].length;
      rect(svg, byteX[i] + j * cell, 140, cell, 26, on ? 'cu-bits-on' : 'cu-bits', 0);
      txt(svg, byteX[i] + j * cell + cell / 2, 158, full[j], on ? 'cu-t-a' : 'cu-t-b', 'middle');
    }
    txt(svg, byteX[i] + 4 * cell, 186, `0x${parseInt(full, 2).toString(16)}`, 'cu-t-b', 'middle');
  });
  txt(svg, 12, 220, `t h e: 1 byte each (0xxxxxxx).  ${M.HINDI}: ${Array.from(M.HINDI).length} code points × 3 bytes = ${M.bytes(M.HINDI).length} bytes.`, 'cu-t');
  return svg;
}
function splitClose() {
  const svg = svgBox(700, 150, 'Regex pre-token boundaries');
  txt(svg, 12, 22, `INPUT   "${M.SPLIT_EXAMPLE}"`, 'cu-t-b');
  txt(svg, 12, 54, 'REGEX PIECES', 'cu-t-m');
  chips(svg, M.pretokenize(M.SPLIT_EXAMPLE).map(t => t.replace(/ /g, 'Ġ')), 12, 64, 670, { active: true });
  txt(svg, 12, 122, "Ġ marks a leading space. 't is its own piece, and the first of the two", 'cu-t');
  txt(svg, 12, 140, 'spaces stays alone because the second one joins "it".', 'cu-t');
  return svg;
}
function pairsClose() {
  const svg = svgBox(700, 230, 'Most frequent adjacent pairs in the training corpus');
  const top = M.TOP.slice(0, 7), max = top[0].count;
  txt(svg, 12, 14, 'pair', 'cu-t-m'); txt(svg, 105, 14, 'occurrences inside pre-tokens, whole corpus', 'cu-t-m'); txt(svg, 690, 14, 'hex', 'cu-t-m', 'end');
  top.forEach((p, i) => {
    const y = 24 + i * 29, w = 430 * p.count / max;
    txt(svg, 90, y + 15, p.pair.split(' ').map(display).join(' + '), 'cu-t-b', 'end');
    rect(svg, 105, y, Math.max(2, w), 20, i ? 'cu-slot' : 'cu-slot-on', 2);
    txt(svg, 113 + w, y + 15, `${p.count}`, i ? 'cu-t-b' : 'cu-t-a');
    txt(svg, 690, y + 15, p.pair, 'cu-t-m', 'end');
  });
  return svg;
}
function firstClose() {
  const svg = svgBox(700, 160, 'First merge before and after');
  txt(svg, 12, 25, 'BEFORE', 'cu-t-m'); chips(svg, ['Ġ', 't', 'h', 'e'], 110, 7, 300);
  txt(svg, 300, 25, '" the" = 20 74 68 65', 'cu-t-m');
  txt(svg, 12, 74, 'RANK 0', 'cu-t-m'); chips(svg, ['Ġt', 'h', 'e'], 110, 56, 300, { active: true });
  txt(svg, 300, 74, 'Ġ + t → Ġt  (20 74 → id 256)', 'cu-t-a');
  txt(svg, 12, 120, `Each of the ${M.TOP[0].count} occurrences turns two tokens into one:`, 'cu-t');
  txt(svg, 12, 142, `${M.corpusCount(0)} − ${M.TOP[0].count} = ${M.corpusCount(1)} corpus tokens`, 'cu-t-b');
  return svg;
}
function learnClose(g) {
  const phone = matchMedia('(max-width: 900px)').matches, W = phone ? 310 : 700, H = phone ? 200 : 220;
  const svg = svgBox(W, H, 'Sentence token count after each number of merges');
  svg.setAttribute('class', 'tk-chart');
  const left = phone ? 34 : 70, right = W - (phone ? 12 : 30), bottom = H - 34;
  const k = n(g), X = m => left + m * (right - left) / M.MAX_MERGES, Y = c => 30 + (23 - c) * (phone ? 34 : 40);
  [20, 21, 22].forEach(c => { line(svg, `M${left} ${Y(c)}H${right}`, 'cu-grid'); txt(svg, left - 10, Y(c) + 5, String(c), 'cu-t-m', 'end'); });
  for (let m = 0; m <= M.MAX_MERGES; m += phone ? 10 : 5) txt(svg, X(m), bottom, String(m), 'cu-t-m', 'middle');
  txt(svg, (left + right) / 2, H - 12, 'merges learned', 'cu-t-m', 'middle');
  txt(svg, 12, 18, 'tokens', 'cu-t-m');
  line(svg, `M${left} ${Y(M.TARGET)}H${right}`, 'cu-mark');
  txt(svg, right - 2, Y(M.TARGET) - 12, `target: below ${M.TARGET}`, 'cu-t-bad', 'end');
  let d = `M${X(0)} ${Y(count(0))}`;
  for (let m = 1; m <= 40; m++) d += `H${X(m)}V${Y(count(m))}`;
  line(svg, d, 'tk-curve');
  txt(svg, X(2) + 6, Y(21) + 20, 'rank 1: h + e', 'cu-t-m');
  txt(svg, X(35) - 6, Y(20) + (phone ? 18 : 20), 'rank 34: t + he', 'cu-t-m', 'end');
  line(svg, `M${X(k)} 30V${Y(19.6)}`, 'tk-cursor');
  svg.append(s('circle', { cx: X(k), cy: Y(count(k)), r: 5, class: 'tk-dot' }));
  txt(svg, X(k) + (k > 30 ? -8 : 8), 44, `${k} merges → ${count(k)} tokens`, 'cu-t-a', k > 30 ? 'end' : undefined);
  return svg;
}
function orderClose() {
  const svg = svgBox(700, 176, 'Ranked merges applied to the pre-token them');
  const rows = [['bytes', ['Ġ', 't', 'h', 'e', 'm']], ['rank 0 · Ġ + t', ['Ġt', 'h', 'e', 'm']], ['rank 1 · h + e', ['Ġt', 'he', 'm']], ['rank 3 · Ġt + he', ['Ġthe', 'm']]];
  rows.forEach(([label, ts], i) => { txt(svg, 12, 30 + i * 41, label, i ? 'cu-t-b' : 'cu-t-m'); chips(svg, ts, 170, 11 + i * 41, 500, { active: i > 0 }); });
  return svg;
}
function decodeClose() {
  const svg = svgBox(700, 200, 'Three tokens arrive one at a time; decoding each alone gives replacement characters, buffering gives न');
  const cols = [230, 400, 570], toks = ['e0', 'a4', 'a8'];
  txt(svg, 12, 26, 'token arrives', 'cu-t-m');
  txt(svg, 12, 92, 'decode alone', 'cu-t-m');
  txt(svg, 12, 140, 'stream=True', 'cu-t-m'); txt(svg, 12, 156, 'buffer', 'cu-t-m');
  toks.forEach((t, i) => {
    const x = cols[i];
    chip(svg, x - 28, 8, 56, `<${t}>`, 'cu-slot', 'cu-t-b');
    txt(svg, x, 54, `token ${i + 1}`, 'cu-t-m', 'middle');
    txt(svg, x, 96, '�', 'tk-bad-big', 'middle');
    const buf = toks.slice(0, i + 1); let bx = x - buf.length * 17;
    buf.forEach(b => { rect(svg, bx, 128, 32, 24, i === 2 ? 'cu-slot-on' : 'cu-slot', 3); txt(svg, bx + 16, 145, b, 'cu-t-b', 'middle'); bx += 34; });
    txt(svg, x, 182, i < 2 ? 'waits: incomplete' : 'emits  न', i < 2 ? 'cu-t-m' : 'cu-t-a', 'middle');
  });
  return svg;
}
function costClose(g) {
  const svg = svgBox(700, 168, 'English and Hindi token counts drawn one cell per token');
  const k = n(g);
  [['the', 'the'], [M.HINDI, M.HINDI]].forEach(([label, text], i) => {
    const ts = M.encode(text, k), y = 18 + i * 62;
    txt(svg, 90, y + 19, label, 'cu-t-b', 'end');
    ts.forEach((t, j) => rect(svg, 105 + j * 30, y, 27, 27, i ? 'cu-slot-on' : 'cu-slot', 3));
    txt(svg, 105, y + 46, `${M.bytes(text).length} bytes → ${ts.length} token${ts.length === 1 ? '' : 's'}`, 'cu-t-m');
  });
  txt(svg, 12, 158, 'One cell = one token. Same price per token; bars share the same scale.', 'cu-t');
  return svg;
}

const num = (id, prompt, hint) => ui => ui.number({ prompt, check: v => v === M.ANSWERS[id], hint });
const add = (glyph, name, runs, conf) => [{ glyph, name, runs, conf }];
const steps = [
  { id: 'kit', phase: 'kit', kicker: 'YOUR KIT', title: 'Gather the training data', lead: `Train on ${M.CORPUS.length} short English paragraphs with a budget of ${M.MAX_MERGES} merges. Follow <b>${M.SENTENCE}</b> through the tokenizer; the Hindi word is outside the training corpus.`, minutes: 1, view: 'board',
    parts: () => [{ title: 'Training kit', n: 3 }, { glyph: 'doc', name: 'Corpus', runs: `${M.bytes(M.CORPUS.join('')).length} UTF-8 bytes in ${M.CORPUS.length} paragraphs` }, { glyph: 'matrix', name: 'Vocabulary budget', runs: `256 byte entries + up to ${M.MAX_MERGES} merges` }, { glyph: 'text', name: 'Sentence', runs: M.SENTENCE }], task: 'predict' },
  { id: 'bytes', phase: 'build', kicker: 'UTF-8', title: 'Encode text to bytes', lead: 'Add a UTF-8 encoder. ASCII letters take one byte each; a Devanagari code point takes three.', minutes: 2, view: 'board',
    adds: add('text', 'UTF-8 encoder', 'Python stdlib', '"the नमस्ते".encode("utf-8")  # 22 bytes'), closeLabel: 'CLOSE-UP · UTF-8', close: bytesClose, mission: 'bytes',
    task: num('hindiBytes', 'How many UTF-8 bytes are in नमस्ते?', v => v === 6 ? 'That counts code points; each here takes 3 bytes.' : v === 12 ? 'These code points take 3 bytes each, not 2.' : 'Count all 6 code points at 3 bytes each.'),
    after: () => `The word has 6 code points × 3 bytes = ${M.ANSWERS.hindiBytes} bytes. With "the" and the space: 3 + 1 + 18 = ${M.bytes(M.SENTENCE).length} bytes.` },
  { id: 'split', phase: 'build', kicker: 'PRE-TOKENIZER', title: 'Split at boundaries', lead: 'Add the GPT-2 regex before counting pairs. A leading space belongs to the following word, and merges never cross a piece boundary.', minutes: 2, view: 'board',
    adds: add('tool', 'Pre-tokenizer', 'Hugging Face tokenizers', 'pre_tokenizers.ByteLevel(add_prefix_space=False, use_regex=True)'), closeLabel: 'CLOSE-UP · REGEX AND SPLIT', close: splitClose, mission: 'split',
    task: num('split', `How many pre-tokens are in “${M.SPLIT_EXAMPLE}”?`, v => v === 4 ? 'Splitting on spaces misses the contraction and punctuation.' : v === 6 ? 'Six misses the standalone extra space before “it”; the other space joins the word.' : 'Count the contraction, punctuation and the extra space; a leading space joins a word.'),
    after: () => `The regex produces ${M.ANSWERS.split} pieces: ${M.pretokenize(M.SPLIT_EXAMPLE).map(x => '[' + x.replace(/ /g, 'Ġ') + ']').join(' ')}. On the board, the vowel signs ् and े are not letters to the regex (\\p{L}), so they split off as their own pieces.` },
  { id: 'pairs', phase: 'build', kicker: 'TRAINING', title: 'Count adjacent pairs', lead: 'Count adjacent bytes inside each pre-token in the fixed corpus. Ties are resolved by byte order in this simulation.', minutes: 2, view: 'board',
    adds: add('chart', 'Pair counter', 'Python stdlib', 'Counter(p for w in words for p in zip(w, w[1:]))'), closeLabel: 'CLOSE-UP · TOP PAIRS', close: pairsClose, mission: 'pairs',
    task: ui => ui.choice({ prompt: 'Which pair occurs most often?', options: [['he', 'h + e', `h + e occurs ${M.TOP[1].count} times, fewer than the space followed by t (${M.TOP[0].count}).`], ['st', 'Ġ + t', null], ['ng', 'n + g', `n + g occurs ${M.TOP[2].count} times, fewer than space followed by t (${M.TOP[0].count}).`]], check: choice => CHECK.pairs({ choice }) }),
    after: () => `Ġ + t appears ${M.TOP[0].count} times; h + e appears ${M.TOP[1].count} times: ${M.TOP[0].count} > ${M.TOP[1].count}. Every " the", " to" and " tickets" adds one Ġ + t.` },
  { id: 'first', phase: 'build', kicker: 'MERGE', title: 'Apply the first merge', lead: 'Add the most frequent pair to the merge table and vocabulary. Replace every non-overlapping occurrence inside each pre-token.', minutes: 2, view: 'board',
    adds: add('key', 'Merge rank 0', 'merges.txt + vocab.json', 'merges.txt: "Ġ t"    vocab.json: "Ġt": 256'), closeLabel: 'CLOSE-UP · FIRST MERGE', close: firstClose, mission: 'first',
    task: num('firstCount', `The corpus starts with ${M.corpusCount(0)} byte tokens. How many remain after the first merge?`, v => v === M.corpusCount(0) ? 'Each occurrence of the pair removes one token.' : v === M.corpusCount(0) - 2 * M.TOP[0].count ? 'A merge turns two tokens into one, so each occurrence removes one token, not two.' : `Subtract the ${M.TOP[0].count} non-overlapping occurrences from the initial count.`),
    after: () => `${M.corpusCount(0)} − ${M.TOP[0].count} = ${M.ANSWERS.firstCount} tokens. The sentence has no Ġ + t, so its ${count(1)} tokens do not change yet.` },
  { id: 'learn', phase: 'build', kicker: 'TRAINING', title: 'Learn more merges', lead: 'Repeat counting and merging to grow the table. Find the smallest budget that brings the sentence below the target, and watch the token strip on the board.', minutes: 3, view: 'board',
    adds: g => add('loop', 'BPE trainer', 'Hugging Face tokenizers', `trainers.BpeTrainer(vocab_size=${256 + n(g)}, initial_alphabet=pre_tokenizers.ByteLevel.alphabet())`), closeLabel: 'CLOSE-UP · TOKENS VS MERGES', close: learnClose, mission: 'learn',
    task: (ui, g) => ui.sliders({ prompt: `Use the fewest merges to get below ${M.TARGET} tokens.`, sliders: [{ label: 'Merges', min: 0, max: M.MAX_MERGES, step: 1, get: () => n(g), set: v => g.settings.merges = v }], check: () => CHECK.learn({ merges: n(g) }) ? true : n(g) < M.ANSWERS.needed ? `${n(g)} merges leave ${count(n(g))} tokens; below ${M.TARGET} means at most ${M.TARGET - 1}.` : `${n(g)} merges work, but an earlier rank also reaches the target. Find the first drop below ${M.TARGET}.` }),
    onReveal: g => { g.settings.merges = M.ANSWERS.needed; g.saveSettings(); },
    after: g => `${M.ANSWERS.needed - 1} merges leave ${count(M.ANSWERS.needed - 1)} tokens; ${M.ANSWERS.needed} leave ${count(M.ANSWERS.needed)} because rank 34 (t + he) builds "the". Ranks 2 to 33 never match this sentence. ${M.bytes(M.SENTENCE).length} bytes ÷ ${count(n(g))} tokens = ${ratio(n(g))} bytes per token.` },
  { id: 'order', phase: 'build', kicker: 'ENCODING', title: 'Apply ranks to new text', lead: 'Add the ranked encoder. For the unseen pre-token “ them”, apply the lowest available rank first; the rank determines the order.', minutes: 2, view: 'board',
    adds: add('model', 'Ranked BPE encoder', 'Hugging Face tokenizers · ByteLevel configured above', 'tokenizer.encode(" them").tokens'), closeLabel: 'CLOSE-UP · NEW PRE-TOKEN', close: orderClose, mission: 'order',
    task: ui => ui.order({ prompt: 'Tap the merges that fire, in order.', items: [['r3', '3: Ġt + he'], ['r2', '2: n + g'], ['r0', '0: Ġ + t'], ['r1', '1: h + e']], order: M.ANSWERS.order, check: order => CHECK.order({ order }), why: { r3: 'Rank 3 needs the results of ranks 0 and 1 first.', r2: 'There is no n + g in this pre-token.', r1: 'Rank 0 is available and has the lower rank.' } }),
    after: () => 'Ranks 0, 1 and 3 reduce 5 byte tokens to 2: 5 − 1 − 1 − 1 = 2 (Ġthe and m). Rank 2 never matches, and rank 34 (t + he) cannot fire because t is already inside Ġt.' },
  { id: 'python', phase: 'build', kicker: 'IMPLEMENTATION', title: 'Implement ranked encoding', lead: 'Add an encoder that repeatedly finds the available pair with the lowest rank. Its inputs are a list of byte integers and an ordered list of pairs of tuples.', minutes: 4, view: 'bench',
    adds: add('code', 'Python encoder', 'your code', 'encode(word_bytes, merges) -> list[tuple[int, ...]]'),
    bench: (host, g) => pyCell(host, { id: 'bpe-encode', title: 'Python · ranked BPE', prompt: 'Return a list of tuples of byte integers. Each merge is a pair of tuples; merge the lowest-ranked available pair until none applies.', starter: 'def encode(word_bytes, merges):\n    tokens = [(b,) for b in word_bytes]\n    return tokens\n', tests: [
      "check('empty', encode([], []) == [], 'empty input stays empty')",
      "check('single byte', encode([97], []) == [(97,)], 'one byte is one tuple')",
      "check('basic merge', encode([97,98], [((97,),(98,))]) == [(97,98)], 'join the matching pair')",
      "check('unseen word', encode([120,97,98], [((97,),(98,))]) == [(120,),(97,98)], 'keep unmatched bytes')",
      "check('rank before position', encode([97,98,99], [((98,),(99,)),((97,),(98,))]) == [(97,),(98,99)], 'the lower ranked right-hand pair wins')",
      "check('non-overlapping repeats', encode([97,97,97,97,97], [((97,),(97,))]) == [(97,97),(97,97),(97,)], 'merge each non-overlapping pair and keep the last byte')",
    ].join('\n'), onPass: () => g.pass('python') }),
    mission: 'python',
    task: ui => ui.code({ prompt: 'Write encode() and run all six checks.', fallback: [['Repeat the lowest-ranked available pair until none applies', true], ['Merge the leftmost pair regardless of rank', false, 'A lower-ranked pair on the right must win.'], ['Merge only the most frequent pair in the new word', false, 'Encoding uses learned ranks, not fresh frequency counts.'], ['Merge across pre-token boundaries', false, 'The encoder works on one pre-token at a time.']] }),
    after: () => 'For a b c, if b + c has rank 0 and a + b has rank 1, rank 0 wins: 3 tokens − 1 merge = 2 tokens (a, bc). Stop when no adjacent pair has a learned rank.' },
  { id: 'decode', phase: 'build', kicker: 'DECODING', title: 'Buffer bytes before decoding', lead: 'Add an incremental UTF-8 decoder after vocabulary lookup. Each Hindi byte here is its own token, so a token boundary falls inside every Hindi character.', minutes: 2, view: 'board',
    adds: add('text', 'Byte decoder', 'tokenizers + Python stdlib', 'decoders.ByteLevel()  ·  codecs.getincrementaldecoder("utf-8")()'), closeLabel: 'CLOSE-UP · SPLIT CHARACTER', close: decodeClose, mission: 'decode',
    task: ui => ui.choice({ prompt: 'Why buffer these bytes before displaying text?', options: [['buffer', 'A token may end inside a UTF-8 character.', null], ['id', 'IDs must be sorted before decoding.', 'Sorting changes the text order.'], ['space', 'UTF-8 inserts a space between bytes.', 'UTF-8 uses byte sequences without added spaces.']], check: choice => CHECK.decode({ choice }) }),
    after: () => 'Token IDs 224, 164, 168 map to bytes e0, a4, a8. Only all three together encode न; decoding e0 alone gives �. The buffered decoder turns all 22 bytes back into the original text.' },
  { id: 'cost', phase: 'scale', kicker: 'TOKEN COUNTS', title: 'Compare language costs', lead: 'Compare the English word “the” and the Hindi word “नमस्ते” with the learned table. This fixed English corpus is a simulation, not a claim about production tokenizers.', minutes: 2, view: 'board',
    adds: add('chart', 'Token counter', 'Hugging Face tokenizers', 'len(tokenizer.encode(text).ids)'), closeLabel: 'CLOSE-UP · TOKEN COUNTS', close: costClose, mission: 'cost',
    task: (ui, g) => ui.number({ prompt: 'At the same price per token, the Hindi word costs how many times as much as the English word?', check: v => CHECK.cost({ value: v, merges: n(g) }),
      hint: v => v === 6 ? '6 counts code points. Divide the Hindi token count by the English token count.' : v === 2 ? 'That compares characters. Divide the Hindi token count by the English token count.' : 'Divide the Hindi token count by the English token count; compare tokens, not characters.' }),
    after: g => `${M.encode(M.HINDI, n(g)).length} ÷ ${M.encode('the', n(g)).length} = ${M.encode(M.HINDI, n(g)).length / M.encode('the', n(g)).length} times the cost at the same price per token. No merge learned from English covers a Devanagari byte pair, so every byte stays a token.` },
  { id: 'done', phase: 'done', kicker: 'BUILD COMPLETE', title: 'Keep your tokenizer', lead: 'Copy your learned merge order and vocabulary excerpt from this simulation. The text follows the GPT-2 merge-file convention; the byte IDs are our own. Use the checkpoint to test what you built.', view: 'board', task: 'done' },
];

createGuide({
  M, steps, board, init: g => { g.settings.merges ??= 0; },
  done: {
    stats: g => [['vocab size', 256 + n(g)], ['bytes/token', ratio(n(g))], ['merges', n(g)]],
    artifactTitle: 'merges.txt + vocab.json excerpt',
    artifact: g => `# merges.txt: one merge per line; the line order is the rank\n#version: 0.2\n${M.MERGES.slice(0, n(g)).map(m => `${display(m.a)} ${display(m.b)}`).join('\n')}\n\n# vocab.json excerpt (token → ID; IDs 0–255 are the raw bytes in this simulation)\n${JSON.stringify(Object.fromEntries([['Ġ', 32], ['t', 116], ['<e0>', 224], ...M.MERGES.slice(0, n(g)).map((m, i) => [display(m.into), 256 + i])]), null, 2)}`,
  },
});
