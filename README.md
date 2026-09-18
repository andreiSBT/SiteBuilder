# SiteBuilder

This is an app that makes building your own site way easier.

A visual website builder. You stack **blocks** (hero, text, image, cards…), style them
in the side panel, and export a finished `.html` file you can put on any host.

## Running it

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Writing a site with Claude

On the start screen, describe what the site is for and Claude writes the blocks: real
sentences about your subject, a colour and font that suit it, and a page you can then edit
like any other. It takes about half a minute.

### Talking to it about the page

The right-hand panel has a **Claude** tab: ask for a change to the page you're looking at
and it happens. "Make the headline shorter", "add a section about how to get there",
"something calmer than the orange". Each answer comes with **Undo**.

It's **stateless on purpose**. Every message sends the page exactly as it stands, rather
than Claude remembering what it wrote last time — so anything you typed by hand in between
counts, and the conversation can't drift away from what's actually on screen.

Text is sent with its formatting tags intact and comes back through `sanitizeRich()`, so a
word you bolded yourself stays bold through an edit that wasn't about it. The reply is
checked against the same schema and mapped onto real blocks, so a change it invents can't
produce a block this builder doesn't have.

### On your subscription, not an API key

A **Claude Pro or Max plan doesn't include the API** — the API is billed separately
([why](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console)).
But a plan *does* include a monthly **Agent SDK credit**, and that explicitly covers
third-party apps authenticating with your subscription
([docs](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)).

So this uses `@anthropic-ai/claude-agent-sdk`, not the API SDK. Nothing to paste, no card,
and when the monthly credit runs out requests simply stop rather than quietly becoming a
bill.

### Why it's off on the deployed site

The Agent SDK runs the Claude Code runtime as a local process and signs in as *you*. Two
consequences: it only works where that runtime and your login exist — the machine you run
the builder on — and if it ran on the public site, every visitor would be spending your
credit. So the route answers `{ available: false }` in production and the panel doesn't
appear. The SDK is `await import()`ed inside that guard, so its few megabytes never reach
the deployed build either.

### What comes back is not trusted

Claude returns JSON, which is parsed, checked against a zod schema, and mapped onto real
blocks with the builder's own defaults — so a field it invents is ignored rather than
becoming a block. Every string still goes through `sanitizeRich()`, exactly like text typed
by hand, and the block count and string lengths are capped.

## Templates

The first time you open the app you get a **start screen**: five templates, or Blank.
The **New** button in the toolbar brings it back any time.

The thumbnails are not screenshots — each one is the template *actually rendered* in a
shrunken iframe, by the same `exportHtml()` used for the real download. So a thumbnail
can never go stale or lie about what you'll get.

Templates live in `src/lib/templates.ts`. To add one, append to `TEMPLATES`:

```ts
{
  id: "recipe",
  name: "Recipe",
  tagline: "One dish, written down properly.",
  build: () => ({
    title: "Best Pancakes",
    theme: theme({ accent: "#d97706", font: "serif" }),
    blocks: [
      b("hero", { heading: "Best Pancakes", style: "tint" }),
      b("text", { text: "Flour, eggs, milk. That's mostly it." }),
    ],
  }),
}
```

`b()` starts from a block's defaults and overrides only what you name, and `theme()`
does the same for the theme — so you only write the parts that differ.

## Editing on the page

Text is edited **where it appears**, not in a side panel. Click any heading, paragraph,
card or button in the preview and type. Select a word or phrase and a toolbar floats above
it with **bold / italic / underline / strikethrough, font, size and colour**.

The same text can also be edited **in the side panel**, for when a block is off-screen or
the text is too small to click comfortably. Both boxes are views onto the same value and
stay in step: typing in one updates the other without rebuilding anything. The panel box
has no toolbar of its own — fonts, sizes and colours are applied on the page, where you can
see them — but ⌘B / ⌘I / ⌘U work there, free from contentEditable.

The inspector still holds everything that isn't words: alignment, block size, links,
images, colours.

### Stacking order

The format bar is rendered into `<body>` through a portal. As a child of the preview panel
it was clipped by that panel's scrolling and painted underneath the side panels. The app's
layers, highest last:

```
preview / start screen  50
format bar              95
the bar's own dropdowns 110
dialogs                 130
tooltips                140
```

The bar hides itself in full-screen preview and on the start screen, where there's nothing
to format.

### How it works

The preview is a **sandboxed iframe**, so the app cannot reach its DOM, its selection or
its caret. The editing engine therefore lives *inside* the frame
(`src/lib/inlineEditor.ts`, injected only into the preview, never into an export), and the
two halves talk by `postMessage`:

```
frame -> app   sb:edit   which block, which field, the new value
frame -> app   sb:sel    caret rect, current font and size
app   -> frame sb:cmd    bold / font / size / colour
app   -> frame sb:cmd    select    move the selected-block outline
app   -> frame sb:cmd    setField  a panel edit, applied to one element
```

`setField` is why panel typing doesn't rebuild the document: the app updates the single
element that changed, and the frame ignores it if that element is focused — because then
someone is typing in it.

Blocks mark their editable text with `data-edit="heading"` or `data-edit="items.0.title"`,
added by `toHtml` only when rendering for the editor. Values come back through the same
`sanitizeRich()` allowlist as everything else, so typing in the page is exactly as safe as
typing in a panel.

Three things had to be got right, each of which silently broke editing:

- **Never rebuild the document while someone is typing in it.** Replacing `srcDoc` on
  every keystroke throws the caret to the start. Edits arriving from the frame skip
  exactly one rebuild — the frame already shows that change.
- **Selecting a block must not rebuild it either.** Moving the highlight used to re-render
  the document, which meant clicking text placed a caret and then immediately destroyed
  it, so you had to click twice. The outline is moved by a message instead.
- **`execCommand` does nothing in an unfocused frame.** The toolbar lives in the app, so
  clicking it leaves the frame unfocused; the engine calls `window.focus()` first, then
  restores the saved selection (focusing an element that lost focus brings back its
  *previous* caret).

There are **14 fonts**, all already on people's machines, so an exported site downloads
nothing.

### How it's kept safe

Rich text means storing HTML, so `src/lib/sanitize.ts` is the load-bearing part.
`sanitizeRich()` is an allowlist: `strong em u s p br span`, and on a `span` only
`color`, `background-color`, `font-size`, `font-family`, `font-weight`, `font-style` and
`text-decoration`, each matched against a pattern. Anything else is dropped — the tag
goes, its words stay. It runs on the way *in* from the editor and again on the way *out*
when rendering, so a hand-edited project file can't sneak anything through either.

It's written **without the DOM** on purpose: the same function runs in the editor, in the
export, and in Node tests, and all three have to agree exactly.

Two traps worth knowing about, both of which cost real debugging:

- **`&quot;` contains a semicolon.** Browsers serialise font stacks as
  `font-family: X, &quot;Arial Narrow Bold&quot;, sans-serif`. Splitting the style on
  `;` *before* decoding tears the font name in half and the whole declaration gets
  rejected. Decode first, then split.
- **Read the selection before calling `focus()`.** Focusing an element that lost focus
  restores its *previous* caret, throwing away the selection you were about to style.

`execCommand` still powers bold/italic/underline — it's deprecated but works everywhere,
and its `<b>` output is normalised to `<strong>` by the sanitiser. Size, font and colour
can't use it (`fontSize` only understands 1–7, `foreColor` emits `<font>` tags), so those
wrap the selection in a styled `<span>` directly.

## Spacing

Every block leaves about 28px above and below itself. A **heading is the exception**: it
keeps its space above but almost none below, because a heading belongs to what comes after
it. With equal padding it sat 76px from the paragraph it introduced — marooned halfway
between two things, so the page read as a list of unrelated items rather than sections.
It's 30px now.

The **Spacer** block adds to that rather than replacing it, so a 48px spacer between two
blocks makes a 104px gap. That surprised its author, never mind anyone else, so the field
says "Extra gap" and starts at 24 rather than 48. If a gap looks too big, that's usually a
spacer doing exactly what it was told.

Headings use `text-wrap: balance` and paragraphs `text-wrap: pretty`, which keeps a
heading from leaving one word stranded on its own line.

## Text size

Hero, Heading and Text blocks have a **Text size** control for the whole block — drag the
slider or type a number. `0` means "automatic". To size individual words instead, use the
rich text toolbar above.

Sizes render as `min(Npx, Nvw)`, so a 150px headline shrinks on a phone instead of
running off the screen. Anything above 400px is clamped.

Headings are always a real `<h2>`. There's no heading-level picker: the size slider
covers how big it *looks*, and keeping the tag fixed means screen readers and search
engines still see a proper heading.

## What you can change

Beyond the words, most of how a block *looks* is adjustable in the panel. Everything here
defaults to how the site rendered before the control existed, so opening an old project
changes nothing about it.

**Buttons** — four styles (solid, outline, soft tint, or just a link), corners (follow the
theme, square, rounded, pill), three sizes, and three widths: as wide as the words, wide,
or full width. The hero's button has the same style, corner and size controls of its own.
Beyond those presets, a button can be **put anywhere and made any size by hand** — see
below.

**Heroes** — compact, normal, tall, or fills the screen. The last one centres the contents
vertically, which is why the hero wraps them in a `.hero__inner`: as direct flex children
they'd be stretched to full width, and a button would silently become a banner.

**Pictures** — a shape (as it comes, 16:9, 4:3, square, 3:4, 21:9), a width as a percentage
of the page, and which side a narrow one sits on. Anything but "as it comes" crops with
`object-fit: cover`, because a browser told only an aspect ratio squashes the picture
instead of trimming it.

**Feature grids** — one to four cards per row (two on a tablet, one on a phone, whatever
it's told), the gap between them, text alignment, and four card styles: filled, outlined,
raised, or no card at all.

**Spacers** — still a gap, and now optionally a line across it: full width, a short rule in
the middle, or dotted.

**The whole site** — a separate font for headings, the air around every block, and line
spacing, alongside the colours, body font, content width and corner roundness that were
already there.

Values are read through a `choice()` helper that falls back when a prop is missing or
unrecognised, so a block saved before any of this existed renders exactly as it did, and a
hand-edited project file can't produce a class that isn't in the stylesheet.

### Claude edits don't undo any of it

Claude is sent the page as words and returns it as words, so a block used to come back
with none of the looks somebody had chosen — ask for a shorter headline and your pill
buttons went back to being rectangles. `applyAiPage` now walks the old and new block lists
together, matching on type, and keeps everything except the handful of props Claude was
actually shown (`AI_OWNED` in `aiPage.ts`). Blocks keep their ids through an edit too, so
whatever was selected stays selected.

### Moving and sizing a button on the page

Select a button and it gets a box with four handles: **move** (the circle on its left),
**corners** (the filled circle at the top right), **width** (the right edge) and **width
and height together** (the bottom right corner). Drag them. Arrow keys nudge the selected
button a pixel at a time, or ten with Shift held.

The five numbers behind those handles — `x`, `y`, `w`, `h`, `r` — are ordinary block props,
all meaning "leave it alone" at 0, and they appear in the panel as sliders too, so you can
drag roughly and then type the exact number. The hero's button has the same five under
`buttonX`, `buttonW` and so on; `boxKey()` in `blocks.ts` is what maps between them.

It works the way everything else in the preview does. The handles live *inside* the frame
(`src/lib/boxHandles.ts`), because the frame is sandboxed and the app cannot measure
anything in it. While the pointer is down that script moves the pixels itself, so the drag
never waits for a round trip, and it posts `sb:box` messages the app folds into the real
props. It brackets the whole drag with `sb:dragging`, which is the existing signal that
stops the app replacing the document — otherwise the first mousemove would delete the very
handle being held.

Two details that took a try to get right:

- **The nudge rides on `--bx` / `--by`, not `transform` directly.** `.btn:hover` lifts a
  button by a pixel, and a transform written inline lost to that rule the instant the
  pointer arrived — so a button you had just dragged jumped back under the cursor.
- **Snapping is what makes it usable.** A free drag can't hit "centred", and can never
  quite get back to zero. The move handle lines up with the column's left edge, centre and
  right edge, and with the button's own starting point, whenever it comes within 7px.

### The corners bug this turned up

Picking Square or Pill did nothing *in the editor* — and worked perfectly in the exported
file, which is a maddening way to find a bug. The preview's own stylesheet ends with

```css
[data-edit] { cursor: text; border-radius: 3px; }
```

which rounds the boxes you can type into. A button's text is edited in place, so the
button *is* a `[data-edit]` — and `[data-edit]` and `.btn--pill` have exactly the same
specificity, with that rule coming last. Every button in the preview was 3px, whatever it
had been told. It's `[data-edit]:not(.btn)` now.

## Preview

**Preview** in the toolbar opens the finished site full-screen — the actual exported
file, running for real. Buttons jump between pages, the nav works, links behave. It opens
on whichever page you were editing. Desktop / tablet / mobile widths; `Esc` to leave.

While *editing*, a single click on a button selects it (so you can change it) and a
**double-click** follows it to its page. There's also an "Open page →" shortcut next to
any "Goes to" dropdown.

## Dialogs and the colour picker

**Nothing in the app uses browser-native UI.** Four kinds were replaced:

| Native thing | Replacement |
|---|---|
| `window.alert` / `window.confirm` | `Dialogs.tsx` — `useDialog()` |
| `title=""` tooltips | `Tooltip.tsx` — `<Tip label="…">` |
| `<select>` dropdowns | `Select.tsx` |
| `<input type="color">` | `ColorPicker.tsx` |

The only native UI left is the **file picker** (`<input type="file">` for "Open a file…"),
which is an operating-system window that no web page is allowed to replace. `<iframe
title="…">` also stays — that's an accessibility name, not a tooltip, and never appears
on screen.

`Tip` clones its child and adds the hover handlers to it, so no extra element enters the
layout. One bubble is rendered for the whole app and positioned `fixed` from the target's
rect — an absolutely-positioned one would be clipped by the scrolling sidebars.

`Select` renders its list in a portal for the same reason, and closes on scroll or resize
because its position was measured when it opened. Arrow keys, Home/End, Enter and Escape
all work.

Dialogs go through `DialogProvider` in `src/components/Dialogs.tsx`:

```tsx
const dialog = useDialog();

const ok = await dialog.confirm({
  title: `Delete "${page.name}"?`,
  message: "It has 3 blocks on it, which will go too.",
  confirmLabel: "Delete page",
  danger: true,        // red button, for anything that throws work away
});
```

`dialog.alert({ … })` is the same without a cancel button. Both return promises, so call
sites read like the native ones they replaced.

Two things in there are easy to get wrong:

- **`onConfirm`** runs *synchronously inside the confirm click*, before the promise
  resolves. `window.open()` needs that — after an `await`, the browser no longer counts
  the call as something you asked for and blocks it as a popup.
- **Whether a dialog is open lives in its own context**, separate from the
  `confirm`/`alert` functions. Putting it in the same object would change that object's
  identity whenever a dialog opened, so any effect depending on it would re-run and open
  another one — an infinite loop.

**The colour picker** (`ColorPicker.tsx`) is one line per channel — R, G, B — each with a
slider and a typeable number, plus a hex box and some presets. Each track is a gradient
of what *that* channel does to the current colour, so you can see where you're going
before you drag. Click the swatch to fold the sliders away.

## What can still hand control to the browser

The app was swept for anything that triggers browser-native UI. What's left, and why:

| Still native | Why it stays |
|---|---|
| File picker (`Open a file…`) | An OS window. No web page may replace it. |
| Download (Export HTML, ⤓) | The browser's own save flow. |
| New tab from "Yes, open it" | That *is* the feature — and it's asked for first. |
| Drag ghost when reordering | Part of HTML5 drag and drop. |
| Spellcheck squiggles in text boxes | Wanted — it's your site's writing. |
| `<iframe title>` | An accessibility name, never drawn. |

Three things were found and closed:

- **Autofill dropdowns.** Browsers pop a saved-value list over unmarked fields. Every
  input and textarea now carries `autoComplete="off"`; the link box also turns off
  autocorrect and autocapitalise, which mangle URLs.
- **`allow-popups` on the preview frame.** Not needed — link clicks are intercepted and
  the *app* opens the tab after asking. Removed, so a previewed page can't open one
  behind your back.
- **`allow-modals` is never granted.** A previewed page calling `alert()` is ignored by
  the browser, so a site you build can't interrupt you while you edit it.

There are also **no `<form>` elements**, so the browser's own "Please fill in this field"
validation bubbles can never appear.

## Links that leave your site

In the preview, clicking a button that points anywhere other than one of your pages
doesn't follow it. You get a dialog instead:

> **This button points outside your site** — It goes to another website (github.com).
> Do you want to open it in a new tab?

"Yes" opens it in a new tab, so the preview stays where it is. Empty links (`#`) say so
rather than doing nothing silently. In the editing pane it's a **double-click** that
asks, since a single click selects the block.

**The exported site never does this** — visitors expect links to just work, and a site
that interrogates you before every link would read as broken. The guard is injected only
into the preview documents (`EXTERNAL_LINK_GUARD` in `render.ts`). Say the word if you
want it in the real export too.

## Putting a site online

**Publish** in the toolbar puts the finished site on the internet. Four choices, easiest
first:

- **Live** — one button, no sign-up. The page goes on Sitebuilder itself at a short address
  like `/site/my-portfolio-348511`, and **keeps up with your edits**: change something and
  the page changes too, at the same address, so a link you already sent stays right.
- **Just a link** — the site compressed into the link itself. Nothing stored anywhere, never
  expires, but it's a *frozen copy*: edits made afterwards don't show in a link already sent.
- **Vercel** / **GitHub** — onto your own account, with a token. GitHub also keeps the code.

Cloudflare Drop used to be here as the no-account option. **Live** is that, but permanent
and self-updating, so Drop was only ever the worse choice and it's gone.

### How Live works

```
POST /api/site   → stores the page, returns { id, editKey, url }
PUT  /api/site   → replaces it, if you have the key
GET  /site/<id>  → serves it
```

Pages live in a private Vercel Blob store. Private, not public, on purpose: the serving
route reads with `useCache: false`, so an edit is visible **immediately** — a public blob
can serve up to a minute stale, which would make a page look broken right after you changed
it.

The **edit key is never stored anywhere.** It's an HMAC of the id with a server-side secret
(`SITE_EDIT_SECRET`), so the server can recognise a real one without keeping a list, and
there's no key sitting in the store to be read. The browser keeps its copy in
`localStorage`, deliberately *not* in the project — otherwise anyone you sent the `.html`
to could overwrite your live page.

Updates wait for a **pause in the typing** (2.5s) rather than firing per keystroke, so a
sentence is one upload rather than forty. The corner shows "updating…" then "up to date".

### It checks that the page is really there

A recorded address isn't proof of anything — a page can be taken down, or a host can still
be building it. So the corner asks before it claims: a green dot and **"Online at"** when
the address answers, a red dot and **"Not answering"** when it doesn't, grey while it finds
out. Checked when the address changes and again after each edit is uploaded.

The browser can't ask another site directly (it won't answer a cross-origin request), so
`/api/check` asks on its behalf and reports only the status code. Fetching a URL somebody
else chose is a way to make a server knock on doors it shouldn't, so before anything is
requested: http(s) only, the hostname is resolved and refused if it lands on a private,
loopback or link-local address — including the cloud metadata address — and redirects
aren't followed. This app's own host is allowed through by name, or pages hosted here would
look dead during local development.

### If someone puts something bad up there

Anyone who can reach the app can publish a page on your domain — that's the cost of "no
account". Pages are capped at 2MB. To see what's there and remove something:

```bash
vercel blob list --prefix sites/     # everything published
vercel blob del sites/<id>.html      # take one down
```

If it's ever a real problem, Vercel's Firewall can rate-limit `/api/site` without touching
the rest of the app.

### The address is remembered

Publishing used to show the link once, and closing the dialog lost it. A site now keeps
the addresses it's been published to (`site.published`), so **Publish** always opens with
"Your site is online at…" — newest first, with when it was published and a Copy button
next to each.

The **bottom corner of the right-hand panel** always says where the site stands: "Not on a
host yet", with *Copy share link* and *Put it online* buttons before you publish, and a green dot with the
address and a Copy button after. Never a blank space you have to guess about. The panel
scrolls under it; the corner stays put.

Publishing with a token records the address by itself. The other routes can't: the drop
page hands *you* the URL, not the app, and a site published before any of this existed
left no record. So the dialog has a **"Already put it online somewhere?"** box — paste the
address, press Remember, and the corner shows it from then on. A bare host like
`example.pages.dev` is fine; it goes through the same `normalizeUrl()` as any link.

The share link is never recorded, for two reasons: it *contains* the site, so storing it
inside that site would make the next link bigger and the one after bigger again — and a
saved one would be **wrong the moment you edit anything**. So the corner has a **Copy share
link** button that builds one fresh each time, which is always right by construction.

It travels inside the project, so it survives a reload, and comes back when you reopen the
downloaded `.html`. Visitors never see it: it lives in the embedded project block, not the
page. The share link isn't listed there, because pressing the button again rebuilds exactly
the same link from the site itself.

### Why there's no permanent free host without an account

Because permanent anonymous hosting gets used for scam and malware pages within days. The
drop services square that circle by handing out a URL to anyone and deleting it an hour
later. Anything that stays up wants to know who put it there — which is the whole job the
token does.

Of the two that stay up, **GitHub Pages is the better first one**: the account is free with
no card, the site is permanent, and your code lives next to it.

Each of those needs a **token**, which is how the host knows it's you. The dialog links straight to
the page that makes one (Vercel: any name, Full Account; GitHub: a classic token with the
`repo` box ticked).

### About the token

A token is like a password — anyone who has it can act as you on that site. So:

- It is sent to the host, used once, and **never stored or logged** by this app.
- "Remember this token in this browser" is **off by default**. Turning it on saves it in
  `localStorage` on that computer only. Don't tick it on a shared or school computer.
- If one ever leaks, delete it on the host's tokens page; it stops working immediately.

### How it works

The browser can't call these APIs directly — they don't allow it (CORS) — so the request
goes through this app's own routes, which forward it and translate the reply into plain
English:

```
src/app/api/publish/vercel/route.ts   POST /v13/deployments, one inlined index.html
src/app/api/publish/github/route.ts   create repo -> PUT contents/index.html -> enable Pages
```

That means **the builder has to be running** (`npm run dev`) to publish. Download still
works offline.

The GitHub route treats "repository already exists" (422) and "Pages already on" (409) as
success rather than errors — that's what republishing looks like.

## Saving

Two kinds, deliberately:

- **Save** keeps the site *inside the app*, in the browser. Your sites show up on the
  start screen with live thumbnails — open, copy, or delete them there. After the first
  Save, edits keep saving themselves, so it's one click ever, not one click per change.
- **Download** saves one `.html` file that is both things at once: a finished web page
  anyone can open, *and* the project. **Open a file…** takes it straight back, so there's
  no second file to keep track of.

In-app saving uses the browser's `localStorage` (a few MB, this browser only). If it
fills up, the Save button says "No space" rather than pretending it worked — that's when
to download a project file.

- Work in progress autosaves to `localStorage`, so a refresh never loses anything.
- **One file does both jobs.** `exportHtml(site, { embedProject: true })` tucks the project
  into the page as an inert `<script type="application/json">` block, and
  `projectFromHtml()` reads it back. Visitors never see it; it costs about 2KB. Every `<`
  in that JSON is escaped, so a site whose own text contains `</script>` can't close the
  tag early and break out into the page.
- It's left out of the **share link** on purpose — there every byte becomes URL characters.
  Downloads and published sites carry it, so a live page can be pulled back in and edited.
- Old `site-project.json` files still open.
- Old project files from before pages existed still open — `migrate()` in `src/lib/site.ts`
  turns their single block list into one "Home" page.

## Pages

A site is a list of **pages**, each with its own blocks. Add, rename (double-click),
reorder (drag) and delete them in the top-left panel.

Export is still **one single `.html` file**. Every page becomes a
`<section class="page" id="slug">`, and a small script shows whichever one matches the
URL hash:

```
yoursite.html          -> first page
yoursite.html#about    -> the About page
```

The browser back button works, and a nav bar is generated automatically once you have
two or more pages (switch it off with the checkbox).

Any "Goes to" field on a button, hero, or footer link is a **dropdown of your pages** —
picking one stores `#slug`. Rename a page and every link pointing at it is rewritten to
follow, so links don't silently break.

One consequence worth knowing: because it's a single file, a visitor downloads the whole
site at once. That's ideal for a handful of pages and wrong for a hundred.

## How it's put together

The important idea: **there is one source of truth for HTML.** Every block knows how to
turn itself into an HTML string, and that same string is used for *both* the live preview
and the export. So the preview can never drift out of sync with the real output.

```
src/lib/types.ts       Block, Site and Field types
src/lib/blocks.ts      every block: its fields, its defaults, its toHtml()
src/lib/render.ts      the site stylesheet + full-document builder
src/components/Editor.tsx     the 3-column app (palette | preview | inspector)
src/components/Inspector.tsx  builds the edit form from a block's `fields`
src/components/StartScreen.tsx the template picker, with live-rendered thumbnails
src/lib/templates.ts          the starting-point sites
src/lib/site.ts               pages, slugs, and the save-file migration
src/lib/projects.ts           the in-app saved-sites store
src/components/PreviewOverlay.tsx  full-screen preview of the real export
```

### Two iframe traps, already hit

**Base URLs.** A `srcdoc` iframe inherits its base URL from the parent page, so inside
one, `href="#about"` resolves against the *editor's* URL — the iframe loads the editor
into itself. The full-screen preview therefore serves the site from a **blob URL**
(`PreviewOverlay.tsx`), which gives the document a URL of its own.

**Blocked navigation.** A sandboxed frame isn't allowed to navigate to a blob URL, so
`location.hash = "about"` is silently refused and nothing happens. The routing script in
`render.ts` therefore handles page-link clicks itself, and only touches `location.hash`
when the protocol isn't `blob:`. On a real host the hash still updates, so the back
button works.

The preview is an `<iframe>` so the site's CSS can't collide with the editor's CSS.
A tiny injected script posts a message up when you click a block, which is how
click-to-select works.

## Adding a new block type

You only touch `src/lib/blocks.ts` — the editor UI builds itself from what you declare.

1. Add the name to `BlockType` in `types.ts`.
2. Add an entry to `BLOCKS`:

```ts
quote: {
  type: "quote",
  name: "Quote",
  icon: "❝",
  description: "A pulled-out quotation",
  fields: [
    { key: "text",   label: "Quote",  type: "textarea" },
    { key: "author", label: "Author", type: "text" },
  ],
  defaults: () => ({ text: "Stay hungry.", author: "Someone" }),
  toHtml: (p) => `<section class="block">
    <blockquote>${esc(p.text)}<cite>${esc(p.author)}</cite></blockquote>
  </section>`,
},
```

3. Add `"quote"` to `BLOCK_ORDER`, and style `blockquote` in `siteCss()`.

That's it — the palette button, the edit form and the export all appear on their own.

### Field types you can use

`text` · `textarea` · `link` (a plain URL) · `pagelink` (dropdown of your pages, or a
custom URL) · `color` · `select` (needs `options`) · `number` (a slider; takes
`min`/`max`/`step`) · `list` (a repeater, like the feature cards)

## Safety note

All text people type is escaped with `esc()` before going into HTML, and link URLs go
through `escUrl()`. Keep using them — that's what stops someone's typed `<script>` from
running.

`escUrl()` calls `normalizeUrl()`, which works out what a typed link *means*:

| typed | becomes |
|---|---|
| `example.com`, `portal.example.co.uk/x` | `https://…` |
| `me@example.com` | `mailto:me@example.com` |
| `about.html`, `menu.pdf` | left alone (a file next to this one) |
| `#about`, `/about`, `./x` | left alone |
| `javascript:`, `data:`, anything else with a scheme | `#` — refused |

Only `http`, `https`, `mailto` and `tel` schemes are ever allowed through. The rule that
matters: **be generous about what people type, strict about what schemes run.** The
inspector shows what a link resolves to, so nothing is silently rewritten behind your
back.
