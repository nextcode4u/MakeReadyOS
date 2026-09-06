import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ToolbarPopover({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!position) return;
    panel.current?.focus();
    const close = () => setPosition(null);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      // Account actions can open a separate modal above this popover.
      if (target instanceof Element && target.closest(".modal-backdrop")) return;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".modal-backdrop")) { close(); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [position]);
  return <>
    <button ref={trigger} type="button" className="button button-secondary toolbar-popover-trigger" data-testid={testId}
      aria-haspopup="dialog" aria-expanded={Boolean(position)} aria-controls={position ? id : undefined}
      onClick={() => {
        if (position) { setPosition(null); return; }
        const rect = trigger.current!.getBoundingClientRect();
        setPosition({ left: Math.max(8, Math.min(rect.right - 300, window.innerWidth - 308)), top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 180)) });
      }}>{label}<span className="toolbar-popover-arrow" aria-hidden="true" /></button>
    {position ? createPortal(<div ref={panel} id={id} role="dialog" aria-label={label} tabIndex={-1} data-testid={`${testId}-panel`}
      className="toolbar-popover-panel" style={{ left: position.left, top: position.top, maxHeight: `calc(100dvh - ${position.top + 8}px)` }}>
      {children}
    </div>, document.body) : null}
  </>;
}
