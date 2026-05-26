export type ToastTone = "success" | "error" | "info";

export type ToastItem = {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
};

type Props = {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
};

export function ToastViewport({ toasts, onDismiss }: Props) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article key={toast.id} className={`toast toast-${toast.tone}`}>
          <div className="toast-copy">
            <strong>{toast.title}</strong>
            {toast.message ? <p>{toast.message}</p> : null}
          </div>
          <button type="button" className="icon-button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
            ×
          </button>
        </article>
      ))}
    </div>
  );
}
