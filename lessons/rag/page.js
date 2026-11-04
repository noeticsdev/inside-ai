import * as M from './model.mjs';
import { createGuide, s, T_, pyCell, fmt, svgBox } from '../../platform/shell/guide-runtime.js';

// The board and every close-up draw from the same model calls: the words, the
// chunk windows, the store rows, the cosine ranking and the packed prompt.
let G;
const E = M.EXAMPLE;
const ok = (id) => G?.solved(id);
const cfg = () => G.settings.rag;
const ov = () => M.effOverlap(cfg().chunkSize, cfg().overlap);
const CH = 8.4; // mono advance at 14px

const rect = (x, y, w, hh, cls = 'hw-part', rx = 4) => s('rect', { x, y, width: w, height: hh, rx, class: cls });
const line = (x1, y1, x2, y2, cls = 'hw-detail') => s('line', { x1, y1, x2, y2, class: cls });
const path = (d, cls) => s('path', { d, class: cls });
const dot = (cx, cy) => s('circle', { cx, cy, r: 3.5, class: 'rag-dot' });
const text = (x, y, t, cls = 'rag-text', anchor) => T_(x, y, t, cls, anchor);
const group = (id, ctx, n, kids) => s('g', { class: `hw-grp ${ctx.fresh === n || ctx.on?.includes(id) ? 'is-on' : ''}` }, kids);

const QTEXT = { leave: 'How many vacation days per year?', twopart: 'Vacation days and dinner receipts?', unanswerable: 'What pay do parents of twins get?' };
const questionOf = (step) => (step.id === 'fix' ? 'twopart' : step.id === 'refuse' ? 'unanswerable' : 'leave');
const goldSpans = (question) => M.QUESTIONS[question].gold.map(M.factSpan);
const r3 = (x) => x.toFixed(3);

function wrap(str, max) {
  const out = [''];
  for (const w of str.split(' ')) {
    const j = out.length - 1;
    if ((out[j] + ' ' + w).trim().length > max) out.push(w);
    else out[j] += (out[j] ? ' ' : '') + w;
  }
  return out;
}

// One source page: its real words, the gold sentence highlighted, the chunk
// windows as brackets under the words, overlap hatched, and a red bar wherever
// a window boundary cuts the gold sentence.
function docPage(svg, doc, x, y, w, hh, o) {
  const words = M.wordsOf(doc.text), pos = [];
  const lh = 25;
  let px = x + 12, py = y + 48;
  for (const word of words) {
    const ww = word.length * CH;
    if (px + ww > x + w - 10) { px = x + 12; py += lh; }
    pos.push({ x: px, y: py, w: ww });
    px += ww + CH;
  }
  svg.append(rect(x, y, w, hh, 'hw-part'), text(x + 12, y + 22, doc.title.toUpperCase(), 'rag-title'), text(x + w - 12, y + 22, `${doc.id}.md`, 'rag-muted', 'end'));
  const spans = (o.gold || []).filter((g) => g.doc === doc.id);
  for (const g of spans) for (let i = g.start; i < g.end; i++) {
    const p = pos[i], last = i === g.end - 1 || pos[i + 1].y !== p.y;
    svg.append(rect(p.x - 3, p.y - 15, p.w + (last ? 6 : CH + 3), 21, 'rag-gold', 2));
  }
  for (const [i, word] of words.entries()) svg.append(text(pos[i].x, pos[i].y, word, 'rag-text'));
  if (!o.windows) return;
  const wins = M.windows(doc, o.size, o.overlap);
  for (let j = 1; j < wins.length; j++) {
    for (let i = wins[j][0]; i < wins[j - 1][1]; i++) {
      const p = pos[i];
      for (let dx = 0; dx < p.w; dx += 5) svg.append(line(p.x + dx, p.y + 12, p.x + dx + 4, p.y + 6, 'rag-hatch'));
    }
  }
  wins.forEach(([a0, end], j) => {
    let a = a0;
    while (a < end) {
      let b = a + 1;
      while (b < end && pos[b].y === pos[a].y) b++;
      const p = pos[a], q = pos[b - 1], yy = p.y + 6 + (j % 2) * 4;
      const left = a === a0 ? `M${p.x - 2} ${yy - 5}V${yy}` : `M${p.x - 2} ${yy}`;
      const right = b === end ? `H${q.x + q.w + 2}V${yy - 5}` : `H${q.x + q.w + 2}`;
      svg.append(path(left + right, j % 2 ? 'rag-window-alt' : 'rag-window'));
      a = b;
    }
  });
  // A window boundary inside a gold sentence splits it.
  for (const g of spans) {
    const cuts = new Set();
    for (const [a, b] of wins) { if (a > g.start && a < g.end) cuts.add(a); if (b > g.start && b < g.end) cuts.add(b); }
    for (const c of cuts) { const p = pos[c]; svg.append(line(p.x - CH / 2, p.y - 18, p.x - CH / 2, p.y + 14, 'rag-split')); }
  }
}

function ghost(x, y, w, hh, title, note, n) {
  return [rect(x, y, w, hh, 'rag-ghost', 6), text(x + 16, y + 26, title, 'rag-ghost-t'), text(x + w - 16, y + 26, `added in step ${n}`, 'rag-ghost-t', 'end'), ...note.map((t, i) => text(x + 16, y + 54 + i * 22, t, 'rag-muted'))];
}

function factLine(f, retrievalBuilt, k) {
  if (!f.whole) return [`✗ ${f.name} (${f.words} words) split: ${M.idList(f.parts)}`, 'rag-bad'];
  if (!retrievalBuilt) return [`✓ ${f.name} (${f.words} words) whole in ${f.whole}`, 'rag-ok'];
  if (!f.retrieved) return [`✗ ${f.name}: ${f.whole} ranks ${f.rank}, top-k is ${k}`, 'rag-bad'];
  return [`✓ ${f.name}: whole in ${f.whole}, rank ${f.rank}`, 'rag-ok'];
}

function contextParts(question) {
  const c = cfg(), hits = M.retrieve(question, c.chunkSize, c.overlap, c.k);
  return [['system', E.system, 'sys'], ['question', E.question, 'q'], ...hits.map((r) => [r.id, E.chunkTokens, r.id, r]), ['reserve', E.reserve, 'reserve']];
}

function board(ctx) {
  const { built, step } = ctx, c = cfg(), question = questionOf(step);
  const rows = M.store(c.chunkSize, c.overlap), ranked = M.ranked(question, c.chunkSize, c.overlap);
  const facts = M.factStatus(question, c.chunkSize, c.overlap, c.k), gold = goldSpans(question), golds = M.QUESTIONS[question].gold;
  const svg = s('svg', { viewBox: '0 0 1000 600', role: 'img', 'aria-label': 'RAG pipeline on six handbook pages: chunk windows over the words, the vector store, cosine ranking, the packed context window and the cited answer' });
  svg.append(rect(8, 8, 984, 584, 'hw-chassis', 10), text(24, 34, 'RAG PIPELINE · HANDBOOK Q&A · SIMULATION', 'rag-heading'));

  // Left column: the source pages, the fact status and the question.
  svg.append(text(24, 64, 'SOURCE DOCUMENTS', 'rag-title'), text(384, 64, '2 of 6 shown', 'rag-muted', 'end'));
  const pageOpts = { gold, windows: built >= 1, size: c.chunkSize, overlap: ov() };
  docPage(svg, M.DOCS[0], 24, 74, 360, 144, pageOpts);
  docPage(svg, M.DOCS[1], 24, 228, 360, 144, pageOpts);
  if (built >= 1) {
    const st = facts.map((f) => factLine(f, built >= 3, c.k));
    svg.append(group('chunk', ctx, 1, [
      text(24, 398, `size ${c.chunkSize} · overlap ${ov()} → ${rows.length} chunks`, 'rag-accent'),
      ...(st.length ? st.map(([t, cls], i) => text(24, 422 + i * 21, t, cls)) : [text(24, 422, '✗ no page states the answer', 'rag-bad')]),
    ]));
  } else {
    svg.append(text(24, 398, 'Highlight: the sentence that answers.', 'rag-muted'), text(24, 420, 'Pages are not cut into chunks yet.', 'rag-muted'));
  }
  svg.append(text(24, 474, 'QUESTION', 'rag-title'), text(24, 496, QTEXT[question], 'rag-text'));

  // Right column, top: the vector store.
  if (built >= 2) {
    const kids = [rect(410, 46, 566, 216, 'hw-part'), text(426, 68, 'VECTOR STORE · 64 dims', 'rag-title'), text(960, 68, ok('embed') ? `${rows.length} rows${rows.length > 6 ? ' · 6 shown' : ''}` : '? rows', 'rag-muted', 'end'), line(426, 78, 960, 78),
      text(426, 98, 'id', 'rag-muted'), text(536, 98, 'chunk text', 'rag-muted'), text(806, 98, 'dims 0–15', 'rag-muted')];
    const top = new Set(built >= 3 ? ranked.slice(0, c.k).map((r) => r.id) : []);
    const drawVec = (vec, y, cls) => { kids.push(line(806, y + 2, 950, y + 2, 'rag-axis')); vec.slice(0, 16).forEach((v, j) => { if (v) kids.push(rect(807 + j * 9, y + 2 - Math.min(v, 3) * 4.5, 6, Math.min(v, 3) * 4.5, cls, 0)); }); };
    rows.slice(0, 6).forEach((r, i) => {
      const y = 120 + i * 21;
      if (top.has(r.id)) kids.push(rect(418, y - 15, 550, 20, 'rag-row-on', 2));
      kids.push(text(426, y, r.id, 'rag-text'), text(536, y, r.text.split(' ').slice(0, 3).join(' ').slice(0, 30), 'rag-text'));
      drawVec(r.vec, y, 'rag-bar-dark');
    });
    if (built >= 3) { kids.push(line(426, 237, 960, 237, 'rag-axis'), text(426, 254, 'query', 'rag-accent'), text(536, 254, 'the question, embedded', 'rag-muted')); drawVec(M.embed(M.QUESTIONS[question].text), 252, 'rag-bar-q'); }
    svg.append(group('embed', ctx, 2, kids));
  } else svg.append(...ghost(410, 46, 566, 216, 'VECTOR STORE', ['one row per chunk:', 'chunk id · its text · 64 numbers'], 2));

  // Right column, middle: the ranking with the top-k cut.
  if (built >= 3) {
    const kids = [rect(410, 272, 566, 158, 'hw-part'), text(426, 294, 'RETRIEVER · cosine(query, row)', 'rag-title'), text(960, 294, `top-k = ${c.k}`, 'rag-accent', 'end')];
    ranked.slice(0, 7).forEach((r, i) => {
      const y = 316 + i * 17, whole = golds.some((f) => r.text.includes(f));
      const part = !whole && facts.some((f) => !f.whole && f.parts.includes(r.id));
      kids.push(text(426, y, r.id, whole ? 'rag-accent' : 'rag-text'), rect(536, y - 10, Math.max(1.5, 280 * r.score), 11, i < c.k ? 'rag-bar-active' : 'rag-bar', 0), text(826, y, r.score.toFixed(2), 'rag-text'));
      if (whole) kids.push(text(960, y, 'whole fact', 'rag-accent', 'end'));
      else if (part) kids.push(text(960, y, 'part only', 'rag-bad', 'end'));
      if (i === c.k - 1) kids.push(path(`M418 ${y + 4.5}H968`, 'rag-cut'));
    });
    svg.append(group('retrieve', ctx, 3, kids));
  } else svg.append(...ghost(410, 272, 566, 158, 'RETRIEVER', ['a cosine score for every row,', 'sorted high to low, cut at top-k'], 3));

  // Right column, bottom: the context window to scale.
  if (built >= 5) {
    const parts = contextParts(question), total = parts.reduce((a, p) => a + p[1], 0), over = total > E.window, sc = 440 / E.window, end = 426 + E.window * sc;
    const kids = [rect(410, 440, 566, 138, over ? 'rag-over' : 'hw-part'), text(426, 462, 'CONTEXT WINDOW', 'rag-title'), text(960, 462, ok('pack') ? `${total} / ${E.window} tokens` : `? / ${E.window} tokens`, over ? 'rag-bad' : 'rag-text', 'end')];
    let x = 426;
    for (const [i, [, n, label]] of parts.entries()) {
      const w = n * sc, past = x + w > end + 0.1;
      kids.push(rect(x, 478, w, 30, past ? 'rag-seg-over' : i === parts.length - 1 ? 'rag-reserve' : i < 2 ? 'rag-bar' : 'rag-bar-active', 0), text(x + w / 2, 498, String(n), 'rag-small', 'middle'), text(x + w / 2, 528, label, past ? 'rag-seg-bad' : 'rag-seg', 'middle'));
      x += w;
    }
    kids.push(line(end, 470, end, 516, 'rag-limit'), text(end + 6, 482, `${E.window}`, 'rag-seg'));
    if (ok('pack')) kids.push(text(426, 554, `${E.system} + ${E.question} + ${parts.length - 3} × ${E.chunkTokens} + ${E.reserve} reserve = ${total}`, 'rag-text'), text(426, 572, over ? `over by ${total - E.window}: top-k ${c.k} eats the answer reserve` : `prompt ${total - E.reserve} tokens · ${E.window - total} spare`, over ? 'rag-bad' : 'rag-muted'));
    else kids.push(text(426, 558, 'fixed example: 30 tokens per chunk', 'rag-muted'));
    svg.append(group('pack', ctx, 5, kids));
  } else svg.append(...ghost(410, 440, 566, 138, 'PROMPT PACKER', [`a ${E.window}-token window: system, question,`, 'chunks, and room kept for the answer'], 5));

  // Left column, bottom: the answer card and its citation leader.
  if (built >= 6) {
    const refuse = step.id === 'refuse', cited = M.factStatus('leave', c.chunkSize, c.overlap, 4)[0].whole;
    const solved = refuse ? ok('refuse') : ok('cite');
    const tag = refuse ? (solved ? 'none' : '?') : solved ? cited : '?';
    const tw = tag.length * CH + 26;
    const kids = [rect(24, 508, 360, 72, 'hw-part'), text(36, 530, 'ANSWER', 'rag-title'), text(102, 530, 'scripted', 'rag-muted'),
      rect(372 - tw, 514, tw, 24, refuse && solved ? 'rag-tag-bad' : 'rag-tag', 3), text(372 - tw / 2, 531, `[${tag}]`, refuse && solved ? 'rag-bad' : 'rag-accent', 'middle'),
      text(36, 556, refuse ? (solved ? 'The handbook does not say.' : '?') : M.GOLDS.leave[0], 'rag-text'),
      text(36, 574, refuse ? (solved ? 'no chunk mentions pay or twins' : '') : 'copied from the packed chunk', 'rag-muted')];
    const idx = rows.findIndex((r) => r.id === cited);
    if (!refuse && solved && idx >= 0 && idx < 6) {
      const ry = 115 + idx * 21;
      kids.push(rect(418, ry - 10, 550, 20, 'rag-row-cite', 2), path(`M372 526H397V${ry}H418`, 'rag-citation'), dot(372, 526), dot(418, ry));
    }
    svg.append(group(refuse ? 'refuse' : 'cite', ctx, refuse ? 8 : 6, kids));
  } else svg.append(...ghost(24, 508, 360, 72, 'ANSWER + CITATION', [], 6));
  return svg;
}

// ---------- close-ups ----------
function closeWindows(question = 'leave') {
  const c = cfg(), svg = svgBox(900, 228, 'The two pages with their chunk windows, overlap and the answer sentence');
  const o = { gold: goldSpans(question), windows: true, size: c.chunkSize, overlap: ov() };
  docPage(svg, M.DOCS[0], 4, 4, 440, 150, o);
  docPage(svg, M.DOCS[1], 456, 4, 440, 150, o);
  const y = 184;
  svg.append(path(`M8 ${y - 5}V${y}H40V${y - 5}`, 'rag-window'), text(48, y + 2, 'one chunk window', 'cu-t'));
  for (let dx = 0; dx < 30; dx += 5) svg.append(line(200 + dx, y + 2, 204 + dx, y - 4, 'rag-hatch'));
  svg.append(text(238, y + 2, 'overlap (in two windows)', 'cu-t'), rect(456, y - 12, 32, 18, 'rag-gold', 2), text(496, y + 2, 'answer sentence', 'cu-t'), line(652, y - 12, 652, y + 6, 'rag-split'), text(662, y + 2, 'window cuts the sentence', 'cu-t'));
  const counts = M.DOCS.slice(0, 2).map((d) => `${d.id}: ${M.wordsOf(d.text).length} words → ${M.windows(d, c.chunkSize, ov()).length} chunk(s)`).join('  ·  ');
  svg.append(text(8, 216, `size ${c.chunkSize}, overlap ${ov()}, stride ${c.chunkSize - ov()}  ·  ${counts}`, 'cu-t-m'));
  return svg;
}

function closeEmbed() {
  const c = cfg(), row = M.store(c.chunkSize, c.overlap)[0], svg = svgBox(900, 222, `The 64-number vector of ${row.id}, and which bucket each word lands in`);
  svg.append(text(8, 18, `${row.id} → embed() → 64 counts, one bar per bucket`, 'cu-t-b'), text(892, 18, `float32 × 64 = 256 bytes`, 'cu-t-m', 'end'));
  const base = 112;
  svg.append(line(8, base, 892, base, 'cu-axis'));
  row.vec.forEach((v, i) => {
    const x = 12 + i * 13.7;
    if (v) svg.append(rect(x, base - v * 20, 9, v * 20, 'cu-pk-m', 0), text(x + 4.5, base - v * 20 - 5, String(v), 'cu-t-a', 'middle'));
    else svg.append(rect(x, base - 2, 9, 2, 'cu-pk', 0));
    if (i % 8 === 0 || i === 63) svg.append(text(x + 4.5, base + 16, String(i), 'cu-t-m', 'middle'));
  });
  const words = M.buckets(row.text);
  let x = 8, y = 156;
  svg.append(text(8, 146, 'word → bucket (FNV-1a hash mod 64, stopwords dropped) · accent = two words share a bucket', 'cu-t-m'));
  for (const [w, d] of words) {
    const label = `${w}→${d}`, ww = label.length * 7.8 + 12;
    if (x + ww > 892) { x = 8; y += 26; }
    const clash = words.some(([w2, d2]) => d2 === d && w2 !== w);
    svg.append(rect(x, y, ww, 20, clash ? 'cu-pk-new' : 'cu-bits', 3), text(x + 6, y + 14, label, clash ? 'cu-t-a' : 'cu-t'));
    x += ww + 6;
  }
  return svg;
}

function closeScores(question) {
  const c = cfg(), rows = M.ranked(question, c.chunkSize, c.overlap), shown = rows, golds = M.QUESTIONS[question].gold;
  const facts = M.factStatus(question, c.chunkSize, c.overlap, c.k);
  const svg = svgBox(900, 50 + shown.length * 24, 'Every chunk ranked by cosine similarity to the question, with the top-k cut');
  svg.append(text(8, 18, `"${M.QUESTIONS[question].text}"`, 'cu-t-b'), text(892, 18, `${rows.length} rows · top-k ${c.k}`, 'cu-t-m', 'end'));
  shown.forEach((r, i) => {
    const y = 44 + i * 24, whole = golds.some((f) => r.text.includes(f)), part = !whole && facts.some((f) => !f.whole && f.parts.includes(r.id));
    svg.append(text(8, y, r.id, whole ? 'cu-t-a' : 'cu-t'), rect(120, y - 11, Math.max(2, 480 * r.score), 13, i < c.k ? 'cu-pk-m' : 'cu-bits', 0), text(610, y, r.score.toFixed(3), 'cu-t'), text(672, y, wrap(r.text, whole || part ? 14 : 26)[0], 'cu-t-m'));
    if (whole) svg.append(text(892, y, 'whole fact', 'cu-t-a', 'end'));
    else if (part) svg.append(text(892, y, 'part only', 'cu-t-bad', 'end'));
    if (i === c.k - 1) svg.append(path(`M4 ${y + 6}H896`, 'rag-cut'));
  });
  return svg;
}

function closePack() {
  const parts = contextParts('leave'), total = parts.reduce((a, p) => a + p[1], 0), sc = 250 / Math.max(E.window, total);
  const bodies = { system: M.PROMPT_LINE, question: M.QUESTIONS.leave.text, reserve: '(empty: the model writes the answer here)' };
  const body = (name, r) => wrap(r ? r.text : bodies[name], 62);
  const hs = parts.map(([name, , , r]) => 16 + Math.min(2, body(name, r).length) * 17);
  const svg = svgBox(900, 52 + hs.reduce((a, n) => a + n + 6, 0), 'The packed prompt, part by part, with token counts to scale');
  svg.append(text(8, 16, 'tokens, to scale', 'cu-t-m'), text(280, 16, 'what the model reads, in order', 'cu-t-m'));
  let y = 26, acc = 0;
  parts.forEach(([name, n, , r], i) => {
    const all = body(name, r), lines = all.slice(0, 2), hh = hs[i], past = acc + n > E.window;
    svg.append(rect(8 + acc * sc, y, n * sc, hh, past ? 'rag-seg-over' : i === parts.length - 1 ? 'rag-reserve' : i < 2 ? 'cu-bits' : 'cu-bits-on', 0), text(8 + (acc + n / 2) * sc, y + hh / 2 + 5, String(n), 'cu-t-b', 'middle'));
    svg.append(text(280, y + 15, r ? `CHUNK ${i - 1}` : name.toUpperCase(), past ? 'cu-t-bad' : 'cu-t-b'), r ? text(280, y + 32, r.id, 'cu-t-a') : text(280, y + 32, '', 'cu-t'));
    lines.forEach((l, j) => svg.append(text(400, y + 15 + j * 17, j === 1 && all.length > 2 ? `${l} …` : l, 'cu-t')));
    acc += n;
    y += hh + 6;
  });
  const lx = 8 + E.window * sc;
  svg.append(line(lx, 22, lx, y, 'rag-limit'), text(lx, y + 16, `window ends at ${E.window}`, 'cu-t-m', 'middle'), text(892, y + 16, ok('pack') ? `${total} of ${E.window} tokens used` : `? of ${E.window} tokens used`, total > E.window ? 'cu-t-bad' : 'cu-t-a', 'end'));
  return svg;
}

function closeCite() {
  const c = cfg(), id = M.factStatus('leave', c.chunkSize, c.overlap, 4)[0].whole, row = M.store(c.chunkSize, c.overlap).find((r) => r.id === id);
  const svg = svgBox(900, 150, 'The answer sentence and the chunk it is copied from');
  svg.append(rect(4, 10, 360, 72, 'cu-bits-on', 4), text(16, 32, 'ANSWER · scripted', 'cu-t-b'), text(352, 32, ok('cite') ? `[${id}]` : '[ ? ]', 'cu-t-a', 'end'), text(16, 62, M.GOLDS.leave[0], 'cu-t'));
  svg.append(path('M364 46H420', 'rag-citation'), dot(364, 46), dot(420, 46));
  const words = M.wordsOf(row.text), span = M.factSpan(M.GOLDS.leave[0]);
  svg.append(rect(420, 10, 476, 132, 'cu-bits', 4), text(432, 32, `CHUNK ${ok('cite') ? id : '?'} · ${row.words} words`, 'cu-t-b'));
  let x = 432, y = 60;
  words.forEach((w, i) => {
    const ww = w.length * 7.8;
    if (x + ww > 884) { x = 432; y += 25; }
    if (i >= span.start && i < span.end) svg.append(rect(x - 2, y - 13, ww + 4 + (i < span.end - 1 ? 7.8 : 0), 19, 'rag-gold', 2));
    svg.append(text(x, y, w, 'cu-t'));
    x += ww + 7.8;
  });
  svg.append(text(8, 110, 'A citation is checkable: the cited chunk', 'cu-t-m'), text(8, 128, 'holds the sentence word for word.', 'cu-t-m'));
  return svg;
}

function closeRefuse() {
  const ex = M.explainScore('unanswerable'), svg = svgBox(900, 196, 'Why the top chunk scores 0.600: question words, their buckets and the chunk words in the same bucket');
  svg.append(text(8, 18, `"${M.QUESTIONS.unanswerable.text}"  vs  ${ex.id}, the top hit`, 'cu-t-b'));
  ex.dims.forEach((d, i) => {
    const x = 8 + i * 224, real = d.cWords.includes(d.qWords[0]), hit = d.c > 0;
    svg.append(rect(x, 30, 212, 96, hit ? 'cu-bits-on' : 'cu-bits', 4), text(x + 12, 52, d.qWords.join(', '), 'cu-t-b'), text(x + 200, 52, `bucket ${d.dim}`, 'cu-t-m', 'end'));
    svg.append(text(x + 12, 76, hit ? d.cWords.join(', ') : 'no chunk word', hit ? 'cu-t' : 'cu-t-m'), text(x + 12, 100, `${d.q} × ${d.c} = ${d.q * d.c}`, 'cu-t-b'), text(x + 200, 100, !hit ? '' : real ? 'same word' : 'collision', real ? 'cu-t-a' : 'cu-t-bad', 'end'));
  });
  svg.append(text(8, 150, `cosine = (${ex.dims.map((d) => d.q * d.c).join(' + ')}) / (|q| ${ex.qn} × |${ex.id}| ${ex.cn}) = ${ex.dot} / ${ex.qn * ex.cn} = ${r3(ex.score)}`, 'cu-t'));
  svg.append(rect(8, 162, 560, 28, ok('refuse') ? 'cu-bits-on' : 'cu-bits', 3), text(20, 181, ok('refuse') ? 'guard: no chunk states the pay → "The handbook does not say."' : 'guard: ?', ok('refuse') ? 'cu-t-a' : 'cu-t'));
  return svg;
}

function closeCost() {
  const done = ok('cost'), svg = svgBox(900, 200, 'The token bill for one question, as an itemised receipt');
  const rx = 250, rw = 400;
  let top = `M${rx} 8`;
  for (let i = 1; i <= 20; i++) top += `L${rx + i * 20} ${i % 2 ? 4 : 8}`;
  let bottom = `L${rx + rw} 192`;
  for (let i = 19; i >= 0; i--) bottom += `L${rx + i * 20} ${i % 2 ? 196 : 192}`;
  svg.append(path(`${top}${bottom}Z`, 'rag-receipt'), text(rx + rw / 2, 32, 'ONE QUESTION · EXAMPLE PRICES', 'cu-t-b', 'middle'), line(rx + 16, 44, rx + rw - 16, 44, 'rag-dash'));
  const items = [['input', `${E.input} tok × $${E.inputPrice} / M`, (E.input * E.inputPrice) / 1e6], ['output', `${E.output} tok × $${E.outputPrice} / M`, (E.output * E.outputPrice) / 1e6]];
  items.forEach(([a, b, v], i) => {
    const y = 74 + i * 30;
    svg.append(text(rx + 16, y, a, 'cu-t-b'), text(rx + 90, y, b, 'cu-t'), text(rx + rw - 16, y, done ? `$${v.toFixed(5)}` : '$ ?', 'cu-t', 'end'));
  });
  svg.append(line(rx + 16, 140, rx + rw - 16, 140, 'rag-dash'), text(rx + 16, 166, 'TOTAL', 'cu-t-b'), text(rx + rw - 16, 166, done ? `$${M.ANSWERS.cost.toFixed(5)}` : '$ ?', 'cu-t-a', 'end'));
  svg.append(text(8, 74, 'input = system, question', 'cu-t-m'), text(8, 92, 'and packed chunks', 'cu-t-m'), text(892, 74, 'output = the answer', 'cu-t-m', 'end'), text(892, 92, 'priced 4× input here', 'cu-t-m', 'end'));
  return svg;
}

// ---------- steps ----------
const base = (id, title, lead, add, extra) => ({ id, phase: 'build', kicker: 'Build', title, lead, minutes: 2, view: 'board', adds: typeof add === 'function' ? (g) => [add(g)] : add, ...extra });
const num = (prompt, answer, hint) => (ui) => ui.number({ prompt, placeholder: 'answer', check: (v) => v === answer, hint: () => hint });
const choice = (prompt, options, answer) => (ui) => ui.choice({ prompt, options, check: (id) => id === answer });
const exLeave = M.explainScore('leave'), exNone = M.explainScore('unanswerable');
const fixAfter = () => {
  const c = cfg(), st = M.factStatus('twopart', c.chunkSize, c.overlap, c.k);
  return `With ${c.chunkSize}-word windows the ${st[0].words}-word leave fact sits whole in <b>${st[0].whole}</b> (rank ${st[0].rank}) and the ${st[1].words}-word dinner fact in <b>${st[1].whole}</b> (rank ${st[1].rank}). Top-${c.k} takes both. Small windows can score high on one shared word, but they cut the sentence, and the retriever cannot join the pieces back.`;
};

const steps = [
  { id: 'kit', phase: 'kit', kicker: 'The kit', title: 'Build a RAG pipeline', lead: 'Six short handbook pages and one question: how many vacation days do staff get? The answer is one highlighted sentence. You will build the path that finds it, packs it into a 160-token prompt and cites it.', minutes: 1, view: 'board', parts: () => [{ title: 'Handbook pages', n: '6' }, { title: 'Question', n: 'vacation days?' }, { title: 'Context window', n: '160 tokens' }], task: 'predict' },
  base('chunk', 'Chunk the documents', 'Cut each page into word windows. Overlap repeats the last words of one window at the start of the next, so a sentence near a boundary can stay whole. The brackets on the board are the real windows over the real words.',
    [{ glyph: 'doc', name: 'Word-window chunker', runs: 'whitespace split · size 24 · overlap 6', conf: 'step = 24 - 6\nchunks = [words[i:i+24] for i in range(0, len(words), step)]' }],
    { close: () => closeWindows('leave'), closeLabel: 'CLOSE-UP · CHUNK WINDOWS', closeHint: 'the two pages, word by word', mission: 'chunk', on: ['chunk'],
      task: num('A 100-word document uses size 24 and overlap 4. How many chunks?', M.ANSWERS.chunks, 'With no overlap the stride would be 24, but each window re-uses 4 words, so the stride is 24 − 4 = 20. The last window must still reach word 100: round up.'),
      after: () => 'Stride = 24 − 4 = 20. Windows start at words 0, 20, 40, 60 and 80; the fifth covers 80–100. (100 − 4) / 20 = 4.8, round up to <b>5 chunks</b>. On the board each page is 20 or 21 words, so size 24 gives one chunk per page.' }),
  base('embed', 'Embed and store', 'Turn each chunk into a vector and store it next to its id. This simulation hashes each word into one of 64 buckets and counts; a trained model such as sentence-transformers outputs 384 or more learned dimensions. FAISS keeps the vectors as float32.',
    [{ glyph: 'db', name: 'faiss.IndexFlatIP(64)', runs: 'inner product on unit vectors = cosine', conf: 'vecs = embed(chunks)       # 6 × 64 float32\nfaiss.normalize_L2(vecs)\nindex = faiss.IndexFlatIP(64)\nindex.add(vecs)' }],
    { close: closeEmbed, closeLabel: 'CLOSE-UP · ONE VECTOR', closeHint: 'leave#1, all 64 buckets', mission: 'embed', on: ['embed'],
      task: num('Six chunks each have 64 float32 values. How many bytes for the vectors alone?', M.ANSWERS.bytes, '384 is the number of values (6 × 64), not bytes. Each float32 takes 4 bytes: multiply by 4.'),
      after: () => `6 × 64 × 4 = <b>${fmt(M.ANSWERS.bytes)} bytes</b>. Ids, text and index overhead are extra. In the close-up, "vacation" and "days" land in the same bucket, 10: a hash collision.` }),
  base('retrieve', 'Retrieve the nearest chunks', 'Embed the question with the same function and score every row by cosine similarity. The rows are sorted and cut at top-k. A high score means shared buckets, not proof that the chunk answers.',
    [{ glyph: 'vector', name: 'index.search', runs: 'scores every row, keeps the top k', conf: 'q = embed([question]); faiss.normalize_L2(q)\nscores, ids = index.search(q, k=1)' }],
    { close: () => closeScores('leave'), closeLabel: 'CLOSE-UP · RANKING', closeHint: 'every row, cosine to the question', mission: 'retrieve', on: ['retrieve'],
      task: choice('Which chunk ranks first for the vacation question?', [['hybrid#1', 'hybrid#1', `hybrid#1 scores ${r3(M.retrieve('leave')[1].score)}: it shares only "days" with the question. leave#1 shares vacation, days, staff, get and year.`], ['leave#1', 'leave#1', null], ['laptop#1', 'laptop#1', `laptop#1 scores ${r3(M.explainScore('leave', 24, 6, 'laptop#1').score)}, and only through hash collisions ("new" lands in the bucket of "staff").`]], M.ANSWERS.first),
      after: () => `<b>${M.ANSWERS.first}</b>: dot = 2 × 3 (vacation, days in bucket 10) + staff + get + year = ${exLeave.dot}. |q| = √8 = ${exLeave.qn.toFixed(2)}, |leave#1| = ${exLeave.cn}. Cosine = ${exLeave.dot} / (${exLeave.qn.toFixed(2)} × ${exLeave.cn}) = <b>${r3(exLeave.score)}</b>. hybrid#1 is next at ${r3(M.retrieve('leave')[1].score)}.` }),
  base('fix', 'Fix a retrieval miss', 'A two-part question needs the leave fact and the dinner fact, each whole inside a retrieved chunk. The board starts with 6-word windows and top-1, and red bars show both sentences cut. Move the three sliders until both facts are whole and above the top-k cut.',
    () => { const c = cfg(); return { glyph: 'doc', name: 'Chunk and search settings', runs: 're-chunk, re-embed, re-search', conf: `chunk_size = ${c.chunkSize}\noverlap = ${ov()}\nscores, ids = index.search(q, k=${c.k})` }; },
    { close: () => closeScores('twopart'), closeLabel: 'CLOSE-UP · RANKING', closeHint: 'two-part question, your settings', mission: 'fix', on: ['chunk', 'retrieve'],
      enter: (g) => { const c = g.settings.rag; if (!g.solved('fix') && !c.fixStarted) { Object.assign(c, M.FIX_START, { fixStarted: true }); g.saveSettings(); } },
      onReveal: () => Object.assign(cfg(), { chunkSize: 24, overlap: 6, k: 2 }),
      task: (ui) => ui.sliders({ prompt: 'Get both complete facts into the top-k.', sliders: [['chunkSize', 'chunk size', 6, 24, 6], ['overlap', 'overlap', 0, 6, 3], ['k', 'top-k', 1, 4, 1]].map(([key, label, min, max, step]) => ({ label, min, max, step, get: () => cfg()[key], set: (v) => { cfg()[key] = v; } })), check: () => M.fixHint(cfg()) }),
      after: fixAfter }),
  base('pack', 'Pack the prompt', 'The model reads one window of 160 tokens. Keep 40 for the answer first, then fit the system line, the question and as many retrieved chunks as the rest allows. These token counts are fixed simulation values, not tokenizer output.',
    [{ glyph: 'text', name: 'Prompt packer', runs: 'fills the window, keeps the answer reserve', conf: 'context_window = 160\nmax_new_tokens = 40     # answer reserve\nbudget = 160 - 20 - 10 - 40   # system, question' }],
    { close: closePack, closeLabel: 'CLOSE-UP · PACKED PROMPT', closeHint: 'your top-k chunks, in order', mission: 'pack', on: ['pack'],
      task: num('What is the largest whole number of 30-token chunks that fits?', M.ANSWERS.pack, '4 chunks would be 120 tokens, but the window also holds 20 system + 10 question + 40 reserve. Subtract those first: 160 − 70 = 90 left. How many 30s fit in 90?'),
      after: () => `160 − 20 − 10 − 40 = 90; 90 / 30 = <b>3 chunks</b>. Three chunks make a ${M.promptTokens(3)}-token prompt and leave exactly 40 for the answer. At top-k 4 the bar turns red: the fourth chunk would eat the reserve.` }),
  base('cite', 'Cite the supporting chunk', 'The scripted answer copies one sentence from the packed evidence. Tag it with the id of the chunk that holds that sentence word for word, so a reader can check it.',
    [{ glyph: 'tag', name: 'Citation formatter', runs: 'answer sentence + source chunk id', conf: 'answer = f"{sentence} [{hit.id}]"' }],
    { close: closeCite, closeLabel: 'CLOSE-UP · CITATION', closeHint: 'the answer and its source chunk', mission: 'cite', on: ['cite'],
      task: choice('Which chunk supports the vacation sentence?', [['expenses#1', 'expenses#1', 'expenses#1 is about dinner receipts. It was packed for the two-part question, but it has no vacation sentence.'], ['leave#1', 'leave#1', null], ['hybrid#1', 'hybrid#1', 'hybrid#1 ranks second and mentions days at home, not vacation days. Related is not supporting.']], M.ANSWERS.citation),
      after: () => `"Staff get 25 vacation days per year." appears word for word in <b>[${M.ANSWERS.citation}]</b>. The board draws the leader from the answer to that row of the vector store.` }),
  { id: 'python', phase: 'build', kicker: 'Build', title: 'Write the ranking function', lead: 'Write the retriever yourself: cosine similarity, sorted high to low, cut at k. The cell uses three 2-number vectors so you can check every score by hand.', minutes: 4, view: 'bench', adds: [{ glyph: 'vector', name: 'retrieve(q_vec, store, k)', runs: 'Python, stdlib only', conf: 'cos = dot(q, v) / (|q| * |v|)' }],
    bench: (host) => pyCell(host, { id: 'rag-retrieve', title: 'Python · retrieve', prompt: 'Return ids ordered by descending cosine similarity. Break ties by id; return at most k ids. Zero vectors score zero.', starter: 'def retrieve(q_vec, store, k):\n    return []\n', data: { store: [{ id: 'a', vec: [1, 0] }, { id: 'b', vec: [0, 1] }, { id: 'c', vec: [1, 1] }] }, tests: ["check('rank', retrieve([1,0], DATA['store'], 2) == ['a','c'], 'rank by cosine')", "check('other axis', retrieve([0,1], DATA['store'], 1) == ['b'], 'compare direction')", "check('all', len(retrieve([1,0], DATA['store'], 9)) == 3, 'return only available rows')", "check('zero k', retrieve([1,0], DATA['store'], 0) == [], 'zero k returns nothing')", "check('zero vector ties', retrieve([0,0], DATA['store'], 2) == ['a','b'], 'zero scores tie by id')"].join('\n'), solution: 'def retrieve(q_vec, store, k):\n    def score(row):\n        v = row["vec"]\n        dot = sum(a*b for a,b in zip(q_vec,v))\n        norm = (sum(a*a for a in q_vec)*sum(b*b for b in v)) ** 0.5\n        return dot / norm if norm else 0\n    return [r["id"] for r in sorted(store, key=lambda r: (-score(r), r["id"]))[:k]]\n', onPass: () => G.pass('python', { passed: true }) }),
    mission: 'python', task: (ui) => ui.code({ prompt: 'Write retrieve(q_vec, store, k), then run the five checks.', fallback: [['Sort by cosine descending, then id; take k', true], ['Sort by id only', false, 'The vector scores must decide the rank.'], ['Sort by cosine ascending', false, 'The most similar vectors have the highest cosine, so ascending puts the worst first.']] }),
    after: () => 'For q = [1, 0]: a scores 1, c scores 1 / √2 = 0.707, b scores 0. Sorted high to low and cut at k = 2: <b>[a, c]</b>.' },
  base('refuse', 'Refuse when evidence is missing', `Ask what pay parents of twins get. No page says. The retriever still returns ${exNone.id} with a score of ${r3(exNone.score)}, mostly from hash collisions. The guard checks for a supporting sentence, not for a high score.`,
    [{ glyph: 'key', name: 'Evidence guard', runs: 'answers only from a supporting chunk', conf: 'if not supported(answer, packed):\n    return "The handbook does not say."' }],
    { close: closeRefuse, closeLabel: 'CLOSE-UP · WHY 0.600', closeHint: 'question words and their buckets', mission: 'refuse', on: ['refuse'],
      task: choice('What should the answer say?', [['guess', 'Guess a pay amount', 'No chunk mentions pay, parents or twins. A guess would have nothing to cite.'], ['refuse', 'Say the documents do not provide the answer', null], ['score', 'Trust the top score as proof', `${exNone.id} scores ${r3(exNone.score)} because "parents" and "twins" collide with vacation, days and leave. A score measures shared buckets, not support.`]], 'refuse'),
      after: () => `Cosine = (0 + 3 + 2 + 1) / (2 × 5) = <b>${r3(exNone.score)}</b>. Five of those six points are hash collisions; only "get" is a real shared word. No chunk contains pay, parents or twins, so the guard answers "The handbook does not say."` }),
  { ...base('cost', 'Calculate cost per question', 'Every question pays for the tokens it sends and the tokens it gets back, and output tokens usually cost more. These prices are fixed examples, not any provider\'s list price.',
    [{ glyph: 'chart', name: 'Cost estimator', runs: 'input and output priced separately', conf: 'input_price = 2 / 1_000_000    # $ per token\noutput_price = 8 / 1_000_000\ncost = 100 * input_price + 40 * output_price' }],
    { close: closeCost, closeLabel: 'CLOSE-UP · TOKEN BILL', closeHint: 'example prices', mission: 'cost', on: [],
      task: num('100 input tokens at $2 per million plus 40 output tokens at $8 per million. Total cost in dollars?', M.ANSWERS.cost, 'The prices are per million tokens: 100 × 2 + 40 × 8 = 520 is millionths of a dollar. Divide by 1,000,000.'),
      after: () => '(100 × 2 + 40 × 8) / 1,000,000 = (200 + 320) / 1,000,000 = <b>$0.00052</b>. A million such questions cost $520.' }), phase: 'scale', kicker: 'Scale' },
  { id: 'done', phase: 'done', kicker: 'Done', title: 'Use your pipeline config', lead: 'You built a retrieval path with a token budget and an evidence check. This config records your choices for the simulated pipeline.', view: 'board', task: 'done' },
];

const used = () => M.promptTokens(Math.min(cfg().k, M.ANSWERS.pack)) + E.reserve;
createGuide({
  M, steps, board,
  init: (g) => { G = g; g.settings.rag ||= { chunkSize: 24, overlap: 6, k: 1 }; },
  done: {
    stats: () => [['chunks', M.store(cfg().chunkSize, cfg().overlap).length], ['top-k', cfg().k], ['window used', `${used()} / ${E.window}`]],
    artifactTitle: 'Your RAG config',
    artifact: () => `# Simulation config, not a vendor API\nchunk_size: ${cfg().chunkSize}       # words\noverlap: ${ov()}\nembedding_dim: ${M.DIMS}     # hashed counts\nindex: IndexFlatIP    # cosine\ntop_k: ${cfg().k}\ncontext_window: ${E.window}\nanswer_reserve: ${E.reserve}\nrequire_support: true\n`,
  },
});
