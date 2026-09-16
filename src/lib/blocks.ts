import { richToHtml } from "./sanitize";
import type { BlockDef, BlockProps, BlockType, RenderOpts, Theme } from "./types";

/** Escape untrusted text before putting it into HTML. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SAFE_SCHEME = /^(https?|mailto|tel):/i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** "example.com", "portal.example.co.uk/path" — a host typed without a scheme. */
const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i;
const BARE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** "about.html", "menu.pdf" — a file sitting next to this one, not a website. */
const BARE_FILE = /^[^/?#]+\.(html?|php|aspx?|pdf|txt|md|css|js|json|xml|csv|zip|png|jpe?g|gif|svg|webp|ico|mp[34]|mov|docx?|xlsx?|pptx?)$/i;

/**
 * Work out what a typed link actually means.
 *
 * People type "portal.example.com" far more often than "https://portal.example.com",
 * so a bare host gets https:// put in front of it rather than being thrown away.
 * Anything carrying a scheme we don't trust (javascript:, data:) becomes "#".
 */
export function normalizeUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (raw === "") return "";
  // Fragments and relative paths are already fine.
  if (/^([#/]|\.\.?\/)/.test(raw)) return raw;
  if (ANY_SCHEME.test(raw)) return SAFE_SCHEME.test(raw) ? raw : "#";
  if (BARE_EMAIL.test(raw)) return `mailto:${raw}`;
  if (BARE_FILE.test(raw)) return raw;
  if (BARE_HOST.test(raw)) return `https://${raw}`;
  // Something like "about.html" — a relative file next to this one.
  return raw;
}

/** Escape a URL for HTML, after working out what it means. */
export function escUrl(value: unknown): string {
  return esc(normalizeUrl(value));
}

/**
 * A font size in px. 0 means "use the default for this block".
 * Rendered as min(Npx, Nvw) so a huge size still fits a phone screen.
 */
function sizeStyle(value: unknown, vw: number): string {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return "";
  const clamped = Math.min(400, Math.max(8, size));
  return `;font-size:min(${clamped}px, ${vw}vw)`;
}

const SIZE_FIELD = (max: number) => ({
  key: "size",
  label: "Size of all the text (0 = automatic)",
  type: "number" as const,
  min: 0,
  max,
  step: 1,
});

/**
 * Marks a piece of text as editable in place. Only ever added in the editor's
 * preview — the exported file has none of these.
 *
 * `rich` text keeps its inline formatting; `plain` text is stored as words.
 */
function edit(opts: RenderOpts | undefined, path: string, kind: "rich" | "plain" = "rich") {
  if (!opts?.edit) return "";
  return ` data-edit="${esc(path)}" data-edit-kind="${kind}"`;
}

const ALIGN_FIELD = {
  key: "align",
  label: "Alignment",
  type: "select" as const,
  options: [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
    { value: "right", label: "Right" },
  ],
};

export const BLOCKS: Record<BlockType, BlockDef> = {
  hero: {
    type: "hero",
    name: "Hero",
    icon: "★",
    description: "Big headline at the top of the page",
    fields: [
      { key: "heading", label: "Headline", type: "rich" },
      { key: "subheading", label: "Subtitle", type: "rich" },
      SIZE_FIELD(200),
      { key: "buttonText", label: "Button text", type: "text" },
      { key: "buttonLink", label: "Button goes to", type: "pagelink" },
      {
        key: "style",
        label: "Background",
        type: "select",
        options: [
          { value: "plain", label: "Plain" },
          { value: "tint", label: "Accent tint" },
          { value: "gradient", label: "Gradient" },
        ],
      },
      ALIGN_FIELD,
    ],
    defaults: () => ({
      heading: "Build something great",
      subheading: "A short sentence that tells people what this site is about.",
      buttonText: "Get started",
      buttonLink: "#",
      size: 0,
      style: "tint",
      align: "center",
    }),
    toHtml: (p, _theme, o) => {
      const button = p.buttonText
        ? `\n      <a class="btn" href="${escUrl(p.buttonLink)}"${edit(o, "buttonText", "plain")}>${esc(p.buttonText)}</a>`
        : "";
      return `<section class="block hero hero--${esc(p.style)}" style="text-align:${esc(p.align)}">
      <h1 style="${sizeStyle(p.size, 14).slice(1)}"${edit(o, "heading")}>${richToHtml(p.heading)}</h1>
      ${p.subheading || o?.edit ? `<p class="lead"${edit(o, "subheading")} data-placeholder="Add a subtitle…">${richToHtml(p.subheading)}</p>` : ""}${button}
    </section>`;
    },
  },

  heading: {
    type: "heading",
    name: "Heading",
    icon: "H",
    description: "A section title",
    fields: [
      { key: "text", label: "Text", type: "rich" },
      SIZE_FIELD(200),
      ALIGN_FIELD,
    ],
    defaults: () => ({ text: "A section title", size: 0, align: "left" }),
    // Always an <h2>: the size slider handles how big it looks, and screen
    // readers still get a real heading.
    toHtml: (p, _theme, o) => `<section class="block block--heading">
      <h2 style="text-align:${esc(p.align)}${sizeStyle(p.size, 14)}"${edit(o, "text")}>${richToHtml(p.text)}</h2>
    </section>`,
  },

  text: {
    type: "text",
    name: "Text",
    icon: "¶",
    description: "A paragraph of writing",
    fields: [
      { key: "text", label: "Text", type: "rich" },
      SIZE_FIELD(120),
      ALIGN_FIELD,
    ],
    defaults: () => ({
      text: "Write whatever you want here.\n\nLeave a blank line to start a new paragraph.",
      size: 0,
      align: "left",
    }),
    toHtml: (p, _theme, o) => `<section class="block prose" style="text-align:${esc(p.align)}${sizeStyle(p.size, 9)}"${edit(o, "text")}>
      ${richToHtml(p.text, { paragraphs: true })}
    </section>`,
  },

  image: {
    type: "image",
    name: "Image",
    icon: "▣",
    description: "A picture from a URL",
    fields: [
      { key: "src", label: "Image URL", type: "link" },
      { key: "alt", label: "Description (for screen readers)", type: "text" },
      { key: "caption", label: "Caption", type: "text" },
      { key: "rounded", label: "Rounded corners", type: "select", options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ] },
    ],
    defaults: () => ({
      src: "https://picsum.photos/1200/700",
      alt: "A placeholder photo",
      caption: "",
      rounded: "yes",
    }),
    toHtml: (p, _theme, o) => `<section class="block">
      <figure class="figure${p.rounded === "yes" ? " figure--rounded" : ""}">
        <img src="${escUrl(p.src)}" alt="${esc(p.alt)}" loading="lazy">
        ${p.caption ? `<figcaption${edit(o, "caption", "plain")}>${esc(p.caption)}</figcaption>` : ""}
      </figure>
    </section>`,
  },

  button: {
    type: "button",
    name: "Button",
    icon: "▭",
    description: "A link that looks like a button",
    fields: [
      { key: "text", label: "Button text", type: "text" },
      { key: "link", label: "Goes to", type: "pagelink" },
      {
        key: "variant",
        label: "Style",
        type: "select",
        options: [
          { value: "solid", label: "Solid" },
          { value: "outline", label: "Outline" },
        ],
      },
      ALIGN_FIELD,
    ],
    defaults: () => ({ text: "Click me", link: "#", variant: "solid", align: "left" }),
    toHtml: (p, _theme, o) => `<section class="block" style="text-align:${esc(p.align)}">
      <a class="btn${p.variant === "outline" ? " btn--outline" : ""}" href="${escUrl(p.link)}"${edit(o, "text", "plain")}>${esc(p.text)}</a>
    </section>`,
  },

  features: {
    type: "features",
    name: "Feature grid",
    icon: "⠿",
    description: "A row of cards",
    fields: [
      { key: "title", label: "Section title", type: "text" },
      {
        key: "items",
        label: "Cards",
        type: "list",
        addLabel: "Add card",
        itemFields: [
          { key: "icon", label: "Emoji", type: "text" },
          { key: "title", label: "Title", type: "rich" },
          { key: "body", label: "Description", type: "rich" },
        ],
        newItem: () => ({ icon: "✨", title: "New card", body: "Say something about it." }),
      },
    ],
    defaults: () => ({
      title: "Why it's good",
      items: [
        { icon: "⚡", title: "Fast", body: "Loads instantly, everywhere." },
        { icon: "🎨", title: "Pretty", body: "Looks good without any effort." },
        { icon: "🔧", title: "Simple", body: "No setup, no config files." },
      ],
    }),
    toHtml: (p) => {
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      const cards = items
        .map(
          (item) => `<div class="card">
          ${item.icon ? `<div class="card__icon">${esc(item.icon)}</div>` : ""}
          <h3>${richToHtml(item.title)}</h3>
          <p>${richToHtml(item.body)}</p>
        </div>`
        )
        .join("\n        ");
      return `<section class="block">
      ${p.title ? `<h2>${esc(p.title)}</h2>` : ""}
      <div class="grid">
        ${cards}
      </div>
    </section>`;
    },
  },

  spacer: {
    type: "spacer",
    name: "Spacer",
    icon: "↕",
    description: "Extra gap, on top of the space blocks already leave",
    fields: [
      {
        key: "height",
        // Blocks already leave ~28px above and below themselves, so this is
        // added to that rather than being the whole gap. Saying "extra" is the
        // difference between a 48 that looks like 48 and one that looks like 104.
        label: "Extra gap (px)",
        type: "number",
        min: 0,
        max: 300,
        step: 4,
      },
    ],
    defaults: () => ({ height: 24 }),
    toHtml: (p) => {
      const h = Number(p.height);
      const height = Number.isFinite(h) ? Math.min(300, Math.max(0, h)) : 48;
      return `<div class="spacer" style="height:${height}px"></div>`;
    },
  },

  footer: {
    type: "footer",
    name: "Footer",
    icon: "▁",
    description: "Small print at the bottom",
    fields: [
      { key: "text", label: "Text", type: "text" },
      {
        key: "links",
        label: "Links",
        type: "list",
        addLabel: "Add link",
        itemFields: [
          { key: "label", label: "Label", type: "text" },
          { key: "href", label: "Goes to", type: "pagelink" },
        ],
        newItem: () => ({ label: "New link", href: "#" }),
      },
    ],
    defaults: () => ({
      text: "© 2026 My Site",
      links: [{ label: "Email", href: "mailto:hello@example.com" }],
    }),
    toHtml: (p, _theme, o) => {
      const links = Array.isArray(p.links) ? (p.links as Record<string, unknown>[]) : [];
      const rendered = links
        .map((l) => `<a href="${escUrl(l.href)}">${esc(l.label)}</a>`)
        .join("\n        ");
      return `<footer class="block site-footer">
      <p${edit(o, "text", "plain")}>${esc(p.text)}</p>
      ${rendered ? `<nav class="footer-links">\n        ${rendered}\n      </nav>` : ""}
    </footer>`;
    },
  },
};

export const BLOCK_ORDER: BlockType[] = [
  "hero",
  "heading",
  "text",
  "image",
  "button",
  "features",
  "spacer",
  "footer",
];

export function newBlock(type: BlockType) {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    props: BLOCKS[type].defaults(),
  };
}

export const DEFAULT_THEME: Theme = {
  accent: "#4f46e5",
  bg: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  font: "system",
  maxWidth: 760,
  radius: 12,
};

export const FONT_STACKS: Record<string, string> = {
  system:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  rounded: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
  verdana: "Verdana, Geneva, sans-serif",
  tahoma: "Tahoma, Verdana, sans-serif",
  futura: "Futura, 'Century Gothic', 'Avenir Next', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  times: "'Times New Roman', Times, serif",
  palatino: "Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif",
  garamond: "Garamond, 'Apple Garamond', 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  courier: "'Courier New', Courier, monospace",
  impact: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
  comic: "'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', cursive",
  brush: "'Brush Script MT', 'Snell Roundhand', cursive",
};

/** Shown in both the theme picker and the rich text toolbar. */
export const FONT_OPTIONS = [
  { value: "system", label: "Sans" },
  { value: "rounded", label: "Rounded" },
  { value: "verdana", label: "Verdana" },
  { value: "tahoma", label: "Tahoma" },
  { value: "futura", label: "Futura" },
  { value: "serif", label: "Georgia" },
  { value: "times", label: "Times" },
  { value: "palatino", label: "Palatino" },
  { value: "garamond", label: "Garamond" },
  { value: "mono", label: "Monospace" },
  { value: "courier", label: "Courier" },
  { value: "impact", label: "Impact" },
  { value: "comic", label: "Comic" },
  { value: "brush", label: "Brush Script" },
];

export function blockHtml(type: BlockType, props: BlockProps, theme: Theme): string {
  return BLOCKS[type].toHtml(props, theme);
}
