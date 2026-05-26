import { Modal } from "./Modal";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
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
  tone = "default",
  busy,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      open={open}
      title={title}
      testId="confirm-dialog"
      onClose={() => {
        if (!busy) {
          onClose();
        }
      }}
      actions={(
        <>
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            data-testid="confirm-dialog-confirm"
            className={tone === "danger" ? "button button-danger" : "button button-primary"}
            onClick={async () => {
              await onConfirm();
            }}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      )}
    >
      <p className="modal-copy">{description}</p>
    </Modal>
  );
}
