// Build every machine into dist/m/<slug>/index.html, write dist/catalog.json, then build the platform pages.
// Usage: bun scripts/build.mjs [--only <slug>] [--out dist]
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { machinePage } from "../platform/shell/page.mjs";
import { lessonPage } from "../platform/shell/lesson.mjs";
import * as kit from "../kit/iso-kit.mjs";
import * as inkKit from "../kit/ink.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const ONLY = flag("--only");
const OUT = resolve(ROOT, flag("--out") || "dist");
const TMP = join(ROOT, ".build");

const MACHINES = join(ROOT, "machines");
const REQUIRED = ["content.mjs", "model.mjs", "figure.mjs", "live.js"];

function slugs() {
  return readdirSync(MACHINES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => REQUIRED.every((f) => existsSync(join(MACHINES, name, f))))
    .filter((name) => (ONLY ? name === ONLY : !name.startsWith("_")))
    .filter((name) => !existsSync(join(ROOT, "lessons", name, "page.js")));
}

// Lessons: lessons/<slug>/{content.mjs, model.mjs, page.js}. A lesson replaces a machine with the same slug.
function lessonSlugs() {
  const dir = join(ROOT, "lessons");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && ["content.mjs", "model.mjs", "page.js"].every((f) => existsSync(join(dir, d.name, f))))
    .map((d) => d.name)
    .filter((name) => (ONLY ? name === ONLY : true));
}

async function loadLesson(slug) {
  const dir = join(ROOT, "lessons", slug);
  const bust = `?t=${Date.now()}`;
  const content = (await import(pathToFileURL(join(dir, "content.mjs")).href + bust)).default;
  const model = await import(pathToFileURL(join(dir, "model.mjs")).href + bust);
  if (!Array.isArray(content.quiz) || content.quiz.length !== 6) throw new Error(`${slug}: content.quiz must have 6 items`);
  const missions = (model.MISSIONS || []).map(({ id, title, goal }) => ({ id, title, goal, hint: "", try: null }));
  return { slug, dir, content, missions, lesson: true, fig: null };
}

async function bundleLesson(lesson, data) {
  mkdirSync(TMP, { recursive: true });
  const dataFile = join(TMP, `${lesson.slug}-lesson-data.js`);
  writeFileSync(dataFile, `window.__LESSON__ = ${JSON.stringify(data)};\nwindow.__IA_DATA = window.__LESSON__;\n`);
  const entry = join(TMP, `${lesson.slug}-lesson-entry.js`);
  writeFileSync(entry, `import ${JSON.stringify(dataFile)};\nimport ${JSON.stringify(join(lesson.dir, "page.js"))};\n`);
  const result = await Bun.build({ entrypoints: [entry], format: "esm", minify: { syntax: true, whitespace: true }, target: "browser" });
  if (!result.success) throw new Error(`${lesson.slug}: bundle failed\n${result.logs.join("\n")}`);
  return await result.outputs[0].text();
}

async function loadMachine(slug) {
  const dir = join(MACHINES, slug);
  const bust = `?t=${Date.now()}`;
  const content = (await import(pathToFileURL(join(dir, "content.mjs")).href + bust)).default;
  const model = await import(pathToFileURL(join(dir, "model.mjs")).href + bust);
  const { figure } = await import(pathToFileURL(join(dir, "figure.mjs")).href + bust);
  const fig = await figure();
  for (const key of ["svg", "data", "controls", "readouts"]) if (fig[key] === undefined) throw new Error(`${slug}: figure() is missing "${key}"`);
  if (!Array.isArray(content.quiz) || content.quiz.length !== 6) throw new Error(`${slug}: content.quiz must have 6 items`);
  if (!Array.isArray(model.MISSIONS) || model.MISSIONS.length < 3) throw new Error(`${slug}: model.MISSIONS needs at least 3 missions`);
  const missions = model.MISSIONS.map(({ id, title, goal, hint, try: tryConfig }) => ({ id, title, goal, hint, try: tryConfig ?? null }));
  return { slug, dir, content, fig, missions };
}

async function bundle(machine, data) {
  mkdirSync(TMP, { recursive: true });
  const abs = (p) => JSON.stringify(join(ROOT, p));
  const live = readFileSync(join(machine.dir, "live.js"), "utf8");
  const entry = join(TMP, `${machine.slug}-entry.js`);
  writeFileSync(
    entry,
    `import * as K from ${abs("kit/iso-kit.mjs")};
import * as Ink from ${abs("kit/ink.mjs")};
import * as M from ${JSON.stringify(join(machine.dir, "model.mjs"))};
import { createIA, theme } from ${abs("platform/shell/sdk.js")};
const D = ${JSON.stringify(machine.fig.data)};
const T = theme();
document.querySelector("[data-ia-theme]")?.addEventListener("click", () => T.toggle());
const labels = document.querySelector("[data-ia-labels]");
if (new URLSearchParams(location.search).get("labels") === "0") { document.documentElement.classList.add("iso-nolabels"); if (labels) labels.checked = false; }
labels?.addEventListener("change", () => document.documentElement.classList.toggle("iso-nolabels", !labels.checked));
const IA = createIA({ M, data: ${JSON.stringify(data)} });
window.IA = IA;
window.__IA_DATA = ${JSON.stringify(data)};
(function (K, Ink, M, D, IA) {
${live}
})(K, Ink, M, D, IA);
`,
  );
  const result = await Bun.build({ entrypoints: [entry], format: "esm", minify: { syntax: true, whitespace: true }, target: "browser" });
  if (!result.success) throw new Error(`${machine.slug}: bundle failed\n${result.logs.join("\n")}`);
  return await result.outputs[0].text();
}

// A standalone light-theme still of the machine for catalog cards: the page CSS is embedded in the SVG.
function thumbnail(svg, extraCss = "") {
  const css = `${kit.ISO_CSS}${inkKit.INK_CSS}${extraCss}`.replace(/<\/style/gi, "");
  return svg
    .replace(/<svg ([^>]*?)class="([^"]*)"/, '<svg $1class="$2 iso iso-ink" data-theme="light"')
    .replace(/(<svg[^>]*>)/, `$1<style>${css}</style>`)
    .replace(/filter="url\(#iso-hand\)"/g, "")
    .replace(/<[a-zA-Z][^>]*>/g, (tag) => tag.replace(/\s(data-[\w-]+)(?=[\s>/])(?!=)/g, ' $1=""'));
}

const list = slugs();
if (!list.length && !lessonSlugs().length) {
  console.error(ONLY ? `no machine "${ONLY}" with ${REQUIRED.join(", ")}` : "no machines found");
  process.exit(1);
}
if (!ONLY) rmSync(join(OUT, "m"), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const machines = [];
for (const slug of list) {
  try {
    machines.push(await loadMachine(slug));
  } catch (error) {
    console.error(`✗ ${slug}: ${error.stack || error}`);
    process.exitCode = 1;
  }
}
for (const slug of lessonSlugs()) {
  try {
    machines.push(await loadLesson(slug));
  } catch (error) {
    console.error(`✗ lesson ${slug}: ${error.stack || error}`);
    process.exitCode = 1;
  }
}
machines.sort((a, b) => (a.content.order ?? 99) - (b.content.order ?? 99) || a.slug.localeCompare(b.slug));

const catalog = machines.map((m, i) => ({
  slug: m.slug,
  title: m.content.title,
  hook: m.content.hook,
  level: m.content.level,
  minutes: m.content.minutes,
  order: m.content.order,
  track: m.content.track,
  bigIdea: m.content.bigIdea,
  index: i + 1,
  href: `/m/${m.slug}/`,
  missions: m.missions.map(({ id, title, goal }) => ({ id, title, goal })),
  quiz: m.content.quiz.map(({ stage, question, options, correct }) => ({ stage, question, options, correct })),
}));

for (const [i, m] of machines.entries()) {
  const nextEntry = catalog[i + 1] ? { title: catalog[i + 1].title, href: catalog[i + 1].href } : null;
  const data = { slug: m.slug, title: m.content.title, missions: m.missions, quiz: m.content.quiz, next: nextEntry };
  try {
    const dir = join(OUT, "m", m.slug);
    mkdirSync(dir, { recursive: true });
    let html;
    if (m.lesson) {
      const js = await bundleLesson(m, data);
      const css = existsSync(join(m.dir, "page.css")) ? readFileSync(join(m.dir, "page.css"), "utf8") : "";
      html = lessonPage({ content: m.content, bundle: js, css, next: nextEntry, index: i + 1, missions: m.missions });
      const thumb = join(m.dir, "figure.svg");
      if (existsSync(thumb)) cpSync(thumb, join(dir, "figure.svg"));
    } else {
      const js = await bundle(m, data);
      html = machinePage({ content: m.content, fig: m.fig, bundle: js, next: nextEntry, index: i + 1, missions: m.missions });
      writeFileSync(join(dir, "figure.svg"), thumbnail(m.fig.svg, m.fig.css || ""));
    }
    writeFileSync(join(dir, "index.html"), html);
    console.log(`✓ ${m.slug.padEnd(22)} ${(html.length / 1024).toFixed(0).padStart(5)} KB  ${m.missions.length} missions`);
  } catch (error) {
    console.error(`✗ ${m.slug}: ${error.stack || error}`);
    process.exitCode = 1;
  }
}

if (!ONLY) {
  writeFileSync(join(OUT, "catalog.json"), JSON.stringify(catalog, null, 2));
  console.log(`✓ catalog.json        ${catalog.length} machines`);
  const pages = join(ROOT, "platform", "pages", "build.mjs");
  if (existsSync(pages)) {
    const mod = await import(pathToFileURL(pages).href);
    await mod.build({ root: ROOT, dist: OUT, catalog });
    console.log("✓ platform pages");
  }
  const pub = join(ROOT, "platform", "public");
  if (existsSync(pub)) cpSync(pub, OUT, { recursive: true });
}
