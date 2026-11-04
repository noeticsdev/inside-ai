// Guided-build lesson page: one step at a time. A stage on the left shows the system being built;
// a panel on the right holds the step's instruction, the parts it adds, one task, and the next button.
// scripts/build.mjs uses this template when a lesson's content.mjs sets layout: "guide".
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { head, LOGO, esc, SHELL_CSS } from "./page.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const LESSON_CSS = readFileSync(join(HERE, "lesson.css"), "utf8");
export const GUIDE_CSS = readFileSync(join(HERE, "guide.css"), "utf8");

export function guidePage({ content, bundle, css = "", next, missions }) {
  const sources = (content.sources || []).map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a></li>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head({ title: `${content.title} · Inside AI`, description: content.hook })}
<style>${SHELL_CSS}${LESSON_CSS}${GUIDE_CSS}${css}</style>
</head>
<body class="gd-body">
<script>document.body.dataset.theme=document.documentElement.dataset.theme;</script>
<header class="ia-top gd-top">
  <a class="ia-logo" href="/">${LOGO}<span>Inside AI</span></a>
  <div class="gd-name"><strong>${esc(content.short || content.title)}</strong><span>${esc(content.subtitle || content.hook)}</span></div>
  <nav class="gd-phases" data-gd-phases aria-label="Lesson phases"></nav>
  <div class="ia-top-right">
    <span class="ia-progress" title="Tasks solved"><span class="ia-bar" data-ia-bar></span><span data-ia-count>0/${missions.length}</span></span>
    <button type="button" class="ia-icon-btn" data-ia-theme aria-label="Switch light or dark theme">◐</button>
    <a class="ia-user" data-ia-user hidden href="/login/">Sign in</a>
  </div>
</header>
<main class="gd" data-ia-machine data-slug="${esc(content.slug)}">
  <section class="gd-stage" data-gd-stage aria-label="The system you are building"></section>
  <section class="gd-panel" aria-live="polite">
    <div class="gd-panel-body" data-gd-panel></div>
    <footer class="gd-foot">
      <button type="button" class="gd-back" data-gd-back aria-label="Previous step">←</button>
      <button type="button" class="gd-next" data-gd-next><span data-gd-next-label>Next</span><span aria-hidden="true">→</span></button>
    </footer>
  </section>
</main>
<div hidden data-gd-parking>
  <aside class="ls-predict gd-predict" data-ia-predict aria-label="Predict before you start"></aside>
  <div class="gd-check" data-gd-check>
    <button type="button" class="ia-btn ia-primary" data-ia-check-open>Take the checkpoint · 5 questions</button>
    <details class="ls-sources"><summary>Sources and honesty</summary><ul>${sources}</ul><p>${esc(content.notes || "")}</p></details>
    ${next ? `<a class="ls-next" href="${esc(next.href)}"><span>Next lesson</span><strong>${esc(next.title)} →</strong></a>` : `<a class="ls-next" href="/"><span>All lessons</span><strong>Back to the catalog →</strong></a>`}
  </div>
</div>
<dialog class="ia-dialog" data-ia-quiz aria-label="Checkpoint">
  <button type="button" class="ia-icon-btn ia-dialog-close" data-ia-quiz-close aria-label="Close">✕</button>
  <div data-ia-quiz-body></div>
</dialog>
<div class="ia-toasts" data-ia-toast aria-live="polite"></div>
<script type="module">${bundle.replace(/<\/(script)/gi, "<\\/$1")}</script>
</body>
</html>
`;
}
