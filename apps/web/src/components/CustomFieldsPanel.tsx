import { useEffect, useMemo, useState } from "react";
import type { CustomField, CustomFieldOption, CustomFieldType } from "../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
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
  message?: string;
  error?: string;
  onCreate: (input: { label: string; fieldType: CustomFieldType; description: string | null; options?: EditableOption[] }) => Promise<void>;
  onUpdate: (id: string, input: { label: string; fieldType: CustomFieldType; description: string | null; options?: EditableOption[] }) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onReorder: (fieldIds: string[]) => Promise<void>;
};

function supportsOptions(type: CustomFieldType) {
  return type === "SINGLE_SELECT" || type === "MULTI_SELECT";
}

function startingOption(): EditableOption {
  return { label: "", color: "#58a6de", sortOrder: 0, isArchived: false };
}

export function CustomFieldsPanel({ fields, loading, message, error, onCreate, onUpdate, onArchive, onReorder }: Props) {
  const activeFields = useMemo(() => fields.filter((field) => !field.isArchived), [fields]);
  const archivedFields = useMemo(() => fields.filter((field) => field.isArchived), [fields]);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<CustomField | null>(null);
  const [draft, setDraft] = useState<{
    label: string;
    fieldType: CustomFieldType;
    description: string;
    options: EditableOption[];
  }>({ label: "", fieldType: "TEXT", description: "", options: [] });

  const selectedField = fields.find((field) => field.id === selectedId) ?? null;

  useEffect(() => {
    if (creating) return;
    const field = selectedField ?? activeFields[0];
    if (!field) return;
    if (!selectedField) setSelectedId(field.id);
    setDraft({
      label: field.label,
      fieldType: field.fieldType,
      description: field.description ?? "",
      options: field.options.map((option) => ({ ...option })),
    });
  }, [activeFields, creating, selectedField]);

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

  return (
    <div className="custom-fields-shell" data-testid="custom-fields-panel">
      <section className="custom-fields-list">
        <header className="admin-section-head">
          <div>
            <p className="eyebrow">Board Configuration</p>
            <h2>Custom Fields</h2>
          </div>
          <button type="button" className="button button-primary" data-testid="custom-field-new" onClick={beginCreate}>
            New Field
          </button>
        </header>
        <p className="subtitle">Additional columns for make-ready items. These are ready for later spreadsheet mapping.</p>
        {activeFields.length === 0 ? (
          <StatusState title="No custom fields" description="Create a field to add a configurable column to the main table." tone="subtle" />
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
                  <button type="button" aria-label={`Move ${field.label} earlier`} disabled={index === 0 || loading} onClick={() => void moveField(field, -1)}>Up</button>
                  <button type="button" aria-label={`Move ${field.label} later`} disabled={index === activeFields.length - 1 || loading} onClick={() => void moveField(field, 1)}>Down</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {archivedFields.length > 0 ? <p className="subtitle">{archivedFields.length} archived field{archivedFields.length === 1 ? "" : "s"} retained for historical values.</p> : null}
      </section>

      <section className="custom-field-editor">
        <header className="admin-section-head">
          <h3>{creating ? "Create Field" : selectedField ? "Edit Field" : "Field Setup"}</h3>
          {!creating && selectedField ? (
            <button type="button" className="button button-danger" data-testid="custom-field-archive" onClick={() => setArchiveTarget(selectedField)}>
              Archive Field
            </button>
          ) : null}
        </header>
        {message ? <div className="admin-message success">{message}</div> : null}
        {error ? <div className="admin-message error">{error}</div> : null}
        {!creating && !selectedField ? (
          <StatusState title="Choose a field" description="Select an existing column or create a new configurable field." tone="subtle" />
        ) : (
          <div className="custom-field-form">
            <label>
              Field name
              <input data-testid="custom-field-label" value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} />
            </label>
            <label>
              Type
              <select data-testid="custom-field-type" value={draft.fieldType} onChange={(event) => setDraft((current) => ({ ...current, fieldType: event.target.value as CustomFieldType, options: supportsOptions(event.target.value as CustomFieldType) && current.options.length === 0 ? [startingOption()] : current.options }))}>
                {fieldTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label className="span-full">
              Description
              <input data-testid="custom-field-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Optional guidance for operators" />
            </label>

            {supportsOptions(draft.fieldType) ? (
              <div className="custom-field-options span-full" data-testid="custom-field-options">
                <div className="admin-section-head">
                  <p className="section-label">Status options</p>
                  <button type="button" className="button button-secondary" onClick={() => setDraft((current) => ({ ...current, options: [...current.options, { ...startingOption(), sortOrder: current.options.length }] }))}>Add Option</button>
                </div>
                {draft.options.map((option, index) => (
                  <div className="custom-field-option" key={option.id ?? index}>
                    <input data-testid={`custom-field-option-label-${index}`} value={option.label} onChange={(event) => updateOption(index, { label: event.target.value })} placeholder="Label" />
                    <input aria-label={`Color for option ${index + 1}`} type="color" value={option.color} onChange={(event) => updateOption(index, { color: event.target.value })} />
                    <label className="toggle-row">
                      <input type="checkbox" checked={option.isArchived} onChange={(event) => updateOption(index, { isArchived: event.target.checked })} />
                      Archived
                    </label>
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
              {creating ? "Create Field" : "Save Changes"}
            </button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive custom field"
        description={`Archive ${archiveTarget?.label ?? "this field"}? Existing values remain stored, but the column is hidden from the board.`}
        confirmLabel="Archive Field"
        tone="danger"
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (!archiveTarget) return;
          await onArchive(archiveTarget.id);
          setArchiveTarget(null);
          setSelectedId("");
        }}
      />
    </div>
  );
}
