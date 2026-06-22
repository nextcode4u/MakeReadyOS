import type { UserLanguage } from "../lib/api";

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
  language?: UserLanguage;
};

export function ToastViewport({ toasts, onDismiss, language }: Props) {
  const isSpanish = language === "es";
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article key={toast.id} className={`toast toast-${toast.tone}`}>
          <div className="toast-copy">
            <strong>{toast.title}</strong>
            {toast.message ? <p>{toast.message}</p> : null}
          </div>
          <button type="button" className="icon-button" onClick={() => onDismiss(toast.id)} aria-label={isSpanish ? "Descartar notificación" : "Dismiss notification"}>
            ×
          </button>
        </article>
      ))}
    </div>
  );
}
