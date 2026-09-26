import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Supplemental help only: required actions and save warnings stay in the page. */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  function close() { clearTimeout(timer.current); setPosition(null); }
  function open() {
    clearTimeout(timer.current);
    const rect = button.current?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 292)), top: rect.bottom + 6 });
  }
  function leave() { if (!focused.current) timer.current = setTimeout(close, 150); }
  useLayoutEffect(() => {
    const rect = tooltip.current?.getBoundingClientRect();
    if (position && rect && rect.bottom > window.innerHeight - 12) {
      setPosition({ ...position, top: Math.max(12, window.innerHeight - rect.height - 12) });
    }
  }, [position]);
  useEffect(() => {
    if (!position) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close(); } };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !button.current?.contains(event.target) && !tooltip.current?.contains(event.target)) close();
    };
    window.addEventListener("keydown", dismiss, true);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", dismiss, true);
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [position]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <>
    <button ref={button} type="button" className="help-tip-trigger" aria-label={label} aria-describedby={position ? id : undefined} aria-expanded={Boolean(position)} onMouseEnter={open} onMouseLeave={leave} onFocus={() => { focused.current = true; open(); }} onBlur={() => { focused.current = false; close(); }} onClick={open}>?</button>
    {position ? createPortal(<span ref={tooltip} id={id} role="tooltip" className="help-tip-content" style={position} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={leave}>{children}</span>, document.body) : null}
  </>;
}
