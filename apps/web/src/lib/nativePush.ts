type Bridge = { postMessage: (message: string) => void; onmessage?: (event: { data: string }) => void };
declare global { interface Window { MakeReadyOSPush?: Bridge } }
export type NativePushState = { configured: boolean; projectId?: string; optedIn?: boolean; enabled?: boolean; bindingId?: string; token?: string };
let sequence = 0;
const pending = new Map<string, { resolve: (value: NativePushState) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
export function nativePushAvailable() { return Boolean(window.MakeReadyOSPush); }
export function nativePush(action: string, input: Record<string, unknown> = {}): Promise<NativePushState> {
  const bridge = window.MakeReadyOSPush;
  if (!bridge) return Promise.reject(new Error("This APK does not include native notifications."));
  bridge.onmessage = event => {
    try {
      const value = JSON.parse(event.data);
      const job = pending.get(value.id);
      if (!job) return;
      pending.delete(value.id); clearTimeout(job.timer);
      if (value.error) job.reject(new Error(value.error)); else job.resolve(value);
    } catch { /* Ignore unrelated or malformed messages. */ }
  };
  return new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Device notification request timed out. Try again.")); }, 30000);
    pending.set(id, { resolve, reject, timer });
    try { bridge.postMessage(JSON.stringify({ id, action, ...input })); }
    catch { clearTimeout(timer); pending.delete(id); reject(new Error("Device notifications are unavailable.")); }
  });
}
export function clearNativePush() {
  if (typeof window !== "undefined" && nativePushAvailable()) void nativePush("clear").catch(() => {});
}
