import { DEFAULT_THEME } from "./blocks";
import type { Block, Page, Site } from "./types";

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "page"
  );
}

/** A slug that isn't already taken by another page. */
export function uniqueSlug(name: string, pages: Page[], ignoreId?: string): string {
  const base = slugify(name);
  const taken = new Set(pages.filter((p) => p.id !== ignoreId).map((p) => p.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newPage(name: string, pages: Page[], blocks: Block[] = []): Page {
  return { id: newId("page"), name, slug: uniqueSlug(name, pages), blocks };
}

export function emptySite(): Site {
  return {
    title: "My New Site",
    theme: { ...DEFAULT_THEME },
    nav: true,
    pages: [{ id: newId("page"), name: "Home", slug: "home", blocks: [] }],
  };
}

/**
 * Accept anything that was ever written to localStorage or a project file and
 * return a valid Site. Sites saved before pages existed had a top-level
 * `blocks` array; those become a single "Home" page.
 */
export function migrate(raw: unknown): Site {
  const base = emptySite();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  const theme = { ...base.theme, ...(r.theme as object) };
  const title = typeof r.title === "string" ? r.title : base.title;
  const nav = typeof r.nav === "boolean" ? r.nav : true;

  if (Array.isArray(r.pages) && r.pages.length > 0) {
    const pages = (r.pages as Page[]).map((p, i) => ({
      id: typeof p?.id === "string" ? p.id : newId("page"),
      name: typeof p?.name === "string" ? p.name : `Page ${i + 1}`,
      slug: typeof p?.slug === "string" && p.slug ? p.slug : slugify(p?.name ?? `page-${i + 1}`),
      blocks: Array.isArray(p?.blocks) ? p.blocks : [],
    }));
    return { title, theme, nav, pages };
  }

  if (Array.isArray(r.blocks)) {
    return {
      title,
      theme,
      nav,
      pages: [{ id: newId("page"), name: "Home", slug: "home", blocks: r.blocks as Block[] }],
    };
  }

  return { ...base, title, theme, nav };
}
