import { useEffect, useMemo, useState } from "react";
import type { CustomField, CustomFieldOption, CustomFieldType, UserLanguage } from "../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { LabelPill } from "./LabelPill";
import { StatusState } from "./StatusState";

const fieldTypes: Array<{ value: CustomFieldType; label: string }> = [
  { value: "TEXT", label: "Text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "SINGLE_SELECT", label: "Single select / status" },
  { value: "MULTI_SELECT", label: "Multi select" },
  { value: "BOOLEAN", label: "Boolean" },
  { value: "USER", label: "User / assignee" },
];

type EditableOption = Pick<CustomFieldOption, "label" | "color" | "sortOrder" | "isArchived"> & { id?: string };

type Props = {
  fields: CustomField[];
  loading: boolean;
  language: UserLanguage;
  message?: string;
  error?: string;
  onCreate: (input: { label: string; fieldType: CustomFieldType; description: string | null; options?: EditableOption[] }) => Promise<void>;
  onUpdate: (id: string, input: { label: string; fieldType: CustomFieldType; description: string | null; options?: EditableOption[] }) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
  onPermanentDelete: (id: string) => Promise<void>;
  onReorder: (fieldIds: string[]) => Promise<void>;
};

function supportsOptions(type: CustomFieldType) {
  return type === "SINGLE_SELECT" || type === "MULTI_SELECT";
}

function startingOption(): EditableOption {
  return { label: "", color: "#58a6de", sortOrder: 0, isArchived: false };
}

export function CustomFieldsPanel({ fields, loading, language, message, error, onCreate, onUpdate, onArchive, onRestore, onTrash, onPermanentDelete, onReorder }: Props) {
  const isSpanish = language === "es";
  const activeFields = useMemo(() => fields.filter((field) => !field.isArchived && !field.deletedAt), [fields]);
  const archivedFields = useMemo(() => fields.filter((field) => field.isArchived && !field.deletedAt), [fields]);
  const trashedFields = useMemo(() => fields.filter((field) => field.deletedAt), [fields]);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<CustomField | null>(null);
  const [trashTarget, setTrashTarget] = useState<CustomField | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomField | null>(null);
  const [draft, setDraft] = useState<{
    label: string;
    fieldType: CustomFieldType;
    description: string;
    options: EditableOption[];
  }>({ label: "", fieldType: "TEXT", description: "", options: [] });

  const selectedField = fields.find((field) => field.id === selectedId) ?? null;

  useEffect(() => {
    if (creating) return;
    const field = selectedField ?? activeFields[0] ?? archivedFields[0] ?? trashedFields[0];
    if (!field) return;
    if (!selectedField) setSelectedId(field.id);
    setDraft({
      label: field.label,
      fieldType: field.fieldType,
      description: field.description ?? "",
      options: field.options.map((option) => ({ ...option })),
    });
  }, [activeFields, archivedFields, creating, selectedField, trashedFields]);

  const beginCreate = () => {
    setCreating(true);
    setSelectedId("");
    setDraft({ label: "", fieldType: "TEXT", description: "", options: [] });
  };

  const updateOption = (index: number, next: Partial<EditableOption>) => {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => optionIndex === index ? { ...option, ...next } : option),
    }));
  };

  const moveField = async (field: CustomField, direction: -1 | 1) => {
    const index = activeFields.findIndex((entry) => entry.id === field.id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= activeFields.length) return;
    const next = [...activeFields];
    [next[index], next[destination]] = [next[destination], next[index]];
    await onReorder(next.map((entry) => entry.id));
  };

  const submittedOptions = supportsOptions(draft.fieldType)
    ? draft.options
      .filter((option) => option.label.trim())
      .map((option, index) => ({ ...option, label: option.label.trim(), sortOrder: index }))
    : undefined;
  const activeDraftOptionCount = submittedOptions?.filter((option) => !option.isArchived).length ?? 0;
  const archivedDraftOptionCount = submittedOptions?.filter((option) => option.isArchived).length ?? 0;

  return (
    <div className="custom-fields-shell" data-testid="custom-fields-panel">
      <section className="custom-fields-list">
        <header className="admin-section-head">
          <div>
            <p className="eyebrow">{isSpanish ? "Configuración del tablero" : "Board Configuration"}</p>
            <h2>{isSpanish ? "Campos personalizados" : "Custom Fields"}</h2>
          </div>
          <button type="button" className="button button-primary" data-testid="custom-field-new" onClick={beginCreate}>
            {isSpanish ? "Nuevo campo" : "New Field"}
          </button>
        </header>
        <p className="subtitle">{isSpanish ? "Columnas adicionales para elementos de make-ready. Están listas para un mapeo posterior con hojas de cálculo." : "Additional columns for make-ready items. These are ready for later spreadsheet mapping."}</p>
        {activeFields.length === 0 ? (
          <StatusState title={isSpanish ? "No hay campos personalizados" : "No custom fields"} description={isSpanish ? "Cree un campo para agregar una columna configurable a la tabla principal." : "Create a field to add a configurable column to the main table."} tone="subtle" />
        ) : (
          <div className="field-definition-list">
            {activeFields.map((field, index) => (
              <div className={selectedId === field.id && !creating ? "field-definition active" : "field-definition"} key={field.id}>
                <button type="button" data-testid={`custom-field-item-${field.fieldKey}`} onClick={() => {
                  setCreating(false);
                  setSelectedId(field.id);
                }}>
                  <strong>{field.label}</strong>
                  <small>{fieldTypes.find((type) => type.value === field.fieldType)?.label ?? field.fieldType}</small>
                </button>
                <div className="field-order-controls">
                  <button type="button" aria-label={`${isSpanish ? "Mover" : "Move"} ${field.label} ${isSpanish ? "antes" : "earlier"}`} disabled={index === 0 || loading} onClick={() => void moveField(field, -1)}>{isSpanish ? "Subir" : "Up"}</button>
                  <button type="button" aria-label={`${isSpanish ? "Mover" : "Move"} ${field.label} ${isSpanish ? "después" : "later"}`} disabled={index === activeFields.length - 1 || loading} onClick={() => void moveField(field, 1)}>{isSpanish ? "Bajar" : "Down"}</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {archivedFields.length > 0 ? (
          <div className="field-archive-section" data-testid="archived-custom-fields">
            <h3>{isSpanish ? "Campos archivados" : "Archived Fields"}</h3>
            <p className="subtitle">{isSpanish ? "Ocultos de la configuración activa del tablero, conservados para valores históricos." : "Hidden from active board setup, retained for historical values."}</p>
            <div className="field-definition-list">
              {archivedFields.map((field) => (
                <div className={selectedId === field.id && !creating ? "field-definition active" : "field-definition"} key={field.id}>
                  <button type="button" data-testid={`archived-custom-field-item-${field.fieldKey}`} onClick={() => {
                    setCreating(false);
                    setSelectedId(field.id);
                  }}>
                    <strong>{field.label}</strong>
                    <small>{fieldTypes.find((type) => type.value === field.fieldType)?.label ?? field.fieldType}</small>
                  </button>
                  <div className="field-order-controls">
                    <button type="button" disabled={loading} onClick={() => void onRestore(field.id)}>{isSpanish ? "Restaurar" : "Restore"}</button>
                    <button type="button" disabled={loading} onClick={() => setTrashTarget(field)}>{isSpanish ? "Enviar a papelera" : "Trash"}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="field-archive-section" data-testid="custom-field-trash">
          <h3>{isSpanish ? "Papelera" : "Trash Can"}</h3>
          <p className="subtitle">{isSpanish ? "Los campos en papelera se conservan durante 7 días antes de permitir la eliminación permanente." : "Trashed fields are retained for 7 days before permanent deletion is allowed."}</p>
          {trashedFields.length === 0 ? (
            <p className="subtitle">{isSpanish ? "La papelera está vacía." : "Trash is empty."}</p>
          ) : (
            <div className="field-definition-list">
              {trashedFields.map((field) => {
                const deleteAfter = field.deleteAfter ? new Date(field.deleteAfter) : null;
                const canDelete = Boolean(deleteAfter && deleteAfter <= new Date());
                return (
                  <div className={selectedId === field.id && !creating ? "field-definition active" : "field-definition"} key={field.id}>
                    <button type="button" data-testid={`trashed-custom-field-item-${field.fieldKey}`} onClick={() => {
                      setCreating(false);
                      setSelectedId(field.id);
                    }}>
                      <strong>{field.label}</strong>
                      <small>{deleteAfter ? `${isSpanish ? "Eliminar después de" : "Delete after"} ${deleteAfter.toLocaleDateString()}` : isSpanish ? "Retención pendiente" : "Retention pending"}</small>
                    </button>
                    <div className="field-order-controls">
                      <button type="button" disabled={loading} onClick={() => void onRestore(field.id)}>{isSpanish ? "Restaurar" : "Restore"}</button>
                      <button type="button" disabled={loading || !canDelete} onClick={() => setDeleteTarget(field)}>{isSpanish ? "Eliminar" : "Delete"}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="custom-field-editor">
        <header className="admin-section-head">
          <h3>{creating ? (isSpanish ? "Crear campo" : "Create Field") : selectedField ? (isSpanish ? "Editar campo" : "Edit Field") : (isSpanish ? "Configuración del campo" : "Field Setup")}</h3>
          {!creating && selectedField && !selectedField.deletedAt ? (
            <div className="admin-actions">
              {selectedField.isArchived ? (
                  <button type="button" className="button button-secondary" data-testid="custom-field-restore" onClick={() => void onRestore(selectedField.id)}>
                  {isSpanish ? "Restaurar campo" : "Restore Field"}
                  </button>
              ) : (
                <button type="button" className="button button-danger" data-testid="custom-field-archive" onClick={() => setArchiveTarget(selectedField)}>
                  {isSpanish ? "Archivar campo" : "Archive Field"}
                </button>
              )}
              {selectedField.isArchived ? (
                <button type="button" className="button button-danger" data-testid="custom-field-trash-button" onClick={() => setTrashTarget(selectedField)}>
                  {isSpanish ? "Mover a la papelera" : "Move to Trash"}
                </button>
              ) : null}
            </div>
          ) : null}
        </header>
        {message ? <div className="admin-message success">{message}</div> : null}
        {error ? <div className="admin-message error">{error}</div> : null}
        {!creating && selectedField?.deletedAt ? (
          <StatusState
            title={isSpanish ? "El campo está en la papelera" : "Field is in trash"}
            description={isSpanish ? "Restaure este campo para editarlo. La eliminación permanente solo está disponible después del período de retención de 7 días." : "Restore this field to edit it. Permanent deletion is only available after the 7-day retention window."}
            tone="subtle"
          />
        ) : !creating && !selectedField ? (
          <StatusState title={isSpanish ? "Elija un campo" : "Choose a field"} description={isSpanish ? "Seleccione una columna existente o cree un nuevo campo configurable." : "Select an existing column or create a new configurable field."} tone="subtle" />
        ) : (
          <div className="custom-field-form">
            <label>
              {isSpanish ? "Nombre del campo" : "Field name"}
              <input data-testid="custom-field-label" value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} />
            </label>
            <label>
              {isSpanish ? "Tipo" : "Type"}
              <select data-testid="custom-field-type" value={draft.fieldType} onChange={(event) => setDraft((current) => ({ ...current, fieldType: event.target.value as CustomFieldType, options: supportsOptions(event.target.value as CustomFieldType) && current.options.length === 0 ? [startingOption()] : current.options }))}>
                {fieldTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label className="span-full">
              {isSpanish ? "Descripción" : "Description"}
              <input data-testid="custom-field-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder={isSpanish ? "Guía opcional para operadores" : "Optional guidance for operators"} />
            </label>

            {supportsOptions(draft.fieldType) ? (
              <div className="custom-field-options span-full" data-testid="custom-field-options">
                <div className="admin-section-head">
                  <p className="section-label">{isSpanish ? "Opciones de estado" : "Status options"}</p>
                  <button type="button" className="button button-secondary" onClick={() => setDraft((current) => ({ ...current, options: [...current.options, { ...startingOption(), sortOrder: current.options.length }] }))}>{isSpanish ? "Agregar opción" : "Add Option"}</button>
                </div>
                <div className="option-summary" data-testid="custom-field-option-summary">
                  <span className="status-chip active">{isSpanish ? `${activeDraftOptionCount} activas` : `${activeDraftOptionCount} active`}</span>
                  <span className="status-chip inactive">{isSpanish ? `${archivedDraftOptionCount} archivadas` : `${archivedDraftOptionCount} archived`}</span>
                </div>
                <p className="helper-copy span-full">
                  {isSpanish
                    ? "Las opciones archivadas permanecen en registros existentes, pero no se ofrecerán para nuevas selecciones."
                    : "Archived options remain on existing records, but they will not be offered for new selections."}
                </p>
                {draft.options.map((option, index) => (
                  <div className="custom-field-option" key={option.id ?? index}>
                    <input data-testid={`custom-field-option-label-${index}`} value={option.label} onChange={(event) => updateOption(index, { label: event.target.value })} placeholder={isSpanish ? "Etiqueta" : "Label"} />
                    <input aria-label={`${isSpanish ? "Color para la opción" : "Color for option"} ${index + 1}`} type="color" value={option.color} onChange={(event) => updateOption(index, { color: event.target.value })} />
                    <label className="toggle-row">
                      <input type="checkbox" checked={option.isArchived} onChange={(event) => updateOption(index, { isArchived: event.target.checked })} />
                      {isSpanish ? "Archivado" : "Archived"}
                    </label>
                    <div className="inline-option-preview">
                      <LabelPill value={option.label || (isSpanish ? "Vista previa" : "Preview")} label={{ color: option.color, textColor: "#f4f6fa" } as never} muted={option.isArchived} />
                      <span className={`option-state-badge ${option.isArchived ? "archived" : "active"}`}>{option.isArchived ? (isSpanish ? "Solo historial" : "Historical only") : (isSpanish ? "Activa" : "Active")}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              data-testid="custom-field-save"
              className="button button-primary span-full"
              disabled={loading || !draft.label.trim() || (supportsOptions(draft.fieldType) && (submittedOptions?.filter((option) => !option.isArchived).length ?? 0) === 0)}
              onClick={async () => {
                const input = { label: draft.label.trim(), fieldType: draft.fieldType, description: draft.description.trim() || null, options: submittedOptions };
                if (creating) {
                  await onCreate(input);
                  setCreating(false);
                } else if (selectedField) {
                  await onUpdate(selectedField.id, input);
                }
              }}
            >
              {creating ? (isSpanish ? "Crear campo" : "Create Field") : (isSpanish ? "Guardar cambios" : "Save Changes")}
            </button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        language={isSpanish ? "es" : "en"}
        title={isSpanish ? "Archivar campo personalizado" : "Archive custom field"}
        description={`${isSpanish ? "¿Archivar" : "Archive"} ${archiveTarget?.label ?? (isSpanish ? "este campo" : "this field")}? ${isSpanish ? "Los valores existentes se conservan, pero la columna se oculta del tablero." : "Existing values remain stored, but the column is hidden from the board."}`}
        confirmLabel={isSpanish ? "Archivar campo" : "Archive Field"}
        tone="danger"
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (!archiveTarget) return;
          await onArchive(archiveTarget.id);
          setArchiveTarget(null);
          setSelectedId("");
        }}
      />
      <ConfirmDialog
        open={Boolean(trashTarget)}
        language={isSpanish ? "es" : "en"}
        title={isSpanish ? "Mover campo personalizado a la papelera" : "Move custom field to trash"}
        description={`${isSpanish ? "¿Mover" : "Move"} ${trashTarget?.label ?? (isSpanish ? "este campo" : "this field")} ${isSpanish ? "a la papelera? Se podrá recuperar durante 7 días antes de permitir la eliminación permanente." : "to trash? It will stay recoverable for 7 days before permanent deletion is available."}`}
        confirmLabel={isSpanish ? "Mover a la papelera" : "Move to Trash"}
        tone="danger"
        onClose={() => setTrashTarget(null)}
        onConfirm={async () => {
          if (!trashTarget) return;
          await onTrash(trashTarget.id);
          setTrashTarget(null);
          setSelectedId("");
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        language={isSpanish ? "es" : "en"}
        title={isSpanish ? "Eliminar campo personalizado permanentemente" : "Permanently delete custom field"}
        description={`${isSpanish ? "¿Eliminar permanentemente" : "Permanently delete"} ${deleteTarget?.label ?? (isSpanish ? "este campo" : "this field")}? ${isSpanish ? "Esto no se puede deshacer después de la ventana de retención." : "This cannot be undone after the retention window."}`}
        confirmLabel={isSpanish ? "Eliminar permanentemente" : "Delete Permanently"}
        tone="danger"
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await onPermanentDelete(deleteTarget.id);
          setDeleteTarget(null);
          setSelectedId("");
        }}
      />
    </div>
  );
}
