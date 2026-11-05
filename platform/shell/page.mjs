// Machine page template. scripts/build.mjs calls machinePage() once per machine.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as ink from "../../kit/ink.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SHELL_CSS = readFileSync(join(HERE, "shell.css"), "utf8");

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7z" fill="var(--ia-accent)"/><path d="M12 12 21 7M12 12v10M12 12 3 7" stroke="var(--ia-page)" stroke-width="1.6" fill="none"/><path d="M12 2 21 7v10l-9 5-9-5V7z" stroke="var(--ia-strong)" stroke-width="1.4" fill="none" stroke-linejoin="round"/></svg>`;

// Company logo. company-logo.png is dark ink for the light theme, company-logo-light.png is white for the dark theme.
// shell.css shows the one that matches data-theme. 1672 x 284 source, drawn about 15px tall.
export const NOETICS_LOGO = `<img class="ia-co ia-co-ink" src="/brand/company-logo.png" alt="Noetics" width="88" height="15"><img class="ia-co ia-co-white" src="/brand/company-logo-light.png" alt="Noetics" width="88" height="15">`;
export const BRAND = `${NOETICS_LOGO}<span class="ia-co-sep" aria-hidden="true"></span><span>Inside AI</span>`;
export const NOETICS_URL = "https://noetics.dev";

export const THEME_BOOT = `<script>(function(){var a=/[?&]theme=(light|dark)/.exec(location.search),s=null;try{s=localStorage.getItem("ia:theme")}catch(e){}var v=a?a[1]:s||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=v;})();</script>`;

export function head({ title, description }) {
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(LOGO.replaceAll("var(--ia-accent)", "#5b3fd9").replaceAll("var(--ia-page)", "#f2efe7").replaceAll("var(--ia-strong)", "#1b2340"))}">
${THEME_BOOT}`;
}

export function machinePage({ content, fig, bundle, next, index, missions }) {
  const level = { starter: "Starter", core: "Core", advanced: "Advanced" }[content.level] || content.level;
  const readouts = fig.readouts.map((r) => `<div><span>${esc(r.label)}</span><strong data-ro="${esc(r.key)}">–</strong></div>`).join("");
  const parts = content.stations.map((s) => `<tr><td>${esc(s.concept)}</td><td>${esc(s.does)}</td><td>${esc(s.fails)}</td></tr>`).join("");
  const sources = (content.sources || []).map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a></li>`).join("");
  const description = `${content.hook} An interactive machine with missions and a checkpoint.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head({ title: `${content.title} · Inside AI`, description })}
<style>${k.ISO_CSS}${ink.INK_CSS}${SHELL_CSS}${fig.css || ""}</style>
</head>
<body class="iso iso-ink">
<script>document.body.dataset.theme=document.documentElement.dataset.theme;</script>
<header class="ia-top">
  <a class="ia-logo" href="/" aria-label="Inside AI by Noetics, home">${BRAND}</a>
  <span class="ia-crumb">/ machines / ${esc(content.slug)}</span>
  <div class="ia-top-right">
    <span class="ia-progress" title="Missions complete"><span class="ia-bar" data-ia-bar></span><span data-ia-count>0/${missions.length}</span></span>
    <button type="button" class="ia-icon-btn" data-ia-theme aria-label="Switch light or dark theme">◐</button>
    <a class="ia-user" data-ia-user hidden href="/login/">Sign in</a>
  </div>
</header>
<main class="ia-machine" data-ia-machine data-slug="${esc(content.slug)}">
  <section class="ia-card ia-bench" aria-label="${esc(content.title)}">
    <div class="ia-head">
      <span class="ia-fig">Machine ${String(index).padStart(2, "0")}</span>
      <h1>${esc(content.title)}</h1>
      <span class="ia-hook">${esc(content.hook)}</span>
      <span class="ia-meta"><span class="ia-chip">${esc(level)}</span><span class="ia-chip">~${esc(content.minutes)} min</span></span>
    </div>
    <div class="ia-controls" data-ia-controls role="group" aria-label="Machine controls">${fig.controls}</div>
    <div class="ia-stage" data-ia-stage data-ie-stage tabindex="0" role="group" aria-label="${esc(content.title)}. ${esc(content.machine)}">
      ${fig.svg}
      <div class="ia-stage-tools"><label class="ia-toggle" style="min-height:32px;font-size:12px"><input type="checkbox" data-ia-labels checked> Labels</label></div>
    </div>
    <div class="ia-readouts" aria-label="Live readouts">${readouts}</div>
    <p class="ia-big"><b>The big idea:</b> ${esc(content.bigIdea)} <span class="sr-only" data-ia-live data-ie-live aria-live="polite"></span></p>
  </section>
  <aside class="ia-rail" aria-label="Missions and checkpoint">
    <section class="ia-card ia-panel" data-ia-predict></section>
    <section class="ia-card ia-panel">
      <h2>Missions <span class="ia-count" data-ia-count>0/${missions.length}</span></h2>
      <ol class="ia-missions" data-ia-missions></ol>
    </section>
    <section class="ia-card ia-panel">
      <button type="button" class="ia-btn ia-check-cta" data-ia-check-open>Take the checkpoint · 5 questions</button>
    </section>
    <section class="ia-card ia-panel">
      <h2>Machine log</h2>
      <ol class="ia-log" data-ia-log aria-live="off"></ol>
    </section>
  </aside>
</main>
<section class="ia-below">
  <details class="ia-card"><summary>What each part does</summary><div><table class="ia-parts"><thead><tr><th>Part</th><th>What it does</th><th>Without it</th></tr></thead><tbody>${parts}</tbody></table>
  <p class="ia-honest" style="margin-top:12px"><b>The machine:</b> ${esc(content.machine)}</p></div></details>
  <details class="ia-card"><summary>Sources and honesty</summary><div><ul>${sources}</ul><p class="ia-honest">${esc(content.notes || "")} Figures drawn with the Anatomy kit (MIT).</p></div></details>
  ${next ? `<a class="ia-card ia-next" href="${esc(next.href)}"><div><span>Next machine</span><div><strong>${esc(next.title)}</strong></div></div><span aria-hidden="true">→</span></a>` : `<a class="ia-card ia-next" href="/"><div><span>All machines</span><div><strong>Back to the catalog</strong></div></div><span aria-hidden="true">→</span></a>`}
</section>
<dialog class="ia-dialog" data-ia-quiz aria-label="Checkpoint">
  <button type="button" class="ia-icon-btn ia-dialog-close" data-ia-quiz-close aria-label="Close">✕</button>
  <div data-ia-quiz-body></div>
</dialog>
<div class="ia-toasts" data-ia-toast aria-live="polite"></div>
<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}</style>
<script type="module">${bundle.replace(/<\/(script)/gi, "<\\/$1")}</script>
</body>
</html>
`;
}
