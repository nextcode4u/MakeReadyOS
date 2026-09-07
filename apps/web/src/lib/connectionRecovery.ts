export function startConnectionRecovery(probe: (signal: AbortSignal) => Promise<boolean>, recovered: () => void) {
  let stopped = false;
  let controller: AbortController | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const check = async () => {
    controller = new AbortController();
    deadline = setTimeout(() => controller?.abort(), 10_000);
    try {
      if (await probe(controller.signal) && !stopped && !controller.signal.aborted) {
        stopped = true;
        recovered();
      }
    } catch {
      // Keep the warning during genuine failures; never replay a failed write here.
    } finally {
      clearTimeout(deadline);
      if (!stopped) timer = setTimeout(() => void check(), 15_000);
    }
  };
  timer = setTimeout(() => void check(), 1_000);
  return () => { stopped = true; clearTimeout(timer); clearTimeout(deadline); controller?.abort(); };
}
