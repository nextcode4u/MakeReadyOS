import { getVerifiedSession, isCurrentSession, verifiedSessionEventName } from "./verifiedSession";

type ReportBridge = { postMessage: (message: string) => void; onmessage: ((event: { data: string }) => void) | null };
type ReportWindow = Window & { MakeReadyOSReports?: ReportBridge };
let pending: { reject: (error: Error) => void } | null = null;
const bridge = () => (window as ReportWindow).MakeReadyOSReports;
function clearNativeReport() {
  try { bridge()?.postMessage(JSON.stringify({ version: 1, action: "clear" })); } catch { /* Never interrupt account cleanup. */ }
}

if (typeof window !== "undefined") {
  window.addEventListener(verifiedSessionEventName, () => {
    pending?.reject(new Error("The account changed. Generate the report again after signing in."));
    clearNativeReport();
  });
}

export async function deliverReportPdf(pdfBase64: string, filename: string, kind: "draft" | "resident", android: boolean) {
  const session = getVerifiedSession();
  if (!session.userId) throw new Error("Sign in before exporting a report.");
  if (!android) {
    const bytes = Uint8Array.from(atob(pdfBase64), char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  const native = bridge();
  if (!native) throw new Error("PDF export is unavailable. Update the Android app and Android System WebView, or use the website.");
  if (pending) throw new Error("A report is already being prepared.");
  if (!pdfBase64 || pdfBase64.length > 22369624) throw new Error("This report is too large for the Android pilot. Download it from the website.");
  const id = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      window.clearTimeout(timer); pending = null; native.onmessage = null;
      if (error) reject(error); else resolve();
    };
    const timer = window.setTimeout(() => {
      clearNativeReport();
      finish(new Error("Android did not confirm the report. Nothing was exported; try again."));
    }, 30000);
    pending = { reject: error => finish(error) };
    native.onmessage = event => {
      try {
        const result = JSON.parse(event.data);
        if (result.id !== id) return;
        if (!isCurrentSession(session)) return finish(new Error("The account changed. Generate the report again."));
        finish(result.status === "ready" ? undefined : new Error("Android could not prepare this PDF. Nothing was exported. Try again or use the website."));
      } catch { /* Ignore messages that are not part of this request. */ }
    };
    try { native.postMessage(JSON.stringify({ version: 1, action: "report", id, kind, filename, pdfBase64 })); }
    catch { finish(new Error("Could not hand the PDF to Android. Nothing was exported.")); }
  });
}
