import { richToHtml } from "./sanitize";
import type { BlockDef, BlockProps, BlockType, Field, RenderOpts, Theme } from "./types";

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

/**
 * A named choice, falling back when the value is missing or unknown.
 *
 * Every one of these was added after sites already existed, so a block saved
 * before the control existed has no value at all — and must keep rendering
 * exactly as it did. The fallback is always "how it looked before".
 */
function choice(value: unknown, allowed: readonly string[], fallback: string): string {
  const v = String(value ?? "");
  return allowed.includes(v) ? v : fallback;
}

/** A class like "btn--pill", left out entirely when the choice is the default. */
function modifier(base: string, value: string, skip: string): string {
  return value === skip ? "" : ` ${base}--${value}`;
}

const SHAPE_FIELD = {
  key: "shape",
  label: "Corners",
  type: "select" as const,
  options: [
    { value: "theme", label: "Follow the theme" },
    { value: "square", label: "Square" },
    { value: "rounded", label: "Rounded" },
    { value: "pill", label: "Pill" },
  ],
};

const SHAPES = ["theme", "square", "rounded", "pill"] as const;
const SIZES = ["small", "medium", "large"] as const;
const WIDTHS = ["auto", "wide", "full"] as const;

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

/**
 * Position, size and corners set by dragging the button around the page.
 *
 * Five numbers, all of which mean "leave it alone" at 0: an exact width and
 * height, a nudge across and down, and a corner radius that beats the shape
 * preset. The hero has a button too, so the same five live there under
 * `buttonX`, `buttonW` and so on — hence the prefix.
 */
export const BOX_KEYS = ["x", "y", "w", "h", "r"] as const;

export type BoxKey = (typeof BOX_KEYS)[number];

const BOX_LIMITS: Record<BoxKey, [number, number]> = {
  x: [-600, 600],
  y: [-400, 400],
  w: [0, 1200],
  h: [0, 400],
  r: [0, 400],
};

/** Where one of those five numbers lives on a block: "w", or "buttonW". */
export function boxKey(prefix: string, key: BoxKey): string {
  return prefix ? prefix + key.toUpperCase() : key;
}

function boxNumber(value: unknown, key: BoxKey): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const [lo, hi] = BOX_LIMITS[key];
  return Math.round(Math.min(hi, Math.max(lo, n)));
}

/** Write a dragged box back onto a block's props, ignoring anything odd. */
export function applyBox(
  props: BlockProps,
  prefix: string,
  patch: Record<string, unknown>
): BlockProps {
  const next = { ...props };
  for (const key of BOX_KEYS) {
    if (patch[key] === undefined) continue;
    next[boxKey(prefix, key)] = boxNumber(patch[key], key);
  }
  return next;
}

/**
 * The inline style for a hand-placed button.
 *
 * The offset goes through custom properties rather than `transform` directly,
 * because `.btn:hover` lifts the button by a pixel — a transform written here
 * would be replaced by that one the moment the pointer arrived.
 */
function boxStyle(p: BlockProps, prefix: string): string {
  const at = (key: BoxKey) => boxNumber(p[boxKey(prefix, key)], key);
  const w = at("w");
  const h = at("h");
  const x = at("x");
  const y = at("y");
  const r = at("r");
  let style = "";
  if (w > 0) style += `;width:${w}px;text-align:center`;
  // A fixed height only holds the words in the middle if the box is a flex one.
  if (h > 0) style += `;height:${h}px;display:inline-flex;align-items:center;justify-content:center`;
  if (x) style += `;--bx:${x}px`;
  if (y) style += `;--by:${y}px`;
  if (r > 0) style += `;border-radius:${r}px`;
  return style;
}

/** The five drag-me-anywhere fields, so the panel and the page stay in step. */
function boxFields(prefix: string): Field[] {
  const key = (k: BoxKey) => boxKey(prefix, k);
  return [
    { key: key("r"), label: "Corner roundness (0 = use the shape)", type: "number", min: 0, max: 400, step: 1 },
    { key: key("w"), label: "Exact width (0 = automatic)", type: "number", min: 0, max: 1200, step: 5 },
    { key: key("h"), label: "Exact height (0 = automatic)", type: "number", min: 0, max: 400, step: 5 },
    { key: key("x"), label: "Nudge across", type: "number", min: -600, max: 600, step: 1 },
    { key: key("y"), label: "Nudge down", type: "number", min: -400, max: 400, step: 1 },
  ];
}

/** Every box number starts at 0, meaning "however it would look anyway". */
function boxDefaults(prefix: string): BlockProps {
  const out: BlockProps = {};
  for (const key of BOX_KEYS) out[boxKey(prefix, key)] = 0;
  return out;
}

/**
 * What gets written onto the button itself: the hand-set box, plus — in the
 * editor only — the marker the drag handles look for. `data-box` carries the
 * prefix, so the handles know whether they're moving a button block or the one
 * inside a hero.
 */
function boxAttrs(p: BlockProps, prefix: string, o?: RenderOpts): string {
  const style = boxStyle(p, prefix);
  return (
    (style ? ` style="${style.slice(1)}"` : "") + (o?.edit ? ` data-box="${esc(prefix)}"` : "")
  );
}

/**
 * The classes for one button. The hero has a button too, so this lives outside
 * both blocks — a hero button takes the defaults and reads them from nothing.
 */
/** What each picture shape actually means, as a CSS aspect ratio. */
const RATIOS: Record<string, string> = {
  wide: "16 / 9",
  photo: "4 / 3",
  square: "1 / 1",
  tall: "3 / 4",
  banner: "21 / 9",
};

export function btnClass(p: BlockProps): string {
  const variant = choice(p.variant, ["solid", "outline", "soft", "link"], "solid");
  return (
    "btn" +
    modifier("btn", variant, "solid") +
    modifier("btn", choice(p.shape, SHAPES, "theme"), "theme") +
    modifier("btn", choice(p.size, SIZES, "medium"), "medium") +
    modifier("btn", choice(p.width, WIDTHS, "auto"), "auto")
  );
}

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
        key: "buttonVariant",
        label: "Button style",
        type: "select",
        options: [
          { value: "solid", label: "Solid" },
          { value: "outline", label: "Outline" },
          { value: "soft", label: "Soft tint" },
          { value: "link", label: "Just a link" },
        ],
      },
      {
        key: "buttonShape",
        label: "Button corners",
        type: "select",
        options: [
          { value: "theme", label: "Follow the theme" },
          { value: "square", label: "Square" },
          { value: "rounded", label: "Rounded" },
          { value: "pill", label: "Pill" },
        ],
      },
      {
        key: "buttonSize",
        label: "Button size",
        type: "select",
        options: [
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Large" },
        ],
      },
      ...boxFields("button"),
      {
        key: "height",
        label: "How tall",
        type: "select",
        options: [
          { value: "compact", label: "Compact" },
          { value: "normal", label: "Normal" },
          { value: "tall", label: "Tall" },
          { value: "screen", label: "Fills the screen" },
        ],
      },
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
      buttonVariant: "solid",
      buttonShape: "theme",
      buttonSize: "medium",
      ...boxDefaults("button"),
      size: 0,
      height: "normal",
      style: "tint",
      align: "center",
    }),
    toHtml: (p, _theme, o) => {
      const cls = btnClass({
        variant: p.buttonVariant,
        shape: p.buttonShape,
        size: p.buttonSize,
      });
      const button = p.buttonText
        ? `\n        <a class="${cls}" href="${escUrl(p.buttonLink)}"${boxAttrs(p, "button", o)}${edit(o, "buttonText", "plain")}>${esc(p.buttonText)}</a>`
        : "";
      const height = choice(p.height, ["compact", "normal", "tall", "screen"], "normal");
      // The contents are wrapped because "fills the screen" centres them
      // vertically, and a flex child would otherwise be stretched to the full
      // width — which turns a button into a banner.
      return `<section class="block hero hero--${esc(p.style)}${modifier("hero", height, "normal")}" style="text-align:${esc(p.align)}">
      <div class="hero__inner">
        <h1 style="${sizeStyle(p.size, 14).slice(1)}"${edit(o, "heading")}>${richToHtml(p.heading)}</h1>
        ${p.subheading || o?.edit ? `<p class="lead"${edit(o, "subheading")} data-placeholder="Add a subtitle…">${richToHtml(p.subheading)}</p>` : ""}${button}
      </div>
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
      {
        key: "shape",
        label: "Shape",
        type: "select",
        options: [
          { value: "original", label: "However the picture comes" },
          { value: "wide", label: "Wide (16:9)" },
          { value: "photo", label: "Photo (4:3)" },
          { value: "square", label: "Square" },
          { value: "tall", label: "Tall (3:4)" },
          { value: "banner", label: "Banner (21:9)" },
        ],
      },
      { key: "width", label: "How wide (% of the page)", type: "number", min: 20, max: 100, step: 5 },
      ALIGN_FIELD,
    ],
    defaults: () => ({
      src: "https://picsum.photos/1200/700",
      alt: "A placeholder photo",
      caption: "",
      rounded: "yes",
      shape: "original",
      width: 100,
      align: "center",
    }),
    toHtml: (p, _theme, o) => {
      const shape = choice(p.shape, ["original", "wide", "photo", "square", "tall", "banner"], "original");
      // A cropped picture has to be told what to do with the overflow, or the
      // browser squashes it instead of trimming it.
      const crop = shape === "original" ? "" : ` style="aspect-ratio:${RATIOS[shape]};object-fit:cover;height:100%"`;
      const w = Number(p.width);
      const width = Number.isFinite(w) ? Math.min(100, Math.max(10, w)) : 100;
      const align = choice(p.align, ["left", "center", "right"], "center");
      // Narrower than the page? Then it needs to be told which side to sit on.
      const place =
        width >= 100
          ? ""
          : `;max-width:${width}%;margin-inline:${align === "left" ? "0 auto" : align === "right" ? "auto 0" : "auto"}`;
      return `<section class="block">
      <figure class="figure${p.rounded === "yes" ? " figure--rounded" : ""}" style="text-align:${esc(align)}${place}">
        <img src="${escUrl(p.src)}" alt="${esc(p.alt)}" loading="lazy"${crop}>
        ${p.caption ? `<figcaption${edit(o, "caption", "plain")}>${esc(p.caption)}</figcaption>` : ""}
      </figure>
    </section>`;
    },
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
          { value: "soft", label: "Soft tint" },
          { value: "link", label: "Just a link" },
        ],
      },
      SHAPE_FIELD,
      {
        key: "size",
        label: "Size",
        type: "select",
        options: [
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Large" },
        ],
      },
      {
        key: "width",
        label: "Stretch",
        type: "select",
        options: [
          { value: "auto", label: "As wide as the words" },
          { value: "wide", label: "Wide" },
          { value: "full", label: "Full width" },
        ],
      },
      ALIGN_FIELD,
      ...boxFields(""),
    ],
    defaults: () => ({
      text: "Click me",
      link: "#",
      variant: "solid",
      shape: "theme",
      size: "medium",
      width: "auto",
      align: "left",
      ...boxDefaults(""),
    }),
    toHtml: (p, _theme, o) => `<section class="block" style="text-align:${esc(p.align)}">
      <a class="${btnClass(p)}" href="${escUrl(p.link)}"${boxAttrs(p, "", o)}${edit(o, "text", "plain")}>${esc(p.text)}</a>
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
      {
        key: "columns",
        label: "Cards per row",
        type: "select",
        options: [
          { value: "auto", label: "As many as fit" },
          { value: "1", label: "One" },
          { value: "2", label: "Two" },
          { value: "3", label: "Three" },
          { value: "4", label: "Four" },
        ],
      },
      {
        key: "cardStyle",
        label: "Card style",
        type: "select",
        options: [
          { value: "filled", label: "Filled" },
          { value: "outline", label: "Outlined" },
          { value: "shadow", label: "Raised" },
          { value: "plain", label: "No card at all" },
        ],
      },
      { key: "gap", label: "Space between cards (px)", type: "number", min: 0, max: 48, step: 4 },
      ALIGN_FIELD,
    ],
    defaults: () => ({
      title: "Why it's good",
      columns: "auto",
      cardStyle: "filled",
      gap: 16,
      align: "left",
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
      const columns = choice(p.columns, ["auto", "1", "2", "3", "4"], "auto");
      const style = choice(p.cardStyle, ["filled", "outline", "shadow", "plain"], "filled");
      const g = Number(p.gap);
      const gap = Number.isFinite(g) ? Math.min(48, Math.max(0, g)) : 16;
      const align = choice(p.align, ["left", "center", "right"], "left");
      return `<section class="block cards--${esc(style)}" style="text-align:${esc(align)}">
      ${p.title ? `<h2>${esc(p.title)}</h2>` : ""}
      <div class="grid${modifier("grid", columns, "auto")}" style="gap:${gap}px">
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
      {
        key: "line",
        label: "A line across the gap",
        type: "select",
        options: [
          { value: "none", label: "Nothing, just space" },
          { value: "full", label: "All the way across" },
          { value: "short", label: "A short rule in the middle" },
          { value: "dots", label: "Dotted" },
        ],
      },
    ],
    defaults: () => ({ height: 24, line: "none" }),
    toHtml: (p) => {
      const h = Number(p.height);
      const height = Number.isFinite(h) ? Math.min(300, Math.max(0, h)) : 48;
      const line = choice(p.line, ["none", "full", "short", "dots"], "none");
      return `<div class="spacer${modifier("spacer", line, "none")}" style="height:${height}px"></div>`;
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
  headingFont: "",
  maxWidth: 760,
  radius: 12,
  // The numbers the site had baked in before any of this was adjustable, so a
  // project made then looks identical now.
  spacing: 28,
  lineHeight: 160,
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
