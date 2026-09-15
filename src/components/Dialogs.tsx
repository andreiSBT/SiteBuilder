"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for things that throw work away. */
  danger?: boolean;
  /** Drop the cancel button, when there's nothing to decide. */
  hideCancel?: boolean;
  /**
   * Run synchronously inside the confirm click, before the promise resolves.
   * window.open() needs this: after an await the browser no longer counts it
   * as something the user asked for, and blocks it as a popup.
   */
  onConfirm?: () => void;
};

type AlertOptions = {
  title: string;
  message?: ReactNode;
  okLabel?: string;
};

type Request =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "alert"; opts: AlertOptions; resolve: (ok: boolean) => void };

type DialogApi = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: AlertOptions) => Promise<boolean>;
};

const DialogContext = createContext<DialogApi>({
  confirm: async () => false,
  alert: async () => false,
});

/**
 * Whether a dialog is showing lives in its own context on purpose. If it were
 * part of the api object, that object would change identity every time a dialog
 * opened, and any effect depending on it would re-run and open another one.
 */
const DialogOpenContext = createContext(false);

export const useDialog = () => useContext(DialogContext);
export const useDialogOpen = () => useContext(DialogOpenContext);

/**
 * In-app replacements for window.confirm / window.alert. Native dialogs look
 * like the browser interrupting you, can't be styled, and block the page; these
 * match the rest of the app and resolve a promise, so call sites read the same.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setRequest({ kind: "confirm", opts, resolve })),
    []
  );

  const alert = useCallback(
    (opts: AlertOptions) =>
      new Promise<boolean>((resolve) => setRequest({ kind: "alert", opts, resolve })),
    []
  );

  const close = useCallback(
    (result: boolean) => {
      setRequest((current) => {
        current?.resolve(result);
        return null;
      });
    },
    []
  );

  // Stable for the lifetime of the provider, so effects can depend on it.
  const api = useMemo(() => ({ confirm, alert }), [confirm, alert]);

  return (
    <DialogContext.Provider value={api}>
      <DialogOpenContext.Provider value={request !== null}>
        {children}
        {request && <DialogShell request={request} onClose={close} />}
      </DialogOpenContext.Provider>
    </DialogContext.Provider>
  );
}

function DialogShell({
  request,
  onClose,
}: {
  request: Request;
  onClose: (result: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const { opts } = request;
  const isConfirm = request.kind === "confirm";
  const danger = isConfirm && (opts as ConfirmOptions).danger;

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose(false);
      }
    };
    // Capture, so this runs before any other Escape handler in the app.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 p-4"
      onClick={() => onClose(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dialog-title" className="text-base font-semibold text-slate-900">
          {opts.title}
        </h2>

        {opts.message && (
          <div className="mt-1.5 text-sm leading-relaxed text-slate-600">{opts.message}</div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {isConfirm && !(opts as ConfirmOptions).hideCancel && (
            <button
              onClick={() => onClose(false)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {(opts as ConfirmOptions).cancelLabel ?? "Cancel"}
            </button>
          )}
          <button
            ref={confirmRef}
            onClick={() => {
              if (isConfirm) (opts as ConfirmOptions).onConfirm?.();
              onClose(true);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              danger
                ? "bg-rose-600 hover:bg-rose-700 focus:ring-rose-400"
                : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-400"
            }`}
          >
            {isConfirm
              ? ((opts as ConfirmOptions).confirmLabel ?? "OK")
              : ((opts as AlertOptions).okLabel ?? "OK")}
          </button>
        </div>
      </div>
    </div>
  );
}
