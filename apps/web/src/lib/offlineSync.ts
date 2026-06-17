import {
  ApiError,
  createLeaseComplianceIssue,
  createPestIssue,
  createPoolLogEntry,
  createProjectRecord,
  completePreventiveMaintenanceTask,
  patchMakeReadyItem,
  skipPreventiveMaintenanceTask,
  uploadItemAttachment,
  uploadLeaseComplianceIssuePhoto,
  uploadPestIssueAttachment,
  uploadPoolLogAttachment,
  uploadPreventiveMaintenanceAttachment,
  uploadProjectAttachment,
  type LeaseCompliancePhotoCategory,
  type PestPhotoType,
  type PoolChemical,
  type PreventiveMaintenanceTaskAttachment,
  type ProjectAttachmentType,
} from "./api";

const databaseName = "makereadyos-offline-sync";
const databaseVersion = 1;
const storeName = "jobs";
const queueUpdatedEventName = "makereadyos:offline-queue-updated";

type QueuedBlob = {
  name: string;
  mimeType: string;
  lastModified: number;
  blob: Blob;
};

type QueuedProjectAttachment = QueuedBlob & {
  attachmentType: ProjectAttachmentType;
  caption: string | null;
};

type QueuedLeasePhoto = QueuedBlob & {
  photoCategory: LeaseCompliancePhotoCategory | null;
  caption: string | null;
};

type QueuedPestAttachment = QueuedBlob & {
  photoType: PestPhotoType | null;
  caption: string | null;
};

type QueuedCaptionedAttachment = QueuedBlob & {
  caption: string | null;
};

type OfflineSyncJobPayload =
  | {
      kind: "makeReadyPatch";
      itemId: string;
      data: Record<string, unknown>;
    }
  | {
      kind: "makeReadyUpload";
      itemId: string;
      files: QueuedBlob[];
    }
  | {
      kind: "projectCreate";
      input: Parameters<typeof createProjectRecord>[0];
      files: QueuedProjectAttachment[];
    }
  | {
      kind: "projectUpload";
      propertyId: string;
      recordId: string;
      recordTitle: string;
      files: QueuedProjectAttachment[];
    }
  | {
      kind: "leaseCreate";
      input: Parameters<typeof createLeaseComplianceIssue>[0];
      files: QueuedLeasePhoto[];
    }
  | {
      kind: "leaseUpload";
      issueId: string;
      files: QueuedLeasePhoto[];
    }
  | {
      kind: "pestCreate";
      input: Parameters<typeof createPestIssue>[0];
    }
  | {
      kind: "pestUpload";
      issueId: string;
      files: QueuedPestAttachment[];
    }
  | {
      kind: "poolCreate";
      input: Parameters<typeof createPoolLogEntry>[0];
    }
  | {
      kind: "poolUpload";
      entryId: string;
      files: QueuedBlob[];
    }
  | {
      kind: "pmComplete";
      taskId: string;
      input: Parameters<typeof completePreventiveMaintenanceTask>[1];
    }
  | {
      kind: "pmSkip";
      taskId: string;
      input: Parameters<typeof skipPreventiveMaintenanceTask>[1];
    }
  | {
      kind: "pmUpload";
      taskId: string;
      files: QueuedBlob[];
    };

export type OfflineSyncJob = {
  id: string;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  payload: OfflineSyncJobPayload;
};

export type OfflineSyncJobSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  kind: OfflineSyncJobPayload["kind"];
  module: "make-ready" | "projects" | "lease-compliance" | "pest" | "pool" | "pm";
  title: string;
  fileCount: number;
};

export type OfflineQueueState = {
  pendingCount: number;
  syncing: boolean;
};

let syncing = false;
let syncPromise: Promise<{ processed: number; synced: number; remaining: number }> | null = null;

function queueUnavailable() {
  return typeof indexedDB === "undefined";
}

function emitQueueState(state: OfflineQueueState) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OfflineQueueState>(queueUpdatedEventName, { detail: state }));
}

async function announceQueueState() {
  emitQueueState({ pendingCount: await getOfflineSyncPendingCount(), syncing });
}

function openDatabase() {
  if (queueUnavailable()) {
    return Promise.resolve<IDBDatabase | null>(null);
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline sync queue"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T> | T) {
  const database = await openDatabase();
  if (!database) {
    if (mode === "readonly") {
      return [] as unknown as T;
    }
    throw new Error("Browser storage is unavailable for offline sync.");
  }
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    Promise.resolve(work(store)).then((value) => {
      transaction.oncomplete = () => {
        database.close();
        resolve(value);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error("Offline sync queue transaction failed"));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error("Offline sync queue transaction aborted"));
      };
    }).catch((error) => {
      database.close();
      reject(error);
    });
  });
}

function readAll(store: IDBObjectStore) {
  return new Promise<OfflineSyncJob[]>((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as OfflineSyncJob[]).sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
    request.onerror = () => reject(request.error ?? new Error("Could not load offline sync jobs"));
  });
}

function writeJob(store: IDBObjectStore, job: OfflineSyncJob) {
  return new Promise<void>((resolve, reject) => {
    const request = store.put(job);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not save offline sync job"));
  });
}

function deleteJob(store: IDBObjectStore, id: string) {
  return new Promise<void>((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not remove offline sync job"));
  });
}

function buildBlob(file: File): QueuedBlob {
  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    lastModified: file.lastModified,
    blob: file,
  };
}

function restoreFile(file: QueuedBlob) {
  return new File([file.blob], file.name, { type: file.mimeType, lastModified: file.lastModified });
}

function jobTitle(payload: OfflineSyncJobPayload) {
  switch (payload.kind) {
    case "makeReadyPatch":
      return `Item ${payload.itemId}`;
    case "makeReadyUpload":
      return `Item ${payload.itemId} attachments`;
    case "projectCreate":
      return payload.input.title;
    case "projectUpload":
      return payload.recordTitle;
    case "leaseCreate":
      return payload.input.unitId || payload.input.area || payload.input.building || payload.input.issueTypeName || "Lease issue";
    case "leaseUpload":
      return `Lease issue ${payload.issueId}`;
    case "pestCreate":
      return payload.input.unitId || payload.input.area || payload.input.pestType || "Pest issue";
    case "pestUpload":
      return `Pest issue ${payload.issueId}`;
    case "poolCreate":
      return payload.input.facilityId || payload.input.propertyId;
    case "poolUpload":
      return `Pool entry ${payload.entryId}`;
    case "pmComplete":
    case "pmSkip":
    case "pmUpload":
      return `PM task ${payload.taskId}`;
  }
}

function jobModule(payload: OfflineSyncJobPayload): OfflineSyncJobSummary["module"] {
  switch (payload.kind) {
    case "makeReadyPatch":
    case "makeReadyUpload":
      return "make-ready";
    case "projectCreate":
    case "projectUpload":
      return "projects";
    case "leaseCreate":
    case "leaseUpload":
      return "lease-compliance";
    case "pestCreate":
    case "pestUpload":
      return "pest";
    case "poolCreate":
    case "poolUpload":
      return "pool";
    case "pmComplete":
    case "pmSkip":
    case "pmUpload":
      return "pm";
  }
}

function jobFileCount(payload: OfflineSyncJobPayload) {
  switch (payload.kind) {
    case "makeReadyUpload":
    case "projectCreate":
    case "projectUpload":
    case "leaseCreate":
    case "leaseUpload":
    case "pestUpload":
    case "poolUpload":
    case "pmUpload":
      return payload.files.length;
    default:
      return 0;
  }
}

function summarize(job: OfflineSyncJob): OfflineSyncJobSummary {
  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    attemptCount: job.attemptCount,
    lastAttemptAt: job.lastAttemptAt,
    lastError: job.lastError,
    kind: job.payload.kind,
    module: jobModule(job.payload),
    title: jobTitle(job.payload),
    fileCount: jobFileCount(job.payload),
  };
}

function buildJob(payload: OfflineSyncJobPayload): OfflineSyncJob {
  const now = new Date().toISOString();
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `offline-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    payload,
  };
}

function isNetworkError(error: unknown) {
  return error instanceof ApiError && error.status === 0;
}

async function updateFailedJob(job: OfflineSyncJob, error: unknown) {
  const failed: OfflineSyncJob = {
    ...job,
    updatedAt: new Date().toISOString(),
    attemptCount: job.attemptCount + 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: error instanceof Error ? error.message : String(error),
  };
  await withStore("readwrite", (store) => writeJob(store, failed));
}

async function syncJob(job: OfflineSyncJob) {
  switch (job.payload.kind) {
    case "makeReadyPatch":
      await patchMakeReadyItem(job.payload.itemId, job.payload.data);
      return;
    case "makeReadyUpload":
      for (const file of job.payload.files) {
        await uploadItemAttachment(job.payload.itemId, restoreFile(file));
      }
      return;
    case "projectCreate": {
      const { record } = await createProjectRecord(job.payload.input);
      for (const file of job.payload.files) {
        await uploadProjectAttachment(record.id, restoreFile(file), file.attachmentType, file.caption ?? undefined);
      }
      return;
    }
    case "projectUpload":
      for (const file of job.payload.files) {
        await uploadProjectAttachment(job.payload.recordId, restoreFile(file), file.attachmentType, file.caption ?? undefined);
      }
      return;
    case "leaseCreate": {
      const { issue } = await createLeaseComplianceIssue(job.payload.input);
      for (const file of job.payload.files) {
        await uploadLeaseComplianceIssuePhoto(issue.id, restoreFile(file), {
          photoCategory: file.photoCategory ?? undefined,
          caption: file.caption ?? undefined,
        });
      }
      return;
    }
    case "leaseUpload":
      for (const file of job.payload.files) {
        await uploadLeaseComplianceIssuePhoto(job.payload.issueId, restoreFile(file), {
          photoCategory: file.photoCategory ?? undefined,
          caption: file.caption ?? undefined,
        });
      }
      return;
    case "pestCreate":
      await createPestIssue(job.payload.input);
      return;
    case "pestUpload":
      for (const file of job.payload.files) {
        await uploadPestIssueAttachment(job.payload.issueId, restoreFile(file), {
          photoType: file.photoType ?? undefined,
          caption: file.caption ?? undefined,
        });
      }
      return;
    case "poolCreate":
      await createPoolLogEntry(job.payload.input);
      return;
    case "poolUpload":
      for (const file of job.payload.files) {
        await uploadPoolLogAttachment(job.payload.entryId, restoreFile(file));
      }
      return;
    case "pmComplete":
      await completePreventiveMaintenanceTask(job.payload.taskId, job.payload.input);
      return;
    case "pmSkip":
      await skipPreventiveMaintenanceTask(job.payload.taskId, job.payload.input);
      return;
    case "pmUpload":
      for (const file of job.payload.files) {
        await uploadPreventiveMaintenanceAttachment(job.payload.taskId, restoreFile(file));
      }
      return;
  }
}

async function enqueue(payload: OfflineSyncJobPayload) {
  const job = buildJob(payload);
  await withStore("readwrite", (store) => writeJob(store, job));
  await announceQueueState();
  return summarize(job);
}

export async function listOfflineSyncJobs() {
  const jobs = await withStore("readonly", (store) => readAll(store));
  return jobs.map(summarize);
}

export async function getOfflineSyncJobs() {
  return withStore("readonly", (store) => readAll(store));
}

export async function getOfflineSyncPendingCount() {
  const jobs = await withStore("readonly", (store) => readAll(store));
  return jobs.length;
}

export async function removeOfflineSyncJob(id: string) {
  await withStore("readwrite", (store) => deleteJob(store, id));
  await announceQueueState();
}

export function getOfflineSyncEventName() {
  return queueUpdatedEventName;
}

export async function syncOfflineJobs() {
  if (syncPromise) {
    return syncPromise;
  }
  syncPromise = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { processed: 0, synced: 0, remaining: await getOfflineSyncPendingCount() };
    }
    syncing = true;
    await announceQueueState();
    try {
      let processed = 0;
      let syncedCount = 0;
      const jobs = await getOfflineSyncJobs();
      for (const job of jobs) {
        try {
          await syncJob(job);
          await withStore("readwrite", (store) => deleteJob(store, job.id));
          processed += 1;
          syncedCount += 1;
        } catch (error) {
          await updateFailedJob(job, error);
          if (isNetworkError(error)) {
            break;
          }
        }
      }
      return { processed, synced: syncedCount, remaining: await getOfflineSyncPendingCount() };
    } finally {
      syncing = false;
      syncPromise = null;
      await announceQueueState();
    }
  })();
  return syncPromise;
}

export async function enqueueMakeReadyPatch(itemId: string, data: Record<string, unknown>) {
  return enqueue({ kind: "makeReadyPatch", itemId, data });
}

export async function enqueueMakeReadyAttachmentUpload(itemId: string, files: File[]) {
  return enqueue({
    kind: "makeReadyUpload",
    itemId,
    files: files.map((file) => buildBlob(file)),
  });
}

export async function enqueueProjectCreate(input: {
  recordInput: Parameters<typeof createProjectRecord>[0];
  files: File[];
  attachmentType?: ProjectAttachmentType;
  caption?: string | null;
}) {
  return enqueue({
    kind: "projectCreate",
    input: input.recordInput,
    files: input.files.map((file) => ({
      ...buildBlob(file),
      attachmentType: input.attachmentType ?? "GENERAL",
      caption: input.caption ?? null,
    })),
  });
}

export async function enqueueProjectAttachmentUpload(input: {
  propertyId: string;
  recordId: string;
  recordTitle: string;
  files: Array<{ file: File; attachmentType?: ProjectAttachmentType; caption?: string | null }>;
}) {
  return enqueue({
    kind: "projectUpload",
    propertyId: input.propertyId,
    recordId: input.recordId,
    recordTitle: input.recordTitle,
    files: input.files.map((entry) => ({
      ...buildBlob(entry.file),
      attachmentType: entry.attachmentType ?? "GENERAL",
      caption: entry.caption ?? null,
    })),
  });
}

export async function enqueueLeaseCreate(input: Parameters<typeof createLeaseComplianceIssue>[0], files: Array<{ file: File; photoCategory?: LeaseCompliancePhotoCategory; caption?: string | null }> = []) {
  return enqueue({
    kind: "leaseCreate",
    input,
    files: files.map((entry) => ({
      ...buildBlob(entry.file),
      photoCategory: entry.photoCategory ?? null,
      caption: entry.caption ?? null,
    })),
  });
}

export async function enqueueLeaseUpload(issueId: string, files: Array<{ file: File; photoCategory?: LeaseCompliancePhotoCategory; caption?: string | null }> = []) {
  return enqueue({
    kind: "leaseUpload",
    issueId,
    files: files.map((entry) => ({
      ...buildBlob(entry.file),
      photoCategory: entry.photoCategory ?? null,
      caption: entry.caption ?? null,
    })),
  });
}

export async function enqueuePestCreate(input: Parameters<typeof createPestIssue>[0]) {
  return enqueue({ kind: "pestCreate", input });
}

export async function enqueuePestUpload(issueId: string, files: Array<{ file: File; photoType?: PestPhotoType; caption?: string | null }> = []) {
  return enqueue({
    kind: "pestUpload",
    issueId,
    files: files.map((entry) => ({
      ...buildBlob(entry.file),
      photoType: entry.photoType ?? null,
      caption: entry.caption ?? null,
    })),
  });
}

export async function enqueuePoolCreate(input: Parameters<typeof createPoolLogEntry>[0]) {
  return enqueue({ kind: "poolCreate", input });
}

export async function enqueuePoolUpload(entryId: string, files: File[]) {
  return enqueue({
    kind: "poolUpload",
    entryId,
    files: files.map((file) => buildBlob(file)),
  });
}

export async function enqueuePmComplete(taskId: string, input: Parameters<typeof completePreventiveMaintenanceTask>[1]) {
  return enqueue({ kind: "pmComplete", taskId, input });
}

export async function enqueuePmSkip(taskId: string, input: Parameters<typeof skipPreventiveMaintenanceTask>[1]) {
  return enqueue({ kind: "pmSkip", taskId, input });
}

export async function enqueuePmUpload(taskId: string, files: File[]) {
  return enqueue({
    kind: "pmUpload",
    taskId,
    files: files.map((file) => buildBlob(file)),
  });
}
