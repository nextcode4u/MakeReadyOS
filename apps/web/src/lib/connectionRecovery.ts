export type ConnectionProbeResult = "reachable" | "unreachable" | "unauthenticated" | "stale";

export function createConnectionRecovery(probe: (signal: AbortSignal) => Promise<ConnectionProbeResult>, callbacks: {
  reachable: (refresh: boolean) => void;
  unreachable: () => void;
  unauthenticated: () => void;
  visible: () => boolean;
}) {
  let stopped = false;
  let running = false;
  let failures = 0;
  let refreshNeeded = false;
  let controller: AbortController | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scheduledDelay = 0;
  const schedule = (delay: number) => {
    clearTimeout(timer);
    scheduledDelay = delay;
    if (!stopped) timer = setTimeout(() => void run(), delay);
  };
  const run = async () => {
    timer = undefined;
    if (stopped || running) return;
    if (!callbacks.visible()) { schedule(15_000); return; }
    running = true;
    controller = new AbortController();
    deadline = setTimeout(() => controller?.abort(), 10_000);
    let result: ConnectionProbeResult = "unreachable";
    try { result = await probe(controller.signal); }
    catch { /* A failed probe is evidence, not a reason to replay a write. */ }
    finally { clearTimeout(deadline); running = false; }
    if (stopped) return;
    // Mobile suspension is not evidence that the server is down.
    if (!callbacks.visible()) { schedule(15_000); return; }
    if (controller.signal.aborted) result = "unreachable";
    if (result === "stale") { schedule(1_000); return; }
    if (result === "unauthenticated") {
      failures = 0;
      refreshNeeded = false;
      callbacks.unauthenticated();
      return;
    }
    if (result === "reachable") {
      const refresh = refreshNeeded || failures > 0;
      failures = 0;
      refreshNeeded = false;
      callbacks.reachable(refresh);
      return;
    }
    failures++;
    if (failures === 2) callbacks.unreachable();
    schedule(failures === 1 ? 2_000 : 15_000);
  };
  return {
    check(suspectedFailure = false) {
      refreshNeeded ||= suspectedFailure;
      // Focus and visibility events often arrive together. Never overlap checks.
      if (!running && (timer === undefined || scheduledDelay > 1_000)) schedule(1_000);
    },
    stop() { stopped = true; clearTimeout(timer); clearTimeout(deadline); controller?.abort(); },
  };
}
