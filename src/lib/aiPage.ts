import { z } from "zod";
import { BLOCKS, DEFAULT_THEME, FONT_OPTIONS, newBlock } from "./blocks";
import { sanitizeRich } from "./sanitize";
import { newId, slugify } from "./site";
import type { Block, BlockType, Page, Site } from "./types";

/**
 * What Claude is asked to return.
 *
 * One flat shape with optional fields rather than a union per block type: it
 * describes every block the builder has, and a field that doesn't apply is
 * simply left out, which is far more forgiving than a strict union.
 */
const AiBlock = z.object({
  type: z.enum(["hero", "heading", "text", "image", "button", "features", "spacer", "footer"]),
  /** Hero: the big line. */
  heading: z.string().optional(),
  /** Hero: the sentence under it. */
  subheading: z.string().optional(),
  /** Heading, text, button and footer all use this for their words. */
  text: z.string().optional(),
  /** Hero and button: what the button says. */
  buttonText: z.string().optional(),
  /** Feature grid: the line above the cards. */
  title: z.string().optional(),
  cards: z
    .array(z.object({ icon: z.string(), title: z.string(), body: z.string() }))
    .optional(),
  /** Image: what it shows, so a real picture can be dropped in later. */
  alt: z.string().optional(),
  caption: z.string().optional(),
});

export const AiPageSchema = z.object({
  title: z.string(),
  /** A hex colour that suits the subject, like "#2563eb". */
  accent: z.string(),
  font: z.enum(FONT_OPTIONS.map((o) => o.value) as [string, ...string[]]),
  blocks: z.array(AiBlock),
});

export type AiPage = z.infer<typeof AiPageSchema>;

export const MAX_BLOCKS = 14;

/** Claude writes the words; the builder still owns what a block actually is. */
function toBlock(item: z.infer<typeof AiBlock>): Block | null {
  const type = item.type as BlockType;
  if (!BLOCKS[type]) return null;

  const block = newBlock(type);
  const clean = (value: string | undefined) =>
    value === undefined ? undefined : sanitizeRich(value.slice(0, 2000));

  const props: Record<string, unknown> = { ...block.props };
  const set = (key: string, value: string | undefined) => {
    if (value !== undefined) props[key] = value;
  };

  switch (type) {
    case "hero":
      set("heading", clean(item.heading ?? item.text));
      set("subheading", clean(item.subheading));
      set("buttonText", clean(item.buttonText));
      break;
    case "heading":
    case "text":
      set("text", clean(item.text ?? item.heading));
      break;
    case "button":
      set("text", clean(item.buttonText ?? item.text));
      break;
    case "footer":
      set("text", clean(item.text));
      break;
    case "image":
      set("alt", clean(item.alt));
      set("caption", clean(item.caption));
      break;
    case "features":
      set("title", clean(item.title ?? item.heading));
      if (item.cards?.length) {
        props.items = item.cards.slice(0, 6).map((card) => ({
          icon: (card.icon ?? "").slice(0, 4),
          title: sanitizeRich(card.title.slice(0, 200)),
          body: sanitizeRich(card.body.slice(0, 600)),
        }));
      }
      break;
    case "spacer":
      break;
  }

  return { ...block, props };
}

/** Turn what came back into a site the builder can actually open. */
export function aiPageToSite(page: AiPage): Site {
  const blocks = page.blocks
    .slice(0, MAX_BLOCKS)
    .map(toBlock)
    .filter((b): b is Block => b !== null);

  const title = sanitizeRich(page.title.slice(0, 120)) || "My New Site";
  const accent = /^#[0-9a-f]{6}$/i.test(page.accent) ? page.accent : DEFAULT_THEME.accent;
  const font = FONT_OPTIONS.some((o) => o.value === page.font) ? page.font : DEFAULT_THEME.font;

  const home: Page = {
    id: newId("page"),
    name: "Home",
    slug: slugify(title) === "page" ? "home" : "home",
    blocks,
  };

  return {
    title,
    theme: { ...DEFAULT_THEME, accent, font },
    nav: true,
    pages: [home],
  };
}

/**
 * Describe the page as it stands right now, so Claude changes what's actually
 * on screen rather than what it wrote last time.
 *
 * Text is sent as stored, formatting tags and all. They survive the round trip
 * through sanitizeRich(), so a bolded word stays bold unless the change is
 * about that word.
 */
export function siteToAiPage(site: Site, pageId: string): AiPage {
  const page = site.pages.find((p) => p.id === pageId) ?? site.pages[0];
  const blocks = (page?.blocks ?? []).map((block) => {
    const p = block.props as Record<string, string | undefined>;
    const item: Record<string, unknown> = { type: block.type };
    for (const key of ["heading", "subheading", "text", "buttonText", "title", "alt", "caption"]) {
      if (typeof p[key] === "string" && p[key]) item[key] = p[key];
    }
    if (block.type === "features" && Array.isArray(block.props.items)) {
      item.cards = (block.props.items as Record<string, string>[]).map((card) => ({
        icon: card.icon ?? "",
        title: card.title ?? "",
        body: card.body ?? "",
      }));
    }
    return item;
  });

  return {
    title: site.title,
    accent: site.theme.accent,
    font: site.theme.font,
    blocks,
  } as AiPage;
}

/** Put a revised page back, keeping everything the change wasn't about. */
export function applyAiPage(site: Site, pageId: string, revised: AiPage): Site {
  const rebuilt = aiPageToSite(revised);
  return {
    ...site,
    title: rebuilt.title,
    theme: { ...site.theme, accent: rebuilt.theme.accent, font: rebuilt.theme.font },
    pages: site.pages.map((page) =>
      page.id === pageId ? { ...page, blocks: rebuilt.pages[0].blocks } : page
    ),
  };
}

export const EDIT_PROMPT = `You are changing a page someone is looking at right now.

They send you the page as it stands and one instruction. Return the whole page back in the
same shape, with that instruction carried out and **everything else left exactly as it
was** — same words, same order, same blocks. Don't rewrite what wasn't mentioned, and
don't add blocks nobody asked for.

Text may contain simple formatting tags like <strong> or <span style="color:#e11d48">.
Keep them unless the instruction is about that formatting.

If the instruction is vague, make the smallest sensible change rather than starting over.`;

export const SYSTEM_PROMPT = `You write the contents of a small website, as blocks.

The person describes what the site is for. Give them a page that is worth showing to
someone: real sentences about their subject, not placeholder text, and never the words
"lorem ipsum" or "your text here".

Blocks available, in the order they usually make sense:
- hero: the big opening line (heading), a sentence under it (subheading), and a button (buttonText)
- heading: a section title
- text: one or more paragraphs; separate paragraphs with a blank line
- features: a title and 2-4 cards, each with an emoji icon, a short title and a sentence
- image: only when a picture would genuinely help; write alt describing what to put there
- button: a link to press
- footer: the small print at the bottom
- spacer: rarely needed; blocks already have space around them

Keep it to 5-9 blocks. Write in the voice the subject deserves — a club night is not a
bank. Pick an accent colour that suits it, and a font from the list.`;
