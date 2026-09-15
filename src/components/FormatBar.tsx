"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FONT_OPTIONS } from "@/lib/blocks";
import ColorPicker from "./ColorPicker";
import Select from "./Select";
import { Tip } from "./Tooltip";

const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80, 120];

export type SelectionState = {
  active: boolean;
  rich: boolean;
  collapsed: boolean;
  /** Where the words are, in the preview frame's own coordinates. */
  rect: { top: number; left: number; width: number; height: number };
  /** Where that frame is on screen, so the two can be added together. */
  frame: { top: number; left: number };
  font: string;
  size: string;
};

export type Command =
  | { type: "sb:cmd"; cmd: "exec"; value: string }
  | { type: "sb:cmd"; cmd: "font"; value: string }
  | { type: "sb:cmd"; cmd: "size"; value: string }
  | { type: "sb:cmd"; cmd: "color"; value: string };

/**
 * Floats above the words being edited.
 *
 * Rendered into <body> rather than into the preview panel: as a child of the
 * panel it was clipped by the panel's own scrolling, and painted underneath the
 * side panels. Fixed position plus a portal means nothing can cover it.
 *
 * The app's stacking order, highest last:
 *   preview / start screen 50 · format bar 95 · its dropdowns 110 ·
 *   dialogs 130 · tooltips 140
 */
export default function FormatBar({
  selection,
  inheritedFontLabel,
  inheritedSizeLabel,
  onCommand,
}: {
  selection: SelectionState;
  inheritedFontLabel: string;
  inheritedSizeLabel: string;
  onCommand: (command: Command) => void;
}) {
  const [color, setColor] = useState("#111827");
  const [showColor, setShowColor] = useState(false);

  const exec = (value: string) => onCommand({ type: "sb:cmd", cmd: "exec", value });
  const nothingSelected = selection.collapsed;

  const sizes = SIZES.includes(Number(selection.size)) || selection.size === "0"
    ? SIZES
    : [...SIZES, Number(selection.size)].sort((a, b) => a - b);

  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  useEffect(() => {
    const measure = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const wanted = {
    top: selection.frame.top + selection.rect.top - 46,
    left: selection.frame.left + selection.rect.left,
  };
  // Keep it on screen: below the words if there's no room above, and never past
  // the right-hand edge.
  const top =
    wanted.top < 8 ? selection.frame.top + selection.rect.top + selection.rect.height + 8 : wanted.top;
  const left = Math.max(8, Math.min(wanted.left, viewport.width - 470));

  return createPortal(
    <div
      className="fixed z-[95] flex flex-col"
      style={{ top, left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
        <ToolButton label="Bold" disabled={nothingSelected} onClick={() => exec("bold")}>
          <b>B</b>
        </ToolButton>
        <ToolButton label="Italic" disabled={nothingSelected} onClick={() => exec("italic")}>
          <i>I</i>
        </ToolButton>
        <ToolButton label="Underline" disabled={nothingSelected} onClick={() => exec("underline")}>
          <u>U</u>
        </ToolButton>
        <ToolButton
          label="Strikethrough"
          disabled={nothingSelected}
          onClick={() => exec("strikeThrough")}
        >
          <s>S</s>
        </ToolButton>

        <span className="mx-0.5 h-5 w-px bg-slate-200" />

        <div className="w-[132px]">
          <Select
            value={selection.font}
            ariaLabel="Font for the selected words"
            options={[{ value: "", label: inheritedFontLabel }, ...FONT_OPTIONS]}
            onChange={(value) => onCommand({ type: "sb:cmd", cmd: "font", value })}
          />
        </div>
        <div className="w-[116px]">
          <Select
            value={selection.size}
            ariaLabel="Size of the selected words"
            options={[
              { value: "0", label: inheritedSizeLabel },
              ...sizes.map((n) => ({ value: String(n), label: `${n} px` })),
            ]}
            onChange={(value) => onCommand({ type: "sb:cmd", cmd: "size", value })}
          />
        </div>

        <Tip label="Colour for the selected words">
          <button
            type="button"
            onClick={() => setShowColor((o) => !o)}
            className="flex items-center gap-1 rounded border border-slate-300 px-1.5 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
          >
            <span
              className="h-3 w-3 rounded-sm border border-slate-300"
              style={{ background: color }}
            />
            <span className="text-[9px] text-slate-400">▼</span>
          </button>
        </Tip>

        <span className="mx-0.5 h-5 w-px bg-slate-200" />

        <ToolButton
          label="Remove all formatting from the selection"
          disabled={nothingSelected}
          onClick={() => exec("removeFormat")}
        >
          <span className="text-[10px]">✕</span>
        </ToolButton>
      </div>

      {showColor && (
        <div className="mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <ColorPicker value={color} onChange={setColor} />
          <button
            type="button"
            disabled={nothingSelected}
            onClick={() => onCommand({ type: "sb:cmd", cmd: "color", value: color })}
            className="mt-1.5 w-full rounded bg-indigo-600 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
          >
            Apply to selected words
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tip label={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="h-7 w-7 rounded text-xs text-slate-700 transition hover:bg-slate-100 disabled:opacity-30"
      >
        {children}
      </button>
    </Tip>
  );
}
