// Guided-build runtime: the step player shared by every lesson with content.layout = "guide".
// A lesson supplies its steps, a board() that draws the thing being built, and its model (with MISSIONS).
// This file owns navigation, the panel, task widgets, gating, persistence, the footer and the finish screen.
// Contract and step fields: AGENTS.md, "Guided-build lessons".
import { createIA, theme } from "./sdk.js";
import { mountPyCell } from "./pycell.js";

// ---------- DOM helpers (exported for lessons) ----------
const NS = "http://www.w3.org/2000/svg";
function put(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k.nodeType ? k : String(k));
  return el;
}
export const h = (tag, attrs, ...kids) => add(put(document.createElement(tag), attrs), kids);
export const s = (tag, attrs, ...kids) => add(put(document.createElementNS(NS, tag), attrs), kids);
export const fmt = (n) => Number(n).toLocaleString("en-US");
export const r3 = (v) => Math.round(v * 1000) / 1000;
export const svgBox = (w, hh, label) => s("svg", { viewBox: `0 0 ${w} ${hh}`, role: "img", "aria-label": label, style: `max-width:${w}px` });
export const T_ = (x, y, text, cls = "cu-t", anchor) => s("text", { x, y, class: cls, "text-anchor": anchor, text });
export const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const metricsRow = (items) => h("div", { class: "metrics" }, items.map(([a, b, c]) => h("div", {}, h("span", { text: a }), h("strong", { class: c, text: String(b) }))));

// small fine-line glyphs for the parts list
export function glyph(kind) {
  const g = s("svg", { viewBox: "0 0 40 32", "aria-hidden": "true" });
  const st = { fill: "none", stroke: "currentColor", "stroke-width": 1.2 };
  const R = (x, y, w, hh, rx = 0) => s("rect", { ...st, x, y, width: w, height: hh, rx });
  const P = (d) => s("path", { ...st, d });
  const C = (cx, cy, r) => s("circle", { ...st, cx, cy, r });
  const shapes = {
    cpu: () => [R(10, 6, 20, 20, 2), R(15, 11, 10, 10), ...[13, 20, 27].flatMap((p) => [P(`M${p} 2v4`), P(`M${p} 26v4`)])],
    gpu: () => [R(3, 7, 34, 18, 2), ...[0, 1, 2, 3].map((i) => R(7 + i * 7, 11, 5, 5)), P("M6 25v4M34 25v4")],
    nic: () => [R(4, 8, 32, 16, 2), R(8, 12, 8, 8), P("M20 16h12M28 12l4 4-4 4")],
    cam: () => [R(12, 9, 24, 15, 3), C(11, 16.5, 6), P("M24 24v6")],
    model: () => [R(6, 6, 28, 20, 2), R(11, 10, 9, 9), R(19, 14, 10, 8)],
    doc: () => [P("M10 3h14l6 6v20H10z"), P("M24 3v6h6M14 15h12M14 20h12M14 25h8")],
    db: () => [s("ellipse", { ...st, cx: 20, cy: 8, rx: 11, ry: 4 }), P("M9 8v16c0 2.2 4.9 4 11 4s11-1.8 11-4V8M9 16c0 2.2 4.9 4 11 4s11-1.8 11-4")],
    matrix: () => [R(6, 5, 28, 22, 1), P("M6 12h28M6 19h28M15 5v22M24 5v22")],
    vector: () => [P("M6 26L30 8"), P("M24 7l6 1-2 6"), C(6, 26, 2)],
    text: () => [P("M8 9h24M8 15h24M8 21h16")],
    loop: () => [P("M28 12a9 9 0 1 0 1 8"), P("M29 6v7h-7")],
    tool: () => [P("M24 6a6 6 0 0 0-7 8L7 24l3 3 10-10a6 6 0 0 0 8-7l-4 4-3-1-1-3z")],
    dice: () => [R(9, 6, 22, 22, 4), C(15, 12, 1.5), C(25, 22, 1.5), C(20, 17, 1.5)],
    chart: () => [P("M6 27h28M6 27V5"), P("M9 22l7-7 6 4 9-11")],
    key: () => [C(12, 16, 6), P("M18 16h16M29 16v5M33 16v4")],
    tag: () => [R(6, 9, 28, 14, 7), P("M12 16h16")],
  };
  g.append(...(shapes[kind] || shapes.tag)());
  return g;
}

export function pyCell(host, spec) {
  try {
    return mountPyCell(host, spec);
  } catch (error) {
    host.append(h("p", { class: "cu-cap", text: "The Python cell could not load here." }));
    console.warn(error);
    return null;
  }
}

// ---------- the guide ----------
const PHASES = [
  ["kit", "Kit"],
  ["build", "Build"],
  ["scale", "Scale"],
  ["done", "Done"],
];

export function createGuide({ M, steps, board, onBoard, done = {}, phaseNames = {}, words = {}, init }) {
  const L = window.__LESSON__;
  L.missionChecks = Object.fromEntries((M.MISSIONS || []).map((m) => [m.id, m.check]));
  L.words = { right: "You were right.", shows: "The build showed", later: "You will find out as you build.", skip: "Skip the prediction", ...words };
  const T = theme();
  document.querySelector("[data-ia-theme]")?.addEventListener("click", () => T.toggle());
  const IA = createIA({ M: { MISSIONS: [] }, data: L });
  window.IA = IA;

  const KEY = `ia:guide:${L.slug}`;
  const state = (() => {
    try {
      return { step: 0, revealed: {}, max: 0, settings: {}, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    } catch {
      return { step: 0, revealed: {}, max: 0, settings: {} };
    }
  })();
  state.settings ||= {};
  const saveState = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  };

  const stage = document.querySelector("[data-gd-stage]");
  const panel = document.querySelector("[data-gd-panel]");
  const nextBtn = document.querySelector("[data-gd-next]");
  const nextLabel = document.querySelector("[data-gd-next-label]");
  const backBtn = document.querySelector("[data-gd-back]");
  const phases = document.querySelector("[data-gd-phases]");
  const parking = document.querySelector("[data-gd-parking]");
  nextLabel.before(h("span", { class: "gd-tick", "aria-hidden": "true", text: "✓" }));

  const BUILD = steps.filter((x) => x.phase === "build");
  const solved = (id) => IA.isDone(id) || Boolean(state.revealed[id]);
  const stepReady = (st) => !st.mission || solved(st.mission);
  const builtAt = (i) => (["scale", "done"].includes(steps[i].phase) ? BUILD.length : steps.slice(0, i + 1).filter((x) => x.phase === "build").length);
  let kitHw = null;
  let partsHost = null;
  let currentSolved = null;
  let playTimer = 0;

  const g = {
    M,
    IA,
    state,
    settings: state.settings,
    solved,
    saveSettings: saveState,
    pass: (id, detail) => passStep(id, detail),
    rerender: (opts) => renderStage(opts),
    refreshParts: () => renderParts(),
    go: (i) => go(i),
    step: () => steps[state.step],
    // a single shared timer for play buttons in benches; cleared on every step change
    play(fn, ms) {
      clearTimeout(playTimer);
      const tick = () => {
        const more = fn();
        playTimer = more ? setTimeout(tick, still ? 0 : ms) : 0;
        renderStage();
      };
      playTimer = setTimeout(tick, 0);
    },
    stop() {
      clearTimeout(playTimer);
      playTimer = 0;
    },
    playing: () => Boolean(playTimer),
  };

  function renderPhases() {
    const cur = steps[state.step];
    phases.replaceChildren(
      ...PHASES.filter(([p]) => steps.some((x) => x.phase === p)).map(([p, label]) => {
        const i = steps.findIndex((x) => x.phase === p);
        const small = cur.phase === p && p === "build" ? `${BUILD.indexOf(cur) + 1}/${BUILD.length}` : "";
        const b = h("button", { type: "button", disabled: i > state.max, "aria-current": cur.phase === p ? "step" : null }, phaseNames[p] || label, small ? h("small", { text: small }) : null);
        if (small) b.append(h("i", { style: `width:calc(${(BUILD.indexOf(cur) + 1) / BUILD.length} * (100% - 20px))` }));
        b.onclick = () => go(i);
        return b;
      }),
    );
  }

  function fitBoard() {
    const svg = stage.querySelector(".gd-board svg");
    if (!svg || matchMedia("(max-width: 900px)").matches) return;
    const card = stage.querySelector(".gd-close");
    const room = stage.clientHeight - (card ? card.offsetHeight + 26 : 0) - 14;
    svg.style.maxHeight = `${Math.max(400, room)}px`;
  }
  addEventListener("resize", () => fitBoard());

  function stepNumber(i) {
    const st = steps[i];
    if (st.num !== undefined) return st.num;
    return st.phase === "build" || st.phase === "scale" ? String(i) : "";
  }

  function renderStage({ animate = false } = {}) {
    const i = state.step;
    const st = steps[i];
    stage.replaceChildren();
    const num = stepNumber(i);
    if (num) stage.append(h("div", { class: "gd-num", text: num }));
    if (st.view === "bench") {
      if (st.where) stage.append(h("div", { class: "gd-where" }, "runs on", h("b", { text: st.where })));
      const bench = h("div", { class: "gd-bench" });
      stage.append(bench);
      st.bench(bench, g);
      return;
    }
    const ctx = { step: st, index: i, built: builtAt(i), on: st.id === steps[0].id && st.phase === "kit" ? (kitHw ? [kitHw] : []) : st.on || [], fresh: st.phase === "build" ? BUILD.indexOf(st) + 1 : null, enter: animate, hit: st.phase === "kit" ? (id) => ((kitHw = id), renderStage(), renderParts()) : null, solved, settings: state.settings, g };
    const svg = board(ctx);
    stage.append(h("div", { class: "gd-board" }, svg));
    if (onBoard) {
      if (animate) requestAnimationFrame(() => onBoard(svg, ctx));
      else onBoard(svg, ctx);
    }
    if (st.close) {
      const tools = h("div", { class: "gd-tools" });
      const body = h("div", { class: "gd-close-body" }, st.close(g));
      const card = h("div", { class: "gd-close" }, h("div", { class: "gd-close-head" }, h("b", { text: st.closeLabel || "CLOSE-UP" }), h("span", { text: st.closeHint || "" }), tools), body);
      if (st.code) {
        const codeBox = h("div", { class: "gd-close-code" });
        tools.append(h("button", { class: "gd-tool", type: "button", text: "Code it in Python", onclick: (e) => (e.currentTarget.remove(), pyCell(codeBox, { ...st.code, onPass: () => IA.event("control", { name: "pycell", value: `${st.code.id}:pass` }) }), codeBox.scrollIntoView({ block: "nearest" })) }));
        card.append(codeBox);
      }
      if (st.replay) tools.append(h("button", { class: "gd-tool", type: "button", text: "Replay", onclick: () => renderStage({ animate: true }) }));
      stage.append(card);
    }
    fitBoard();
  }

  // ---------- task widgets ----------
  function taskUi(st, box, fb, onRevealed) {
    let tries = 0;
    const fail = (msg) => {
      tries += 1;
      fb.dataset.ok = "false";
      fb.textContent = msg;
      if (tries >= 2 && !box.querySelector(".gd-reveal") && st.mission) {
        const rv = h("button", { class: "gd-reveal", type: "button", text: "Show me the answer" });
        rv.onclick = () => {
          state.revealed[st.mission] = true;
          st.onReveal?.(g);
          saveState();
          IA.event("control", { name: "reveal", value: st.mission });
          onRevealed();
        };
        box.append(rv);
      }
    };
    const note = (msg) => {
      fb.dataset.ok = "false";
      fb.textContent = msg;
    };
    const ok = (detail) => passStep(st.mission, detail);
    return {
      fail,
      note,
      ok,
      // a numeric answer; hint(v, tries) explains the common wrong answers
      number({ prompt, placeholder = "answer", check, hint, onTry, unit }) {
        const inp = h("input", { type: "number", inputmode: "decimal", step: "any", placeholder, "aria-label": placeholder });
        const btn = h("button", { class: "ia-btn ia-primary", type: "button", text: "Check" });
        const run = () => {
          if (!inp.value.trim()) return;
          const v = Number(String(inp.value).replace(/[, _]/g, ""));
          onTry?.(v);
          const good = Boolean(check(v));
          IA.event("answer", { index: -1, stage: "mission", answer: v, correct: good });
          if (good) ok({ value: v });
          else fail(hint ? hint(v, tries + 1) : "Not quite.");
        };
        btn.onclick = run;
        inp.onkeydown = (e) => e.key === "Enter" && run();
        return [h("p", { text: prompt }), h("div", { class: "gd-row" }, inp, unit ? h("span", { class: "gd-unit", text: unit }) : null, btn)];
      },
      // options: [id, label, whyWrong|null]; check(id) decides
      choice({ prompt, options, check, why }) {
        const wrap = h("div", { class: "gd-choices" });
        for (const [id, label, wrong] of options) {
          const b = h("button", { class: "gd-choice", type: "button", text: label });
          b.onclick = () => {
            const good = Boolean(check(id));
            IA.event("answer", { index: -1, stage: "mission", answer: id, correct: good });
            b.dataset.state = good ? "yes" : "no";
            if (good) ok({ choice: id });
            else fail(wrong || (why ? why(id) : "Not this one."));
          };
          wrap.append(b);
        }
        return [h("p", { text: prompt }), wrap];
      },
      // tap items in order; items: [id, label]; order: ids (a subset is allowed: distractors stay unpicked)
      order({ prompt, items, order, why = {}, check }) {
        const seq = h("div", { class: "gd-seq" });
        const picked = [];
        const wrap = h("div", { class: "gd-chips" });
        for (const [id, label] of items) {
          const b = h("button", { class: "gd-chip", type: "button", text: label });
          b.onclick = () => {
            if (id === order[picked.length]) {
              picked.push(id);
              b.disabled = true;
              seq.append(h("span", { text: label }));
              fb.textContent = "";
              if (picked.length === order.length && (!check || check(picked))) ok({ order: picked });
            } else {
              b.dataset.state = "no";
              setTimeout(() => delete b.dataset.state, 400);
              IA.event("answer", { index: -1, stage: "mission", answer: id, correct: false });
              fail(why[id] || "Not that one yet.");
            }
          };
          wrap.append(b);
        }
        return [h("p", { text: prompt }), wrap, seq];
      },
      // live sliders; check() returns true when solved, or a string explaining what is still wrong
      sliders({ prompt, sliders, check }) {
        const rows = sliders.map((sl) => {
          const show = (v) => (sl.format ? sl.format(v) : String(v));
          const out = h("output", { text: show(sl.get()) });
          const r = h("input", { type: "range", min: sl.min, max: sl.max, step: sl.step, value: sl.get(), "aria-label": sl.label });
          r.oninput = () => {
            sl.set(Number(r.value));
            out.textContent = show(Number(r.value));
            saveState();
            renderStage();
            renderParts();
            IA.event("control", { name: sl.label, value: r.value });
            const res = check();
            if (res === true) ok({ [sl.label]: Number(r.value) });
            else if (typeof res === "string") note(res);
          };
          return h("div", { class: "gd-slider" }, h("label", {}, sl.label, out), r);
        });
        return [h("p", { text: prompt }), ...rows];
      },
      // live selects; same check() contract as sliders
      selects({ prompt, selects, check }) {
        const els = selects.map((se) => {
          const el = h("select", { class: "gd-select", "aria-label": se.label }, se.options.map(([v, label]) => h("option", { value: v, text: label, selected: String(v) === String(se.get()) })));
          el.onchange = () => {
            se.set(se.parse ? se.parse(el.value) : el.value);
            saveState();
            renderStage();
            renderParts();
            IA.event("control", { name: se.label, value: el.value });
            const res = check();
            if (res === true) ok({ [se.label]: el.value });
            else if (typeof res === "string") fail(res);
          };
          return h("label", { class: "gd-sel" }, h("span", { text: se.label }), el);
        });
        return [h("p", { text: prompt }), h("div", { class: "gd-row" }, els)];
      },
      // the step's Python cell lives on the bench and calls g.pass(mission) on 5/5;
      // fallback: [label (code), good, whyWrong] for readers whose browser cannot load Python
      code({ prompt, fallback = [] }) {
        const out = [h("p", { text: prompt })];
        if (fallback.length) {
          const details = h("details", { class: "gd-fallback" }, h("summary", { text: "Python won't load here? Pick the rule instead" }));
          const wrap = h("div", { class: "gd-choices" });
          for (const [label, good, wrong] of fallback) {
            const b = h("button", { class: "gd-choice", type: "button" }, h("code", { text: label }));
            b.onclick = () => {
              b.dataset.state = good ? "yes" : "no";
              if (good) ok({ passed: true, fallback: true });
              else fail(wrong || "Not this one.");
            };
            wrap.append(b);
          }
          details.append(wrap);
          out.push(details);
        }
        return out;
      },
    };
  }

  function renderParts() {
    const st = steps[state.step];
    if (!partsHost) return;
    if (st.parts) {
      const out = [];
      let list = null;
      for (const p of st.parts(g)) {
        if (p.title) {
          out.push(h("h3", { class: "gd-h" }, p.title, p.n !== undefined ? h("span", { text: String(p.n) }) : null));
          list = h("div", { class: "gd-parts" });
          out.push(list);
          continue;
        }
        const row = h("div", { class: `gd-part ${p.hw && p.hw === kitHw ? "is-on" : ""}` }, glyph(p.glyph), h("div", {}, h("div", { class: "gd-part-name", text: p.name }), h("div", { class: "gd-part-runs", text: p.runs })));
        if (p.hw) {
          row.style.cursor = "pointer";
          row.onclick = () => ((kitHw = p.hw), renderStage(), renderParts());
        }
        (list || (list = out[out.push(h("div", { class: "gd-parts" })) - 1])).append(row);
      }
      partsHost.replaceChildren(...out);
      return;
    }
    const adds = typeof st.adds === "function" ? st.adds(g) : st.adds;
    if (!adds || !adds.length) return partsHost.replaceChildren();
    partsHost.replaceChildren(
      h("h3", { class: "gd-h" }, st.addsLabel || "You add", h("span", { text: String(adds.length) })),
      h(
        "div",
        { class: "gd-parts" },
        adds.map((a) => h("div", { class: "gd-part" }, glyph(a.glyph), h("div", {}, h("div", { class: "gd-part-name", text: a.name }), h("div", { class: "gd-part-runs", text: a.runs })), a.conf ? h("pre", { text: typeof a.conf === "function" ? a.conf(g) : a.conf }) : null)),
      ),
    );
  }

  function renderPanel() {
    const i = state.step;
    const st = steps[i];
    const numbered = steps.filter((x) => x.phase === "build" || x.phase === "scale").length;
    const left = steps.slice(i).reduce((a, x) => a + (x.minutes || 0), 0);
    const kicker = st.phase === "build" || st.phase === "scale" ? `Step ${i} of ${numbered} · ${st.kicker}` : st.kicker;
    panel.replaceChildren(h("div", { class: "gd-meta" }, h("span", { class: "gd-kicker", text: kicker }), left ? h("span", { class: "gd-left", text: `${left} min left` }) : null), h("h2", { class: "gd-title", text: st.title }), h("p", { class: "gd-lead", html: st.lead }));
    partsHost = h("div");
    panel.append(partsHost);
    renderParts();

    if (st.task === "predict") {
      const pred = document.querySelector("[data-ia-predict]");
      if (pred) {
        pred.hidden = false;
        panel.append(pred);
      }
    } else if (st.task === "done") {
      done.before?.(g);
      const stats = done.stats ? done.stats(g) : [];
      if (stats.length) panel.append(h("div", { class: "gd-stats" }, stats.map(([a, b]) => h("div", {}, h("span", { text: a }), h("strong", { text: String(b) })))));
      if (done.artifact) {
        const copy = h("button", { class: "gd-tool", type: "button", text: "Copy" });
        copy.onclick = () => navigator.clipboard?.writeText(done.artifact(g)).then(() => (copy.textContent = "Copied"));
        panel.append(h("h3", { class: "gd-h gd-h-row" }, done.artifactTitle || "What you built", copy), h("div", { class: "gd-config" }, h("pre", { text: done.artifact(g) })));
      }
      const check = document.querySelector("[data-gd-check]");
      if (check) panel.append(check);
    } else if (typeof st.task === "function") {
      const box = h("div", { class: "gd-task" });
      const fb = h("div", { class: "gd-fb", "aria-live": "polite" });
      const tag = h("span", { class: "gd-task-tag", text: "Your move" });
      const afterBox = h("div");
      const showSolved = () => {
        box.dataset.done = "true";
        tag.textContent = state.revealed[st.mission] && !IA.isDone(st.mission) ? "✓ Answer shown" : "✓ Solved";
        fb.textContent = "";
        box.querySelector(".gd-reveal")?.remove();
        if (st.after) afterBox.replaceChildren(h("div", { class: "gd-after" }, h("h4", { text: "What just happened" }), h("div", { html: st.after(g) })));
        syncNext();
      };
      const ui = taskUi(st, box, fb, () => {
        renderStage();
        renderParts();
        showSolved();
      });
      currentSolved = showSolved;
      box.append(tag, ...[].concat(st.task(ui, g)), fb);
      panel.append(box, afterBox);
      if (st.mission && solved(st.mission)) showSolved();
    }
    const nx = steps[i + 1];
    if (nx) {
      const card = h("button", { class: "gd-next-card", type: "button", disabled: !stepReady(st) }, h("b", { text: nx.phase === "done" ? "✓" : stepNumber(i + 1) || "→" }), h("span", { text: nx.title }), h("span", { "aria-hidden": "true", text: "→" }));
      card.onclick = () => stepReady(st) && go(i + 1);
      panel.append(h("h3", { class: "gd-h", text: "Up next" }), card);
    }
    panel.scrollTop = 0;
  }

  function passStep(mission, detail) {
    if (!mission) return;
    if (IA.complete(mission, { quiet: true })) IA.event("control", { name: "step-solved", value: mission, detail });
    renderStage();
    renderParts();
    if (steps[state.step].mission === mission) currentSolved?.();
    syncNext();
  }

  function syncNext() {
    const st = steps[state.step];
    const ready = stepReady(st);
    nextBtn.dataset.ready = String(ready);
    nextBtn.setAttribute("aria-disabled", String(!ready));
    backBtn.disabled = state.step === 0;
    const card = panel.querySelector(".gd-next-card");
    if (card) card.disabled = !ready;
    if (st.phase === "done") {
      nextLabel.textContent = "Take the checkpoint";
      return;
    }
    nextLabel.textContent = !ready ? "Solve the task to continue" : st.nextLabel || (steps[state.step + 1].phase === "done" ? "Done, finish up" : "Done, next step");
  }

  function go(i, { animate = true } = {}) {
    g.stop();
    state.step = Math.max(0, Math.min(steps.length - 1, i));
    state.max = Math.max(state.max, state.step);
    saveState();
    IA.event("control", { name: "step", value: steps[state.step].id });
    if (steps[state.step].phase === "done") IA.event("control", { name: "guide-finished", value: true });
    currentSolved = null;
    for (const sel of ["[data-ia-predict]", "[data-gd-check]"]) {
      const n = document.querySelector(sel);
      if (n && !parking.contains(n)) parking.append(n);
    }
    steps[state.step].enter?.(g);
    renderPhases();
    renderPanel();
    renderStage({ animate });
    syncNext();
    stage.scrollTop = 0;
    if (matchMedia("(max-width: 900px)").matches) scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
  }

  nextBtn.addEventListener("click", () => {
    if (steps[state.step].phase === "done") return document.querySelector("[data-ia-check-open]")?.click();
    if (!stepReady(steps[state.step])) {
      panel.querySelector(".gd-task")?.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
      panel.querySelector(".gd-task input, .gd-task button, .gd-task select")?.focus({ preventScroll: true });
      return;
    }
    go(state.step + 1);
  });
  backBtn.addEventListener("click", () => go(state.step - 1));
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowRight" && stepReady(steps[state.step])) go(state.step + 1);
    if (e.key === "ArrowLeft") go(state.step - 1);
  });

  init?.(g);
  const fromUrl = /[?&]step=(\d+)/.exec(location.search);
  go(fromUrl ? Number(fromUrl[1]) : Math.min(state.step, steps.length - 1));
  window.__lesson = { ready: true, M, go, state, steps: steps.map((x) => x.id), g };
  return g;
}
