import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { turnText } from "../lib/turnLocale";

const PAGE_WIDTH = 816;
const PAGE_HEIGHT = 1056;

export function FinalReportPreview({ html, language }: { html: string; language: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const previousScale = useRef<number | null>(null);
  const [width, setWidth] = useState(PAGE_WIDTH);
  const [height, setHeight] = useState(PAGE_HEIGHT);
  const [zoom, setZoom] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const scale = zoom ?? Math.min(1, width / PAGE_WIDTH);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "final-report-height") return;
      const measured = event.data.height;
      if (typeof measured === "number" && Number.isFinite(measured)) setHeight(Math.max(PAGE_HEIGHT, Math.min(1000000, Math.ceil(measured))));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useLayoutEffect(() => {
    const element = viewport.current;
    const previous = previousScale.current;
    if (element && zoom === null) {
      element.scrollTo(0, 0);
    } else if (element && previous && previous !== scale) {
      const ratio = scale / previous;
      element.scrollLeft = (element.scrollLeft + element.clientWidth / 2) * ratio - element.clientWidth / 2;
      element.scrollTop = (element.scrollTop + element.clientHeight / 2) * ratio - element.clientHeight / 2;
    }
    previousScale.current = scale;
  }, [scale, zoom]);
  // The frame remains an opaque sandbox: only this sizing script runs, with no
  // same-origin access. Screen padding matches the PDF's Letter-page margins.
  const document = html.replace("</head>", `<style>@media screen { html { overflow:hidden; } body { width:816px; min-height:1056px; padding:38.4px 38.4px 43.2px; } }</style></head>`)
    .replace("</body>", `<script>const reportHeight = () => parent.postMessage({type:"final-report-height",height:document.body.getBoundingClientRect().height},"*");new ResizeObserver(reportHeight).observe(document.body);addEventListener("load",reportHeight);reportHeight();</script></body>`);
  return <>
    <div className="final-report-zoom" role="group" aria-label={turnText(language, "Preview zoom controls")}>
      <button type="button" className="button" aria-label={turnText(language, "Zoom out")} disabled={scale <= 0.25} onClick={() => setZoom(Math.max(0.25, scale / 1.25))}>-</button>
      <output aria-live="polite">{Math.round(scale * 100)}%</output>
      <button type="button" className="button" aria-label={turnText(language, "Zoom in")} disabled={scale >= 3} onClick={() => setZoom(Math.min(3, scale * 1.25))}>+</button>
      <button type="button" className="button" onClick={() => { setZoom(null); viewport.current?.scrollTo(0, 0); }}>{turnText(language, "Fit width")}</button>
      <button type="button" className="button" onClick={() => setZoom(1)}>{turnText(language, "Actual size")}</button>
    </div>
    <p>{turnText(language, "Zoom in, then drag to inspect the report. You can also scroll or use arrow keys. Download the PDF for final page breaks.")}</p>
    <div ref={viewport} className="final-report-viewport" data-testid="final-report-viewport" data-dragging={dragging} tabIndex={0} role="region" aria-label={turnText(language, "Scrollable report preview")}
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        const element = event.currentTarget;
        element.focus({ preventScroll: true });
        element.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
        setDragging(true);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (!start || start.id !== event.pointerId) return;
        event.currentTarget.scrollLeft = start.left + start.x - event.clientX;
        event.currentTarget.scrollTop = start.top + start.y - event.clientY;
      }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); drag.current = null; setDragging(false); }}
      onPointerCancel={() => { drag.current = null; setDragging(false); }}
      onLostPointerCapture={() => { drag.current = null; setDragging(false); }}>
      <div className="final-report-paper" style={{ width: PAGE_WIDTH * scale, height: height * scale }}>
        <iframe ref={frame} title={turnText(language, "Final-walk draft preview")} sandbox="allow-scripts" srcDoc={document} tabIndex={-1} style={{ width: PAGE_WIDTH, height, transform: `scale(${scale})` }} />
      </div>
    </div>
  </>;
}
