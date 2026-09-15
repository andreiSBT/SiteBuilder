"use client";

import { useState } from "react";
import { Tip } from "./Tooltip";

type Rgb = { r: number; g: number; b: number };

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n) || 0));

export function hexToRgb(hex: string): Rgb {
  const clean = hex.trim().replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((n) => clamp255(n).toString(16).padStart(2, "0")).join("")}`;
}

const PRESETS = [
  "#111827", "#ffffff", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#0ea5e9", "#4f46e5", "#a855f7", "#ec4899",
];

const CHANNELS = [
  { key: "r" as const, label: "R" },
  { key: "g" as const, label: "G" },
  { key: "b" as const, label: "B" },
];

/**
 * A colour control with one line per channel, rather than the browser's native
 * colour window. Each track shows what that channel does to the current colour,
 * and the number can be typed.
 */
export default function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const rgb = hexToRgb(value);

  const setChannel = (key: keyof Rgb, n: number) =>
    onChange(rgbToHex({ ...rgb, [key]: clamp255(n) }));

  /** The track gradient: this channel swept 0→255, others held still. */
  const trackFor = (key: keyof Rgb) => {
    const from = rgbToHex({ ...rgb, [key]: 0 });
    const to = rgbToHex({ ...rgb, [key]: 255 });
    return `linear-gradient(to right, ${from}, ${to})`;
  };

  return (
    <div className="rounded-md border border-slate-200">
      <div className="flex items-center gap-2 p-1.5">
        <Tip label={open ? "Hide the R/G/B sliders" : "Show the R/G/B sliders"}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="h-7 w-9 shrink-0 rounded border border-slate-300 transition hover:scale-105"
            style={{ background: value }}
            aria-label="Toggle colour sliders"
          />
        </Tip>
        <input
            autoComplete="off"
          className="w-full min-w-0 rounded border border-slate-200 px-1.5 py-1 font-mono text-xs uppercase text-slate-800 outline-none focus:border-indigo-500"
          value={hexDraft ?? value}
          onChange={(e) => {
            const next = e.target.value;
            setHexDraft(next);
            // Only commit once it's a real colour, so typing isn't fought with.
            const clean = next.trim().replace(/^#/, "");
            if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(clean)) onChange(rgbToHex(hexToRgb(clean)));
          }}
          onBlur={() => setHexDraft(null)}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 px-1 text-[10px] text-slate-400 transition hover:text-slate-700"
          aria-label="Toggle colour sliders"
        >
          {open ? "▲" : "▼"}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 p-2">
          <div className="flex flex-col gap-1.5">
            {CHANNELS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-3 shrink-0 text-[11px] font-semibold text-slate-500">
                  {label}
                </span>
                <input
            autoComplete="off"
                  type="range"
                  min={0}
                  max={255}
                  value={rgb[key]}
                  onChange={(e) => setChannel(key, Number(e.target.value))}
                  className="sb-range min-w-0 flex-1"
                  style={{ background: trackFor(key) }}
                  aria-label={`${label} channel`}
                />
                <input
            autoComplete="off"
                  type="number"
                  min={0}
                  max={255}
                  value={rgb[key]}
                  onChange={(e) => setChannel(key, Number(e.target.value))}
                  className="w-11 shrink-0 rounded border border-slate-200 px-1 py-0.5 text-center text-[11px] tabular-nums outline-none focus:border-indigo-500"
                />
              </div>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
            {PRESETS.map((hex) => (
              <Tip key={hex} label={hex}>
                <button
                  type="button"
                  onClick={() => onChange(hex)}
                  className={`h-4 w-4 rounded border transition hover:scale-110 ${
                    value.toLowerCase() === hex ? "border-slate-900" : "border-slate-300"
                  }`}
                  style={{ background: hex }}
                />
              </Tip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
