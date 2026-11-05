// Lesson page template: hero, objectives, predict card, a body the lesson script fills, checkpoint, sources.
// scripts/build.mjs calls lessonPage() for every lessons/<slug>/ folder.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { head, BRAND, esc, SHELL_CSS } from "./page.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const LESSON_CSS = readFileSync(join(HERE, "lesson.css"), "utf8");

export function lessonPage({ content, bundle, css = "", next, index, missions }) {
  const level = { starter: "Starter", core: "Core", advanced: "Advanced" }[content.level] || content.level;
  const objectives = (content.objectives || []).map((o) => `<li>${esc(o)}</li>`).join("");
  const sources = (content.sources || []).map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a></li>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head({ title: `${content.title} · Inside AI`, description: content.hook })}
<style>${SHELL_CSS}${LESSON_CSS}${css}</style>
</head>
<body>
<script>document.body.dataset.theme=document.documentElement.dataset.theme;</script>
<header class="ia-top">
  <a class="ia-logo" href="/" aria-label="Inside AI by Noetics, home">${BRAND}</a>
  <span class="ia-crumb">/ lessons / ${esc(content.slug)}</span>
  <div class="ia-top-right">
    <span class="ia-progress" title="Missions complete"><span class="ia-bar" data-ia-bar></span><span data-ia-count>0/${missions.length}</span></span>
    <button type="button" class="ia-icon-btn" data-ia-theme aria-label="Switch light or dark theme">◐</button>
    <a class="ia-user" data-ia-user hidden href="/login/">Sign in</a>
  </div>
</header>
<main class="ls" data-ia-machine data-slug="${esc(content.slug)}">
  <section class="ls-hero">
    <p class="ls-kicker">Lesson ${String(index).padStart(2, "0")} · ${esc(content.track)} · ${esc(level)} · ~${esc(content.minutes)} min</p>
    <h1>${esc(content.title)}</h1>
    <p class="ls-lede">${esc(content.hook)}</p>
    <div class="ls-hero-grid">
      <div class="ls-objectives"><h2>You will be able to</h2><ul>${objectives}</ul></div>
      <aside class="ls-predict" data-ia-predict aria-label="Predict before you start"></aside>
    </div>
  </section>
  <div class="ls-body" data-lesson-body></div>
  <section class="ls-section ls-end">
    <h2>Prove it</h2>
    <p>Five questions on what you just did. Each answer shows why, and your first prediction is compared at the end.</p>
    <button type="button" class="ia-btn ia-primary ls-check" data-ia-check-open>Take the checkpoint · 5 questions</button>
    <details class="ls-sources"><summary>Sources and honesty</summary><ul>${sources}</ul><p>${esc(content.notes || "")}</p></details>
    ${next ? `<a class="ls-next" href="${esc(next.href)}"><span>Next lesson</span><strong>${esc(next.title)} →</strong></a>` : `<a class="ls-next" href="/"><span>All lessons</span><strong>Back to the catalog →</strong></a>`}
  </section>
</main>
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
