"use client";

import { useEffect, useState } from "react";
import { migrate } from "@/lib/site";
import type { Site } from "@/lib/types";

/**
 * Describe a site in a sentence and have Claude write it.
 *
 * Only appears when the builder is running on your own computer, because that's
 * where Claude is signed in — see the route for why.
 */
export default function AiStarter({ onWritten }: { onWritten: (site: Site) => void }) {
  const [available, setAvailable] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/page")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAvailable(!!data?.available);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;

  const write = async () => {
    if (!description.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: description }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "That didn't work.");
        return;
      }
      onWritten(migrate(data.site));
    } catch {
      setError("Couldn't reach Claude. Is the builder still running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-10 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-5">
      <h2 className="text-sm font-semibold text-slate-900">
        Describe it, and Claude writes it
      </h2>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
        Say what the site is for, in a sentence or two. You get a real page with real
        words — then change whatever you like.
      </p>

      <textarea
        value={description}
        autoComplete="off"
        disabled={busy}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter is a new line.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            write();
          }
        }}
        placeholder="a page for my school robotics club — we build combat robots and meet on Thursdays"
        className="mt-3 h-20 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
      />

      {error && (
        <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400">
          {busy ? "Claude is writing — this takes about half a minute." : "Uses your Claude subscription."}
        </p>
        <button
          onClick={write}
          disabled={busy || !description.trim()}
          className="shrink-0 rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? "Writing…" : "Write it"}
        </button>
      </div>
    </section>
  );
}
