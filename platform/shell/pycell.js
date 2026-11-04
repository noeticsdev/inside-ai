// pycell.js: editable, runnable Python cells with graded checks.
// Python runs in one shared Web Worker (Pyodide, loaded lazily from the CDN).
// Usage: mountPyCell(host, { id, title, prompt, starter, tests, data, solution, onPass }).

const PYODIDE_BASE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const TIMEOUT_MS = 6000;
const LOAD_TIMEOUT_MS = 120000;
const OUTPUT_CAP = 200;
const MIN_LINES = 6;
const INDENT = "    ";

// ---------------------------------------------------------------- worker

const HARNESS = String.raw`
import sys, json, ast, traceback, linecache

class _PcOut:
    encoding = "utf-8"
    def __init__(self, cap):
        self.parts, self.lines, self.cap, self.truncated = [], 0, cap, False
    def write(self, s):
        s = str(s)
        n = len(s)
        while s and not self.truncated:
            if self.lines >= self.cap:
                self.truncated = True
                break
            i = s.find("\n")
            if i < 0:
                self.parts.append(s)
                break
            self.parts.append(s[: i + 1])
            self.lines += 1
            s = s[i + 1 :]
        return n
    def flush(self):
        pass
    def isatty(self):
        return False

def _pc_fmt(e):
    if isinstance(e, SyntaxError) and e.filename == "<your code>":
        out = f"{type(e).__name__}: {e.msg} (line {e.lineno})"
        if e.text:
            line = e.text.rstrip("\n")
            body = line.lstrip()
            out += "\n    " + body
            if e.offset:
                out += "\n    " + " " * max(0, e.offset - 1 - (len(line) - len(body))) + "^"
        return out
    frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "<your code>"]
    parts = []
    if frames:
        parts.append("Traceback (most recent call last):")
        for f in frames[-5:]:
            where = "" if f.name == "<module>" else f", in {f.name}"
            parts.append(f"  line {f.lineno}{where}")
            if f.line:
                parts.append("    " + f.line.strip())
    msg = str(e)
    parts.append(f"{type(e).__name__}: {msg}" if msg else type(e).__name__)
    return "\n".join(parts)

def _pc_test_name(node):
    v = getattr(node, "value", None)
    if isinstance(node, ast.Expr) and isinstance(v, ast.Call) and isinstance(v.func, ast.Name) and v.func.id == "check" and v.args and isinstance(v.args[0], ast.Constant):
        return str(v.args[0].value)
    return f"tests line {node.lineno}"

def _pc_no_input(*a, **k):
    raise RuntimeError("input() is not available in a code cell")

def _pc_run(code, tests, data_json):
    results = []
    def check(name, condition, message=""):
        ok = bool(condition)
        results.append({"name": str(name), "ok": ok, "message": "" if ok else str(message)})
        return ok
    ns = {"__name__": "__main__", "DATA": json.loads(data_json), "check": check, "input": _pc_no_input}
    linecache.cache["<your code>"] = (len(code), None, code.splitlines(True), "<your code>")
    out = _PcOut(${OUTPUT_CAP})
    saved = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = out
    error = None
    test_error = None
    ran_tests = False
    try:
        try:
            exec(compile(code, "<your code>", "exec"), ns)
        except BaseException as e:
            error = _pc_fmt(e)
        if error is None and tests.strip():
            results.clear()
            ns["check"] = check
            try:
                tree = ast.parse(tests, "<tests>")
            except SyntaxError as e:
                tree = None
                test_error = f"The tests have a syntax error on line {e.lineno}: {e.msg}"
            if tree is not None:
                ran_tests = True
                for node in tree.body:
                    mod = ast.Module(body=[node], type_ignores=[])
                    try:
                        exec(compile(mod, "<tests>", "exec"), ns)
                    except BaseException as e:
                        msg = str(e)
                        results.append({"name": _pc_test_name(node), "ok": False,
                                        "message": "raised " + (f"{type(e).__name__}: {msg}" if msg else type(e).__name__)})
    finally:
        sys.stdout, sys.stderr = saved
        linecache.cache.pop("<your code>", None)
    return json.dumps({"stdout": "".join(out.parts), "truncated": out.truncated, "error": error,
                       "testError": test_error, "ranTests": ran_tests, "results": results})
`;

const WORKER_SRC = `
const BASE = ${JSON.stringify(PYODIDE_BASE)};
const HARNESS = ${JSON.stringify(HARNESS)};
let py = null;
let runFn = null;
async function boot() {
  if (py) return;
  self.postMessage({ type: "status", text: "loading" });
  importScripts(BASE + "pyodide.js");
  const p = await loadPyodide({ indexURL: BASE, stdout: () => {}, stderr: () => {} });
  p.runPython(HARNESS);
  runFn = p.globals.get("_pc_run");
  py = p;
}
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type !== "run") return;
  try {
    await boot();
    try {
      await py.loadPackagesFromImports(m.code + "\\n" + m.tests, {
        messageCallback: (t) => { if (/^Loading /.test(t)) self.postMessage({ type: "status", text: "packages", detail: t }); },
        errorCallback: () => {},
      });
    } catch (_) { /* missing packages surface as ImportError in the run */ }
    self.postMessage({ type: "start", runId: m.runId });
    const json = runFn(m.code, m.tests, m.data);
    self.postMessage({ type: "result", runId: m.runId, result: JSON.parse(json) });
  } catch (err) {
    self.postMessage({ type: "result", runId: m.runId, result: { fatal: String((err && err.message) || err) } });
  }
};
`;

let worker = null;
let workerUrl = null;
let pyReady = false;
let everStarted = false;
let current = null;
let timer = 0;
let runSeq = 0;
const queue = [];

function getWorker() {
  if (worker) return worker;
  if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
  worker = new Worker(workerUrl);
  worker.onmessage = onWorkerMessage;
  worker.onerror = (e) => {
    e.preventDefault?.();
    killWorker();
    finish({ fatal: `Could not start Python: ${e.message || "network or script error"}` });
  };
  return worker;
}

function killWorker() {
  clearTimeout(timer);
  if (worker) worker.terminate();
  worker = null;
  pyReady = false;
}

function onWorkerMessage(e) {
  const m = e.data;
  if (!current) return;
  if (m.type === "status") {
    current.onStatus(m.text === "loading" ? (everStarted ? "restart" : "loading") : "packages", m.detail);
  } else if (m.type === "start" && m.runId === current.runId) {
    pyReady = true;
    everStarted = true;
    current.onStatus("running");
    clearTimeout(timer);
    timer = setTimeout(() => {
      killWorker();
      finish({ timeout: true });
    }, TIMEOUT_MS);
  } else if (m.type === "result" && m.runId === current.runId) {
    clearTimeout(timer);
    if (m.result && m.result.fatal) {
      killWorker();
    }
    finish(m.result);
  }
}

function finish(result) {
  const job = current;
  current = null;
  if (job) job.resolve(result);
  pump();
}

function pump() {
  if (current || !queue.length) return;
  current = queue.shift();
  current.onStatus(pyReady ? "running" : everStarted ? "restart" : "loading");
  clearTimeout(timer);
  timer = setTimeout(() => {
    killWorker();
    finish({ fatal: "Python took too long to load." });
  }, LOAD_TIMEOUT_MS);
  getWorker().postMessage({ type: "run", runId: current.runId, code: current.code, tests: current.tests, data: current.data });
}

function enqueue(job) {
  return new Promise((resolve) => {
    job.runId = ++runSeq;
    job.resolve = resolve;
    queue.push(job);
    if (current) job.onStatus("queued");
    pump();
  });
}

function cancelJobsFor(owner) {
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].owner === owner) queue.splice(i, 1);
  if (current && current.owner === owner) current.onStatus = () => {};
}

// ---------------------------------------------------------------- styles

const CSS = `
.pc-cell { --pc-lh: 21px; --pc-pad: 12px; box-sizing: border-box; margin: 20px 0; padding: 18px 18px 16px; max-width: 100%; min-width: 0;
  background: var(--ia-card, #fbfaf5); border: 1px solid var(--ia-line, #d9d2c1); border-radius: 12px; color: var(--ia-text, #3a3f52);
  font: 15px/1.55 var(--ia-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif); }
.pc-cell *, .pc-cell *::before, .pc-cell *::after { box-sizing: border-box; }
.pc-cell [hidden] { display: none !important; }
.pc-head { display: flex; align-items: baseline; gap: 10px; margin: 0 0 6px; }
.pc-title { margin: 0; font-size: 16px; font-weight: 650; line-height: 1.3; color: var(--ia-strong, #1b2340); letter-spacing: -0.01em; }
.pc-tag { margin-left: auto; flex: none; padding: 2px 8px; border: 1px solid var(--ia-line, #d9d2c1); border-radius: 999px;
  font: 11px/1.5 var(--ia-mono, "JetBrains Mono", ui-monospace, monospace); color: var(--ia-muted, #747a8c); letter-spacing: 0.02em; }
.pc-prompt { margin: 0 0 14px; color: var(--ia-text, #3a3f52); }
.pc-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.pc-editor { display: flex; min-width: 0; background: var(--ia-page, #f2efe7); border: 1px solid var(--ia-line, #d9d2c1); border-radius: 8px; overflow: hidden; }
.pc-editor:focus-within { border-color: var(--ia-accent, #5b3fd9); box-shadow: 0 0 0 1px var(--ia-accent, #5b3fd9); }
.pc-gutter { flex: none; min-width: 40px; padding: var(--pc-pad) 10px var(--pc-pad) 8px; margin: 0; text-align: right; user-select: none;
  border-right: 1px solid var(--ia-line, #d9d2c1); background: var(--ia-sunk, #ebe6da); color: var(--ia-muted, #747a8c);
  font: 12px/var(--pc-lh) var(--ia-mono, "JetBrains Mono", ui-monospace, monospace); white-space: pre; }
.pc-code { flex: 1 1 auto; min-width: 0; display: block; width: 100%; margin: 0; padding: var(--pc-pad) 14px; border: 0; border-radius: 0; outline: none; resize: none;
  min-height: calc(var(--pc-lh) * ${MIN_LINES} + var(--pc-pad) * 2); overflow-x: auto; overflow-y: hidden; white-space: pre; overflow-wrap: normal;
  background: transparent; color: var(--ia-strong, #1b2340); caret-color: var(--ia-accent, #5b3fd9);
  font: 13.5px/var(--pc-lh) var(--ia-mono, "JetBrains Mono", ui-monospace, monospace); tab-size: 4; font-variant-ligatures: none; }
.pc-code::selection { background: color-mix(in srgb, var(--ia-accent, #5b3fd9) 24%, transparent); }
.pc-hint { margin: 6px 0 0; font-size: 12px; color: var(--ia-muted, #747a8c); }
.pc-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0 0; }
.pc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 0 16px; border-radius: 8px; cursor: pointer;
  font: 600 14px/1 var(--ia-sans, ui-sans-serif, system-ui, sans-serif); border: 1px solid var(--ia-line, #d9d2c1);
  background: var(--ia-card, #fbfaf5); color: var(--ia-strong, #1b2340); transition: background-color .12s, border-color .12s; }
.pc-btn:hover { background: var(--ia-sunk, #ebe6da); }
.pc-btn:focus-visible { outline: 2px solid var(--ia-accent, #5b3fd9); outline-offset: 2px; }
.pc-btn[disabled] { opacity: .6; cursor: progress; }
.pc-run { background: var(--ia-accent, #5b3fd9); border-color: var(--ia-accent, #5b3fd9); color: var(--ia-card, #fbfaf5); }
.pc-run:hover { background: color-mix(in srgb, var(--ia-accent, #5b3fd9) 88%, var(--ia-strong, #1b2340)); }
.pc-kbd { font: 500 11px/1 var(--ia-mono, ui-monospace, monospace); opacity: .75; }
.pc-status { margin-left: auto; font: 12.5px/1.4 var(--ia-mono, ui-monospace, monospace); color: var(--ia-muted, #747a8c); min-width: 0; }
.pc-out { margin: 14px 0 0; padding: 10px 14px; max-height: 300px; overflow: auto; background: var(--ia-sunk, #ebe6da); border: 1px solid var(--ia-line, #d9d2c1);
  border-radius: 8px; font: 12.5px/1.55 var(--ia-mono, "JetBrains Mono", ui-monospace, monospace); color: var(--ia-text, #3a3f52); white-space: pre; }
.pc-out:empty { display: none; }
.pc-out .pc-err { color: var(--ia-bad, #c23a30); }
.pc-out .pc-note { color: var(--ia-muted, #747a8c); }
.pc-report { margin: 14px 0 0; }
.pc-report:empty { display: none; }
.pc-summary { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-weight: 650; font-size: 14px; color: var(--ia-strong, #1b2340); }
.pc-summary.pc-pass { color: var(--ia-ok, #23884a); }
.pc-summary.pc-fail { color: var(--ia-bad, #c23a30); }
.pc-results { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--ia-line, #d9d2c1); }
.pc-row { display: grid; grid-template-columns: 20px minmax(0, 1fr); column-gap: 8px; padding: 7px 2px; border-bottom: 1px solid var(--ia-line, #d9d2c1); font-size: 14px; }
.pc-mark { font-weight: 700; text-align: center; }
.pc-row.pc-ok .pc-mark { color: var(--ia-ok, #23884a); }
.pc-row.pc-no .pc-mark { color: var(--ia-bad, #c23a30); }
.pc-name { color: var(--ia-strong, #1b2340); overflow-wrap: anywhere; }
.pc-msg { grid-column: 2; color: var(--ia-muted, #747a8c); font: 12.5px/1.5 var(--ia-mono, ui-monospace, monospace); overflow-wrap: anywhere; }
.pc-solution { margin: 14px 0 0; }
.pc-sol-label { margin: 0; font: 600 12px/1.4 var(--ia-mono, ui-monospace, monospace); color: var(--ia-muted, #747a8c); text-transform: uppercase; letter-spacing: 0.06em; }
.pc-solution pre { margin: 6px 0 0; padding: 10px 14px; overflow-x: auto; background: var(--ia-page, #f2efe7); border: 1px dashed var(--ia-line, #d9d2c1); border-radius: 8px;
  font: 13px/1.55 var(--ia-mono, ui-monospace, monospace); color: var(--ia-strong, #1b2340); }
.pc-solution .pc-bar { margin-top: 8px; }
@media (max-width: 480px) { .pc-cell { padding: 14px 12px 12px; } .pc-status { flex-basis: 100%; margin-left: 0; } .pc-kbd { display: none; } }
@media (prefers-reduced-motion: reduce) { .pc-btn { transition: none; } }
`;

function injectStyle() {
  if (document.getElementById("pc-style")) return;
  const s = document.createElement("style");
  s.id = "pc-style";
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------- helpers

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (_) { /* storage blocked */ }
}

function load(key) {
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

// Replace text in a textarea, keeping native undo where the browser allows it.
function replaceRange(ta, start, end, text, selStart, selEnd) {
  ta.focus();
  ta.setSelectionRange(start, end);
  let ok = false;
  try {
    ok = document.execCommand("insertText", false, text);
  } catch (_) { ok = false; }
  if (!ok || ta.value.slice(start, start + text.length) !== text) {
    ta.setRangeText(text, start, end, "end");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  ta.setSelectionRange(selStart ?? start + text.length, selEnd ?? selStart ?? start + text.length);
}

const STATUS_TEXT = {
  loading: "Loading Python (about 10 MB, first run only)…",
  restart: "Restarting Python…",
  packages: "Loading packages…",
  queued: "Waiting for another cell…",
  running: "Running…",
};

let cellSeq = 0;

// ---------------------------------------------------------------- component

export function mountPyCell(host, opts = {}) {
  injectStyle();
  const id = String(opts.id || `cell-${++cellSeq}`);
  const starter = String(opts.starter ?? "");
  const tests = String(opts.tests ?? "");
  const dataJson = JSON.stringify(opts.data ?? {});
  const key = `ia:pycell:${id}`;
  const uid = `pc-${id.replace(/[^\w-]/g, "_")}-${++cellSeq}`;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const owner = {};
  let failures = 0;
  let running = false;
  let disposed = false;
  let saveTimer = 0;

  const root = el("section", "pc-cell");
  root.setAttribute("aria-labelledby", `${uid}-title`);
  const head = el("div", "pc-head");
  const title = el("h3", "pc-title", opts.title || "Code cell");
  title.id = `${uid}-title`;
  head.append(title, el("span", "pc-tag", "Python"));
  root.append(head);
  if (opts.prompt) root.append(el("p", "pc-prompt", opts.prompt));

  const label = el("label", "pc-label", `Python code for ${opts.title || "this cell"}`);
  label.htmlFor = `${uid}-code`;
  const editor = el("div", "pc-editor");
  const gutter = el("pre", "pc-gutter");
  gutter.setAttribute("aria-hidden", "true");
  const ta = el("textarea", "pc-code");
  ta.id = `${uid}-code`;
  ta.spellcheck = false;
  ta.wrap = "off";
  ta.setAttribute("autocapitalize", "off");
  ta.setAttribute("autocomplete", "off");
  ta.setAttribute("autocorrect", "off");
  ta.setAttribute("aria-describedby", `${uid}-hint`);
  ta.setAttribute("aria-multiline", "true");
  editor.append(gutter, ta);
  const hint = el("p", "pc-hint", `Tab indents, Shift+Tab dedents, ${isMac ? "⌘" : "Ctrl"}+Enter runs. Press Esc, then Tab, to leave the editor.`);
  hint.id = `${uid}-hint`;
  root.append(label, editor, hint);

  const bar = el("div", "pc-bar");
  const runBtn = el("button", "pc-btn pc-run");
  runBtn.type = "button";
  runBtn.append(el("span", null, "Run"), el("span", "pc-kbd", isMac ? "⌘↵" : "Ctrl+↵"));
  const resetBtn = el("button", "pc-btn pc-reset", "Reset");
  resetBtn.type = "button";
  const solBtn = el("button", "pc-btn pc-show-solution", "Show solution");
  solBtn.type = "button";
  solBtn.hidden = true;
  const status = el("span", "pc-status");
  status.setAttribute("role", "status");
  bar.append(runBtn, resetBtn, solBtn, status);
  root.append(bar);

  const out = el("pre", "pc-out");
  out.setAttribute("aria-label", "Output");
  out.tabIndex = 0;
  const report = el("div", "pc-report");
  report.setAttribute("aria-live", "polite");
  const solBox = el("div", "pc-solution");
  solBox.hidden = true;
  root.append(out, report, solBox);
  host.append(root);

  // ---- editor behaviour
  let lineCount = 0;
  function sync() {
    const n = Math.max(MIN_LINES, ta.value.split("\n").length);
    if (n !== lineCount) {
      lineCount = n;
      let s = "";
      for (let i = 1; i <= n; i++) s += i + (i < n ? "\n" : "");
      gutter.textContent = s;
    }
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight + (ta.offsetHeight - ta.clientHeight)}px`;
  }

  function lineStartOf(pos) {
    return ta.value.lastIndexOf("\n", pos - 1) + 1;
  }

  let tabEscapes = false;
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { tabEscapes = true; return; }
    if (e.key === "Tab" && tabEscapes) return;
    tabEscapes = false;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run();
      return;
    }
    const v = ta.value;
    const s = ta.selectionStart;
    const end = ta.selectionEnd;
    if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const ls = lineStartOf(s);
      const multi = v.slice(s, end).includes("\n");
      if (!e.shiftKey && !multi) {
        replaceRange(ta, s, end, INDENT);
        return;
      }
      // Block indent / dedent over every touched line (just the caret line for Shift+Tab).
      const blockEnd = end > s && v[end - 1] === "\n" ? end - 1 : end;
      let le = v.indexOf("\n", blockEnd);
      if (le < 0) le = v.length;
      const lines = v.slice(ls, le).split("\n");
      let firstDelta = 0;
      let total = 0;
      const next = lines.map((line, i) => {
        if (!e.shiftKey) {
          if (i === 0) firstDelta = INDENT.length;
          total += INDENT.length;
          return INDENT + line;
        }
        const d = line.startsWith("\t") ? 1 : Math.min(INDENT.length, line.length - line.replace(/^ +/, "").length);
        if (i === 0) firstDelta = -d;
        total -= d;
        return line.slice(d);
      });
      const text = next.join("\n");
      const ns = Math.max(ls, s + firstDelta);
      const ne = multi ? end + total : Math.max(ls, end + firstDelta);
      replaceRange(ta, ls, le, text, ns, ne);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey && s === end) {
      const ls = lineStartOf(s);
      const before = v.slice(ls, s);
      let indent = before.match(/^[ \t]*/)[0];
      if (/:\s*(#.*)?$/.test(before)) indent += INDENT;
      if (!indent) return;
      e.preventDefault();
      replaceRange(ta, s, end, "\n" + indent);
    }
  });

  ta.addEventListener("input", () => {
    sync();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store(key, ta.value), 250);
  });

  // ---- rendering results
  function setStatus(kind) {
    status.textContent = STATUS_TEXT[kind] || "";
  }

  function showOutput(stdout, truncated, error, note) {
    out.textContent = "";
    if (stdout) out.append(document.createTextNode(stdout));
    if (truncated) out.append(el("span", "pc-note", `${stdout.endsWith("\n") ? "" : "\n"}… output cut at ${OUTPUT_CAP} lines\n`));
    if (error) {
      if (out.textContent && !out.textContent.endsWith("\n")) out.append("\n");
      out.append(el("span", "pc-err", error));
    }
    if (note) out.append(el("span", "pc-note", note));
  }

  function showReport(summaryText, cls, results) {
    report.textContent = "";
    const sum = el("p", `pc-summary ${cls}`, summaryText);
    report.append(sum);
    if (!results || !results.length) return;
    const ul = el("ul", "pc-results");
    ul.setAttribute("aria-label", "Check results");
    for (const r of results) {
      const li = el("li", `pc-row ${r.ok ? "pc-ok" : "pc-no"}`);
      const mark = el("span", "pc-mark", r.ok ? "✓" : "✗");
      mark.setAttribute("aria-label", r.ok ? "pass" : "fail");
      li.append(mark, el("span", "pc-name", r.name));
      if (!r.ok && r.message) li.append(el("span", "pc-msg", r.message));
      ul.append(li);
    }
    report.append(ul);
  }

  function noteFailure() {
    failures++;
    if (failures >= 2 && opts.solution && solBox.hidden) solBtn.hidden = false;
  }

  async function run() {
    if (running || disposed) return null;
    running = true;
    runBtn.disabled = true;
    runBtn.setAttribute("aria-busy", "true");
    const code = ta.value;
    store(key, code);
    const result = await enqueue({ owner, code, tests, data: dataJson, onStatus: (k) => !disposed && setStatus(k) });
    running = false;
    if (disposed) return result;
    runBtn.disabled = false;
    runBtn.removeAttribute("aria-busy");
    setStatus("");
    const view = { passed: false, results: [], timeout: false, error: null };

    if (result.timeout) {
      view.timeout = true;
      showOutput("", false, `Stopped after ${TIMEOUT_MS / 1000} s: is there an infinite loop?`);
      showReport("The run was stopped, so the checks did not finish.", "pc-fail");
      noteFailure();
      return view;
    }
    if (result.fatal) {
      view.error = result.fatal;
      showOutput("", false, result.fatal, "\nCheck your connection and press Run again.");
      report.textContent = "";
      return view;
    }
    view.error = result.error || result.testError || null;
    view.results = result.results || [];
    showOutput(result.stdout || "", result.truncated, result.error || result.testError);
    if (result.error) {
      showReport("Your code raised an error, so the checks did not run.", "pc-fail");
      noteFailure();
      return view;
    }
    if (result.testError) {
      report.textContent = "";
      return view;
    }
    const total = view.results.length;
    const ok = view.results.filter((r) => r.ok).length;
    if (!total) {
      showReport(result.ranTests ? "The tests recorded no checks." : "Ran without errors.", "");
      return view;
    }
    view.passed = ok === total;
    showReport(`${ok}/${total} check${total === 1 ? "" : "s"} pass`, view.passed ? "pc-pass" : "pc-fail", view.results);
    if (view.passed) {
      try { opts.onPass?.(view.results); } catch (err) { console.error(err); }
    } else {
      noteFailure();
    }
    return view;
  }

  function setCode(code) {
    ta.value = String(code);
    sync();
    store(key, ta.value);
  }

  function reset() {
    ta.value = starter;
    sync();
    clearTimeout(saveTimer);
    store(key, null);
    out.textContent = "";
    report.textContent = "";
  }

  runBtn.addEventListener("click", () => run());
  resetBtn.addEventListener("click", () => {
    reset();
    ta.focus();
  });
  solBtn.addEventListener("click", () => {
    solBtn.hidden = true;
    solBox.hidden = false;
    solBox.textContent = "";
    const pre = el("pre", null, String(opts.solution));
    pre.setAttribute("aria-label", "Solution");
    const sbar = el("div", "pc-bar");
    const use = el("button", "pc-btn", "Copy into editor");
    use.type = "button";
    use.addEventListener("click", () => { setCode(opts.solution); ta.focus(); });
    const hide = el("button", "pc-btn", "Hide solution");
    hide.type = "button";
    hide.addEventListener("click", () => { solBox.hidden = true; solBtn.hidden = false; solBtn.focus(); });
    sbar.append(use, hide);
    solBox.append(el("p", "pc-sol-label", "Solution"), pre, sbar);
    use.focus();
  });

  const saved = load(key);
  ta.value = saved != null ? saved : starter;
  sync();
  // Fonts can change line metrics after first paint.
  if (document.fonts?.ready) document.fonts.ready.then(() => !disposed && sync());
  // Re-measure only when the width changes (a narrower editor may gain a scrollbar).
  let lastWidth = 0;
  const ro = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => {
        const w = editor.clientWidth;
        if (w !== lastWidth) { lastWidth = w; requestAnimationFrame(() => !disposed && sync()); }
      })
    : null;
  ro?.observe(editor);

  return {
    root,
    run,
    reset,
    setCode,
    getCode: () => ta.value,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(saveTimer);
      cancelJobsFor(owner);
      ro?.disconnect();
      root.remove();
    },
  };
}
