import { type ReactNode, useEffect, useEffectEvent, useId, useRef } from "react";
import { t } from "../lib/i18n";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  testId?: string;
};

const openDialogs: HTMLElement[] = [];
let originalOverflow = "";
const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
function focusableElements(panel: HTMLElement) {
  return [...panel.querySelectorAll<HTMLElement>(focusableSelector)].filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest("[inert]"));
}

export function Modal({ open, title, children, actions, onClose, testId }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const close = useEffectEvent(onClose);
  const language =
    typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("es")
      ? "es"
      : "en";
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const panel = panelRef.current;
    if (!panel) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!openDialogs.length) originalOverflow = document.body.style.overflow;
    openDialogs.push(panel);
    document.body.style.overflow = "hidden";
    if (!panel.contains(document.activeElement)) (focusableElements(panel)[0] ?? panel).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      } else if (event.key === "Tab") {
        const elements = focusableElements(panel);
        const first = elements[0] ?? panel;
        const last = elements[elements.length - 1] ?? panel;
        if (!panel.contains(document.activeElement) || document.activeElement === panel || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    const handleFocus = (event: FocusEvent) => {
      if (openDialogs[openDialogs.length - 1] === panel && event.target instanceof Node && !panel.contains(event.target)) (focusableElements(panel)[0] ?? panel).focus();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocus);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocus);
      const wasTop = openDialogs[openDialogs.length - 1] === panel;
      openDialogs.splice(openDialogs.indexOf(panel), 1);
      if (!openDialogs.length) document.body.style.overflow = originalOverflow;
      if (wasTop && opener?.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        ref={panelRef}
        tabIndex={-1}
        data-testid={testId}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t(language, "common.closeDialog")}>
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {actions ? <footer className="modal-actions">{actions}</footer> : null}
      </section>
    </div>
  );
}
