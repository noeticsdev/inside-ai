// Inside AI platform SDK for machine pages. createIA() returns the `IA` object that live.js calls.
// It owns the rail: Predict, Missions, Log and Checkpoint. It keeps progress in localStorage and
// sends events to /api/events (AGENTS.md, "Platform contract"). Static hosts keep working offline.

const STORE = "ia:progress:v1";
const FLUSH_MS = 5000;
const BEAT_MS = 15000;
const IDLE_MS = 60000;

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}") || {};
  } catch {
    return {};
  }
}
function writeStore(all) {
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    /* private mode: progress lives for this page only */
  }
}

export function createIA({ M, data, root = document }) {
  const slug = data.slug;
  const all = readStore();
  const mine = (all[slug] ||= { missions: {}, predict: null, answers: {}, quiz: null, seconds: 0, runs: 0, last: 0 });
  const save = () => {
    mine.last = Date.now();
    all[slug] = mine;
    writeStore(all);
  };
  const $ = (s) => root.querySelector(s);
  const el = (tag, attrs = {}, text) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // ---------- events ----------
  const queue = [];
  let online = true;
  function send(type, payload = {}) {
    queue.push({ slug, type, data: payload, at: Date.now() });
  }
  function flush(final = false) {
    if (!online || !queue.length || location.protocol === "file:") return;
    const events = queue.splice(0, queue.length);
    fetch("/api/events", { method: "POST", credentials: "include", keepalive: final, headers: { "content-type": "application/json" }, body: JSON.stringify({ events }) })
      .then((r) => {
        if (r.status === 404 || r.status === 405) online = false;
      })
      .catch(() => {
        online = false;
      });
  }
  setInterval(flush, FLUSH_MS);
  addEventListener("pagehide", () => flush(true));
  addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush(true));

  let lastTouch = Date.now();
  let pendingSeconds = 0;
  for (const type of ["pointerdown", "keydown", "wheel", "pointermove"]) addEventListener(type, () => (lastTouch = Date.now()), { passive: true });
  setInterval(() => {
    if (document.visibilityState !== "visible" || Date.now() - lastTouch > IDLE_MS) return;
    pendingSeconds += BEAT_MS / 1000;
    mine.seconds += BEAT_MS / 1000;
    save();
    if (pendingSeconds >= 30) {
      send("heartbeat", { seconds: pendingSeconds });
      pendingSeconds = 0;
    }
  }, BEAT_MS);
  send("view");

  // ---------- log ----------
  const log = $("[data-ia-log]");
  function trace(text) {
    if (!log || !text) return;
    const line = el("li", {}, text);
    log.prepend(line);
    while (log.children.length > 40) log.lastChild.remove();
  }

  // ---------- toast ----------
  const toastBox = $("[data-ia-toast]");
  function toast(title, body) {
    if (!toastBox) return;
    const card = el("div", { class: "ia-toast", role: "status" });
    card.append(el("strong", {}, title), el("span", {}, body));
    toastBox.append(card);
    setTimeout(() => card.classList.add("out"), 3400);
    setTimeout(() => card.remove(), 4000);
  }

  // ---------- missions ----------
  const missions = data.missions;
  const checks = Object.fromEntries((M.MISSIONS || []).map((m) => [m.id, m.check]));
  let loader = null;
  const list = $("[data-ia-missions]");
  function renderMissions() {
    if (!list) return;
    list.textContent = "";
    missions.forEach((m, i) => {
      const done = Boolean(mine.missions[m.id]);
      const li = el("li", { class: "ia-mission", "data-done": String(done), "data-id": m.id });
      const head = el("div", { class: "ia-mission-head" });
      head.append(el("span", { class: "ia-mission-n", "aria-hidden": "true" }, done ? "✓" : String(i + 1)), el("strong", {}, m.title));
      li.append(head, el("p", {}, m.goal));
      const tools = el("div", { class: "ia-mission-tools" });
      const hintBtn = el("button", { type: "button", class: "ia-link" }, "Hint");
      const hint = el("p", { class: "ia-hint", hidden: "" }, m.hint);
      hintBtn.addEventListener("click", () => {
        hint.hidden = !hint.hidden;
        if (!hint.hidden && m.try && loader && !tools.querySelector("[data-show]")) {
          const show = el("button", { type: "button", class: "ia-link", "data-show": "" }, "Show me");
          show.addEventListener("click", () => {
            send("control", { name: "show-me", value: m.id });
            loader(m.try);
          });
          tools.append(show);
        }
      });
      tools.append(hintBtn);
      li.append(hint, tools);
      list.append(li);
    });
    const count = missions.filter((m) => mine.missions[m.id]).length;
    for (const node of root.querySelectorAll("[data-ia-count]")) node.textContent = `${count}/${missions.length}`;
    const bar = $("[data-ia-bar]");
    if (bar) bar.style.setProperty("--p", String(missions.length ? count / missions.length : 0));
    const cta = $("[data-ia-check-open]");
    if (cta) cta.dataset.ready = String(count === missions.length);
  }

  function ran(run) {
    mine.runs += 1;
    const fresh = [];
    for (const m of missions) {
      if (mine.missions[m.id] || !checks[m.id]) continue;
      let ok = false;
      try {
        ok = Boolean(checks[m.id](run));
      } catch (error) {
        console.warn("mission check failed", m.id, error);
      }
      if (ok) {
        mine.missions[m.id] = Date.now();
        fresh.push(m);
        send("mission", { id: m.id });
      }
    }
    save();
    renderMissions();
    for (const m of fresh) {
      const card = list && list.querySelector(`[data-id="${CSS.escape(m.id)}"]`);
      if (card) card.classList.add("ia-stamp");
      toast("Mission complete", m.title);
    }
    if (fresh.length && missions.every((m) => mine.missions[m.id])) {
      setTimeout(() => toast("All missions done", "Take the checkpoint to lock it in."), 900);
    }
    revealPrediction();
  }

  // ---------- predict ----------
  const pre = data.quiz.find((q) => q.stage === "pre");
  const preIndex = data.quiz.indexOf(pre);
  const predictBox = $("[data-ia-predict]");
  function renderPredict() {
    if (!predictBox || !pre) return;
    predictBox.textContent = "";
    predictBox.append(el("h2", {}, "Predict first"), el("p", { class: "ia-q" }, pre.question));
    if (mine.predict) {
      const chosen = pre.options[mine.predict.answer];
      const p = el("p", { class: "ia-pick" });
      p.append("You predicted: ", el("strong", {}, chosen));
      predictBox.append(p);
      if (mine.predict.revealed) {
        const verdict = el("p", { class: "ia-verdict", "data-ok": String(mine.predict.correct) }, mine.predict.correct ? "The machine agrees." : `The machine shows: ${pre.options[pre.correct]}`);
        predictBox.append(verdict, el("p", { class: "ia-explain" }, pre.explanation));
      } else {
        predictBox.append(el("p", { class: "ia-muted" }, "Run the machine to find out."));
      }
      return;
    }
    const opts = el("div", { class: "ia-options" });
    pre.options.forEach((option, i) => {
      const b = el("button", { type: "button", class: "ia-option" }, option);
      b.addEventListener("click", () => {
        mine.predict = { answer: i, correct: i === pre.correct, revealed: false, at: Date.now() };
        mine.answers[preIndex] = { answer: i, correct: i === pre.correct };
        send("predict", { answer: i, correct: i === pre.correct });
        save();
        renderPredict();
        root.querySelector("[data-ia-stage]")?.focus({ preventScroll: true });
      });
      opts.append(b);
    });
    const skip = el("button", { type: "button", class: "ia-link" }, "Skip and just play");
    skip.addEventListener("click", () => {
      predictBox.dataset.skipped = "true";
      predictBox.hidden = true;
    });
    predictBox.append(opts, skip);
  }
  function revealPrediction() {
    if (mine.predict && !mine.predict.revealed) {
      mine.predict.revealed = true;
      save();
      renderPredict();
    }
  }

  // ---------- checkpoint ----------
  const dialog = $("[data-ia-quiz]");
  const items = data.quiz.map((q, i) => ({ ...q, i })).filter((q) => q.stage !== "pre");
  let qi = 0;
  let score = 0;
  function renderQuestion() {
    const body = dialog.querySelector("[data-ia-quiz-body]");
    body.textContent = "";
    if (qi >= items.length) {
      mine.quiz = { score, of: items.length, at: Date.now(), best: Math.max(score, mine.quiz?.best || 0) };
      save();
      send("quiz_done", { score, of: items.length });
      body.append(el("h2", {}, `${score} / ${items.length}`));
      let line = score === items.length ? "Clean sweep. You know how this machine works." : score >= items.length - 1 ? "Strong. Read the one explanation you missed." : "Go back to the machine, try the missions again, then retake.";
      if (mine.predict) line += mine.predict.correct ? " Your prediction was right, too." : ` You predicted “${pre.options[mine.predict.answer]}” before you played.`;
      body.append(el("p", {}, line));
      const again = el("button", { type: "button", class: "ia-btn" }, "Retake");
      again.addEventListener("click", () => startQuiz());
      const close = el("button", { type: "button", class: "ia-btn ia-primary" }, data.next ? `Next: ${data.next.title}` : "Back to the machine");
      close.addEventListener("click", () => (data.next ? (location.href = data.next.href) : dialog.close()));
      const row = el("div", { class: "ia-row" });
      row.append(again, close);
      body.append(row);
      renderMissions();
      return;
    }
    const q = items[qi];
    body.append(el("p", { class: "ia-muted" }, `${q.stage === "post" ? "Transfer" : "Check"} · ${qi + 1} of ${items.length}`), el("h2", {}, q.question));
    const opts = el("div", { class: "ia-options" });
    const after = el("div", { class: "ia-after" });
    q.options.forEach((option, oi) => {
      const b = el("button", { type: "button", class: "ia-option" }, option);
      b.addEventListener("click", () => {
        const correct = oi === q.correct;
        if (correct) score += 1;
        mine.answers[q.i] = { answer: oi, correct };
        save();
        send("answer", { index: q.i, stage: q.stage, answer: oi, correct });
        for (const [n, node] of [...opts.children].entries()) {
          node.disabled = true;
          if (n === q.correct) node.dataset.state = "right";
          else if (n === oi) node.dataset.state = "wrong";
        }
        after.append(el("p", { class: "ia-explain" }, q.explanation));
        const next = el("button", { type: "button", class: "ia-btn ia-primary" }, qi + 1 < items.length ? "Next" : "See score");
        next.addEventListener("click", () => {
          qi += 1;
          renderQuestion();
        });
        after.append(next);
        next.focus();
      });
      opts.append(b);
    });
    body.append(opts, after);
    opts.firstChild?.focus();
  }
  function startQuiz() {
    qi = 0;
    score = 0;
    renderQuestion();
    if (!dialog.open) dialog.showModal();
  }
  $("[data-ia-check-open]")?.addEventListener("click", startQuiz);
  dialog?.querySelector("[data-ia-quiz-close]")?.addEventListener("click", () => dialog.close());

  // ---------- header: user + theme + labels ----------
  const who = $("[data-ia-user]");
  if (who && location.protocol !== "file:") {
    fetch("/api/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (!me) return;
        who.hidden = false;
        if (me.user && !me.user.guest) {
          who.textContent = me.user.name || "My progress";
          who.href = "/me/";
        } else {
          who.textContent = "Sign in to save progress";
          who.href = `/login/?next=${encodeURIComponent(location.pathname)}`;
        }
      })
      .catch(() => {});
  }

  renderMissions();
  renderPredict();
  if (mine.missions && Object.keys(mine.missions).length && predictBox && !mine.predict) predictBox.hidden = true;

  return {
    slug,
    ran,
    trace,
    event: (type, payload) => send(type, payload),
    onLoad: (fn) => (loader = fn),
    progress: () => JSON.parse(JSON.stringify(mine)),
    toast,
  };
}

export function theme(root = document.documentElement) {
  const asked = /[?&]theme=(light|dark)/.exec(location.search);
  let saved = null;
  try {
    saved = localStorage.getItem("ia:theme");
  } catch {}
  const value = asked ? asked[1] : saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const set = (v) => {
    root.dataset.theme = v;
    document.body?.setAttribute("data-theme", v);
  };
  set(value);
  return {
    toggle() {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      set(next);
      try {
        localStorage.setItem("ia:theme", next);
      } catch {}
    },
  };
}
