"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Option = { value: string; label: string };

/**
 * A dropdown that belongs to the app rather than the operating system. A native
 * <select> opens an OS menu that can't be styled and looks out of place.
 *
 * The list is rendered in a portal, positioned from the button's rect, so it
 * isn't clipped by the scrolling panel it lives in.
 */
export default function Select({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  const openList = () => {
    setRect(buttonRef.current?.getBoundingClientRect() ?? null);
    setActive(selectedIndex);
    setOpen(true);
  };

  const choose = (option: Option) => {
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  // Close on anything that would leave the list floating in the wrong place.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: Event) => {
      if (
        e.target instanceof Node &&
        (buttonRef.current?.contains(e.target) || listRef.current?.contains(e.target))
      )
        return;
      setOpen(false);
    };
    // The list is positioned from a rect taken when it opened, so anything that
    // moves the button closes it rather than leaving it stranded. Scrolling
    // *inside* the list doesn't count — opening it scrolls the current value
    // into view, which would otherwise close the list the instant it appeared.
    const onMoved = (e: Event) => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return;
      setOpen(false);
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onMoved, true);
    window.addEventListener("resize", onMoved);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onMoved, true);
      window.removeEventListener("resize", onMoved);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (options[active]) choose(options[active]);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex w-full items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-left text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? ""}</span>
        <span className={`shrink-0 text-[9px] text-slate-400 transition ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {open &&
        rect &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="fixed z-[110] max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-xl"
            style={{
              left: rect.left,
              width: rect.width,
              // Flip above the button when there isn't room below.
              top: rect.bottom + 240 > window.innerHeight && rect.top > 260 ? undefined : rect.bottom + 4,
              bottom:
                rect.bottom + 240 > window.innerHeight && rect.top > 260
                  ? window.innerHeight - rect.top + 4
                  : undefined,
            }}
          >
            {options.map((option, i) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  data-active={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(option)}
                  className={`block w-full px-2.5 py-1.5 text-left text-sm transition ${
                    i === active ? "bg-indigo-50 text-indigo-900" : "text-slate-700"
                  } ${option.value === value ? "font-semibold" : ""}`}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  );
}
