import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getUnitHistory } from "../lib/api";
import { Modal } from "./Modal";

export function UnitHistoryButton({ unitId, label, language, onOpenItem }: { unitId: string; label: string; language: string; onOpenItem: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const es = language === "es";
  const history = useQuery({ queryKey: ["unit-history", unitId], queryFn: () => getUnitHistory(unitId), enabled: open, staleTime: 0 });
  return <>
    <button type="button" className="button button-secondary" onClick={() => setOpen(true)}>{es ? "Historial e informes" : "History & reports"}</button>
    {open ? <Modal open title={`${label} / ${es ? "Historial e informes" : "History & reports"}`} onClose={() => setOpen(false)}>
      <p>{es ? "Seleccione una rotación para ver o descargar su informe de inspección." : "Choose a turn to view or download its inspection report."}</p>
      {history.isPending ? <p role="status">{es ? "Cargando..." : "Loading..."}</p> : history.isError ? <p role="alert">{es ? "No se pudo cargar el historial." : "Could not load history."} <button type="button" onClick={() => void history.refetch()}>{es ? "Reintentar" : "Retry"}</button></p> : history.data.turns.length ? history.data.turns.map(turn => <div className="turn-row" key={turn.itemId}>
        <span><strong>{turn.current ? (es ? "Activa" : "Active") : (es ? "Archivada" : "Archived")}</strong> / {es ? "Inicio" : "Started"}: {turn.createdAt.slice(0, 10)} / {es ? "Entrada" : "Move-in"}: {turn.moveInDate?.slice(0, 10) || "-"}</span>
        <button type="button" className="button button-secondary" onClick={() => { setOpen(false); onOpenItem(turn.itemId); }}>{es ? "Abrir rotación e informe" : "Open turn & report"}</button>
      </div>) : <p>{es ? "No hay rotaciones registradas para esta unidad." : "No recorded turns for this unit."}</p>}
    </Modal> : null}
  </>;
}
