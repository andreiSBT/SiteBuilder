"use client";

import { useEffect, useMemo, useState } from "react";
import { exportHtml } from "@/lib/render";
import type { Site } from "@/lib/types";

type Props = {
  site: Site;
  /** Which page to open on, so preview starts where you were editing. */
  startSlug?: string;
  onClose: () => void;
};

/**
 * The real exported site, running for real: links work, buttons jump between
 * pages, the nav is live. This is the finished file, not an approximation.
 */
export default function PreviewOverlay({ site, startSlug, onClose }: Props) {
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  // Rebuilt only when the site changes — not on every device toggle.
  const html = useMemo(() => exportHtml(site, { guardExternalLinks: true }), [site]);

  /**
   * Served from a blob URL rather than srcDoc on purpose. A srcdoc document
   * inherits its base URL from the parent page, so a link to "#about" would
   * resolve against the editor's own URL and load the editor inside the
   * preview. A blob URL gives the document a real URL of its own, so fragment
   * links stay inside the site — exactly as they will in the exported file.
   */
  const [url, setUrl] = useState<string | null>(null);
  // Creating and revoking the blob URL is exactly the external resource an
  // effect is for; the URL has to land in state for the iframe to use it.
  useEffect(() => {
    const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
  }, [html]);

  // Open on the page that was being edited.
  const src =
    url && startSlug && site.pages.length > 1 ? `${url}#${encodeURIComponent(startSlug)}` : url;

  const width = device === "mobile" ? 390 : device === "tablet" ? 820 : "100%";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-700 bg-slate-800 px-4 py-2.5 text-white">
        <span className="text-sm font-semibold">Preview</span>
        <span className="hidden text-xs text-slate-400 sm:inline">
          This is the real exported site — buttons and navigation work.
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-slate-600 p-0.5">
            {(["desktop", "tablet", "mobile"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition ${
                  device === d ? "bg-white text-slate-900" : "text-slate-300 hover:bg-slate-700"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-200"
          >
            Back to editing <span className="text-slate-400">Esc</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 justify-center overflow-auto p-4">
        <div
          className="h-full overflow-hidden rounded-lg bg-white shadow-2xl transition-all"
          style={{ width, maxWidth: "100%" }}
        >
          {src && (
            <iframe
              key={`${device}-${src}`}
              title="Site preview"
              src={src}
              // No allow-modals: a previewed page must not be able to call
              // alert/confirm. No allow-popups either — links are intercepted and
              // the app opens the tab itself, after asking.
              sandbox="allow-scripts"
              className="h-full w-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
