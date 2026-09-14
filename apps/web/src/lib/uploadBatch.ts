export type UploadOutcome = { name: string; status: "UPLOADED" | "QUEUED" | "FAILED" | "UNCONFIRMED" | "NOT_ATTEMPTED"; message?: string };

export async function uploadBatch<T extends { name: string }>(files: T[], options: {
  current: () => boolean;
  upload: (file: T) => Promise<unknown>;
  queue: (file: T) => Promise<unknown>;
  errorStatus: (error: unknown) => number | undefined;
  progress: (outcomes: UploadOutcome[]) => void;
}) {
  const outcomes: UploadOutcome[] = [];
  let blocked = false;
  for (const file of files) {
    if (blocked || !options.current()) {
      outcomes.push({ name: file.name, status: "NOT_ATTEMPTED", message: "Upload stopped because account or access changed. Select this file again after checking access." });
    } else {
      try {
        await options.upload(file);
        outcomes.push({ name: file.name, status: "UPLOADED" });
      } catch (error) {
        const status = options.errorStatus(error);
        if (status === 0 && options.current()) {
          try {
            await options.queue(file);
            outcomes.push({ name: file.name, status: "QUEUED", message: "No server confirmation. Saved in this account's device queue for retry." });
          } catch (queueError) {
            outcomes.push({ name: file.name, status: "UNCONFIRMED", message: `No server confirmation and device retry storage failed. ${queueError instanceof Error ? queueError.message : "Could not store this file."} Check the gallery before retrying.` });
          }
        } else {
          const uncertain = status === undefined || status === 0 || status >= 500;
          outcomes.push({ name: file.name, status: uncertain ? "UNCONFIRMED" : "FAILED", message: uncertain
            ? "No server confirmation. Check the gallery before retrying; the server may already have stored this file."
            : error instanceof Error ? error.message : "Upload rejected. Select this file again after correcting the error." });
          blocked = status === 401 || status === 403 || status === 404;
        }
      }
    }
    if (options.current()) options.progress([...outcomes]);
  }
  return outcomes;
}
