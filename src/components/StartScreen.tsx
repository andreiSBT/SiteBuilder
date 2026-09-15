"use client";

import { useMemo } from "react";
import { TEMPLATES } from "@/lib/templates";
import { exportHtml } from "@/lib/render";
import { timeAgo, type SavedProject } from "@/lib/projects";
import type { Site } from "@/lib/types";
import { Tip } from "./Tooltip";

const THUMB_WIDTH = 1100; // the width we pretend the page is, before scaling down

type Props = {
  saved: SavedProject[];
  onPickTemplate: (site: Site) => void;
  onOpenSaved: (project: SavedProject) => void;
  onDeleteSaved: (project: SavedProject) => void;
  onDuplicateSaved: (project: SavedProject) => void;
  onOpenFile: () => void;
  /** Only offered when there's existing work to go back to. */
  onCancel?: () => void;
};

export default function StartScreen({
  saved,
  onPickTemplate,
  onOpenSaved,
  onDeleteSaved,
  onDuplicateSaved,
  onOpenFile,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sitebuilder</h1>
            <p className="mt-1 text-sm text-slate-500">
              Open one of your sites, or start a new one from a template.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={onOpenFile}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Open a file…
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Back to my site
              </button>
            )}
          </div>
        </header>

        {saved.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Your sites ({saved.length})
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((project) => (
                <SiteCard
                  key={project.id}
                  site={project.site}
                  title={project.name}
                  subtitle={`${pageSummary(project.site)} · saved ${timeAgo(project.updatedAt)}`}
                  onClick={() => onOpenSaved(project)}
                  actions={
                    <>
                      <CardAction
                        title="Make a copy"
                        onClick={() => onDuplicateSaved(project)}
                      >
                        ⧉
                      </CardAction>
                      <CardAction danger title="Delete" onClick={() => onDeleteSaved(project)}>
                        ✕
                      </CardAction>
                    </>
                  }
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Start something new
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((template) => {
              const site = template.build();
              return (
                <SiteCard
                  key={template.id}
                  site={site}
                  title={template.name}
                  subtitle={template.tagline}
                  onClick={() => onPickTemplate(template.build())}
                />
              );
            })}
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-slate-400">
          Every preview above is the real site, rendered by the same code that exports it.
        </p>
      </div>
    </div>
  );
}

function pageSummary(site: Site): string {
  const n = site.pages.length;
  return `${n} page${n === 1 ? "" : "s"}`;
}

function SiteCard({
  site,
  title,
  subtitle,
  onClick,
  actions,
}: {
  site: Site;
  title: string;
  subtitle: string;
  onClick: () => void;
  actions?: React.ReactNode;
}) {
  const srcDoc = useMemo(() => exportHtml(site, { interactive: false }), [site]);
  const isEmpty = site.pages.every((pg) => pg.blocks.length === 0);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md">
      <button onClick={onClick} className="flex flex-1 flex-col text-left focus:outline-none">
        <div className="relative h-52 w-full overflow-hidden border-b border-slate-100 bg-slate-50">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-300">
              <span className="text-4xl font-light">+</span>
              <span className="text-xs font-medium text-slate-400">Empty page</span>
            </div>
          ) : (
            <Thumbnail srcDoc={srcDoc} title={`${title} preview`} />
          )}
        </div>
        <div className="p-3.5">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>
        </div>
      </button>

      {actions && (
        <div className="absolute right-2 top-2 hidden gap-1 rounded-md bg-white/90 p-1 shadow-sm backdrop-blur group-hover:flex">
          {actions}
        </div>
      )}
    </div>
  );
}

function CardAction({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <Tip label={title}>
      <button
        onClick={onClick}
        className={`grid h-6 w-6 place-items-center rounded text-xs transition ${
          danger ? "text-rose-500 hover:bg-rose-50" : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        {children}
      </button>
    </Tip>
  );
}

/**
 * A real render of the page, shrunk down. Scaling a full-width iframe keeps the
 * proportions honest — a thumbnail can never drift from the real site.
 */
function Thumbnail({ srcDoc, title }: { srcDoc: string; title: string }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <iframe
        title={title}
        srcDoc={srcDoc}
        sandbox=""
        tabIndex={-1}
        aria-hidden="true"
        scrolling="no"
        style={{
          width: THUMB_WIDTH,
          height: THUMB_WIDTH * 1.3,
          border: 0,
          transformOrigin: "top left",
          transform: `scale(${330 / THUMB_WIDTH})`,
        }}
      />
    </div>
  );
}
