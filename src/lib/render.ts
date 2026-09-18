import { BLOCKS, FONT_STACKS, esc } from "./blocks";
import { boxHandlesScript } from "./boxHandles";
import { blockDragScript } from "./dragBlocks";
import { inlineEditorScript } from "./inlineEditor";
import type { Page, Site } from "./types";

/** The stylesheet that ships with every exported site. */
export function siteCss(site: Site): string {
  const t = site.theme;
  const font = FONT_STACKS[t.font] ?? FONT_STACKS.system;
  // Headings fall back to the body font, which is what "" means.
  const headingFont = FONT_STACKS[t.headingFont] ?? font;
  const pad = Math.min(80, Math.max(4, Number(t.spacing) || 28));
  const leading = Math.min(260, Math.max(100, Number(t.lineHeight) || 160)) / 100;
  return `:root {
  --accent: ${t.accent};
  --bg: ${t.bg};
  --text: ${t.text};
  --muted: ${t.muted};
  --radius: ${t.radius}px;
  --width: ${t.maxWidth}px;
  --pad: ${pad}px;
  --heading-font: ${headingFont};
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: ${font};
  background: var(--bg);
  color: var(--text);
  line-height: ${leading};
  -webkit-font-smoothing: antialiased;
}
main { max-width: var(--width); margin: 0 auto; padding: 0 24px; }
.block { padding: var(--pad) 0; }
/*
 * A heading belongs to what comes after it. With the same padding as every
 * other block it sits marooned halfway between the two, and the page reads as
 * a list of unrelated things rather than sections.
 */
.block--heading { padding-bottom: 2px; }
.block--heading > h2 { margin-bottom: 0; }

h1, h2, h3, h4 { font-family: var(--heading-font); line-height: 1.2; margin: 0 0 12px; text-wrap: balance; }
h1 { font-size: clamp(32px, 6vw, 52px); letter-spacing: -0.02em; }
h2 { font-size: clamp(24px, 4vw, 32px); letter-spacing: -0.01em; }
h3 { font-size: 20px; }
h4 { font-size: 17px; }
p { margin: 0 0 16px; text-wrap: pretty; }
.prose p:last-child { margin-bottom: 0; }
a { color: var(--accent); }

.hero { padding: 56px 0 52px; }
.hero h1 { margin-bottom: 0; }
.hero .lead {
  font-size: clamp(17px, 2.2vw, 20px);
  color: var(--muted);
  max-width: 34em;
  margin: 14px auto 0;
}
.hero__inner { width: 100%; }
.hero--compact { padding: 32px 0 28px; }
.hero--tall { padding: 96px 0 92px; }
/*
 * A hero told to fill the screen centres its contents vertically. The inner
 * wrapper is what stops a flex column stretching the button to full width.
 */
.hero--screen { min-height: 78vh; display: flex; flex-direction: column; justify-content: center; }
.hero--tint { background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: var(--radius); padding-inline: 32px; margin-top: 24px; }
.hero--gradient { background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%); border-radius: var(--radius); padding-inline: 32px; margin-top: 24px; }

.btn {
  display: inline-block;
  margin-top: 22px;
  padding: 12px 22px;
  border-radius: calc(var(--radius) * 0.7);
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  text-decoration: none;
  border: 2px solid var(--accent);
  transition: opacity .15s ease, transform .15s ease;
}
/* The nudge lives in --bx / --by so the hover lift can add to it rather than
   replace it: a transform written inline would lose to this rule the moment
   the pointer arrived. */
.btn { transform: translate(var(--bx, 0px), var(--by, 0px)); }
.btn:hover { opacity: .9; transform: translate(var(--bx, 0px), calc(var(--by, 0px) - 1px)); }
.btn--outline { background: transparent; color: var(--accent); }
.btn--soft {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  border-color: transparent;
}
.btn--link {
  background: transparent;
  border-color: transparent;
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 4px;
}
.btn--square { border-radius: 0; }
.btn--rounded { border-radius: 10px; }
.btn--pill { border-radius: 999px; }
.btn--small { padding: 8px 16px; font-size: 14px; }
.btn--large { padding: 16px 32px; font-size: 18px; }
.btn--wide { min-width: 260px; text-align: center; }
.btn--full { display: block; width: 100%; text-align: center; }
/* After the sizes, so a link-shaped button keeps its words flush with the text. */
.btn.btn--link { padding-inline: 0; }
.btn.btn--link:hover { transform: none; }

.figure { margin: 0; }
.figure img { display: block; width: 100%; height: auto; }
.figure--rounded img { border-radius: var(--radius); }
figcaption { margin-top: 8px; font-size: 14px; color: var(--muted); text-align: center; }

.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.grid--1 { grid-template-columns: 1fr; }
.grid--2 { grid-template-columns: repeat(2, 1fr); }
.grid--3 { grid-template-columns: repeat(3, 1fr); }
.grid--4 { grid-template-columns: repeat(4, 1fr); }
.card {
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--text) 3%, transparent);
}
.cards--outline .card { background: none; }
.cards--shadow .card {
  border-color: transparent;
  background: var(--bg);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--text) 12%, transparent);
}
.cards--plain .card { border: 0; background: none; padding: 0; }
.card__icon { font-size: 28px; margin-bottom: 8px; }
.card h3 { margin-bottom: 6px; }
.card p { margin: 0; color: var(--muted); font-size: 15px; }

.spacer { width: 100%; display: flex; align-items: center; }
.spacer--full::before,
.spacer--short::before,
.spacer--dots::before {
  content: "";
  flex: 1;
  border-top: 1px solid color-mix(in srgb, var(--text) 16%, transparent);
}
.spacer--short::before { flex: 0 0 120px; margin: 0 auto; }
.spacer--dots::before { border-top-style: dotted; border-top-width: 2px; }

.site-footer {
  margin-top: 24px;
  border-top: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  color: var(--muted);
  font-size: 14px;
  text-align: center;
}
.site-footer p { margin-bottom: 8px; }
.footer-links { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }

.site-nav {
  border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  position: sticky;
  top: 0;
  backdrop-filter: blur(8px);
  z-index: 10;
}
.nav-inner {
  max-width: var(--width);
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.nav-brand { font-weight: 700; text-decoration: none; color: var(--text); margin-right: auto; }
.site-nav nav { display: flex; gap: 18px; flex-wrap: wrap; }
.site-nav nav a {
  text-decoration: none;
  color: var(--muted);
  font-size: 15px;
  font-weight: 500;
  padding-bottom: 2px;
  border-bottom: 2px solid transparent;
}
.site-nav nav a:hover { color: var(--text); }
.site-nav nav a[aria-current="page"] { color: var(--accent); border-bottom-color: var(--accent); }

@media (max-width: 760px) {
  /* Four across is unreadable on a phone whatever the page is told to do. */
  .grid--3, .grid--4 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .block { padding: calc(var(--pad) * 0.8) 0; }
  .hero { padding: 40px 0 32px; }
  .hero--screen { min-height: 70vh; }
  .grid--2, .grid--3, .grid--4 { grid-template-columns: 1fr; }
  .nav-inner { padding: 10px 16px; gap: 12px; }
}`;
}

/** The blocks of one page. */
function pageBlocks(page: Page, site: Site, withIds: boolean): string {
  return page.blocks
    .map((block) => {
      const def = BLOCKS[block.type];
      if (!def) return "";
      const html = def.toHtml(block.props, site.theme, { edit: withIds });
      if (!withIds) return `      ${html}`;
      // The editor needs to know which element is which block, so it can be clicked.
      return `      <div data-block-id="${esc(block.id)}" class="sb-pick">${html}</div>`;
    })
    .join("\n");
}

/** The nav bar, shown only when there's more than one page to move between. */
function navHtml(site: Site, activeSlug: string): string {
  if (!site.nav || site.pages.length < 2) return "";
  const links = site.pages
    .map(
      (p) =>
        `<a href="#${esc(p.slug)}" data-nav="${esc(p.slug)}"${
          p.slug === activeSlug ? ' aria-current="page"' : ""
        }>${esc(p.name)}</a>`
    )
    .join("\n        ");
  return `<header class="site-nav">
    <div class="nav-inner">
      <a class="nav-brand" href="#${esc(site.pages[0].slug)}">${esc(site.title)}</a>
      <nav>
        ${links}
      </nav>
    </div>
  </header>
`;
}

/**
 * Every page lives in the one exported file, and the hash picks which is visible.
 *
 * Clicks on page links are handled directly rather than left to the browser:
 * inside a sandboxed preview frame the browser refuses the fragment navigation
 * and nothing happens at all. Handling it here means the same file behaves
 * identically in the preview and on a real host, and `location.hash` is still
 * updated when the browser allows it, so the back button keeps working.
 */
function routingScript(site: Site): string {
  if (site.pages.length < 2) return "";
  const first = JSON.stringify(site.pages[0].slug);
  return `<script>
(function () {
  var pages = Array.prototype.slice.call(document.querySelectorAll(".page"));

  function show(slug) {
    var target = document.getElementById(slug) || document.getElementById(${first});
    if (!target) return;
    pages.forEach(function (p) { p.hidden = p !== target; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-nav]"), function (a) {
      if (a.dataset.nav === target.id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (target.dataset.title) document.title = target.dataset.title;
  }

  function currentSlug() {
    try {
      return decodeURIComponent(location.hash.slice(1)) || ${first};
    } catch (e) {
      return ${first};
    }
  }

  document.addEventListener("click", function (e) {
    var link = e.target.closest && e.target.closest('a[href^="#"]');
    if (!link) return;
    var slug = decodeURIComponent(link.getAttribute("href").slice(1));
    // Leave non-page anchors (like href="#") to behave normally.
    if (!slug || !document.getElementById(slug)) return;
    e.preventDefault();
    // In the editor's sandboxed preview the document is served from a blob URL,
    // and the browser refuses to navigate to it — so don't ask. Anywhere real
    // (http, https, file) the hash updates and the back button works.
    if (location.protocol !== "blob:" && currentSlug() !== slug) {
      try {
        location.hash = slug;
      } catch (err) {
        /* showing the page is what matters */
      }
    }
    show(slug);
    window.scrollTo(0, 0);
  });

  window.addEventListener("hashchange", function () {
    show(currentSlug());
    window.scrollTo(0, 0);
  });

  show(currentSlug());
})();
</script>
`;
}

/** Marks the block of JSON that lets a finished page be opened again. */
export const PROJECT_TAG = "sitebuilder-project";

/**
 * The editable project, tucked into the page as inert data.
 *
 * Every "<" is escaped, so nothing inside a site's own text can close this tag
 * early and break out into the document.
 */
function embeddedProject(site: Site): string {
  const json = JSON.stringify(site).replace(/</g, "\\u003c");
  return `<script type="application/json" id="${PROJECT_TAG}">${json}</script>\n`;
}

/**
 * Preview-only. Hands any link that leaves the site up to the editor instead of
 * following it, so the preview can't navigate away from the site being built.
 */
const EXTERNAL_LINK_GUARD = `<script>
(function () {
  document.addEventListener("click", function (e) {
    var link = e.target.closest && e.target.closest("a[href]");
    if (!link) return;
    var href = link.getAttribute("href");
    // Page links are the router's job; everything else leaves the site.
    if (href.charAt(0) === "#") return;
    e.preventDefault();
    parent.postMessage({ type: "sb:external", href: href }, "*");
  });
})();
</script>
`;

/**
 * The finished, standalone HTML file — all pages in one document.
 *
 * `interactive: false` leaves out the routing script, for the thumbnails that
 * render with scripts disabled. They only ever show the first page, and without
 * this the blocked script logs an error in the console.
 *
 * `embedProject` tucks the editable project inside the finished page, so the
 * .html file can be opened again in the builder. It's invisible to visitors and
 * costs a couple of kilobytes — left out of the share link, where every
 * character shows up in the URL.
 *
 * `guardExternalLinks` is for the in-app preview only: a link that leaves the
 * site is reported to the editor, which asks before opening it. The real
 * exported file never includes this — visitors expect links to just work.
 */
export function exportHtml(
  site: Site,
  opts: { interactive?: boolean; guardExternalLinks?: boolean; embedProject?: boolean } = {}
): string {
  const interactive = opts.interactive !== false;
  const pages = site.pages
    .map(
      (page, i) =>
        `    <section class="page" id="${esc(page.slug)}" data-title="${esc(
          `${site.title} · ${page.name}`
        )}"${i === 0 ? "" : " hidden"}>
${pageBlocks(page, site, false)}
    </section>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(site.title)}</title>
<style>
${siteCss(site)}
</style>
</head>
<body>
${navHtml(site, site.pages[0]?.slug ?? "")}<main>
${pages}
</main>
${interactive ? routingScript(site) : ""}${
    opts.guardExternalLinks ? EXTERNAL_LINK_GUARD : ""
  }${opts.embedProject ? embeddedProject(site) : ""}</body>
</html>
`;
}

/** The same document, showing one page, plus the editor's click-to-select wiring. */
export function previewHtml(site: Site, pageId: string, selectedId: string | null): string {
  const page = site.pages.find((p) => p.id === pageId) ?? site.pages[0];
  if (!page) return "<!doctype html><html><body></body></html>";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(site.title)}</title>
<style>
${siteCss(site)}
.sb-pick { position: relative; }
.sb-pick:hover { outline: 1px dashed color-mix(in srgb, var(--accent) 35%, transparent); outline-offset: -1px; }
.sb-pick[data-selected="true"] { outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent); outline-offset: -2px; }
/* Grab here to move a block. Kept to the top-right corner, where left-aligned
   text almost never is, and only visible on the block you're pointing at. */
.sb-handle {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  line-height: 1;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.12s ease;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
  user-select: none;
  /* Pointer events only — without this a touch drag scrolls the page instead. */
  touch-action: none;
  z-index: 5;
}
.sb-pick:hover > .sb-handle,
.sb-pick[data-selected="true"] > .sb-handle { opacity: 1; }
.sb-handle:active { cursor: grabbing; }
.sb-pick[data-dragging="true"] { opacity: 0.4; }
.sb-dropline {
  position: absolute;
  height: 3px;
  border-radius: 2px;
  background: var(--accent);
  pointer-events: none;
  z-index: 10;
}
.sb-dropline[hidden] { display: none; }
/* The box around a selected button: drag it anywhere, to any size. The frame
   is see-through to the pointer so the words underneath stay editable; only
   the handles themselves catch it. */
.sb-box { position: absolute; z-index: 8; pointer-events: none; }
.sb-box[hidden] { display: none; }
.sb-box::before {
  content: "";
  position: absolute;
  inset: -3px;
  border: 1px dashed color-mix(in srgb, var(--accent) 60%, transparent);
  border-radius: 4px;
}
.sb-bh {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #fff;
  border: 2px solid var(--accent);
  border-radius: 3px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
  pointer-events: auto;
  touch-action: none;
}
.sb-bh--move {
  left: -20px;
  top: 50%;
  margin-top: -7px;
  border-radius: 50%;
  cursor: move;
}
.sb-bh--radius {
  right: -7px;
  top: -7px;
  background: var(--accent);
  border-radius: 50%;
  cursor: nesw-resize;
}
.sb-bh--width { right: -7px; top: 50%; margin-top: -6px; cursor: ew-resize; }
.sb-bh--size { right: -7px; bottom: -7px; cursor: nwse-resize; }
/* Text you can type straight into.
 *
 * The rounding is kept away from buttons: [data-edit] and .btn--pill have the
 * same specificity and this rule comes later, so a button's own corners lost
 * to it — you could pick Pill or Square, watch the preview ignore you, and
 * only find out it had worked when you exported the page. */
[data-edit] { cursor: text; }
[data-edit]:not(.btn) { border-radius: 3px; }
[data-edit]:hover { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent); }
[data-edit]:empty::before {
  content: attr(data-placeholder);
  opacity: 0.4;
}
[data-edit]:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent);
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}
</style>
</head>
<body>
${navHtml(site, page.slug)}<main>
    <section class="page">
${pageBlocks(page, site, true)}
    </section>
</main>
${inlineEditorScript()}${blockDragScript()}${boxHandlesScript()}<script>
(function () {
  var selected = ${JSON.stringify(selectedId)};
  if (selected) {
    var el = document.querySelector('[data-block-id="' + CSS.escape(selected) + '"]');
    if (el) el.setAttribute("data-selected", "true");
  }
  document.addEventListener("click", function (e) {
    // Nothing inside the preview should navigate while you're editing.
    var link = e.target.closest("a");
    if (link) e.preventDefault();

    // Clicking a nav link switches the page you're editing.
    var navLink = e.target.closest("[data-nav]");
    if (navLink) {
      parent.postMessage({ type: "sb:page", slug: navLink.dataset.nav }, "*");
      return;
    }

    var hit = e.target.closest("[data-block-id]");
    parent.postMessage({ type: "sb:select", id: hit ? hit.dataset.blockId : null }, "*");
  });

  // A single click selects the button so you can edit it; a double-click follows
  // it, the way it will behave for real. Preview mode does it on one click.
  document.addEventListener("dblclick", function (e) {
    var link = e.target.closest("a[href]");
    if (!link) return;
    e.preventDefault();
    var href = link.getAttribute("href");
    if (href.charAt(0) === "#") {
      parent.postMessage({ type: "sb:page", slug: href.slice(1) }, "*");
    } else {
      parent.postMessage({ type: "sb:external", href: href }, "*");
    }
  });
})();
</script>
</body>
</html>
`;
}
