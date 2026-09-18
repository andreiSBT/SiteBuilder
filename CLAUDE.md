@AGENTS.md

# Sitebuilder

A visual website builder. You stack **blocks** on **pages**, style them in the side
panel, and get a real `.html` file out. Next.js 16 App Router, React 19, Tailwind 4,
TypeScript. No database — a project is a `Site` object in localStorage, a `.json` file,
or embedded inside an exported page.

`README.md` is the long form and explains *why* most of this is the way it is. Read the
section that covers whatever you're touching before changing it; several of the decisions
below cost real debugging to arrive at.

## Commands

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # eslint
npx tsc --noEmit # typecheck — faster than a build for a quick check
```

There is no test suite. To check a rendering change, render it and look at it. `src/lib`
imports nothing but its own relative neighbours, so Node runs it directly with type
stripping — it only needs a hook to add the `.ts` the imports leave off:

```js
// hooks.mjs, registered with node:module's register()
export async function resolve(spec, ctx, next) {
  if (spec.startsWith(".") && !/\.(ts|tsx|mjs|js|json)$/.test(spec)) {
    try { return await next(spec + ".ts", ctx); } catch {}
  }
  return next(spec, ctx);
}
```

Then `exportHtml(site)` to a file and screenshot it headlessly:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars --window-size=1100,1700 \
  --screenshot=out.png "file:///path/to/page.html#some-page"
```

## The shape of it

```
src/lib/types.ts      Site → Page → Block, Theme, BlockDef, Field
src/lib/blocks.ts     the eight block types: fields, defaults, toHtml
src/lib/render.ts     siteCss / exportHtml / previewHtml
src/lib/sanitize.ts   sanitizeRich — the load-bearing safety boundary
src/lib/site.ts       migrate, slugs, ids, projectFromHtml
src/lib/templates.ts  the start-screen templates
src/components/Editor.tsx   the whole app — state lives here
src/lib/inlineEditor.ts     runs *inside* the preview iframe, never in an export
src/lib/dragBlocks.ts       ditto — dragging blocks up and down the page
src/lib/boxHandles.ts       ditto — dragging a button anywhere, to any size
src/app/api/…         ai/, publish/, site/, check/
```

`Editor.tsx` holds `site` state and passes it down; there is no store, no context for it,
and adding one is not an improvement anybody has asked for.

## Rules that are easy to break

**Everything that renders text goes through `sanitizeRich()`.** It's an allowlist, written
without the DOM on purpose so the editor, the export and Node all agree exactly. It runs
on the way in from the editor *and* again on the way out when rendering. A new block's
`toHtml` uses `richToHtml()` for rich fields and `esc()` / `escUrl()` for everything else —
never string-interpolate a prop straight into HTML.

**Never rebuild the preview document while someone is typing in it.** Replacing `srcDoc`
throws the caret to the start. Edits arriving from the frame skip exactly one rebuild, and
selecting a block moves the outline by `postMessage` rather than re-rendering.

**The preview is sandboxed and the app cannot reach into it.** The two halves talk by
`postMessage`: `sb:edit`, `sb:sel`, `sb:move` and `sb:box` come out, `sb:cmd` goes in.
`allow-popups` and `allow-modals` are deliberately not granted. Anything that drags must
bracket itself with `sb:dragging`, or the app will replace the document mid-drag and take
away the handle the pointer is holding.

**The preview's editor-only CSS comes after the site's own.** `[data-edit]` matches real
site elements — a button's text is edited in place, so the button *is* `[data-edit]` — and
at equal specificity the later rule wins. A preview-only rule that sets a visual property
(not just a cursor or an outline) must exclude what it would otherwise silently override;
this cost a bug where button corners worked in the export but never in the editor.

**Nothing uses browser-native UI.** `useDialog()` instead of `alert`/`confirm`, `<Tip>`
instead of `title=""`, `Select` instead of `<select>`, `ColorPicker` instead of
`<input type="color">`, and every input carries `autoComplete="off"`. There are no
`<form>` elements, so validation bubbles can't appear. The file picker and the download
flow are the only exceptions — an OS window can't be replaced.

**`migrate()` accepts anything** that was ever written to localStorage or a project file.
If you change the `Site` shape, teach `migrate` the old shape too; old projects and old
exported pages are still out there.

## Adding a block type

Add it to `BlockType` in `types.ts`, then to `BLOCKS` and `BLOCK_ORDER` in `blocks.ts` —
`fields`, `defaults()` and `toHtml`. The inspector builds itself from `fields`, so nothing
in `Inspector.tsx` needs touching. Mark editable text with `edit(o, "path")` so it can be
typed on the page; the path matches the prop (`"heading"`, `"items.0.title"`).

## Adding a template

Append to `TEMPLATES` in `templates.ts`. `b()` starts from a block's defaults and `theme()`
from the default theme, so you write only what differs. Thumbnails are the template
actually rendered in a shrunken iframe, so there's nothing to regenerate.

## Claude features

Two routes — `api/ai/page` (write a site from a description) and `api/ai/edit` (change the
page on screen). Both use `@anthropic-ai/claude-agent-sdk`, **not** the API SDK: a Pro or
Max plan includes an Agent SDK credit but not API access, so this spends credit rather than
becoming a bill.

- Locally it uses the login already on the machine. Deployed it needs
  `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) and stays off without one.
- The SDK is `await import()`ed inside the availability guard, so its megabytes stay out of
  the deployed bundle.
- The public site is rationed by `aiBudget.ts` — a daily dollar cap counted from what the
  SDK reports each run actually cost. Local runs are not rationed.
- Replies are parsed, checked against `AiPageSchema` (zod), and mapped onto real blocks with
  the builder's own defaults. A field Claude invents is ignored rather than becoming a block.
- The edit route is **stateless on purpose**: every message sends the page as it stands, so
  hand-typed changes count and the conversation can't drift from the screen.

## Hosting and publishing

`api/site` puts a page in Vercel Blob under `sites/<id>.html`, served back through
`app/site/[id]`. The key that proves you made a site is an HMAC of its id
(`SITE_EDIT_SECRET`), derived rather than stored. `api/publish/vercel` and
`api/publish/github` push to those hosts with a token the user pastes.

Env (`.env.local`, pulled with `vercel env pull`): `BLOB_READ_WRITE_TOKEN`,
`SITE_EDIT_SECRET`, optionally `CLAUDE_CODE_OAUTH_TOKEN` and `AI_DAILY_LIMIT_USD`.

## Writing style

Commit subjects say what changed in plain words, in the imperative, with no prefix tag —
"Stop headings floating away from their own text", not "fix(blocks): heading margin".
Comments explain why, not what, and the README's voice is the house voice: plain, specific,
and willing to admit what surprised its author.
