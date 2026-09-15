"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOCKS, BLOCK_ORDER, FONT_OPTIONS, newBlock } from "@/lib/blocks";
import { exportHtml, previewHtml } from "@/lib/render";
import { copyText } from "@/lib/clipboard";
import { richToText, sanitizeRich } from "@/lib/sanitize";
import { emptySite, migrate, newPage, projectFromHtml, uniqueSlug } from "@/lib/site";
import type { Block, BlockType, Field, Page, Site } from "@/lib/types";
import {
  deleteProject,
  duplicateProject,
  listProjects,
  saveProject,
  type SavedProject,
} from "@/lib/projects";
import { useDialog, useDialogOpen } from "./Dialogs";
import FormatBar, { type Command, type SelectionState } from "./FormatBar";
import Logo from "./Logo";
import {
  FieldList,
  GoToPageContext,
  InlineSyncContext,
  PagesContext,
  ThemeContext,
} from "./Inspector";
import { Tip } from "./Tooltip";
import { externalLinkPrompt, isOpenable } from "./LinkPrompt";
import PreviewOverlay from "./PreviewOverlay";
import PublishDialog from "./PublishDialog";
import StartScreen from "./StartScreen";

const STORAGE_KEY = "sitebuilder:site:v1";
const CURRENT_KEY = "sitebuilder:current-project:v1";

const THEME_FIELDS: Field[] = [
  { key: "accent", label: "Accent colour", type: "color" },
  { key: "bg", label: "Page background", type: "color" },
  { key: "text", label: "Text colour", type: "color" },
  { key: "muted", label: "Muted text", type: "color" },
  { key: "font", label: "Font for the whole site", type: "select", options: FONT_OPTIONS },
  { key: "maxWidth", label: "Content width", type: "number", min: 520, max: 1100, step: 20 },
  { key: "radius", label: "Corner roundness", type: "number", min: 0, max: 28, step: 2 },
];

/** Write a value at "heading" or "items.0.title" without mutating anything. */
function setByPath(props: Block["props"], path: string, value: unknown): Block["props"] {
  const parts = path.split(".");
  if (parts.length === 1) return { ...props, [parts[0]]: value };

  const [key, index, field] = parts;
  const list = Array.isArray(props[key]) ? [...(props[key] as Record<string, unknown>[])] : [];
  const at = Number(index);
  if (!Number.isInteger(at) || !list[at]) return props;
  list[at] = { ...list[at], [field]: value };
  return { ...props, [key]: list };
}

/** Replace one link target everywhere in a props tree (used when a slug changes). */
function rewriteLinks(value: unknown, from: string, to: string): unknown {
  if (typeof value === "string") return value === from ? to : value;
  if (Array.isArray(value)) return value.map((v) => rewriteLinks(v, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, rewriteLinks(v, from, to)])
    );
  }
  return value;
}

export default function Editor() {
  const [site, setSite] = useState<Site>(emptySite);
  const [activePageId, setActivePageId] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"block" | "theme">("block");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [loaded, setLoaded] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pageDragIndex, setPageDragIndex] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [showStart, setShowStart] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [externalHref, setExternalHref] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [saved, setSaved] = useState<SavedProject[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const fileInput = useRef<HTMLInputElement>(null);
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const dialog = useDialog();
  const [selection, setSelection] = useState<SelectionState | null>(null);
  // Typing in the preview must not rebuild the document under the caret.
  const skipPreviewRebuild = useRef(false);
  // True while a field inside the frame holds the caret. Counting renders to
  // skip "just one" rebuild was too delicate — a rebuild slipped through under
  // fast typing and swallowed the rest of the word. This can't slip.
  const editingInFrame = useRef(false);
  const rebuildWhenDone = useRef(false);
  const [rebuildTick, setRebuildTick] = useState(0);
  const [previewDoc, setPreviewDoc] = useState("");
  const dialogOpen = useDialogOpen();

  // Restore the last session, if there is one. localStorage doesn't exist while
  // this renders on the server, so it can't be read in a state initialiser.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(listProjects());
    setProjectId(localStorage.getItem(CURRENT_KEY));
    let restored = false;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setSite(migrate(JSON.parse(saved)));
        restored = true;
      }
    } catch {
      // A corrupted save shouldn't stop the editor from opening.
    }
    // Nothing to come back to? Offer templates instead of a mystery blank page.
    if (!restored) {
      setIsFirstRun(true);
      setShowStart(true);
    }
    setLoaded(true);
  }, []);

  // Autosave.
  useEffect(() => {
    if (!loaded || isFirstRun) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(site));
      // Once a site has been saved in the app, keep that copy up to date too,
      // so "Save" is a one-time act rather than a chore.
      if (projectId) saveProject(site, site.title, projectId);
    } catch {
      // Out of quota — not worth interrupting the user over.
    }
  }, [site, loaded, isFirstRun, projectId]);

  // Keep the active page pointing at something real.
  const activePage: Page = useMemo(
    () => site.pages.find((p) => p.id === activePageId) ?? site.pages[0],
    [site.pages, activePageId]
  );
  // Clicks inside the preview: select a block, or follow a nav link.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (data?.type === "sb:select") {
        setSelectedId(data.id ?? null);
        if (data.id) setTab("block");
      } else if (data?.type === "sb:edit") {
        // An edit made directly on the page. Rich text is sanitised on the way
        // in, exactly as it is on the way out.
        const { block, path, kind, value } = data;
        if (typeof block !== "string" || typeof path !== "string") return;
        const clean =
          kind === "plain"
            ? String(value ?? "").replace(/\s*\n\s*/g, " ")
            : sanitizeRich(value);
        skipPreviewRebuild.current = true;
        setSite((s) => ({
          ...s,
          pages: s.pages.map((page) => ({
            ...page,
            blocks: page.blocks.map((b) =>
              b.id === block ? { ...b, props: setByPath(b.props, path, clean) } : b
            ),
          })),
        }));
      } else if (data?.type === "sb:editing") {
        editingInFrame.current = !!data.active;
        // Anything that wanted a rebuild while they were typing happens now.
        if (!data.active && rebuildWhenDone.current) {
          rebuildWhenDone.current = false;
          setRebuildTick((tick) => tick + 1);
        }
      } else if (data?.type === "sb:sel") {
        if (!data.active) {
          setSelection(null);
          return;
        }
        const box = previewFrame.current?.getBoundingClientRect();
        setSelection({
          ...(data as SelectionState),
          frame: { top: box?.top ?? 0, left: box?.left ?? 0 },
        });
      } else if (data?.type === "sb:external") {
        // A link that leaves the site — ask before following it.
        if (typeof data.href === "string") setExternalHref(data.href);
      } else if (data?.type === "sb:page") {
        setSite((s) => {
          const target = s.pages.find((p) => p.slug === data.slug);
          if (target) {
            setActivePageId(target.id);
            setSelectedId(null);
          }
          return s;
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (externalHref === null) return;
    let cancelled = false;
    (async () => {
      await dialog.confirm({
        ...externalLinkPrompt(externalHref),
        // Runs inside the click itself, so the browser doesn't block the tab.
        onConfirm: () => {
          if (isOpenable(externalHref)) {
            window.open(externalHref, "_blank", "noopener,noreferrer");
          }
        },
      });
      if (!cancelled) setExternalHref(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [externalHref, dialog]);

  // Escape closes the topmost layer. A dialog handles its own Escape first, so
  // answering one doesn't also close the preview underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || dialogOpen) return;
      if (showPublish) setShowPublish(false);
      else if (showPreview) setShowPreview(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPreview, showPublish, dialogOpen]);

  /** Apply a change to the page currently being edited. */
  const updateActivePage = useCallback(
    (fn: (page: Page) => Page) =>
      setSite((s) => ({
        ...s,
        pages: s.pages.map((p) => (p.id === (activePage?.id ?? "") ? fn(p) : p)),
      })),
    [activePage]
  );

  const blocks = activePage?.blocks ?? [];
  const selected = blocks.find((b) => b.id === selectedId) ?? null;
  const selectedIndex = blocks.findIndex((b) => b.id === selectedId);

  // ---- block operations ----

  const addBlock = (type: BlockType) => {
    const block = newBlock(type);
    updateActivePage((page) => {
      // Footers belong at the bottom; everything else lands after the selection.
      const at = page.blocks.findIndex((b) => b.id === selectedId);
      const index = type === "footer" || at === -1 ? page.blocks.length : at + 1;
      const next = [...page.blocks];
      next.splice(index, 0, block);
      return { ...page, blocks: next };
    });
    setSelectedId(block.id);
    setTab("block");
  };

  const updateProp = (key: string, value: unknown) =>
    updateActivePage((page) => ({
      ...page,
      blocks: page.blocks.map((b) =>
        b.id === selectedId ? { ...b, props: { ...b.props, [key]: value } } : b
      ),
    }));

  const removeBlock = (id: string) => {
    updateActivePage((page) => ({ ...page, blocks: page.blocks.filter((b) => b.id !== id) }));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  const duplicateBlock = (id: string) => {
    let newId = "";
    updateActivePage((page) => {
      const at = page.blocks.findIndex((b) => b.id === id);
      if (at === -1) return page;
      const source = page.blocks[at];
      newId = `${source.type}-${Math.random().toString(36).slice(2, 9)}`;
      const copy: Block = { ...source, id: newId, props: structuredClone(source.props) };
      const next = [...page.blocks];
      next.splice(at + 1, 0, copy);
      return { ...page, blocks: next };
    });
    if (newId) setSelectedId(newId);
  };

  const moveBlock = (from: number, to: number) =>
    updateActivePage((page) => {
      if (to < 0 || to >= page.blocks.length) return page;
      const next = [...page.blocks];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...page, blocks: next };
    });

  // ---- page operations ----

  const addPage = () => {
    setSite((s) => {
      const page = newPage(`Page ${s.pages.length + 1}`, s.pages);
      setActivePageId(page.id);
      setSelectedId(null);
      setRenamingId(page.id);
      return { ...s, pages: [...s.pages, page] };
    });
  };

  const renamePage = (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSite((s) => {
      const current = s.pages.find((p) => p.id === id);
      if (!current) return s;
      const slug = uniqueSlug(trimmed, s.pages, id);
      const renamed = s.pages.map((p) => (p.id === id ? { ...p, name: trimmed, slug } : p));
      if (slug === current.slug) return { ...s, pages: renamed };
      // Any button pointing at the old slug should follow the page.
      return {
        ...s,
        pages: renamed.map((p) => ({
          ...p,
          blocks: p.blocks.map((b) => ({
            ...b,
            props: rewriteLinks(b.props, `#${current.slug}`, `#${slug}`) as Block["props"],
          })),
        })),
      };
    });
  };

  const deletePage = async (id: string) => {
    const target = site.pages.find((p) => p.id === id);
    if (!target || site.pages.length < 2) return;
    const count = target.blocks.length;
    if (count > 0) {
      const ok = await dialog.confirm({
        title: `Delete "${target.name}"?`,
        message: `It has ${count} block${count === 1 ? "" : "s"} on it, which will go too.`,
        confirmLabel: "Delete page",
        danger: true,
      });
      if (!ok) return;
    }
    setSite((s) => ({ ...s, pages: s.pages.filter((p) => p.id !== id) }));
    if (activePageId === id) setSelectedId(null);
  };

  const movePage = (from: number, to: number) =>
    setSite((s) => {
      if (to < 0 || to >= s.pages.length) return s;
      const pages = [...s.pages];
      const [moved] = pages.splice(from, 1);
      pages.splice(to, 0, moved);
      return { ...s, pages };
    });

  // ---- files ----

  const downloadFile = (contents: string, filename: string, mime: string) => {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const download = () =>
    downloadFile(
      // Carries the project inside it, so this same file can be opened again.
      exportHtml(site, { embedProject: true }),
      `${site.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site"}.html`,
      "text/html"
    );

  /** Opens either a project file or a page exported from here. */
  const openProject = async (file: File) => {
    try {
      const text = await file.text();
      const raw = /^\s*[{[]/.test(text) ? JSON.parse(text) : projectFromHtml(text);
      if (raw === null) {
        dialog.alert({
          title: "That page can't be opened",
          message:
            "It's an HTML file, but it wasn't made here — only pages exported from Sitebuilder carry the project inside them.",
        });
        return;
      }
      const parsed = migrate(raw);
      setSite(parsed);
      setProjectId(null);
      localStorage.removeItem(CURRENT_KEY);
      setShowStart(false);
      setActivePageId(parsed.pages[0].id);
      setSelectedId(null);
    } catch {
      dialog.alert({
        title: "That file didn't open",
        message: "It doesn't look like a site made in Sitebuilder.",
      });
    }
  };

  const refreshSaved = () => setSaved(listProjects());

  /** Save into the app's own storage (not a file on the computer). */
  const saveToApp = () => {
    const id = saveProject(site, site.title, projectId ?? undefined);
    if (!id) {
      setSaveState("error");
      return;
    }
    setProjectId(id);
    localStorage.setItem(CURRENT_KEY, id);
    refreshSaved();
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1600);
  };

  const saveCopy = () => {
    const id = saveProject(structuredClone(site), `${site.title} copy`);
    if (!id) {
      dialog.alert({
        title: "No room to save",
        message: "This browser's storage is full. Download a project file instead (⤓).",
      });
      return;
    }
    refreshSaved();
    dialog.alert({
      title: "Copy saved",
      message: `It's in "My sites", called "${site.title} copy".`,
    });
  };

  const openSaved = (project: SavedProject) => {
    setSite(project.site);
    setProjectId(project.id);
    localStorage.setItem(CURRENT_KEY, project.id);
    setActivePageId(project.site.pages[0].id);
    setSelectedId(null);
    setIsFirstRun(false);
    setShowStart(false);
  };

  const removeSaved = async (project: SavedProject) => {
    const ok = await dialog.confirm({
      title: `Delete "${project.name}"?`,
      message: "This can't be undone.",
      confirmLabel: "Delete site",
      danger: true,
    });
    if (!ok) return;
    deleteProject(project.id);
    if (projectId === project.id) {
      setProjectId(null);
      localStorage.removeItem(CURRENT_KEY);
    }
    refreshSaved();
  };

  const copySaved = (project: SavedProject) => {
    duplicateProject(project.id);
    refreshSaved();
  };

  const startNew = async () => {
    const hasWork = site.pages.some((p) => p.blocks.length > 0);
    if (hasWork) {
      const ok = await dialog.confirm({
        title: "Start a new site?",
        message: projectId
          ? "Your current site is saved, so you can open it again from My sites."
          : "Your current site hasn't been saved in the app, so it will be lost.",
        confirmLabel: "Start new",
        danger: !projectId,
      });
      if (!ok) return;
    }
    setShowStart(true);
  };

  useEffect(() => {
    // Skip exactly one rebuild after an edit that came from inside the frame:
    // replacing the document would throw away the caret mid-word.
    if (skipPreviewRebuild.current) {
      skipPreviewRebuild.current = false;
      return;
    }
    if (editingInFrame.current) {
      rebuildWhenDone.current = true;
      return;
    }
    setSelection(null);
    setPreviewDoc(previewHtml(site, activePage?.id ?? "", selectedId));
    // selectedId deliberately isn't a dependency: selecting a block only moves
    // an outline, and rebuilding the document for that would drop the caret the
    // click just placed. The frame is told about it instead, below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, activePage, rebuildTick]);

  useEffect(() => {
    previewFrame.current?.contentWindow?.postMessage(
      { type: "sb:cmd", cmd: "select", value: selectedId },
      "*"
    );
  }, [selectedId, previewDoc]);

  const sendCommand = useCallback((command: Command) => {
    previewFrame.current?.contentWindow?.postMessage(command, "*");
  }, []);

  /**
   * A rich field edited in the panel. Push it into the frame and skip the
   * rebuild: replacing the document would reset its scroll position, and would
   * fight a caret sitting in that same text on the page.
   */
  const syncToPage = useCallback(
    (path: string, html: string) => {
      if (!selectedId) return;
      skipPreviewRebuild.current = true;
      previewFrame.current?.contentWindow?.postMessage(
        { type: "sb:cmd", cmd: "setField", block: selectedId, path, value: html },
        "*"
      );
    },
    [selectedId]
  );

  const startFrom = (next: Site) => {
    setSite(next);
    setProjectId(null);
    localStorage.removeItem(CURRENT_KEY);
    setActivePageId(next.pages[0].id);
    setSelectedId(null);
    setTab("block");
    setIsFirstRun(false);
    setShowStart(false);
  };

  // The most recent place this site was published, shown in the corner.
  const liveAddress = Object.values(site.published ?? {}).sort((a, b) => b.at - a.at)[0] ?? null;

  const goToPage = useCallback(
    (slug: string) => {
      const target = site.pages.find((p) => p.slug === slug);
      if (target) {
        setActivePageId(target.id);
        setSelectedId(null);
      }
    },
    [site.pages]
  );

  return (
    <PagesContext.Provider value={site.pages}>
      <ThemeContext.Provider value={site.theme}>
      <GoToPageContext.Provider value={goToPage}>
      <InlineSyncContext.Provider value={syncToPage}>
      <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
        {showStart && (
          <StartScreen
            saved={saved}
            onPickTemplate={startFrom}
            onOpenSaved={openSaved}
            onDeleteSaved={removeSaved}
            onDuplicateSaved={copySaved}
            onOpenFile={() => fileInput.current?.click()}
            onCancel={isFirstRun ? undefined : () => setShowStart(false)}
          />
        )}

        {showPublish && (
          <PublishDialog
            site={site}
            onPublished={(where, record) =>
              setSite((s) => ({
                ...s,
                published: { ...s.published, [where]: { ...record, at: Date.now() } },
              }))
            }
            onClose={() => setShowPublish(false)}
          />
        )}

        {showPreview && (
          <PreviewOverlay
            site={site}
            startSlug={activePage?.slug}
            onClose={() => setShowPreview(false)}
          />
        )}

        {/* Toolbar */}
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="flex items-center gap-2 font-semibold">
            <Logo size={26} />
            <span className="hidden sm:inline">Sitebuilder</span>
          </div>

          <input
            autoComplete="off"
            value={site.title}
            onChange={(e) => setSite((s) => ({ ...s, title: e.target.value }))}
            className="ml-2 w-48 rounded-md border border-transparent px-2 py-1 text-sm font-medium hover:border-slate-200 focus:border-indigo-500 focus:outline-none"
            aria-label="Site title"
          />

          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-md border border-slate-200 p-0.5">
              {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition ${
                    device === d ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            <input
            autoComplete="off"
              ref={fileInput}
              type="file"
              accept=".html,.json,text/html,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) openProject(f);
                e.target.value = "";
              }}
            />
            <ToolbarBtn onClick={startNew}>New</ToolbarBtn>
            <ToolbarBtn onClick={() => setShowStart(true)}>My sites</ToolbarBtn>

            <Tip
              label={
                projectId
                  ? "Saved in the app, and keeping itself up to date"
                  : "Save this site inside the app"
              }
            >
              <button
                onClick={saveToApp}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                saveState === "saved"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : saveState === "error"
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {saveState === "saved" ? "Saved ✓" : saveState === "error" ? "No space" : "Save"}
              </button>
            </Tip>
            <ToolbarIcon title="Save a copy" onClick={saveCopy}>
              ⧉
            </ToolbarIcon>

            <ToolbarBtn onClick={() => setShowPreview(true)}>Preview</ToolbarBtn>
            <Tip label="Saves one .html file: a real web page, which you can also open here again">
              <button
                onClick={download}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Download
              </button>
            </Tip>
            <button
              onClick={() => setShowPublish(true)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
            >
              Publish
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Left: pages, palette, layers */}
          <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
            <Section title={`Pages (${site.pages.length})`}>
              <div className="flex flex-col gap-1">
                {site.pages.map((page, i) => (
                  <div
                    key={page.id}
                    draggable={renamingId !== page.id}
                    onDragStart={() => setPageDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (pageDragIndex !== null && pageDragIndex !== i) movePage(pageDragIndex, i);
                      setPageDragIndex(null);
                    }}
                    onDragEnd={() => setPageDragIndex(null)}
                    onClick={() => {
                      setActivePageId(page.id);
                      setSelectedId(null);
                    }}
                    onDoubleClick={() => setRenamingId(page.id)}
                    className={`group flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition ${
                      activePage?.id === page.id
                        ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                        : "border-transparent hover:bg-slate-50"
                    } ${pageDragIndex === i ? "opacity-40" : ""}`}
                  >
                    {renamingId === page.id ? (
                      <input
            autoComplete="off"
                        autoFocus
                        defaultValue={page.name}
                        onBlur={(e) => {
                          renamePage(page.id, e.target.value);
                          setRenamingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded border border-indigo-400 px-1 py-0.5 text-xs outline-none"
                      />
                    ) : (
                      <>
                        <span className="text-slate-400">▤</span>
                        <span className="flex-1 truncate font-medium">{page.name}</span>
                        <span className="hidden gap-0.5 group-hover:flex">
                          <IconBtn
                            title="Rename"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingId(page.id);
                            }}
                          >
                            ✎
                          </IconBtn>
                          {site.pages.length > 1 && (
                            <IconBtn
                              title="Delete page"
                              danger
                              onClick={(e) => {
                                e.stopPropagation();
                                deletePage(page.id);
                              }}
                            >
                              ✕
                            </IconBtn>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={addPage}
                className="mt-1.5 w-full rounded-md border border-dashed border-slate-300 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600"
              >
                + Add page
              </button>

              {site.pages.length > 1 && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600">
                  <input
            autoComplete="off"
                    type="checkbox"
                    checked={site.nav}
                    onChange={(e) => setSite((s) => ({ ...s, nav: e.target.checked }))}
                    className="accent-indigo-600"
                  />
                  Show navigation bar
                </label>
              )}
            </Section>

            <Section title="Add a block">
              <div className="grid grid-cols-2 gap-1.5">
                {BLOCK_ORDER.map((type) => (
                  <Tip key={type} label={BLOCKS[type].description}>
                    <button
                      onClick={() => addBlock(type)}
                      className="flex flex-col items-start gap-0.5 rounded-md border border-slate-200 px-2 py-1.5 text-left transition hover:border-indigo-400 hover:bg-indigo-50"
                    >
                      <span className="text-base leading-none text-indigo-600">
                        {BLOCKS[type].icon}
                      </span>
                      <span className="text-[11px] font-medium text-slate-700">
                        {BLOCKS[type].name}
                      </span>
                    </button>
                  </Tip>
                ))}
              </div>
            </Section>

            <Section title={`${activePage?.name ?? "Page"} — blocks (${blocks.length})`}>
              <div className="flex flex-col gap-1">
                {blocks.map((block, i) => (
                  <div
                    key={block.id}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null && dragIndex !== i) moveBlock(dragIndex, i);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    onClick={() => {
                      setSelectedId(block.id);
                      setTab("block");
                    }}
                    className={`group flex cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition ${
                      selectedId === block.id
                        ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                        : "border-transparent hover:bg-slate-50"
                    } ${dragIndex === i ? "opacity-40" : ""}`}
                  >
                    <span className="text-slate-400">⋮⋮</span>
                    <span className="text-indigo-600">{BLOCKS[block.type].icon}</span>
                    <span className="flex-1 truncate font-medium">{blockLabel(block)}</span>
                    <span className="hidden gap-0.5 group-hover:flex">
                      <IconBtn
                        title="Duplicate"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateBlock(block.id);
                        }}
                      >
                        ⧉
                      </IconBtn>
                      <IconBtn
                        title="Delete"
                        danger
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBlock(block.id);
                        }}
                      >
                        ✕
                      </IconBtn>
                    </span>
                  </div>
                ))}
                {blocks.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-slate-400">
                    Empty page — add a block above.
                  </p>
                )}
              </div>
            </Section>
          </aside>

          {/* Middle: live preview */}
          <main className="min-w-0 flex-1 overflow-auto bg-slate-200 p-6">
            <div
              className="mx-auto h-full rounded-xl bg-white shadow-lg ring-1 ring-slate-300/60 transition-all"
              style={{ maxWidth: device === "mobile" ? 390 : 1200 }}
            >
              {selection?.active && selection.rich && !showPreview && !showStart && !showPublish && (
                <FormatBar
                  selection={selection}
                  inheritedFontLabel={`Theme font (${
                    FONT_OPTIONS.find((o) => o.value === site.theme.font)?.label ?? "Sans"
                  })`}
                  inheritedSizeLabel={
                    Number(selected?.props.size) > 0
                      ? `Block size (${Number(selected?.props.size)} px)`
                      : "Automatic size"
                  }
                  onCommand={sendCommand}
                />
              )}
              <iframe
                ref={previewFrame}
                title="Live preview"
                srcDoc={previewDoc}
                sandbox="allow-scripts"
                className="h-full w-full rounded-xl border-0"
              />
            </div>
          </main>

          {/* Right: inspector */}
          <aside className="flex w-72 shrink-0 flex-col border-l border-slate-200 bg-white">
            <div className="flex border-b border-slate-200">
              {(["block", "theme"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 border-b-2 py-2 text-xs font-semibold capitalize transition ${
                    tab === t
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t === "block" ? "Block" : "Theme"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3.5">
              {tab === "theme" ? (
                <FieldList
                  fields={THEME_FIELDS}
                  values={site.theme as unknown as Record<string, unknown>}
                  onChange={(key, value) =>
                    setSite((s) => ({ ...s, theme: { ...s.theme, [key]: value } }))
                  }
                />
              ) : selected ? (
                <>
                  {/* The selected block's own controls, so you never have to go
                      hunting in the page list to move or delete it. */}
                  <div className="mb-3 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600">{BLOCKS[selected.type].icon}</span>
                      <span className="text-sm font-semibold">{BLOCKS[selected.type].name}</span>
                    </div>
                    <div className="mt-2 flex gap-1">
                      <ActionBtn
                        title="Move up"
                        disabled={selectedIndex <= 0}
                        onClick={() => moveBlock(selectedIndex, selectedIndex - 1)}
                      >
                        ↑ Up
                      </ActionBtn>
                      <ActionBtn
                        title="Move down"
                        disabled={selectedIndex >= blocks.length - 1}
                        onClick={() => moveBlock(selectedIndex, selectedIndex + 1)}
                      >
                        ↓ Down
                      </ActionBtn>
                      <ActionBtn title="Duplicate" onClick={() => duplicateBlock(selected.id)}>
                        ⧉ Copy
                      </ActionBtn>
                      <ActionBtn danger title="Delete" onClick={() => removeBlock(selected.id)}>
                        ✕ Delete
                      </ActionBtn>
                    </div>
                  </div>
                  <FieldList
                    fields={BLOCKS[selected.type].fields}
                    values={selected.props}
                    onChange={updateProp}
                  />
                </>
              ) : (
                <p className="py-8 text-center text-xs leading-relaxed text-slate-400">
                  Click a block in the preview
                  <br />
                  to edit it.
                </p>
              )}
            </div>

            {liveAddress && (
              <footer className="border-t border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Live at
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <a
                    href={liveAddress.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={liveAddress.url}
                    className="min-w-0 flex-1 truncate font-mono text-[11px] text-indigo-700 hover:underline"
                  >
                    {liveAddress.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                  <Tip label="Copy the address">
                    <button
                      onClick={async () => {
                        if (await copyText(liveAddress.url)) {
                          setLinkCopied(true);
                          window.setTimeout(() => setLinkCopied(false), 1600);
                        }
                      }}
                      className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      {linkCopied ? "Copied ✓" : "Copy"}
                    </button>
                  </Tip>
                </div>
              </footer>
            )}
          </aside>
        </div>
      </div>
      </InlineSyncContext.Provider>
      </GoToPageContext.Provider>
      </ThemeContext.Provider>
    </PagesContext.Provider>
  );
}

function blockLabel(block: Block): string {
  const p = block.props;
  const text = richToText(p.heading ?? p.text ?? p.title ?? p.alt ?? "");
  const trimmed = text.split("\n")[0].slice(0, 20);
  return trimmed || BLOCKS[block.type].name;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 p-3">
      <h2 className="mb-2 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      {children}
    </div>
  );
}

function ToolbarBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

function ToolbarIcon({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <Tip label={title}>
      <button
        onClick={onClick}
        className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-xs text-slate-600 transition hover:bg-slate-50"
      >
        {children}
      </button>
    </Tip>
  );
}

function ActionBtn({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Tip label={title}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`flex-1 rounded border px-1 py-1 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${
          danger
            ? "border-rose-200 text-rose-600 hover:bg-rose-50"
            : "border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
      >
        {children}
      </button>
    </Tip>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <Tip label={title}>
      <button
        onClick={onClick}
        className={`grid h-4 w-4 place-items-center rounded text-[10px] ${
          danger ? "text-rose-500 hover:bg-rose-100" : "text-slate-500 hover:bg-slate-200"
        }`}
      >
        {children}
      </button>
    </Tip>
  );
}
