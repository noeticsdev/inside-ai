// Token sampler: a guided build of one decoding step, then the generation loop.
// Every number on the board and in the close-ups comes from model.mjs.
import * as M from './model.mjs';
import { createGuide, s, T_, pyCell, svgBox } from '../../platform/shell/guide-runtime.js';

const f = (x) => Number(x).toFixed(3);
const f1 = (x) => Number(x).toFixed(1);
const check = Object.fromEntries(M.MISSIONS.map((m) => [m.id, m.check]));
const E = M.EXAMPLE, W = M.WORK, N = M.NAMES, story = M.PROMPTS.story;
const PROMPT_TOKENS = story.text.split(' ');
const tokName = (t) => (t === '<EOS>' ? '<EOS>' : t.trim() || t);
const CW = 8.45; // mono glyph width at 14px

// ---------- shared drawing helpers ----------
const rect = (x, y, w, h, cls, rx = 4) => s('rect', { x, y, width: Math.max(0, w), height: h, rx, class: cls });
const line = (x1, y1, x2, y2, cls) => s('line', { x1, y1, x2, y2, class: cls });
const text = (x, y, t, cls = 'sam-t', anchor) => T_(x, y, t, cls, anchor);

// What the board shows: the worked example (steps 1-5 and the entropy step), or
// the reader's own run at the first "castle" decision (loop, stop, done).
function view(ctx) {
  const id = ctx.step.id;
  const loopMode = ['loop', 'stop', 'done'].includes(id);
  if (!loopMode) {
    const T = ctx.built === 2 ? E.hotT : E.T;
    return { loopMode, T, k: E.k, p: E.p, rp: 1, labels: N, logits: E.logits, raw: E.logits, u: E.u, uKnown: ctx.solved('draw') || ctx.built > 5, title: `NEXT TOKEN AFTER "…there was a"` };
  }
  const st = ctx.settings, run = M.generate(st);
  const at = run.steps.find((x) => x.row === M.CASTLE_ROW) || run.steps[0];
  return {
    loopMode, run, at, T: st.temperature, k: st.top_k, p: st.top_p, rp: st.repetition_penalty,
    labels: at.row.tokens.map(tokName), logits: at.logits, raw: at.row.logits, u: at.u, uKnown: true,
    title: `DRAW ${at.n + 1} · NEXT TOKEN AFTER "…a castle"`,
  };
}

function chipW(t) { return Math.round(16 + CW * t.length); }

function tape(add, ctx, v) {
  const fresh = ctx.fresh === 6 || ctx.fresh === 8;
  add(rect(14, 10, 972, 118, fresh ? 'sam-panel sam-fresh' : 'sam-panel', 8));
  add(text(30, 34, 'CONTEXT · prompt tokens, then sampled tokens', 'sam-h'));
  const chips = PROMPT_TOKENS.map((t) => ({ t, cls: 'p' }));
  if (!v.loopMode) {
    chips.push(ctx.solved('draw') ? { t: N[M.ANSWERS.draw], cls: 'x' } : { t: '?', cls: 'q' });
  } else {
    v.run.tokens.forEach((t, i) => chips.push({ t: tokName(t), cls: i === v.at.n ? 'x' : 'g' }));
    if (ctx.built >= 8) chips.push(v.run.reason === 'EOS' ? { t: '<EOS>', cls: 'e' } : { t: `max_new_tokens=${v.run.config.max_tokens}`, cls: 'e' });
    else chips.push({ t: '…', cls: 'q' });
  }
  let x = 30, y = 46;
  for (const c of chips) {
    const w = chipW(c.t);
    if (x + w > 972) { x = 30; y += 38; }
    if (y > 90) break;
    add(s('g', { 'data-tape-token': ['g', 'x', 'e'].includes(c.cls) ? '' : null }, rect(x, y, w, 30, `sam-chip sam-chip-${c.cls}`, 5), text(x + w / 2, y + 20, c.t, `sam-chip-t sam-chip-t-${c.cls}`, 'middle')));
    x += w + 6;
  }
  if (v.loopMode) {
    const r = v.run;
    add(text(970, 34, `${r.tokens.length} text tokens · repeated 3-gram: ${r.repeated3 ? 'yes' : 'no'}`, r.repeated3 ? 'sam-bad' : 'sam-a', 'end'));
  } else {
    add(text(970, 34, `seed ${M.DEFAULTS.seed} · simulation`, 'sam-m', 'end'));
  }
}

// Columns of the stage matrix: x positions and the build step that adds each.
const COLS = [
  { x: 112, step: 0, id: 'logits' },
  { x: 260, step: 1, id: 'softmax' },
  { x: 408, step: 3, id: 'topk' },
  { x: 556, step: 4, id: 'topp' },
];
const CWID = 148, ROW0 = 226, RH = 40, BAR = 86;

function matrix(add, ctx, v) {
  add(rect(14, 140, 692, 266, 'sam-panel', 8));
  add(text(30, 164, v.title, 'sam-h'));
  const rows = v.labels.length;
  v.labels.forEach((name, r) => add(text(30, ROW0 + r * RH, name, 'sam-t')));
  const probs = M.softmax(v.logits, v.T);
  const dk = M.distribution(v.logits, v.T, v.k, 1);
  const dp = M.distribution(v.logits, v.T, v.k, v.p);
  const showH = ['entropy', 'done'].includes(ctx.step.id);
  const freshCol = { 1: 'softmax', 2: 'softmax', 3: 'topk', 4: 'topp', 6: 'logits' }[ctx.fresh];
  for (const c of COLS) {
    const built = ctx.built >= c.step;
    const x = c.x;
    if (!built) {
      add(rect(x + 2, 176, CWID - 8, 216, 'sam-ghost', 6));
      add(text(x + CWID / 2 - 2, 278, { softmax: 'softmax', topk: 'top-k', topp: 'top-p' }[c.id], 'sam-m', 'middle'));
      add(text(x + CWID / 2 - 2, 300, `step ${c.step}`, 'sam-m', 'middle'));
      continue;
    }
    const on = freshCol === c.id;
    if (on) add(rect(x + 2, 176, CWID - 8, 216, 'sam-fresh', 6));
    const head = {
      logits: ['logits z', v.rp > 1 && v.loopMode ? `penalty ${f1(v.rp)}` : 'model output'],
      softmax: [`softmax(z/T)`, v.T <= 0 ? 'T = 0 · argmax' : `T = ${f1(v.T)}`],
      topk: [`top_k = ${v.k}`, 'renormalized'],
      topp: [`top_p = ${f1(v.p)}`, 'renormalized'],
    }[c.id];
    add(text(x + 8, 194, head[0], on ? 'sam-a' : 'sam-b'), text(x + 8, 210, head[1], 'sam-m'));
    if (c.id === 'logits') {
      const vals = [...v.logits, ...v.raw, 0], lo = Math.min(...vals), hi = Math.max(...vals);
      const sc = BAR / (hi - lo), ax = x + 8 - lo * sc;
      add(line(ax, 216, ax, 216 + rows * RH - 12, 'sam-axis'));
      v.logits.forEach((z, r) => {
        const y = ROW0 + r * RH - 14;
        if (v.raw[r] !== z) add(rect(Math.min(ax, ax + v.raw[r] * sc), y, Math.abs(v.raw[r] * sc), 18, 'sam-was', 2));
        add(rect(Math.min(ax, ax + z * sc), y, Math.abs(z * sc), 18, v.raw[r] !== z ? 'sam-bar' : 'sam-logit', 2));
        add(text(x + CWID - 6, y + 14, String(+z.toFixed(2)).replace('-', '−'), v.raw[r] !== z ? 'sam-a' : 'sam-t', 'end'));
      });
      if (v.loopMode) add(text(x + 8, 370, 'seen logit ÷ rp', 'sam-m'), text(x + 8, 388, `${f1(v.raw[0])} ÷ ${f1(v.rp)}`, 'sam-m'));
      else add(text(x + 8, 388, 'raw scores', 'sam-m'));
      continue;
    }
    if (c.id === 'softmax') {
      const ghost = ctx.built === 2 && !v.loopMode ? W.probs : null;
      probs.forEach((p, r) => {
        const y = ROW0 + r * RH - 14;
        if (ghost) add(rect(x + 8, y, ghost[r] * BAR, 18, 'sam-was', 2));
        add(rect(x + 8, y, Math.max(2, p * BAR), 18, 'sam-bar', 2));
        add(text(x + CWID - 6, y + 14, f(p), 'sam-t', 'end'));
      });
      const foot = showH ? `H ${f(M.entropyBits(probs))} bit` : ghost ? 'outline T = 1' : 'Σp = 1.000';
      add(text(x + 8, 388, foot, showH ? 'sam-a' : 'sam-m'));
      continue;
    }
    const d = c.id === 'topk' ? dk : dp;
    // cumulative mass inside the top-k set, in descending order, for the top-p column
    const order = dk.kept, cum = {};
    let acc = 0;
    order.forEach((i, j) => { acc += dk.final[j]; cum[i] = acc; });
    if (c.id === 'topp') {
      const tx = x + 8 + v.p * BAR;
      v.labels.forEach((_, r) => { if (cum[r] !== undefined) add(rect(x + 8, ROW0 + r * RH - 16, cum[r] * BAR, 22, 'sam-cum', 2)); });
      add(line(tx, 216, tx, 216 + rows * RH - 8, 'sam-thresh'));
    }
    v.labels.forEach((_, r) => {
      const y = ROW0 + r * RH - 14, j = d.kept.indexOf(r);
      if (j < 0) {
        add(rect(x + 8, y, Math.max(2, probs[r] * BAR), 18, 'sam-cut', 2), text(x + CWID - 6, y + 14, 'cut', 'sam-m', 'end'));
      } else {
        add(rect(x + 8, y, Math.max(2, d.final[j] * BAR), 18, 'sam-bar', 2), text(x + CWID - 6, y + 14, f(d.final[j]), 'sam-t', 'end'));
      }
    });
    let foot;
    if (showH) foot = `H ${f(M.entropyBits(d.final))} bit`;
    else if (c.id === 'topk') {
      add(text(x + 8, 370, '÷ kept mass', 'sam-m'));
      foot = f(dk.mass);
    }
    else {
      let a = 0;
      for (const j of dp.kept) a += dk.final[order.indexOf(j)];
      add(text(x + 8, 370, `Σ ≥ ${f1(v.p)}`, 'sam-m'));
      foot = f(a);
    }
    add(text(x + 8, 388, foot, showH ? 'sam-a' : 'sam-m'));
  }
}

function cdf(add, ctx, v) {
  const on = ctx.fresh === 5;
  add(rect(14, 418, 692, 172, on ? 'sam-panel sam-fresh' : 'sam-panel', 8));
  if (ctx.built < 5) {
    add(rect(30, 440, 660, 134, 'sam-ghost', 6), text(360, 500, 'inverse-CDF draw', 'sam-m', 'middle'), text(360, 522, 'step 5', 'sam-m', 'middle'));
    return;
  }
  const d = M.distribution(v.logits, v.T, v.k, v.p);
  const x0 = 40, w = 640, y = 478;
  const greedy = v.loopMode && v.T <= 0;
  const chosen = greedy ? d.kept[0] : M.sample(v.logits, v.T, v.k, v.p, v.u);
  add(text(30, 442, greedy ? 'GREEDY · T = 0 takes the argmax, no random draw' : 'INVERSE CDF · kept tokens renormalized to sum to 1', 'sam-h'));
  let c = 0;
  d.final.forEach((p, j) => {
    const left = x0 + c * w, i = d.kept[j], hit = v.uKnown && i === chosen;
    add(rect(left, y, p * w, 40, hit ? 'sam-seg-on' : 'sam-seg', 0));
    if (p * w > CW * v.labels[i].length + 10) add(text(left + (p * w) / 2, y + 26, v.labels[i], hit ? 'sam-seg-t-on' : 'sam-t', 'middle'));
    add(text(left, y + 60, f(c), 'sam-m', 'middle'));
    c += p;
  });
  add(text(x0 + w, y + 60, '1.000', 'sam-m', 'middle'));
  if (!greedy) {
    const ux = x0 + v.u * w;
    add(s('path', { d: `M${ux} ${y - 10}v60`, class: 'sam-marker' }));
    add(text(ux, y - 14, v.uKnown ? `u = ${v.u.toFixed(v.loopMode ? 3 : 2)}` : 'u = ?', 'sam-a', 'middle'));
  }
  if (!v.loopMode) {
    // the trap: the same u against the boundaries before renormalizing
    add(text(30, 572, 'before top-p rescale:', 'sam-m'));
    let a = 0;
    const gx = 230, gw = 450;
    W.nucleus.kept.forEach((i) => { const p = W.topk.final[W.topk.kept.indexOf(i)]; add(rect(gx + a * gw, 560, p * gw, 14, 'sam-seg-was', 0)); a += p; });
    add(rect(gx + a * gw, 560, (1 - a) * gw, 14, 'sam-cut', 0));
    add(text(gx + W.topk.final[0] * gw, 588, f(W.topk.final[0]), 'sam-m', 'middle'));
    add(text(gx + a * gw, 588, f(a), 'sam-m', 'middle'));
    add(line(gx + E.u * gw, 554, gx + E.u * gw, 578, 'sam-thresh'));
  } else if (!greedy) {
    add(text(30, 576, `this draw picks "${v.labels[chosen]}"`, 'sam-a'));
  } else {
    add(text(30, 576, `argmax picks "${v.labels[chosen]}" every visit`, v.rp > 1 ? 'sam-a' : 'sam-bad'));
  }
}

function readout(add, ctx, v) {
  add(rect(718, 140, 268, 450, 'sam-panel', 8));
  add(text(734, 164, v.loopMode ? 'YOUR RUN · CASTLE ROW' : 'WORKED EXAMPLE', 'sam-h'));
  const run = M.generate(ctx.settings);
  const dk = M.distribution(v.logits, v.T, v.k, 1), dp = M.distribution(v.logits, v.T, v.k, v.p);
  const chosen = M.sample(v.logits, v.T, v.k, v.p, v.u);
  const rows = v.loopMode ? [
    ['loop', 'decision at', `draw ${v.at.n + 1}`],
    ['loop', `P(${v.labels[chosen]})`, f(M.softmax(v.logits, v.T)[chosen])],
    ['loop', 'top-k retained', `${dk.kept.length} of ${v.labels.length}`],
    ['loop', 'top-p retained', `${dp.kept.length} of ${dk.kept.length}`],
    ['loop', 'draw u', v.T > 0 ? f(v.u) : 'greedy'],
    ['loop', 'repeated 3-gram', run.repeated3 ? 'yes' : 'no'],
    ['stop', 'stop draw', `${run.reason === 'EOS' ? 'EOS' : 'limit'} · ${run.steps.length}`],
    ['entropy', 'row entropy', `${f(M.entropyBits(M.softmax(v.logits, v.T)))} bit`],
  ] : [
    ['softmax', 'P(dragon) T=1', f(M.ANSWERS.softmax)],
    ['temperature', 'P(dragon) T=0.5', f(M.ANSWERS.temperature)],
    ['topk', 'top-1 after k=3', f(M.ANSWERS.topk)],
    ['nucleus', 'nucleus p=0.9', `${M.ANSWERS.nucleus} tokens`],
    ['draw', 'u=0.70 draws', N[M.ANSWERS.draw]],
    ['nucleus', 'kept mass', f(W.topk.final[0] + W.topk.final[1])],
    ['draw', 'CDF boundary', f(W.nucleus.final[0])],
    ['entropy', 'entropy T=1', `${f(M.ANSWERS.entropy)} bit`],
  ];
  rows.forEach(([id, label, val], i) => {
    const y = 194 + i * 28, ok = ctx.solved(id);
    add(text(734, y, label, 'sam-m'), text(972, y, ok ? val : '?', ok ? 'sam-b' : 'sam-m', 'end'));
    add(line(734, y + 9, 972, y + 9, 'sam-rule'));
  });
  // The GenerationConfig the build has written so far.
  const T = v.loopMode ? v.T : ctx.built >= 2 ? (ctx.built === 2 ? E.hotT : E.T) : null;
  const lines = [['GenerationConfig(', true]];
  if (T !== null) {
    lines.push([`  do_sample=${T > 0 ? 'True' : 'False'},`, true]);
    if (T > 0) lines.push([`  temperature=${f1(T)},`, ctx.fresh === 2]);
  }
  if (ctx.built >= 3 && T > 0) lines.push([`  top_k=${v.k},`, ctx.fresh === 3]);
  if (ctx.built >= 4 && T > 0) lines.push([`  top_p=${f1(v.p)},`, ctx.fresh === 4]);
  if (v.loopMode) lines.push([`  repetition_penalty=${f1(v.rp)},`, ctx.fresh === 6]);
  if (v.loopMode && ctx.built >= 8) lines.push([`  max_new_tokens=${M.DEFAULTS.max_tokens},`, ctx.fresh === 8]);
  lines.push([')', false]);
  add(text(734, 428, v.loopMode ? 'your config' : 'example config', 'sam-m'));
  lines.forEach(([t, hot], i) => add(text(734, 448 + i * 17, t, hot && i > 0 ? 'sam-code-a' : 'sam-code')));
}

function board(ctx) {
  const svg = s('svg', { viewBox: '0 0 1000 600', class: 'sam-board', role: 'img', 'aria-label': 'Token sampler: the context tape, the logits through softmax, top-k and top-p, the inverse-CDF draw and a readout' });
  const add = (...a) => svg.append(...a);
  const v = view(ctx);
  tape(add, ctx, v);
  matrix(add, ctx, v);
  cdf(add, ctx, v);
  readout(add, ctx, v);
  return svg;
}

// ---------- close-ups ----------
function graphic(id, g) {
  const box = (w, h, label) => svgBox(w, h, label);
  const t = (x, y, v, c = 'cu-t', a) => T_(x, y, v, c, a);
  const r = (x, y, w, h, c = 'cu-plane-y') => s('rect', { x, y, width: Math.max(1, w), height: h, class: c });
  const L = E.logits;
  if (id === 'kit') {
    const svg = box(850, 170, 'Inputs: prompt tokens and the four example logits');
    svg.append(t(20, 22, 'PROMPT TOKENS', 'cu-t-b'), t(560, 22, 'LOGITS (one per candidate)', 'cu-t-b'));
    let x = 20;
    PROMPT_TOKENS.forEach((tok) => { const w = 12 + tok.length * 8; svg.append(r(x, 40, w, 28, 'cu-slot'), t(x + w / 2, 59, tok, 'cu-t', 'middle')); x += w + 5; });
    svg.append(s('path', { d: `M${x + 6} 54h60m-8 -6l8 6-8 6`, class: 'cu-axis' }), t(x + 10, 92, 'model (simulated)', 'cu-t-m'));
    N.forEach((n, i) => { const y = 36 + i * 31; svg.append(t(560, y + 19, n), r(640, y, 120, 26, 'cu-slot'), t(700, y + 18, String(L[i]).replace('-', '−'), 'cu-t-b', 'middle')); });
    svg.append(t(20, 130, 'The sampler sees only these four scores.', 'cu-t'), t(20, 152, 'It turns them into one token id.', 'cu-t-a'));
    return svg;
  }
  if (id === 'softmax') {
    const svg = box(850, 190, 'Softmax: exponentiate each logit, then divide by the sum');
    const ex = L.map(Math.exp), sum = ex.reduce((a, b) => a + b, 0);
    svg.append(t(20, 22, 'e^z', 'cu-t-b'), t(445, 22, `÷ Σ e^z = ${f(sum)}`, 'cu-t-b'));
    L.forEach((z, i) => {
      const y = 50 + i * 36;
      svg.append(t(20, y, N[i]), r(100, y - 14, ex[i] * 34, 20), t(400, y, ex[i].toFixed(3), 'cu-t', 'end'));
      svg.append(t(445, y, N[i]), r(525, y - 14, W.probs[i] * 250, 20, 'cu-pk-m'), t(830, y, f(W.probs[i]), 'cu-t-b', 'end'));
    });
    svg.append(s('path', { d: 'M412 90h22m-7-5l7 5-7 5', class: 'cu-axis' }), t(20, 184, `${f(ex[0])} ÷ ${f(sum)} = ${f(W.probs[0])}`, 'cu-t-a'));
    return svg;
  }
  if (id === 'temperature') {
    const Ts = [0.5, 1, 2], cls = ['cu-pk-m', 'cu-plane-y', 'cu-plane-uv'];
    const ds = Ts.map((T) => M.softmax(L, T));
    const svg = box(850, 220, 'The same logits at three temperatures');
    svg.append(t(20, 22, 'SAME LOGITS · THREE TEMPERATURES', 'cu-t-b'));
    Ts.forEach((T, j) => { svg.append(r(470 + j * 125, 11, 16, 13, cls[j]), t(492 + j * 125, 22, `T = ${T}`, 'cu-t')); });
    N.forEach((n, i) => {
      const y = 42 + i * 42;
      svg.append(t(20, y + 16, n));
      ds.forEach((ps, j) => svg.append(r(100, y + j * 11, ps[i] * 520, 10, cls[j])));
      svg.append(t(830, y + 16, ds.map((d) => f(d[i])).join(' / '), 'cu-t', 'end'));
    });
    svg.append(t(20, 214, 'z / 0.5 = [4, 2, 0, −2] → dragon 0.865; z / 2 = [1, 0.5, 0, −0.5] → dragon 0.455', 'cu-t-a'));
    return svg;
  }
  if (id === 'topk') {
    const svg = box(850, 200, 'Top-k: keep three, renormalize their mass');
    const d = W.topk;
    svg.append(t(20, 22, 'BEFORE (outline) → AFTER top_k = 3 (filled)', 'cu-t-b'));
    N.forEach((n, i) => {
      const y = 50 + i * 34, j = d.kept.indexOf(i);
      svg.append(t(20, y, n), r(100, y - 14, W.probs[i] * 480, 20, 'cu-slot'));
      if (j >= 0) svg.append(r(100, y - 14, d.final[j] * 480, 20, 'cu-pk-new'), t(830, y, `${f(W.probs[i])} → ${f(d.final[j])}`, 'cu-t', 'end'));
      else svg.append(r(100, y - 14, W.probs[i] * 480, 20, 'cu-plane-uv'), t(830, y, `${f(W.probs[i])} → cut`, 'cu-t-bad', 'end'));
    });
    svg.append(t(20, 190, `kept mass ${f(W.probs[0])} + ${f(W.probs[1])} + ${f(W.probs[2])} = ${f(d.mass)}; ${f(W.probs[0])} ÷ ${f(d.mass)} = ${f(d.final[0])}`, 'cu-t-a'));
    return svg;
  }
  if (id === 'nucleus') {
    const svg = box(850, 220, 'Top-p: sorted bars and the cumulative mass against p = 0.9');
    const d = W.topk, X = 70, H = 150, Y = 180, bw = 70;
    svg.append(t(20, 18, 'SORTED · INSIDE THE TOP-K SET', 'cu-t-b'));
    svg.append(line(X, Y, X + 4 * 100, Y, 'cu-axis'), line(X, Y, X, Y - H, 'cu-axis'));
    [0, 0.5, 1].forEach((q) => svg.append(t(X - 8, Y - q * H + 4, q.toFixed(1), 'cu-t-m', 'end')));
    const ty = Y - E.p * H;
    svg.append(line(X, ty, X + 400, ty, 'cu-mark'), t(X + 404, ty + 4, 'p = 0.9', 'cu-t-bad'));
    let acc = 0; const pts = [];
    N.forEach((n, i) => {
      const j = d.kept.indexOf(i), p = j >= 0 ? d.final[j] : W.probs[i];
      const kept = W.nucleus.kept.includes(i), bx = X + 15 + i * 100;
      svg.append(r(bx, Y - p * H, bw, p * H, kept ? 'cu-pk-m' : 'cu-plane-uv'), t(bx + bw / 2, Y + 16, n, 'cu-t', 'middle'));
      if (j >= 0) { acc += p; pts.push(`${bx + bw / 2},${Y - acc * H}`); svg.append(t(bx + bw / 2, Y - acc * H - 6, f(acc), 'cu-t-b', 'middle')); }
    });
    svg.append(s('polyline', { points: pts.join(' '), class: 'sam-cu-cum' }));
    svg.append(t(520, 60, `dragon  Σ ${f(d.final[0])} < 0.9 → keep going`, 'cu-t'), t(520, 84, `castle  Σ ${f(d.final[0] + d.final[1])} ≥ 0.9 → stop`, 'cu-t-a'), t(520, 108, 'girl    cut by top-p', 'cu-t-bad'), t(520, 132, 'boy     cut by top-k', 'cu-t-bad'));
    return svg;
  }
  if (id === 'draw') {
    const svg = box(850, 200, 'Inverse CDF: u = 0.70 before and after renormalizing the top-p cut');
    const x0 = 160, w = 640, b = W.nucleus.final[0];
    svg.append(t(20, 20, 'SAME u, TWO RULERS', 'cu-t-b'));
    svg.append(t(20, 64, 'renormalized'), r(x0, 44, b * w, 34, 'cu-pk-m'), r(x0 + b * w, 44, (1 - b) * w, 34, 'cu-plane-y'));
    svg.append(t(x0 + (b * w) / 2, 66, 'dragon', 'sam-cu-on', 'middle'), t(x0 + b * w + ((1 - b) * w) / 2, 66, 'castle', 'cu-t', 'middle'));
    [[0, '0'], [b, f(b)], [1, '1']].forEach(([q, l]) => svg.append(t(x0 + q * w, 96, l, 'cu-t-m', 'middle')));
    const [p0, p1] = W.topk.final, top = p0 + p1;
    svg.append(t(20, 140, 'unscaled'), r(x0, 120, p0 * w, 34, 'cu-slot'), r(x0 + p0 * w, 120, p1 * w, 34, 'cu-plane-uv'), r(x0 + top * w, 120, (1 - top) * w, 34, 'cu-slot-empty'));
    svg.append(t(x0 + (p0 * w) / 2, 142, 'dragon', 'cu-t', 'middle'), t(x0 + p0 * w + (p1 * w) / 2, 142, 'castle', 'cu-t-bad', 'middle'));
    [[0, '0'], [p0, f(p0)], [top, f(top)]].forEach(([q, l]) => svg.append(t(x0 + q * w, 172, l, 'cu-t-m', 'middle')));
    svg.append(s('path', { d: `M${x0 + E.u * w} 34v46 M${x0 + E.u * w} 110v46`, class: 'sam-marker' }), t(x0 + E.u * w, 30, 'u = 0.70', 'cu-t-a', 'middle'));
    svg.append(t(20, 194, `0.70 < ${f(b)} → dragon. Without the top-p rescale: 0.70 ≥ ${f(p0)} → castle.`, 'cu-t-a'));
    return svg;
  }
  if (id === 'loop') {
    const run = M.generate(g.settings), greedy = M.generate();
    const svg = box(850, 210, 'Compare the same castle decision with greedy decoding and your settings');
    [greedy, run].forEach((r, k) => {
      const st = r.steps.find((x) => x.row === M.CASTLE_ROW);
      if (!st) return;
      const gx = 20 + k * 420, Y = 125, sc = 22;
      svg.append(t(gx, 20, k ? `YOUR SETTINGS · penalty ${f1(g.settings.repetition_penalty)}` : 'GREEDY · penalty off', 'cu-t-b'));
      svg.append(t(gx, 44, `draw ${st.n + 1} · next after castle`, 'cu-t'), line(gx, Y, gx + 360, Y, 'cu-axis'));
      st.row.tokens.forEach((tok, i) => {
        const z = st.logits[i], raw = st.row.logits[i], bx = gx + 30 + i * 115, on = tok === st.token;
        if (raw !== z) svg.append(s('rect', { x: bx, y: Y - raw * sc, width: 70, height: raw * sc, class: 'cu-slot' }));
        svg.append(s('rect', { x: bx, y: Y - z * sc, width: 70, height: z * sc, class: on ? 'cu-pk-m' : 'cu-plane-y' }), t(bx + 35, Y - z * sc - 5, String(+z.toFixed(2)), on ? 'cu-t-a' : 'cu-t', 'middle'), t(bx + 35, Y + 18, tokName(tok), on ? 'cu-t-a' : 'cu-t', 'middle'));
      });
      const tail = r.tokens.slice(st.n, st.n + 6).map(tokName).join(' ');
      svg.append(t(gx, 175, tail, r.repeated3 ? 'cu-t-bad' : 'cu-t-a'));
      svg.append(t(gx, 200, `${r.tokens.length} text tokens · ${r.reason} · repeat ${r.repeated3 ? 'yes' : 'no'}`, 'cu-t'));
    });
    return svg;
  }
  if (id === 'stop') {
    const run = M.generate(g.settings), max = run.config.max_tokens;
    const svg = box(850, 170, 'Draw slots up to max_new_tokens, and where the run stopped');
    svg.append(t(20, 20, `DRAW SLOTS · max_new_tokens = ${max}`, 'cu-t-b'));
    const sw = 39;
    for (let i = 0; i < max; i++) {
      const x = 20 + i * sw, st = run.steps[i];
      const cls = !st ? 'cu-slot' : st.token === '<EOS>' ? 'cu-pk-m' : 'cu-slot-on';
      svg.append(r(x, 36, sw - 4, 48, cls), t(x + (sw - 4) / 2, 100, String(i + 1), 'cu-t-m', 'middle'));
      if (st) svg.append(t(x + (sw - 4) / 2, 65, st.token === '<EOS>' ? 'EOS' : tokName(st.token).slice(0, 4), st.token === '<EOS>' ? 'sam-cu-on' : 'cu-t', 'middle'));
    }
    svg.append(line(20 + max * sw - 2, 28, 20 + max * sw - 2, 92, 'cu-mark'));
    const used = run.steps.length;
    svg.append(t(20, 132, run.reason === 'EOS' ? `EOS drawn at slot ${used}: ${run.tokens.length} text tokens, ${max - used} slots unused.` : `No EOS in ${max} draws: the limit cuts the text mid-sentence.`, run.reason === 'EOS' ? 'cu-t-a' : 'cu-t-bad'));
    svg.append(t(20, 156, 'Check EOS and stop strings after each draw; continue only within the limit.', 'cu-t'));
    return svg;
  }
  if (id === 'entropy') {
    const svg = box(850, 200, 'Entropy: each token contributes minus p log2 p bits');
    svg.append(t(20, 20, 'BITS PER TOKEN · −p log₂ p', 'cu-t-b'));
    let acc = 0;
    W.probs.forEach((p, i) => {
      const y = 48 + i * 30, b = -p * Math.log2(p);
      svg.append(t(20, y, N[i]), t(100, y, `p ${f(p)}`, 'cu-t-m'), r(200, y - 14, b * 400, 20, 'cu-pk-new'), t(830, y, `${f(b)} bit`, 'cu-t', 'end'));
      acc += b;
    });
    let x = 200;
    W.probs.forEach((p, i) => { const b = -p * Math.log2(p); svg.append(r(x, 168, b * 400, 20, i % 2 ? 'cu-pk-m' : 'cu-plane-y')); x += b * 400; });
    svg.append(t(20, 183, 'sum', 'cu-t-b'), t(830, 183, `${f(acc)} bit`, 'cu-t-a', 'end'));
    return svg;
  }
  return box(10, 10, id);
}

// ---------- steps ----------
const ADDS = {
  softmax: { glyph: 'chart', name: 'torch.softmax', runs: 'turns logits into probabilities', conf: 'probs = torch.softmax(logits, dim=-1)' },
  temperature: { glyph: 'chart', name: 'TemperatureLogitsWarper', runs: 'divides logits by T before softmax', conf: 'GenerationConfig(do_sample=True,\n                 temperature=0.5)' },
  topk: { glyph: 'tag', name: 'TopKLogitsWarper', runs: 'keeps the k highest logits', conf: 'GenerationConfig(top_k=3)' },
  nucleus: { glyph: 'tag', name: 'TopPLogitsWarper', runs: 'keeps the smallest set with mass ≥ p', conf: 'GenerationConfig(top_p=0.9)' },
  draw: { glyph: 'dice', name: 'torch.multinomial', runs: 'draws one id from the kept probabilities', conf: 'next_id = torch.multinomial(probs, 1)\n# here: inverse CDF with u = 0.70' },
  loop: { glyph: 'loop', name: 'RepetitionPenaltyLogitsProcessor', runs: 'demotes tokens already in the context', conf: 'torch.manual_seed(7)\nGenerationConfig(repetition_penalty=1.5)' },
  python: { glyph: 'tool', name: 'sample()', runs: 'your own sampler, in Python', conf: 'sample(logits, temperature, top_k, top_p, u)' },
  stop: { glyph: 'key', name: 'StoppingCriteria', runs: 'EOS id, token limit, stop strings', conf: 'GenerationConfig(eos_token_id=tok.eos_token_id,\n                 max_new_tokens=20)' },
};
const build = (id, title, lead, extra = {}) => ({
  id, phase: 'build', kicker: 'Sampler pipeline', title, lead, minutes: 2, view: 'board', on: [id],
  adds: [ADDS[id]], closeLabel: 'CLOSE-UP', closeHint: 'fixed example logits · simulation', close: (g) => graphic(id, g), mission: id, ...extra,
});
const near = (v, x) => Math.abs(v - x) < 0.006;
const pySolution = `import math
def sample(logits, temperature, top_k, top_p, u):
    if temperature <= 0:
        return max(range(len(logits)), key=lambda i: logits[i])
    m = max(logits)
    weights = [math.exp((x - m) / temperature) for x in logits]
    ids = sorted(range(len(logits)), key=lambda i: (-weights[i], i))
    if top_k > 0:
        ids = ids[:top_k]
    total = sum(weights[i] for i in ids)
    keep, mass = [], 0
    for i in ids:
        keep.append(i)
        mass += weights[i] / total
        if mass >= top_p - 1e-12:
            break
    total = sum(weights[i] for i in keep)
    mass = 0
    for i in keep:
        mass += weights[i] / total
        if u < mass:
            return i
    return keep[-1]
`;
const p = W.probs, sumE = E.logits.map(Math.exp).reduce((a, b) => a + b, 0);
const hotE = E.logits.map((z) => Math.exp(z / E.hotT)), hotSum = hotE.reduce((a, b) => a + b, 0);
const loopRun = () => M.generate(G.settings);
let G;
const opt = (vals, fmtv) => vals.map((x) => [x, fmtv(x)]);

const STEPS = [
  {
    id: 'kit', phase: 'kit', kicker: 'Before you start', title: 'Inspect the inputs', minutes: 1, view: 'board',
    lead: 'A language model ends each step with one score, a logit, for every token in its vocabulary. You will build the sampler that turns those scores into one token, then the loop that repeats it. This simulation uses four fixed logits and a seeded random generator.',
    parts: () => [{ title: 'Inputs', n: 3 }, { glyph: 'text', name: 'Prompt', runs: story.text }, { glyph: 'chart', name: 'Logits', runs: 'dragon 2 · castle 1 · girl 0 · boy −1' }, { glyph: 'dice', name: 'Seed', runs: `${M.DEFAULTS.seed} · the same seed gives the same draws` }],
    closeLabel: 'INPUTS', close: (g) => graphic('kit', g), task: 'predict',
  },
  build('softmax', 'Turn logits into probabilities', 'Softmax exponentiates every logit and divides by the sum, so the scores become positive and add to one. The board slice has four logits: 2, 1, 0 and −1.', {
    task: (ui) => ui.number({
      prompt: 'What is P(dragon)? Enter a decimal.', placeholder: '0.000', check: check.softmax,
      hint: (v) => near(v, 0.665) ? 'That leaves out boy. Its logit is −1, but e^−1 = 0.368 still belongs in the denominator, so use all four exponentials.'
        : near(v, 1) || near(v, 0.5) ? 'That divides by the sum of logits. Softmax divides e^z by the sum of e^z for all four tokens.'
        : near(v, 0.25) ? 'That is a uniform split. Softmax gives a larger share to a larger logit: compute e² ÷ (e² + e¹ + e⁰ + e⁻¹).'
        : 'Exponentiate each logit, then divide e² by the sum of all four exponentials.',
    }),
    after: () => `e² ÷ (e² + e¹ + e⁰ + e⁻¹) = ${f(Math.exp(2))} ÷ ${f(sumE)} = <b>${f(M.ANSWERS.softmax)}</b>. The four probabilities are ${p.map(f).join(', ')} and add to 1.`,
  }),
  build('temperature', 'Set the temperature', 'Temperature divides every logit by T before softmax. T below 1 stretches the gaps between scores and moves probability to the leader; T above 1 flattens them.', {
    task: (ui) => ui.number({
      prompt: 'At T = 0.5, what is P(dragon)? Enter a decimal.', placeholder: '0.000', check: check.temperature,
      hint: (v) => near(v, M.ANSWERS.softmax * 0.5) ? 'Divide each logit by 0.5 before exponentiating; do not multiply the old probability by 0.5.'
        : near(v, M.ANSWERS.softmax) ? 'That is the T = 1 answer. Divide each logit by 0.5 first: [4, 2, 0, −2].'
        : near(v, M.softmax(E.logits, 2)[0]) ? 'That is T = 2, which flattens. Divide by 0.5, which doubles the logits.'
        : 'Divide the logits by 0.5 to get [4, 2, 0, −2], then apply softmax.',
    }),
    after: () => `z ÷ 0.5 = [4, 2, 0, −2]. e⁴ ÷ Σ = ${f(hotE[0])} ÷ ${f(hotSum)} = <b>${f(M.ANSWERS.temperature)}</b>, up from ${f(M.ANSWERS.softmax)} at T = 1. The rest of the worked example goes back to T = 1.`,
  }),
  build('topk', 'Cut with top-k', 'Top-k keeps the k highest-probability tokens and drops the rest, then renormalizes so the kept probabilities add to one. With k = 3, boy is cut.', {
    task: (ui) => ui.number({
      prompt: 'After top_k = 3 at T = 1, what is P(dragon)?', placeholder: '0.000', check: check.topk,
      hint: (v) => near(v, M.ANSWERS.softmax) ? 'That is the probability before the cut. The kept mass is only 0.968, so renormalize: divide by it.'
        : near(v, 1 / 3) ? 'Top-k does not make the kept tokens equal. It keeps their ratios and rescales them to sum to one.'
        : 'Divide e² by e² + e¹ + e⁰. The removed weight no longer enters the denominator.',
    }),
    after: () => `Kept mass ${f(p[0])} + ${f(p[1])} + ${f(p[2])} = ${f(W.topk.mass)}. ${f(p[0])} ÷ ${f(W.topk.mass)} = <b>${f(M.ANSWERS.topk)}</b>. Same as e² ÷ (e² + e¹ + e⁰).`,
  }),
  build('nucleus', 'Cut with top-p', 'Top-p (nucleus) sorts the remaining tokens and keeps the smallest leading set whose cumulative mass reaches p. It runs after top-k, on the renormalized top-k set.', {
    task: (ui) => ui.number({
      prompt: 'How many tokens are in the nucleus at top_p = 0.9?', placeholder: 'count', check: check.nucleus,
      hint: (v) => v === 1 ? 'No single token has 0.9 on its own, and top-p does not test tokens individually. Add probabilities in descending order until the sum reaches 0.9.'
        : v === 3 ? 'Stop as soon as the running sum reaches 0.9: 0.665 + 0.245 already does.'
        : v === 0 ? 'Top-p always keeps at least the top token.'
        : 'Add the top-k probabilities in descending order until the running sum reaches 0.9.',
    }),
    after: () => `${f(W.topk.final[0])} &lt; 0.9, then ${f(W.topk.final[0])} + ${f(W.topk.final[1])} = ${f(W.topk.final[0] + W.topk.final[1])} ≥ 0.9, so <b>2 tokens</b> stay. Renormalized again: dragon ${f(W.nucleus.final[0])}, castle ${f(W.nucleus.final[1])}.`,
  }),
  build('draw', 'Draw a token', 'Lay the kept probabilities end to end on a ruler from 0 to 1 and pick a uniform random number u. The token whose segment contains u is the draw. This step fixes u = 0.70.', {
    task: (ui) => ui.choice({
      prompt: 'Which token does u = 0.70 select?',
      options: [
        ['castle', 'castle', 'That uses the raw boundaries 0.665 and 0.910. After top-p the kept mass is renormalized, so dragon covers [0, 0.731).'],
        ['dragon', 'dragon'],
        ['girl', 'girl', 'Girl was cut by top-p, so it has no segment on the ruler.'],
      ],
      check: check.draw,
    }),
    after: () => `The ruler is dragon [0, ${f(W.nucleus.final[0])}) and castle [${f(W.nucleus.final[0])}, 1). 0.70 &lt; ${f(W.nucleus.final[0])}, so the draw is <b>dragon</b>. A u exactly on a boundary belongs to the next segment.`,
  }),
  build('loop', 'Break the loop', `This fixed script appends a token, scores the next position, and draws again. Greedy decoding (T = 0) writes "…in a castle in a castle…" until the limit. repetition_penalty divides positive logits of tokens already in the context; it multiplies negative logits.`, {
    replay: true,
    closeHint: 'your seed-7 run · simulation',
    task: (ui, g) => ui.selects({
      prompt: 'Pick settings so the seed-7 run ends at EOS with no repeated 3-gram.',
      selects: [
        { label: 'temperature', options: opt(M.LOOP_OPTIONS.temperature, (x) => (x === 0 ? '0 (greedy)' : f1(x))), get: () => g.settings.temperature, set: (x) => (g.settings.temperature = x), parse: Number },
        { label: 'top_p', options: opt(M.LOOP_OPTIONS.top_p, (x) => (x === 1 ? '1.0 (off)' : f1(x))), get: () => g.settings.top_p, set: (x) => (g.settings.top_p = x), parse: Number },
        { label: 'repetition_penalty', options: opt(M.LOOP_OPTIONS.repetition_penalty, (x) => (x === 1 ? '1.0 (off)' : f1(x))), get: () => g.settings.repetition_penalty, set: (x) => (g.settings.repetition_penalty = x), parse: Number },
      ],
      check: () => {
        const r = M.generate(g.settings);
        if (M.loopSolved(r)) return true;
        if (g.settings.temperature > 0) return 'A 3-gram still repeats: this draw lands on "in" at the castle row, so "in a castle" comes back. Sampling alone leaves "in" the most likely token. Demote it.';
        return 'A 3-gram repeats: greedy takes "in" at every castle, so "in a castle" loops until max_new_tokens. Change what the castle row scores.';
      },
    }),
    onReveal: (g) => Object.assign(g.settings, { temperature: 0, top_p: 0.9, repetition_penalty: 1.5 }),
    after: () => {
      const r = loopRun(), at = r.steps.find((x) => x.row === M.CASTLE_ROW);
      const pen = at ? at.logits[0] : 3;
      return `At draw ${at ? at.n + 1 : 7} the context already holds "in" (from "lived in"), so its logit 3 ÷ ${f1(G.settings.repetition_penalty)} = ${f1(pen)} &lt; 2.5 for "by". The run writes <b>${r.tokens.length} text tokens</b> and ends at ${r.reason}: "${r.text}"`;
    },
  }),
  {
    ...build('python', 'Implement the sampler', 'Write the whole pipeline as one Python function: temperature, top-k, top-p, renormalize, inverse-CDF draw. The five checks include a boundary and a renormalization after a cut.'),
    view: 'bench',
    bench: (host, g) => pyCell(host, {
      id: 'sampling-python', title: 'Python · sample one token',
      prompt: 'Return the original index. Sort ties by index; u on a boundary belongs to the next segment. top_k = 0 disables top-k, and temperature = 0 returns the argmax.',
      starter: 'def sample(logits, temperature, top_k, top_p, u):\n    return 0\n',
      tests: ["check('zero temperature', sample([0, 2, 1], 0, 0, 1, .9) == 1, 'Choose argmax')", "check('top k one', sample([0, 2, 1], 1, 1, 1, .9) == 1, 'Only the maximum remains')", "check('nucleus cut', sample([2, 1, 0], 1, 0, .7, .99) == 1, 'Keep enough leading mass')", "check('boundary', sample([0, 0], 1, 0, 1, .5) == 1, 'The boundary starts the next interval')", "check('renormalize', sample([2, 1, 0, -1], 1, 2, 1, .9) == 1, 'Scale kept mass to one')"].join('\n'),
      solution: pySolution, onPass: () => g.pass('python'),
    }),
    task: (ui) => ui.code({ prompt: 'Write sample() and run all five checks.', fallback: [['Sort, filter, renormalize, then choose the first cumulative boundary greater than u', true], ['Choose the first token whose own probability exceeds u', false, 'The draw compares u with the cumulative probability, not with one token\'s probability.'], ['Filter without renormalizing, then draw', false, 'The kept mass must sum to one before the draw, or the boundaries move.']] }),
    after: () => 'For sample([2, 1, 0, −1], 1, 2, 1, 0.9): top-2 keeps dragon and castle, renormalized to 0.731 and 0.269. 0.9 ≥ 0.731, so it returns index 1.',
  },
  build('stop', 'Stop generation', 'After each draw the loop checks its stopping criteria: the EOS token, the max_new_tokens limit, and any stop strings. The first one that fires ends the run.', {
    replay: true,
    closeHint: 'EOS uses one draw slot',
    task: (ui) => ui.choice({
      prompt: 'Your run from step 6 ended. What stopped it?',
      options: [
        ['length', 'The max_new_tokens limit', 'The run used fewer than 20 draws: the limit never fired.'],
        ['eos', 'The EOS token'],
        ['string', 'A stop string', 'This config sets no stop strings.'],
      ],
      check: check.stop,
    }),
    after: () => { const r = loopRun(); return `Draw ${r.steps.length} returned <b>EOS</b> after "${tokName(r.tokens.at(-1))}", with ${M.DEFAULTS.max_tokens - r.steps.length} of ${M.DEFAULTS.max_tokens} draws unused. The greedy run without a penalty never draws EOS and is cut at 20 tokens mid-phrase.`; },
  }),
  {
    id: 'entropy', phase: 'scale', kicker: 'Measure it', title: 'Measure the uncertainty', minutes: 2, view: 'board', on: ['entropy'],
    lead: 'Entropy in bits says how uncertain a distribution is: 0 for a sure thing, 2 for four equal tokens. Compute it for the T = 1 softmax. The board footer shows how each cut lowers it.',
    adds: [{ glyph: 'chart', name: 'torch.distributions.Categorical', runs: 'entropy in nats; divide by ln 2 for bits', conf: 'Categorical(probs=p).entropy() / math.log(2)' }],
    closeLabel: 'CLOSE-UP', closeHint: 'T = 1 softmax', close: (g) => graphic('entropy', g), mission: 'entropy',
    task: (ui) => ui.number({
      prompt: 'What is the entropy of [0.644, 0.237, 0.087, 0.032] in bits?', placeholder: '0.000', check: check.entropy, unit: 'bits',
      hint: (v) => near(v, 1) ? 'The probabilities sum to 1, but entropy is −Σ p log₂ p, not Σ p.'
        : near(v, 2) ? 'Two bits is four equal tokens. This distribution is peaked, so the entropy is lower.'
        : near(v, M.ANSWERS.entropy * Math.LN2) ? 'That is in nats (natural log). Use log₂ for bits, or divide by ln 2.'
        : 'Compute −p log₂ p for each of the four tokens and add them; use log₂.',
    }),
    after: () => `−Σ p log₂ p = ${W.probs.map((q) => f(-q * Math.log2(q))).join(' + ')} = <b>${f(M.ANSWERS.entropy)} bits</b>. After top-k it is ${f(M.entropyBits(W.topk.final))}, after top-p ${f(M.entropyBits(W.nucleus.final))}; at T = 0 it is 0.`,
  },
  { id: 'done', phase: 'done', kicker: 'Build complete', title: 'Keep your sampler', lead: 'Your settings produced the run on the board. Copy the generation config and the text it wrote.', view: 'board', closeLabel: 'YOUR OUTPUT', closeHint: 'draws used and the stopping point', close: (g) => graphic('stop', g), task: 'done' },
];

function configText(st) {
  const sampleOn = st.temperature > 0;
  return [
    'import torch',
    'from transformers import GenerationConfig',
    `torch.manual_seed(${st.seed})`,
    'config = GenerationConfig(',
    `    do_sample=${sampleOn ? 'True' : 'False'},`,
    ...(sampleOn ? [`    temperature=${f1(st.temperature)},`, `    top_k=${st.top_k},`, `    top_p=${f1(st.top_p)},`] : []),
    `    repetition_penalty=${f1(st.repetition_penalty)},`,
    `    max_new_tokens=${st.max_tokens},`,
    ')',
  ].join('\n');
}

createGuide({
  M, steps: STEPS, board,
  onBoard: (svg, ctx) => {
    if (!ctx.enter || !['loop', 'stop'].includes(ctx.step.id) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    svg.querySelectorAll('[data-tape-token]').forEach((chip, i) => chip.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, delay: i * 45, fill: 'backwards' }));
  },
  init: (g) => { G = g; Object.assign(g.settings, { ...M.DEFAULTS, ...g.settings, seed: M.DEFAULTS.seed, top_k: M.DEFAULTS.top_k, max_tokens: M.DEFAULTS.max_tokens }); },
  done: {
    stats: (g) => { const r = M.generate(g.settings); return [['text tokens', r.tokens.length], ['stopped by', r.reason], ['repeated 3-gram', r.repeated3 ? 'yes' : 'no']]; },
    artifactTitle: 'Your generation config and text',
    artifact: (g) => { const r = M.generate(g.settings); return `${configText(r.config)}\n\n# simulated output\n${r.text}`; },
  },
});
