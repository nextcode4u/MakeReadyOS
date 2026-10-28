import { useState } from "react";
import { attachmentDownloadUrl } from "../lib/api";
import { Modal } from "./Modal";

export function FollowUpPhotos({ ids, language, onRemove }: { ids: string[]; language: string; onRemove?: (id: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const es = language === "es";
  if (!ids.length) return null;
  return <div className="follow-up-photos" data-testid="follow-up-photos">
    <strong>{es ? "Fotos del seguimiento" : "Follow-up photos"} ({ids.length})</strong>
    <div className="follow-up-photo-grid">{ids.map((id, index) => <div key={id}>
      <button type="button" className="follow-up-photo" onClick={() => setSelected(id)} aria-label={`${es ? "Ampliar foto" : "Enlarge photo"} ${index + 1}`}>
        <img src={attachmentDownloadUrl(id)} alt={`${es ? "Foto del seguimiento" : "Follow-up photo"} ${index + 1}`} loading="lazy" />
      </button>
      {onRemove ? <button type="button" className="button button-secondary" onClick={() => onRemove(id)} aria-label={`${es ? "Quitar foto" : "Remove photo"} ${index + 1}`}>{es ? "Quitar del seguimiento" : "Remove from follow-up"}</button> : null}
    </div>)}</div>
    <Modal open={Boolean(selected && ids.includes(selected))} title={es ? "Foto del seguimiento" : "Follow-up photo"} onClose={() => setSelected(null)}>
      {selected ? <div className="follow-up-photo-full"><img src={attachmentDownloadUrl(selected)} alt={es ? "Detalle del seguimiento" : "Follow-up detail"} /><a href={attachmentDownloadUrl(selected)} target="_blank" rel="noopener noreferrer">{es ? "Abrir imagen original" : "Open original image"}</a></div> : null}
    </Modal>
  </div>;
}
