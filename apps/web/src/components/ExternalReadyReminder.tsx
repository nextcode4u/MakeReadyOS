import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./Modal";
import { turnText } from "../lib/turnLocale";

const reminderEvent = "makereadyos:external-ready-reminder";

// Only the browser that successfully marked Ready receives this reminder.
export function remindExternalReady(unitNumber: string) {
  window.dispatchEvent(new CustomEvent(reminderEvent, { detail: unitNumber }));
}

export function ExternalReadyReminder({ language }: { language: string }) {
  const [unitNumber, setUnitNumber] = useState<string | null>(null);
  useEffect(() => {
    const show = (event: Event) => setUnitNumber((event as CustomEvent<string>).detail);
    window.addEventListener(reminderEvent, show);
    return () => window.removeEventListener(reminderEvent, show);
  }, []);
  const close = () => setUnitNumber(null);
  return createPortal(<Modal open={unitNumber !== null} title={turnText(language, "Next: update your CRM")} onClose={close} testId="external-ready-reminder" actions={<button type="button" className="button button-primary" onClick={close}>{turnText(language, "Got it")}</button>}>
    <p><strong>{turnText(language, "Unit marked ready")}: {unitNumber}</strong></p>
    <p>{turnText(language, "Please also mark this unit Ready in RealPage or your property's other CRM / property-management system.")}</p>
    <p>{turnText(language, "MakeReadyOS has not updated that system. Dismissing this reminder does not confirm an external update or change this unit's Ready status.")}</p>
  </Modal>, document.body);
}
