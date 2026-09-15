import { useEffect, useState } from "react";
import { onCallMapUrl, type OnCallMarker, type OnCallProperty } from "../lib/onCall";

export function OnCallMap({ property, external, onChange }: { property: OnCallProperty; external: boolean; onChange?: (markers: OnCallMarker[]) => void }) {
  const [page, setPage] = useState(1);
  const [placing, setPlacing] = useState<OnCallMarker["kind"] | "">("");
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setError(false); setLoaded(false); }, [page, property.mapFile?.id, open]);
  if (!property.mapFile) return null;
  return <details className="on-call-map" onToggle={event => setOpen(event.currentTarget.open)}><summary>View map / shop &amp; office: {property.name}</summary>
    {open ? <>
      <div className="on-call-actions">
        {property.mapFile.mime === "application/pdf" ? <label>PDF page<input type="number" min={1} max={50} value={page} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 50) setPage(value); }}/></label> : null}
        {onChange ? <><button type="button" onClick={() => setPlacing("SHOP")}>Mark shop</button><button type="button" onClick={() => setPlacing("OFFICE")}>Mark office</button>{placing ? <button type="button" onClick={() => setPlacing("")}>Cancel placement</button> : null}</> : null}
      </div>
      {placing ? <p role="status">Tap the {placing.toLowerCase()} location on the map, then Save on-call. You can also use the position fields below.</p> : null}
      {error ? <p role="alert">Cannot load this map page. Check the PDF page number or refresh/unlock the guides. The original map can still be downloaded.</p> : null}
      <div className={`on-call-map-canvas ${placing ? "placing" : ""}`} onClick={event => {
        if (!placing || !onChange || !loaded || error) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const pin = { kind: placing, page, x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
        onChange([...(property.markers ?? []).filter(marker => marker.kind !== placing), pin]); setPlacing("");
      }}>
        <img key={`${property.mapFile.id}-${page}`} src={`${onCallMapUrl(property.id, external)}?preview=1&page=${page}&file=${property.mapFile.id}`} alt={`${property.name} map, page ${page}`} onLoad={() => setLoaded(true)} onError={() => { setError(true); setLoaded(false); }}/>
        {loaded && !error ? (property.markers ?? []).filter(pin => pin.page === page).map(pin => <span key={pin.kind} className={`on-call-map-pin ${pin.kind.toLowerCase()}`} style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}>{pin.kind === "SHOP" ? "Shop" : "Office"}</span>) : null}
      </div>
      {onChange ? <div className="on-call-fields">{(["SHOP", "OFFICE"] as const).map(kind => {
        const pin = property.markers?.find(marker => marker.kind === kind);
        const update = (field: "x" | "y", value: number) => onChange([...(property.markers ?? []).filter(marker => marker.kind !== kind), { kind, page: pin?.page ?? page, x: pin?.x ?? .5, y: pin?.y ?? .5, [field]: Math.max(0, Math.min(1, value / 100)) }]);
        return <fieldset key={kind}><legend>{kind === "SHOP" ? "Shop" : "Office"} position {pin ? `(page ${pin.page})` : "(not marked)"}</legend><label>Horizontal %<input type="number" min={0} max={100} step={.1} value={pin ? Math.round(pin.x * 1000) / 10 : ""} onChange={event => update("x", Number(event.target.value))}/></label><label>Vertical %<input type="number" min={0} max={100} step={.1} value={pin ? Math.round(pin.y * 1000) / 10 : ""} onChange={event => update("y", Number(event.target.value))}/></label>{pin ? <button type="button" onClick={() => onChange((property.markers ?? []).filter(marker => marker.kind !== kind))}>Remove {kind.toLowerCase()} marker</button> : null}</fieldset>;
      })}</div> : <p>{(property.markers ?? []).map(pin => `${pin.kind === "SHOP" ? "Shop" : "Office"}: page ${pin.page}`).join(" / ") || "Shop and office have not been marked yet."}</p>}
      <p className="helper-copy">Markers are saved separately; the original downloaded file is unchanged. Replacing a map clears its markers.</p>
    </> : null}
  </details>;
}
