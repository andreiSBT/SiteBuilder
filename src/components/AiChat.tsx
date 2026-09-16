"use client";

import { useEffect, useRef, useState } from "react";
import { applyAiPage, siteToAiPage } from "@/lib/aiPage";
import type { Site } from "@/lib/types";

type Turn =
  | { who: "you"; text: string }
  | { who: "claude"; text: string; undo?: Site };

const SUGGESTIONS = [
  "make the headline shorter",
  "add a section about how to get there",
  "friendlier, less formal",
  "pick a calmer colour",
];

/**
 * A conversation about the page on screen.
 *
 * Every message sends the page as it stands, so Claude works from what's
 * actually there — including anything typed by hand since the last message.
 */
export default function AiChat({
  site,
  pageId,
  onRevised,
}: {
  site: Site;
  pageId: string;
  onRevised: (site: Site) => void;
}) {
  const [available, setAvailable] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, busy]);

  if (!available) {
    return (
      <p className="py-8 text-center text-xs leading-relaxed text-slate-400">
        Claude isn&apos;t switched on here.
        <br />
        It works when you run Sitebuilder yourself.
      </p>
    );
  }

  const send = async (text: string) => {
    const said = text.trim();
    if (!said || busy) return;
    setInstruction("");
    setTurns((t) => [...t, { who: "you", text: said }]);
    setBusy(true);

    const before = site;
    try {
      const response = await fetch("/api/ai/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: siteToAiPage(site, pageId), instruction: said }),
      });
      const data = await response.json();
      if (!response.ok) {
        setTurns((t) => [...t, { who: "claude", text: data?.error ?? "That didn't work." }]);
        return;
      }
      onRevised(applyAiPage(site, pageId, data.page));
      setTurns((t) => [...t, { who: "claude", text: "Done.", undo: before }]);
    } catch {
      setTurns((t) => [...t, { who: "claude", text: "Couldn't reach Claude." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto">
        {turns.length === 0 && (
          <div className="pb-2">
            <p className="text-xs leading-relaxed text-slate-500">
              Ask for a change to this page and it happens. Claude sees the page as it is
              now, so anything you&apos;ve typed yourself counts.
            </p>
            <div className="mt-2.5 flex flex-col gap-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-md border border-dashed border-slate-300 px-2 py-1.5 text-left text-[11px] text-slate-600 transition hover:border-indigo-400 hover:text-indigo-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => (
          <div
            key={i}
            className={`rounded-md px-2.5 py-1.5 text-xs leading-relaxed ${
              turn.who === "you"
                ? "bg-indigo-50 text-indigo-900"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {turn.text}
            {turn.who === "claude" && turn.undo && (
              <button
                onClick={() => {
                  onRevised(turn.undo!);
                  setTurns((t) => [...t, { who: "claude", text: "Put back how it was." }]);
                }}
                className="ml-2 text-[11px] font-medium text-indigo-600 hover:underline"
              >
                Undo
              </button>
            )}
          </div>
        ))}

        {busy && (
          <p className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs text-slate-400">
            Thinking…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-2 border-t border-slate-100 pt-2">
        <textarea
          value={instruction}
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(instruction);
            }
          }}
          placeholder="What should change?"
          className="h-16 w-full resize-none rounded-md border border-slate-300 px-2.5 py-1.5 text-xs leading-relaxed outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
        />
        <button
          onClick={() => send(instruction)}
          disabled={busy || !instruction.trim()}
          className="mt-1.5 w-full rounded-md bg-indigo-600 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? "Thinking…" : "Send"}
        </button>
      </div>
    </div>
  );
}
