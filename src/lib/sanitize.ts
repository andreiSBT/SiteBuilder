/**
 * An allowlist sanitiser for the inline formatting produced by the rich text
 * editor.
 *
 * Deliberately written without the DOM: it runs when exporting, when rendering
 * a preview, and in tests under Node, and all three must agree exactly. Nothing
 * that isn't on the list survives — unknown tags are dropped but their text is
 * kept, so content is never lost, only formatting.
 */

const VOID_TAGS = new Set(["br"]);

/** Tags kept as-is, after mapping a few synonyms onto one spelling. */
const TAG_ALIASES: Record<string, string> = {
  b: "strong",
  strong: "strong",
  i: "em",
  em: "em",
  u: "u",
  s: "s",
  strike: "s",
  del: "s",
  p: "p",
  br: "br",
  span: "span",
  a: "a",
  // Browsers love producing <div> inside contentEditable; treat it as a line.
  div: "p",
};

/** Style declarations a <span> may carry, and what counts as a valid value. */
const STYLE_RULES: Record<string, RegExp> = {
  color: /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\([\d\s.,%]+\))$/i,
  "background-color": /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\([\d\s.,%]+\))$/i,
  "font-size": /^(\d{1,3}(\.\d+)?px|inherit)$/i,
  // Single quotes only: a double quote would close the style="…" attribute.
  "font-family": /^[-\w\s,']{1,200}$/,
  "font-weight": /^(normal|bold|[1-9]00)$/i,
  "font-style": /^(normal|italic)$/i,
  "text-decoration": /^(none|underline|line-through)$/i,
};

const MAX_FONT_SIZE = 400;
const MIN_FONT_SIZE = 8;

/** Escape text, leaving existing entities (&amp;) alone so they don't double up. */
function escapeText(text: string): string {
  return text
    .replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Keep only allowed declarations, with values that match their rule. */
function cleanStyle(rawStyle: string): string {
  // Decode quote entities *before* splitting on ";" — "&quot;" ends in a
  // semicolon, so splitting first tears a quoted font name in half. Single
  // quotes mean the same to CSS and survive the style="…" attribute intact.
  const style = rawStyle
    .replace(/&quot;|&#34;|"/g, "'")
    .replace(/&apos;|&#39;/g, "'");

  const kept: string[] = [];
  for (const declaration of style.split(";")) {
    const at = declaration.indexOf(":");
    if (at === -1) continue;
    const prop = declaration.slice(0, at).trim().toLowerCase();
    let value = declaration.slice(at + 1).trim();
    const rule = STYLE_RULES[prop];
    if (!rule) continue;
    // Nothing may smuggle in a url() or escape sequence.
    if (/url\(|expression|javascript:|[\\<>]/i.test(value)) continue;
    if (prop === "font-size" && value.toLowerCase() !== "inherit") {
      const px = parseFloat(value);
      if (!Number.isFinite(px)) continue;
      value = `${Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, px))}px`;
    }
    if (!rule.test(value)) continue;
    kept.push(`${prop}:${value}`);
  }
  return kept.join(";");
}

/**
 * The one class a link in rich text may carry: the "looks like a button" style.
 * An allowlist of exactly one is still an allowlist.
 */
const LINK_CLASSES = new Set(["link-btn"]);

const SAFE_HREF_SCHEME = /^(https?|mailto|tel):/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * A link target that can't run anything.
 *
 * This repeats a little of `normalizeUrl` in blocks.ts on purpose: blocks.ts
 * imports this file, and the sanitiser is the last line of defence — it should
 * not depend on a caller having cleaned up first. Returns null for anything it
 * won't vouch for, and the tag is then dropped while its words stay.
 */
function safeHref(raw: string): string | null {
  // Control characters and newlines first: "java\nscript:alert(1)" is a link
  // the browser is perfectly happy to follow.
  const href = raw.replace(/[\u0000-\u001f\u007f\s]+/g, "").trim();
  if (!href) return null;
  if (/^([#/]|\.\.?\/)/.test(href) || !HAS_SCHEME.test(href)) {
    // A fragment, a path, or a bare name like "about.html".
    return escapeAttr(href);
  }
  return SAFE_HREF_SCHEME.test(href) ? escapeAttr(href) : null;
}

/** Quotes and angle brackets can't be allowed to end the attribute early. */
function escapeAttr(value: string): string {
  return value
    .replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const TAG_RE = /<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi;
const STYLE_ATTR_RE = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i;
const HREF_ATTR_RE = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;
const CLASS_ATTR_RE = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/i;

/**
 * Sanitise a fragment of inline HTML. Returns well-formed HTML: stray closing
 * tags are dropped and anything left open at the end is closed.
 */
export function sanitizeRich(input: unknown): string {
  const html = String(input ?? "");
  const out: string[] = [];
  const open: string[] = [];
  let last = 0;

  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(html)) !== null) {
    out.push(escapeText(html.slice(last, match.index)));
    last = match.index + match[0].length;

    const raw = match[0];
    const name = match[1].toLowerCase();
    const tag = TAG_ALIASES[name];
    const closing = raw.startsWith("</");

    // Not on the list: drop the tag, keep whatever text is inside it.
    if (!tag) continue;

    if (VOID_TAGS.has(tag)) {
      if (!closing) out.push("<br>");
      continue;
    }

    if (closing) {
      const at = open.lastIndexOf(tag);
      if (at === -1) continue; // stray close
      // Close anything opened inside it first, so nesting stays valid.
      while (open.length > at) out.push(`</${open.pop()}>`);
      continue;
    }

    if (tag === "a") {
      const hrefMatch = HREF_ATTR_RE.exec(match[2]);
      const href = hrefMatch
        ? safeHref(hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? "")
        : null;
      // A link that goes nowhere safe is not a link: drop it, keep the words.
      if (!href) continue;
      const classMatch = CLASS_ATTR_RE.exec(match[2]);
      const wanted = (classMatch?.[2] ?? classMatch?.[3] ?? "").trim();
      const cls = LINK_CLASSES.has(wanted) ? ` class="${wanted}"` : "";
      out.push(`<a href="${href}"${cls}>`);
      open.push("a");
      continue;
    }

    if (tag === "span") {
      const styleMatch = STYLE_ATTR_RE.exec(match[2]);
      const style = cleanStyle(styleMatch ? (styleMatch[2] ?? styleMatch[3] ?? "") : "");
      // A span with nothing left to say is just noise.
      if (!style) continue;
      out.push(`<span style="${style}">`);
      open.push("span");
      continue;
    }

    out.push(`<${tag}>`);
    open.push(tag);
  }

  out.push(escapeText(html.slice(last)));
  while (open.length) out.push(`</${open.pop()}>`);

  return out.join("");
}

/** True if a stored value is plain text from before rich text existed. */
function looksPlain(value: string): boolean {
  return !/<(\/?)(strong|b|em|i|u|s|span|p|br|div|a)\b/i.test(value);
}

/**
 * Turn a stored field value into HTML, whether it's rich HTML or the plain text
 * that blocks used to hold. Plain text keeps its old behaviour: blank lines
 * start new paragraphs.
 */
export function richToHtml(value: unknown, opts: { paragraphs?: boolean } = {}): string {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";

  if (looksPlain(raw)) {
    const escaped = escapeText(raw);
    if (!opts.paragraphs) return escaped.replace(/\n/g, "<br>");
    return escaped
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("\n      ");
  }

  return sanitizeRich(raw);
}

/** The plain words inside a rich value, for list labels and the like. */
export function richToText(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
