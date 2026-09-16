export type BlockType =
  | "hero"
  | "heading"
  | "text"
  | "image"
  | "button"
  | "features"
  | "spacer"
  | "footer";

export type BlockProps = Record<string, unknown>;

export type Block = {
  id: string;
  type: BlockType;
  props: BlockProps;
};

export type Theme = {
  accent: string;
  bg: string;
  text: string;
  muted: string;
  font: string;
  maxWidth: number;
  radius: number;
};

export type Page = {
  id: string;
  name: string;
  /** Used as the URL hash: #about, #contact … */
  slug: string;
  blocks: Block[];
};

/** Where a site has been put online before, so the link isn't lost. */
export type PublishedRecord = {
  url: string;
  repoUrl?: string;
  /** Set for sites hosted here, so they can be updated in place. */
  id?: string;
  at: number;
};

export type Site = {
  title: string;
  theme: Theme;
  /** Show the auto-generated navigation bar (only meaningful with 2+ pages). */
  nav: boolean;
  /** Keyed by host: "vercel", "github". Travels with the project. */
  published?: Record<string, PublishedRecord>;
  pages: Page[];
};

export type Field =
  | { key: string; label: string; type: "text" | "textarea" | "color" | "link" }
  // Text that can carry inline formatting: bold, colour, size, font.
  | { key: string; label: string; type: "rich" }
  // A link to one of this site's pages, or a URL typed by hand.
  | { key: string; label: string; type: "pagelink" }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] }
  | { key: string; label: string; type: "number"; min?: number; max?: number; step?: number }
  | {
      key: string;
      label: string;
      type: "list";
      addLabel: string;
      itemFields: Field[];
      newItem: () => Record<string, unknown>;
    };

/** Extra instructions for a render — currently only "mark the editable text". */
export type RenderOpts = { edit?: boolean };

export type BlockDef = {
  type: BlockType;
  name: string;
  icon: string;
  description: string;
  fields: Field[];
  defaults: () => BlockProps;
  toHtml: (props: BlockProps, theme: Theme, opts?: RenderOpts) => string;
};
