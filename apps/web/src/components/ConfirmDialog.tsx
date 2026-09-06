import { useEffect, useRef, useState } from "react";
import type { UserLanguage } from "../lib/api";
import { t } from "../lib/i18n";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  language?: UserLanguage;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  language = "en",
  tone = "default",
  busy,
  onConfirm,
  onClose,
}: Props) {
  const pending = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const working = Boolean(busy || submitting);
  useEffect(() => { if (open) setError(""); }, [open]);

  return (
    <Modal
      open={open}
      title={title}
      testId="confirm-dialog"
      onClose={() => {
        if (!working && !pending.current) {
          onClose();
        }
      }}
      actions={(
        <>
          <button type="button" className="button button-secondary" onClick={onClose} disabled={working}>
            {t(language, "common.cancel")}
          </button>
          <button
            type="button"
            data-testid="confirm-dialog-confirm"
            className={tone === "danger" ? "button button-danger" : "button button-primary"}
            onClick={async () => {
              if (busy || pending.current) return;
              pending.current = true;
              setSubmitting(true);
              setError("");
              try {
                await onConfirm();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : (language === "es" ? "No se pudo completar la acción." : "Could not complete the action."));
              } finally {
                pending.current = false;
                setSubmitting(false);
              }
            }}
            disabled={working}
          >
            {working ? t(language, "common.working") : confirmLabel}
          </button>
        </>
      )}
    >
      <p className="modal-copy">{description}</p>
      {error ? <p role="alert">{error}</p> : null}
    </Modal>
  );
}
