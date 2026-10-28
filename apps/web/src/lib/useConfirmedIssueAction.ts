import { useRef, useState } from "react";

export function useConfirmedIssueAction(language: string) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(operation: () => Promise<unknown>, confirmed: () => void = () => {}) {
    if (pending.current) return;
    setError("");
    if (!navigator.onLine) {
      setError(language === "es" ? "Sin conexión. Tus entradas siguen aquí; vuelve a conectarte e inténtalo de nuevo." : "You're offline. Your entries are still here; reconnect and try again.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      await operation();
      confirmed();
    } catch (cause) {
      const message = language === "es" ? "No se pudo confirmar el guardado. Se conservaron tus entradas." : "Could not confirm the save. Your entries have been kept.";
      setError(`${message}${cause instanceof Error ? ` ${cause.message}` : ""}`);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
