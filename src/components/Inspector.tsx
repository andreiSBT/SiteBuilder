"use client";

import { createContext, useContext } from "react";
import { DEFAULT_THEME, normalizeUrl } from "@/lib/blocks";
import ColorPicker from "./ColorPicker";
import Select from "./Select";
import TextField from "./TextField";
import { Tip } from "./Tooltip";
import type { Field, Page, Theme } from "@/lib/types";

/**
 * The page list, so "Goes to" fields can offer this site's pages. Context rather
 * than props because list fields nest arbitrarily deep.
 */
export const PagesContext = createContext<Page[]>([]);

/** Lets a "Goes to" field offer a jump to the page it points at. */
export const GoToPageContext = createContext<(slug: string) => void>(() => {});

/** The site's theme, so a rich text toolbar can name the font it falls back to. */
export const ThemeContext = createContext<Theme>(DEFAULT_THEME);

/**
 * Tells the preview that a rich field changed here, so it can update that one
 * element instead of the whole document being rebuilt under the caret.
 */
export const InlineSyncContext = createContext<(path: string, html: string) => void>(() => {});

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

type Props = {
  fields: Field[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Prefix for nested fields, e.g. "items.0" for a card inside a grid. */
  path?: string;
};

export function FieldList({ fields, values, onChange, path }: Props) {
  return (
    <div className="flex flex-col gap-3.5">
      {fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={values[field.key]}
          path={path ? `${path}.${field.key}` : field.key}
          onChange={(v) => onChange(field.key, v)}
        />
      ))}
    </div>
  );
}

function FieldInput({
  field,
  value,
  path,
  onChange,
}: {
  field: Field;
  value: unknown;
  path?: string;
  onChange: (value: unknown) => void;
}) {
  const syncToPage = useContext(InlineSyncContext);
  const label = (
    <label className="mb-1 block text-xs font-medium text-slate-600">{field.label}</label>
  );

  switch (field.type) {
    case "textarea":
      return (
        <div>
          {label}
          <textarea
            autoComplete="off"
            className={`${inputClass} min-h-[88px] resize-y leading-relaxed`}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );

    case "select":
      return (
        <div>
          {label}
          <Select
            value={String(value ?? "")}
            options={field.options}
            onChange={onChange}
            ariaLabel={field.label}
          />
        </div>
      );

    case "color":
      return (
        <div>
          {label}
          <ColorPicker value={String(value ?? "#000000")} onChange={onChange} />
        </div>
      );

    case "number": {
      const min = field.min ?? 0;
      const max = field.max ?? 100;
      const current = Number(value ?? min);
      return (
        <div>
          {label}
          <div className="flex items-center gap-2">
            <input
            autoComplete="off"
              type="range"
              className="min-w-0 flex-1 accent-indigo-600"
              min={min}
              max={max}
              step={field.step}
              value={Math.min(max, Math.max(min, current))}
              onChange={(e) => onChange(Number(e.target.value))}
            />
            {/* Typing beats dragging when you know the number you want. */}
            <input
            autoComplete="off"
              type="number"
              className="w-16 shrink-0 rounded-md border border-slate-300 px-1.5 py-1 text-xs tabular-nums outline-none focus:border-indigo-500"
              min={min}
              max={max}
              step={field.step}
              value={current}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
              }}
            />
          </div>
          {current === 0 && min === 0 && (
            <p className="mt-0.5 text-[11px] text-slate-400">Automatic</p>
          )}
        </div>
      );
    }

    case "rich":
      return (
        <div>
          {label}
          <TextField
            value={String(value ?? "")}
            multiline={field.key === "text" || field.key === "body" || field.key === "subheading"}
            placeholder="Type here, or click the text on the page"
            onChange={(html) => {
              onChange(html);
              if (path) syncToPage(path, html);
            }}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Select text on the page for fonts, sizes and colours.
          </p>
        </div>
      );

    case "list":
      return <ListField field={field} value={value} path={path} onChange={onChange} />;

    case "pagelink":
      return (
        <div>
          {label}
          <PageLinkInput value={value} onChange={onChange} />
        </div>
      );

    default:
      return (
        <div>
          {label}
          <input
            autoComplete="off"
            className={inputClass}
            value={String(value ?? "")}
            placeholder={field.type === "link" ? "https://…" : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
  }
}

/** Choose one of this site's pages, or type any other URL. */
function PageLinkInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const pages = useContext(PagesContext);
  const goToPage = useContext(GoToPageContext);
  const current = String(value ?? "");
  const matched = pages.find((p) => `#${p.slug}` === current);
  const mode = matched ? matched.id : "custom";

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        value={mode}
        ariaLabel="Link target"
        options={[
          ...pages.map((p) => ({ value: p.id, label: `Page: ${p.name}` })),
          { value: "custom", label: "Other link…" },
        ]}
        onChange={(next) => {
          const picked = pages.find((p) => p.id === next);
          // Switching to "custom" keeps whatever was there unless it was a page link.
          onChange(picked ? `#${picked.slug}` : matched ? "" : current);
        }}
      />

      {mode === "custom" && (
        <>
          <input
            autoComplete="off"
            className={inputClass}
            value={current}
            placeholder="example.com  or  you@example.com"
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <LinkHint typed={current} />
        </>
      )}
      {matched && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400">
            Links to <code className="text-slate-500">#{matched.slug}</code>
          </p>
          <button
            type="button"
            onClick={() => goToPage(matched.slug)}
            className="shrink-0 text-[11px] font-medium text-indigo-600 hover:underline"
          >
            Open page →
          </button>
        </div>
      )}
    </div>
  );
}

/** Say out loud what a typed link will actually do. */
function LinkHint({ typed }: { typed: string }) {
  const trimmed = typed.trim();
  if (!trimmed) return null;
  const resolved = normalizeUrl(trimmed);

  if (resolved === "#")
    return (
      <p className="text-[11px] leading-relaxed text-rose-600">
        That kind of link isn&apos;t allowed, so the button won&apos;t go anywhere.
      </p>
    );

  if (resolved === trimmed) return null;

  return (
    <p className="text-[11px] leading-relaxed text-slate-500">
      Opens <code className="text-slate-700">{resolved}</code>
    </p>
  );
}

function ListField({
  field,
  value,
  path,
  onChange,
}: {
  field: Extract<Field, { type: "list" }>;
  value: unknown;
  path?: string;
  onChange: (value: unknown) => void;
}) {
  const fieldPath = path ?? field.key;
  const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

  const update = (next: Record<string, unknown>[]) => onChange(next);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };

  return (
    <div>
      <div className="mb-1 block text-xs font-medium text-slate-600">{field.label}</div>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">#{i + 1}</span>
              <div className="flex gap-1">
                <MiniBtn onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                  ↑
                </MiniBtn>
                <MiniBtn
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  title="Move down"
                >
                  ↓
                </MiniBtn>
                <MiniBtn
                  onClick={() => update(items.filter((_, j) => j !== i))}
                  title="Delete"
                  danger
                >
                  ✕
                </MiniBtn>
              </div>
            </div>
            <FieldList
              fields={field.itemFields}
              values={item}
              path={`${fieldPath}.${i}`}
              onChange={(key, v) =>
                update(items.map((it, j) => (j === i ? { ...it, [key]: v } : it)))
              }
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => update([...items, field.newItem()])}
        className="mt-2 w-full rounded-md border border-dashed border-slate-300 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
      >
        + {field.addLabel}
      </button>
    </div>
  );
}

function MiniBtn({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  danger?: boolean;
}) {
  return (
    <Tip label={title}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`h-5 w-5 rounded text-xs leading-none transition ${
          danger ? "text-rose-500 hover:bg-rose-50" : "text-slate-500 hover:bg-slate-200"
        } disabled:cursor-not-allowed disabled:opacity-25`}
      >
        {children}
      </button>
    </Tip>
  );
}
