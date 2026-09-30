import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";

export async function checkUploadStorage(path: string) {
  if (!(await stat(path)).isDirectory()) throw new Error("Storage unavailable");
  await access(path, constants.R_OK | constants.X_OK);
}

export function createReadinessCheck(probe: () => Promise<unknown>, { timeoutMs = 3000, cacheMs = 10000 } = {}) {
  let pending: Promise<boolean> | undefined;
  let cached: { ok: boolean; expires: number } | undefined;
  let response: Promise<boolean> | undefined;
  return function check(): Promise<boolean> {
    if (cached && Date.now() < cached.expires) return Promise.resolve(cached.ok);
    if (response) return response;
    // Keep a timed-out probe in flight until it settles: a stalled dependency
    // must not accumulate new queries or filesystem operations on every poll.
    if (!pending) {
      pending = Promise.resolve().then(probe).then(() => true, () => false);
      void pending.then(() => { pending = undefined; });
    }
    const active = pending;
    response = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const ok = await Promise.race([active, new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
        cached = { ok, expires: Date.now() + cacheMs };
        return ok;
      } finally {
        clearTimeout(timer);
        response = undefined;
      }
    })();
    return response;
  };
}
