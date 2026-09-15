"use client";

import { useEffect, useState } from "react";
import { decodeSiteLink } from "@/lib/shareLink";

/**
 * Shows a site that arrived inside a link.
 *
 * The page is rendered in a sandboxed frame from a blob URL, never written into
 * this document. Anyone can put anything in a link, and this page shares an
 * origin with the builder — so the frame gets no access to it.
 */
export default function SharedSitePage() {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    decodeSiteLink(window.location.hash)
      .then((html) => {
        if (cancelled) return;
        if (!html) {
          setFailed(true);
          return;
        }
        objectUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  if (failed) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">That link didn&apos;t work</h1>
        <p className="max-w-sm text-sm text-slate-500">
          It may have been cut short when it was sent — these links are long, and some apps
          trim them. Ask for it again, copied whole.
        </p>
      </main>
    );
  }

  if (!url) return <main className="h-screen" />;

  return (
    <iframe
      title="Shared site"
      src={url}
      sandbox="allow-scripts allow-popups"
      className="h-screen w-screen border-0"
    />
  );
}
