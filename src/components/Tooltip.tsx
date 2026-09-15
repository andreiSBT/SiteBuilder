"use client";

import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

type Bubble = { label: string; x: number; y: number; below: boolean };

type TipApi = {
  show: (label: string, rect: DOMRect) => void;
  hide: () => void;
};

const TooltipContext = createContext<TipApi>({ show: () => {}, hide: () => {} });

const DELAY = 400;

/**
 * One floating bubble for the whole app, replacing the browser's `title`
 * tooltips. Native ones can't be styled, take about a second to appear, and sit
 * outside the app's look entirely.
 *
 * It's positioned `fixed` from the target's rect rather than absolutely inside
 * it, so a tooltip in a scrolling sidebar isn't clipped by the sidebar.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const show = useCallback(
    (label: string, rect: DOMRect) => {
      clear();
      timer.current = window.setTimeout(() => {
        // Flip below the target when there isn't room above.
        const below = rect.top < 44;
        setBubble({
          label,
          x: rect.left + rect.width / 2,
          y: below ? rect.bottom + 8 : rect.top - 8,
          below,
        });
      }, DELAY);
    },
    [clear]
  );

  const hide = useCallback(() => {
    clear();
    setBubble(null);
  }, [clear]);

  const api = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <TooltipContext.Provider value={api}>
      {children}
      {bubble && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[140] max-w-[220px] rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium leading-snug text-white shadow-lg"
          style={{
            left: bubble.x,
            top: bubble.y,
            transform: `translate(-50%, ${bubble.below ? "0" : "-100%"})`,
          }}
        >
          {bubble.label}
        </div>
      )}
    </TooltipContext.Provider>
  );
}

type TipChildProps = {
  onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  "aria-label"?: string;
};

/**
 * Wraps a single element and gives it a tooltip. Handlers are added to the
 * child itself, so nothing extra appears in the layout.
 */
export function Tip({
  label,
  children,
}: {
  label: string;
  children: ReactElement<TipChildProps>;
}) {
  const { show, hide } = useContext(TooltipContext);
  const props = children.props;

  return cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      show(label, e.currentTarget.getBoundingClientRect());
      props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      hide();
      props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      show(label, e.currentTarget.getBoundingClientRect());
      props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      hide();
      props.onBlur?.(e);
    },
    // Clicking usually means the thing moved or vanished; don't leave a bubble.
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      hide();
      props.onClick?.(e);
    },
    // Icon-only buttons still need a name for screen readers.
    "aria-label": props["aria-label"] ?? label,
  });
}
