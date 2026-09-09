import {
  ApiError,
  attachChecklist,
  createLeaseComplianceIssue,
  createItemComment,
  createPestIssue,
  createPoolLogEntry,
  createProjectRecord,
  completePreventiveMaintenanceTask,
  deleteItemComment,
  patchMakeReadyItem,
  skipPreventiveMaintenanceTask,
  updateChecklistItem,
  updateItemComment,
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
import { getVerifiedSession, isCurrentSession, type VerifiedSession } from "./verifiedSession";

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
      inspectionStage?: "INITIAL_WALK";
      itemId: string;
      files: QueuedBlob[];
    }
  | {
      kind: "makeReadyCommentCreate";
      itemId: string;
      body: string;
    }
  | {
      kind: "makeReadyCommentUpdate";
      itemId: string;
      commentId: string;
      body: string;
    }
  | {
      kind: "makeReadyCommentDelete";
      itemId: string;
      commentId: string;
    }
  | {
      kind: "makeReadyChecklistAttach";
      itemId: string;
      templateId: string;
    }
  | {
      kind: "makeReadyChecklistUpdate";
      itemId?: string;
      checklistItemId: string;
      input: Parameters<typeof updateChecklistItem>[1];
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
      propertyId?: string;
      files: QueuedLeasePhoto[];
    }
  | {
      kind: "pestCreate";
      input: Parameters<typeof createPestIssue>[0];
      files: QueuedPestAttachment[];
    }
  | {
      kind: "pestUpload";
      issueId: string;
      propertyId?: string;
      files: QueuedPestAttachment[];
    }
  | {
      kind: "poolCreate";
      input: Parameters<typeof createPoolLogEntry>[0];
    }
  | {
      kind: "poolUpload";
      entryId: string;
      propertyId?: string;
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
      propertyId?: string;
      files: QueuedBlob[];
    };

export type OfflineSyncJob = {
  ownerUserId?: string;
  id: string;
  serverRecordId?: string;
  deliveryComplete?: boolean;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastErrorStatus: number | null;
  payload: OfflineSyncJobPayload;
};

export type OfflineSyncJobSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastErrorStatus: number | null;
  kind: OfflineSyncJobPayload["kind"];
  module: "make-ready" | "projects" | "lease-compliance" | "pest" | "pool" | "pm";
  title: string;
  fileCount: number;
  status: "pending" | "retrying" | "blocked";
  nextRetryAt: string | null;
};

export type OfflineQueueState = {
  ownerUserId: string | null;
  pendingCount: number;
  syncing: boolean;
};

let syncing = false;
let syncingSession: VerifiedSession | null = null;
let syncPromise: Promise<{ processed: number; synced: number; remaining: number }> | null = null;
const jobDeliveries = new Map<string, { session: VerifiedSession; promise: Promise<boolean> }>();
const retryDelaysMs = [0, 5000, 15000, 30000, 60000];

function queueUnavailable() {
  return typeof indexedDB === "undefined";
}

function emitQueueState(state: OfflineQueueState) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OfflineQueueState>(queueUpdatedEventName, { detail: state }));
}

async function announceQueueState() {
  const session = getVerifiedSession();
  const pendingCount = await getOfflineSyncPendingCount();
  if (isCurrentSession(session)) emitQueueState({ ownerUserId: session.userId, pendingCount, syncing: syncing && syncingSession === session });
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
    case "makeReadyCommentCreate":
      return `Item ${payload.itemId} comment`;
    case "makeReadyCommentUpdate":
      return `Item ${payload.itemId} comment update`;
    case "makeReadyCommentDelete":
      return `Item ${payload.itemId} comment remove`;
    case "makeReadyChecklistAttach":
      return `Item ${payload.itemId} checklist attach`;
    case "makeReadyChecklistUpdate":
      return payload.itemId ? `Item ${payload.itemId} checklist item ${payload.checklistItemId}` : `Checklist item ${payload.checklistItemId}`;
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
    case "makeReadyCommentCreate":
    case "makeReadyCommentUpdate":
    case "makeReadyCommentDelete":
    case "makeReadyChecklistAttach":
    case "makeReadyChecklistUpdate":
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
    case "pestCreate":
    case "pestUpload":
    case "poolUpload":
    case "pmUpload":
      return payload.files.length;
    default:
      return 0;
  }
}

function summarize(job: OfflineSyncJob): OfflineSyncJobSummary {
  const retrying = job.lastErrorStatus === 0 && Boolean(job.lastAttemptAt);
  const blocked = Boolean(job.lastErrorStatus) && job.lastErrorStatus !== 0;
  const delayIndex = Math.min(Math.max(job.attemptCount, 0), retryDelaysMs.length - 1);
  const nextRetryAt = retrying && job.lastAttemptAt
    ? new Date(new Date(job.lastAttemptAt).getTime() + retryDelaysMs[delayIndex]).toISOString()
    : null;
  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    attemptCount: job.attemptCount,
    lastAttemptAt: job.lastAttemptAt,
    lastError: job.lastError,
    lastErrorStatus: job.lastErrorStatus,
    kind: job.payload.kind,
    module: jobModule(job.payload),
    title: jobTitle(job.payload),
    fileCount: jobFileCount(job.payload),
    status: blocked ? "blocked" : retrying ? "retrying" : "pending",
    nextRetryAt,
  };
}

function buildJob(ownerUserId: string, payload: OfflineSyncJobPayload): OfflineSyncJob {
  const now = new Date().toISOString();
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") throw new Error("This browser cannot safely create offline work IDs.");
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID()
    : `offline-${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("")}`;
  return {
    ownerUserId,
    id,
    createdAt: now,
    updatedAt: now,
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    lastErrorStatus: null,
    payload,
  };
}

function isNetworkError(error: unknown) {
  return error instanceof ApiError && error.status === 0;
}

function automaticRetryDelayMs(job: OfflineSyncJob) {
  const delayIndex = Math.min(Math.max(job.attemptCount, 0), retryDelaysMs.length - 1);
  return retryDelaysMs[delayIndex];
}

function shouldAttemptAutomaticSync(job: OfflineSyncJob, now = Date.now()) {
  if (job.lastErrorStatus && job.lastErrorStatus !== 0) return false;
  if (job.lastErrorStatus === 0 && job.lastAttemptAt) {
    const nextRetryAt = new Date(job.lastAttemptAt).getTime() + automaticRetryDelayMs(job);
    return now >= nextRetryAt;
  }
  return true;
}

async function updateFailedJob(job: OfflineSyncJob, error: unknown) {
  const failed: OfflineSyncJob = {
    ...job,
    updatedAt: new Date().toISOString(),
    attemptCount: job.attemptCount + 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: error instanceof Error ? error.message : String(error),
    lastErrorStatus: error instanceof ApiError ? error.status : null,
  };
  await withStore("readwrite", (store) => writeJob(store, failed));
}

async function checkpointJob(job: OfflineSyncJob) {
  job.updatedAt = new Date().toISOString();
  await withStore("readwrite", (store) => writeJob(store, job));
}

async function uploadQueuedFiles<T extends QueuedBlob>(job: OfflineSyncJob, payload: { files: T[] }, upload: (file: T) => Promise<unknown>) {
  while (payload.files.length) {
    if (getVerifiedSession().userId !== job.ownerUserId) throw new ApiError(409, "Sign in with the account that saved this work before retrying.");
    await upload(payload.files[0]);
    payload.files = payload.files.slice(1);
    await checkpointJob(job);
  }
}

async function syncJob(job: OfflineSyncJob) {
  if (!job.ownerUserId || getVerifiedSession().userId !== job.ownerUserId) {
    throw new ApiError(409, "Sign in with the account that saved this work before retrying.");
  }
  const account = { expectedUserId: job.ownerUserId };
  switch (job.payload.kind) {
    case "makeReadyPatch":
      await patchMakeReadyItem(job.payload.itemId, job.payload.data, account);
      return;
    case "makeReadyUpload": {
      const payload = job.payload;
      await uploadQueuedFiles(job, payload, file => uploadItemAttachment(payload.itemId, restoreFile(file), payload.inspectionStage, account));
      return;
    }
    case "makeReadyCommentCreate":
      await createItemComment(job.payload.itemId, job.payload.body, account);
      return;
    case "makeReadyCommentUpdate":
      await updateItemComment(job.payload.itemId, job.payload.commentId, job.payload.body, account);
      return;
    case "makeReadyCommentDelete":
      await deleteItemComment(job.payload.itemId, job.payload.commentId, account);
      return;
    case "makeReadyChecklistAttach":
      await attachChecklist(job.payload.itemId, job.payload.templateId, account);
      return;
    case "makeReadyChecklistUpdate":
      await updateChecklistItem(job.payload.checklistItemId, job.payload.input, account);
      return;
    case "projectCreate": {
      if (!job.serverRecordId) {
        const { record } = await createProjectRecord(job.payload.input, account);
        job.serverRecordId = record.id;
        await checkpointJob(job);
      }
      await uploadQueuedFiles(job, job.payload, file => uploadProjectAttachment(job.serverRecordId!, restoreFile(file), file.attachmentType, file.caption ?? undefined, account));
      return;
    }
    case "projectUpload": {
      const payload = job.payload;
      await uploadQueuedFiles(job, payload, file => uploadProjectAttachment(payload.recordId, restoreFile(file), file.attachmentType, file.caption ?? undefined, account));
      return;
    }
    case "leaseCreate": {
      if (!job.serverRecordId) {
        const { issue } = await createLeaseComplianceIssue(job.payload.input, account);
        job.serverRecordId = issue.id;
        await checkpointJob(job);
      }
      await uploadQueuedFiles(job, job.payload, file => uploadLeaseComplianceIssuePhoto(job.serverRecordId!, restoreFile(file), { photoCategory: file.photoCategory ?? undefined, caption: file.caption ?? undefined }, account));
      return;
    }
    case "leaseUpload": {
      const payload = job.payload;
      await uploadQueuedFiles(job, payload, file => uploadLeaseComplianceIssuePhoto(payload.issueId, restoreFile(file), { photoCategory: file.photoCategory ?? undefined, caption: file.caption ?? undefined }, account));
      return;
    }
    case "pestCreate": {
      if (!job.serverRecordId) {
        const { issue } = await createPestIssue(job.payload.input, account);
        job.serverRecordId = issue.id;
        await checkpointJob(job);
      }
      await uploadQueuedFiles(job, job.payload, file => uploadPestIssueAttachment(job.serverRecordId!, restoreFile(file), { photoType: file.photoType ?? undefined, caption: file.caption ?? undefined }, account));
      return;
    }
    case "pestUpload": {
      const payload = job.payload;
      await uploadQueuedFiles(job, payload, file => uploadPestIssueAttachment(payload.issueId, restoreFile(file), { photoType: file.photoType ?? undefined, caption: file.caption ?? undefined }, account));
      return;
    }
    case "poolCreate":
      await createPoolLogEntry(job.payload.input, account);
      return;
    case "poolUpload": {
      const payload = job.payload;
      await uploadQueuedFiles(job, payload, file => uploadPoolLogAttachment(payload.entryId, restoreFile(file), account));
      return;
    }
    case "pmComplete":
      await completePreventiveMaintenanceTask(job.payload.taskId, job.payload.input, account);
      return;
    case "pmSkip":
      await skipPreventiveMaintenanceTask(job.payload.taskId, job.payload.input, account);
      return;
    case "pmUpload": {
      const payload = job.payload;
      await uploadQueuedFiles(job, payload, file => uploadPreventiveMaintenanceAttachment(payload.taskId, restoreFile(file), account));
      return;
    }
  }
}

async function enqueue(ownerUserId: string, payload: OfflineSyncJobPayload) {
  if (typeof ownerUserId !== "string" || !ownerUserId.trim()) throw new Error("The account that started this work is required.");
  // Keep the initiating owner even if the session changed during a failed upload.
  const job = buildJob(ownerUserId, payload);
  await withStore("readwrite", (store) => writeJob(store, job));
  await announceQueueState();
  return summarize(job);
}

export async function listOfflineSyncJobs() {
  const jobs = await getOfflineSyncJobs();
  return jobs.map(summarize);
}

export async function getOfflineSyncJobs() {
  const session = getVerifiedSession();
  if (!session.userId) return [];
  const jobs = await withStore("readonly", (store) => readAll(store));
  return isCurrentSession(session) ? jobs.filter(job => job.ownerUserId === session.userId) : [];
}

export async function hasUnattributedOfflineWork() {
  const session = getVerifiedSession();
  if (!session.userId) return false;
  const jobs = await withStore("readonly", (store) => readAll(store));
  return isCurrentSession(session) && jobs.some(job => typeof job.ownerUserId !== "string" || !job.ownerUserId.trim());
}

export async function getOfflineSyncJob(id: string) {
  const jobs = await getOfflineSyncJobs();
  return jobs.find((job) => job.id === id) ?? null;
}

export async function getOfflineSyncPendingCount() {
  const jobs = await getOfflineSyncJobs();
  return jobs.length;
}

export async function removeOfflineSyncJob(id: string) {
  const session = getVerifiedSession();
  if (!session.userId || jobDeliveries.has(id)) return false;
  const removed = await withStore("readwrite", async store => {
    const jobs = await readAll(store);
    if (!isCurrentSession(session) || !jobs.some(job => job.id === id && job.ownerUserId === session.userId) || jobDeliveries.has(id)) return false;
    await deleteJob(store, id);
    return true;
  });
  await announceQueueState();
  return removed;
}

export function getOfflineSyncEventName() {
  return queueUpdatedEventName;
}

function deliverQueuedJob(id: string) {
  const session = getVerifiedSession();
  if (!session.userId) return Promise.resolve(false);
  const pending = jobDeliveries.get(id);
  if (pending) return pending.session === session ? pending.promise : Promise.resolve(false);
  const delivery = Promise.resolve().then(async () => {
    // Re-read after acquiring the lock; another attempt may have removed the job.
    const job = await getOfflineSyncJob(id);
    if (!job || !isCurrentSession(session)) return false;
    try {
      if (!job.deliveryComplete) {
        await syncJob(job);
        job.deliveryComplete = true;
        await checkpointJob(job);
      }
      await withStore("readwrite", (store) => deleteJob(store, id));
      return isCurrentSession(session);
    } catch (error) {
      await updateFailedJob(job, error);
      throw error;
    }
  }).finally(() => { jobDeliveries.delete(id); });
  jobDeliveries.set(id, { session, promise: delivery });
  return delivery;
}

export async function syncOfflineJobs(): Promise<{ processed: number; synced: number; remaining: number }> {
  const session = getVerifiedSession();
  if (!session.userId) return { processed: 0, synced: 0, remaining: 0 };
  if (syncPromise) {
    await syncPromise;
    return isCurrentSession(session) ? syncOfflineJobs() : { processed: 0, synced: 0, remaining: 0 };
  }
  syncPromise = Promise.resolve().then(async () => {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return { processed: 0, synced: 0, remaining: await getOfflineSyncPendingCount() };
      }
      syncing = true;
      syncingSession = session;
      await announceQueueState();
      let processed = 0;
      let syncedCount = 0;
      const jobs = await getOfflineSyncJobs();
      const now = Date.now();
      for (const job of jobs) {
        if (!isCurrentSession(session)) break;
        if (!shouldAttemptAutomaticSync(job, now)) {
          continue;
        }
        try {
          if (await deliverQueuedJob(job.id)) {
            processed += 1;
            syncedCount += 1;
          }
        } catch (error) {
          if (isNetworkError(error)) {
            break;
          }
        }
      }
      return { processed: isCurrentSession(session) ? processed : 0, synced: isCurrentSession(session) ? syncedCount : 0, remaining: await getOfflineSyncPendingCount() };
    } finally {
      syncing = false;
      syncingSession = null;
    }
  }).finally(async () => {
    // Release the shared lock even if offline checks or IndexedDB access fail.
    syncPromise = null;
    await announceQueueState();
  });
  return syncPromise;
}

export async function retryOfflineSyncJob(id: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: false, remaining: await getOfflineSyncPendingCount() };
  }
  try {
    const synced = await deliverQueuedJob(id);
    await announceQueueState();
    return { synced, remaining: await getOfflineSyncPendingCount() };
  } catch (error) {
    await announceQueueState();
    throw error;
  }
}

export async function enqueueMakeReadyPatch(ownerUserId: string, itemId: string, data: Record<string, unknown>) {
  return enqueue(ownerUserId, { kind: "makeReadyPatch", itemId, data });
}

export async function enqueueMakeReadyAttachmentUpload(ownerUserId: string, itemId: string, files: File[], inspectionStage?: "INITIAL_WALK") {
  return enqueue(ownerUserId, {
    kind: "makeReadyUpload",
    inspectionStage,
    itemId,
    files: files.map((file) => buildBlob(file)),
  });
}

export async function enqueueMakeReadyCommentCreate(ownerUserId: string, itemId: string, body: string) {
  return enqueue(ownerUserId, { kind: "makeReadyCommentCreate", itemId, body });
}

export async function enqueueMakeReadyCommentUpdate(ownerUserId: string, itemId: string, commentId: string, body: string) {
  return enqueue(ownerUserId, { kind: "makeReadyCommentUpdate", itemId, commentId, body });
}

export async function enqueueMakeReadyCommentDelete(ownerUserId: string, itemId: string, commentId: string) {
  return enqueue(ownerUserId, { kind: "makeReadyCommentDelete", itemId, commentId });
}

export async function enqueueMakeReadyChecklistAttach(ownerUserId: string, itemId: string, templateId: string) {
  return enqueue(ownerUserId, { kind: "makeReadyChecklistAttach", itemId, templateId });
}

export async function enqueueMakeReadyChecklistUpdate(ownerUserId: string, itemId: string, checklistItemId: string, input: Parameters<typeof updateChecklistItem>[1]) {
  return enqueue(ownerUserId, { kind: "makeReadyChecklistUpdate", itemId, checklistItemId, input });
}

export async function enqueueProjectCreate(ownerUserId: string, input: {
  recordInput: Parameters<typeof createProjectRecord>[0];
  files: File[];
  attachmentType?: ProjectAttachmentType;
  caption?: string | null;
}) {
  return enqueue(ownerUserId, {
    kind: "projectCreate",
    input: input.recordInput,
    files: input.files.map((file) => ({
      ...buildBlob(file),
      attachmentType: input.attachmentType ?? "GENERAL",
      caption: input.caption ?? null,
    })),
  });
}

export async function enqueueProjectAttachmentUpload(ownerUserId: string, input: {
  propertyId: string;
  recordId: string;
  recordTitle: string;
  files: Array<{ file: File; attachmentType?: ProjectAttachmentType; caption?: string | null }>;
}) {
  return enqueue(ownerUserId, {
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

export async function enqueueLeaseCreate(ownerUserId: string, input: Parameters<typeof createLeaseComplianceIssue>[0], files: Array<{ file: File; photoCategory?: LeaseCompliancePhotoCategory; caption?: string | null }> = []) {
  return enqueue(ownerUserId, {
    kind: "leaseCreate",
    input,
    files: files.map((entry) => ({
      ...buildBlob(entry.file),
      photoCategory: entry.photoCategory ?? null,
      caption: entry.caption ?? null,
    })),
  });
}

export async function enqueueLeaseUpload(ownerUserId: string, issueId: string, propertyId: string | undefined, files: Array<{ file: File; photoCategory?: LeaseCompliancePhotoCategory; caption?: string | null }> = []) {
  return enqueue(ownerUserId, {
    kind: "leaseUpload",
    issueId,
    propertyId,
    files: files.map((entry) => ({
      ...buildBlob(entry.file),
      photoCategory: entry.photoCategory ?? null,
      caption: entry.caption ?? null,
    })),
  });
}

export async function enqueuePestCreate(ownerUserId: string, input: Parameters<typeof createPestIssue>[0], files: Array<{ file: File; photoType?: PestPhotoType; caption?: string | null }> = []) {
  return enqueue(ownerUserId, {
    kind: "pestCreate",
    input,
    files: files.map((entry) => ({
      ...buildBlob(entry.file),
      photoType: entry.photoType ?? null,
      caption: entry.caption ?? null,
    })),
  });
}

export async function enqueuePestUpload(ownerUserId: string, issueId: string, propertyId: string | undefined, files: Array<{ file: File; photoType?: PestPhotoType; caption?: string | null }> = []) {
  return enqueue(ownerUserId, {
    kind: "pestUpload",
    issueId,
    propertyId,
    files: files.map((entry) => ({
      ...buildBlob(entry.file),
      photoType: entry.photoType ?? null,
      caption: entry.caption ?? null,
    })),
  });
}

export async function enqueuePoolCreate(ownerUserId: string, input: Parameters<typeof createPoolLogEntry>[0]) {
  return enqueue(ownerUserId, { kind: "poolCreate", input });
}

export async function enqueuePoolUpload(ownerUserId: string, entryId: string, propertyId: string | undefined, files: File[]) {
  return enqueue(ownerUserId, {
    kind: "poolUpload",
    entryId,
    propertyId,
    files: files.map((file) => buildBlob(file)),
  });
}

export async function enqueuePmComplete(ownerUserId: string, taskId: string, input: Parameters<typeof completePreventiveMaintenanceTask>[1]) {
  return enqueue(ownerUserId, { kind: "pmComplete", taskId, input });
}

export async function enqueuePmSkip(ownerUserId: string, taskId: string, input: Parameters<typeof skipPreventiveMaintenanceTask>[1]) {
  return enqueue(ownerUserId, { kind: "pmSkip", taskId, input });
}

export async function enqueuePmUpload(ownerUserId: string, taskId: string, propertyId: string | undefined, files: File[]) {
  return enqueue(ownerUserId, {
    kind: "pmUpload",
    taskId,
    propertyId,
    files: files.map((file) => buildBlob(file)),
  });
}
