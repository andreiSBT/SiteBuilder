"use client";

import { useCallback, useEffect, useRef } from "react";
import { richToHtml, sanitizeRich } from "@/lib/sanitize";

/**
 * The panel's copy of a rich text field, for editing text without hunting for
 * it on the page — handy when a block is off-screen or the text is tiny.
 *
 * It has no formatting toolbar of its own: fonts, sizes and colours are applied
 * on the page, where you can see them. ⌘B / ⌘I / ⌘U still work here, because a
 * contentEditable gives those for free.
 */
export default function TextField({
  value,
  onChange,
  multiline,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Don't write over what's being typed — here or, if this box isn't focused,
    // what's arriving from an edit made on the page.
    if (value === lastEmitted.current) return;
    if (document.activeElement === el) return;
    el.innerHTML = richToHtml(value, { paragraphs: multiline });
    lastEmitted.current = value;
  }, [value, multiline]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const clean = sanitizeRich(el.innerHTML);
    lastEmitted.current = clean;
    onChange(clean);
  }, [onChange]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline ? "true" : "false"}
      data-placeholder={placeholder}
      onInput={emit}
      onBlur={emit}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") e.preventDefault();
      }}
      onPaste={(e) => {
        // The words, not the source site's markup.
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
      className={`sb-rich w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm leading-relaxed text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${
        multiline ? "min-h-[80px]" : "min-h-[34px]"
      }`}
    />
  );
}
