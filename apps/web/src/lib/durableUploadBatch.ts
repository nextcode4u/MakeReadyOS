import type { UploadOutcome } from "./uploadBatch";

/** Commit every selected file to device storage before starting this batch's network delivery. */
export async function durableUploadBatch<T extends { name: string }>(files: T[], options: {
  current: () => boolean;
  save: (file: T) => Promise<{ id: string }>;
  deliver: (id: string) => Promise<{ synced: boolean }>;
  progress: (outcomes: UploadOutcome[]) => void;
}) {
  const outcomes: UploadOutcome[] = [];
  const jobs: Array<{ id: string; index: number }> = [];
  const notify = () => { if (options.current()) options.progress([...outcomes]); };
  for (const file of files) {
    if (!options.current()) {
      outcomes.push({ name: file.name, status: "NOT_ATTEMPTED", message: "Account changed. Select this file again with the correct account." });
    } else {
      try {
        const job = await options.save(file);
        jobs.push({ id: job.id, index: outcomes.length });
        outcomes.push({ jobId: job.id, name: file.name, status: "QUEUED", message: "Pending upload. Saved on this device, not yet confirmed by the server." });
      } catch {
        outcomes.push({ name: file.name, status: "FAILED", message: "Could not save this file on the device. Nothing was sent. Check storage and select it again." });
      }
    }
    notify();
  }
  for (const job of jobs) {
    if (!options.current()) break;
    const row = outcomes[job.index];
    outcomes[job.index] = { ...row, status: "UPLOADING", message: "Uploading. A retry copy remains on this device until confirmation." };
    notify();
    try {
      const result = await options.deliver(job.id);
      outcomes[job.index] = result.synced ? { name: row.name, status: "UPLOADED", message: "Saved. The server confirmed this attachment." } : row;
    } catch (error) {
      const networkFailure = typeof error === "object" && error !== null && "status" in error && error.status === 0;
      outcomes[job.index] = { ...row, message: networkFailure
        ? "Pending upload. Saved on this device; it will retry when the connection is available. Do not select this file again."
        : `Saved on this device; upload not confirmed. ${error instanceof Error ? error.message : "Check pending uploads before retrying."}` };
    }
    notify();
  }
  return outcomes;
}
