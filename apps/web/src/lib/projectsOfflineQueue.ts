import type { ProjectAttachmentType, ProjectBidStatus, ProjectRecordType, ProjectExecutionType, ProjectPriority, ProjectSource, UserRole } from "./api";

const databaseName = "makereadyos-projects-offline";
const databaseVersion = 1;
const storeName = "captures";

type ProjectRecordInput = {
  propertyId: string;
  recordType: ProjectRecordType;
  title: string;
  description?: string | null;
  source?: ProjectSource | null;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  sourceRecordLabel?: string | null;
  status: string;
  priority?: ProjectPriority;
  executionType?: ProjectExecutionType;
  categoryId?: string | null;
  building?: string | null;
  area?: string | null;
  locationNotes?: string | null;
  propertyMapId?: string | null;
  pinX?: number | null;
  pinY?: number | null;
  estimatedQuantity?: number | null;
  quantityUnit?: string | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  totalAmount?: number | null;
  deferredMaintenance?: boolean;
  deferredReason?: string | null;
  targetYear?: number | null;
  deferredNotes?: string | null;
  budgetYear?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  bidStatus?: ProjectBidStatus | null;
  bidNotes?: string | null;
  assignedUserId?: string | null;
  assignedRole?: UserRole | null;
  assignedTeam?: string | null;
  scheduledDate?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  completedDate?: string | null;
  tags?: string[];
};

type QueuedAttachment = {
  name: string;
  mimeType: string;
  lastModified: number;
  attachmentType: ProjectAttachmentType;
  caption: string | null;
  blob: Blob;
};

type CreateRecordJob = {
  kind: "createRecord";
  recordInput: ProjectRecordInput;
};

type UploadAttachmentsJob = {
  kind: "uploadAttachments";
  propertyId: string;
  recordId: string;
  recordTitle: string;
};

type QueueJob = CreateRecordJob | UploadAttachmentsJob;

export type QueuedProjectCapture = {
  id: string;
  createdAt: string;
  job: QueueJob;
  attachments: QueuedAttachment[];
};

export type QueuedProjectCaptureSummary = {
  id: string;
  createdAt: string;
  propertyId: string;
  title: string;
  kind: QueueJob["kind"];
  fileCount: number;
};

function databaseUnavailable() {
  return typeof indexedDB === "undefined";
}

function openDatabase() {
  if (databaseUnavailable()) {
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
    request.onerror = () => reject(request.error ?? new Error("Could not open offline Projects queue"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T> | T) {
  const database = await openDatabase();
  if (!database) {
    if (mode === "readonly") {
      return [] as unknown as T;
    }
    throw new Error("Browser storage is unavailable for offline project capture.");
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
        reject(transaction.error ?? new Error("Offline Projects queue transaction failed"));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error("Offline Projects queue transaction aborted"));
      };
    }).catch((error) => {
      database.close();
      reject(error);
    });
  });
}

function readAll(store: IDBObjectStore) {
  return new Promise<QueuedProjectCapture[]>((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as QueuedProjectCapture[]).sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
    request.onerror = () => reject(request.error ?? new Error("Could not load offline Projects queue"));
  });
}

function writeRecord(store: IDBObjectStore, record: QueuedProjectCapture) {
  return new Promise<void>((resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not save offline Projects capture"));
  });
}

function deleteRecord(store: IDBObjectStore, id: string) {
  return new Promise<void>((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not remove offline Projects capture"));
  });
}

function summarize(record: QueuedProjectCapture): QueuedProjectCaptureSummary {
  return {
    id: record.id,
    createdAt: record.createdAt,
    propertyId: record.job.kind === "createRecord" ? record.job.recordInput.propertyId : record.job.propertyId,
    title: record.job.kind === "createRecord" ? record.job.recordInput.title : record.job.recordTitle,
    kind: record.job.kind,
    fileCount: record.attachments.length,
  };
}

function buildAttachment(file: File, attachmentType: ProjectAttachmentType, caption?: string | null): QueuedAttachment {
  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    lastModified: file.lastModified,
    attachmentType,
    caption: caption ?? null,
    blob: file,
  };
}

export async function listQueuedProjectCaptures() {
  const records = await withStore("readonly", (store) => readAll(store));
  return records.map(summarize);
}

export async function getQueuedProjectCaptures() {
  return withStore("readonly", (store) => readAll(store));
}

export async function enqueueProjectCapture(input: {
  recordInput: ProjectRecordInput;
  files: File[];
  attachmentType?: ProjectAttachmentType;
  caption?: string | null;
}) {
  const record: QueuedProjectCapture = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `queued-${Date.now()}`,
    createdAt: new Date().toISOString(),
    job: {
      kind: "createRecord",
      recordInput: input.recordInput,
    },
    attachments: input.files.map((file) => buildAttachment(file, input.attachmentType ?? "GENERAL", input.caption)),
  };
  await withStore("readwrite", (store) => writeRecord(store, record));
  return summarize(record);
}

export async function enqueueProjectAttachmentUpload(input: {
  propertyId: string;
  recordId: string;
  recordTitle: string;
  files: Array<{ file: File; attachmentType?: ProjectAttachmentType; caption?: string | null }>;
}) {
  const record: QueuedProjectCapture = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `queued-${Date.now()}`,
    createdAt: new Date().toISOString(),
    job: {
      kind: "uploadAttachments",
      propertyId: input.propertyId,
      recordId: input.recordId,
      recordTitle: input.recordTitle,
    },
    attachments: input.files.map((entry) => buildAttachment(entry.file, entry.attachmentType ?? "GENERAL", entry.caption)),
  };
  await withStore("readwrite", (store) => writeRecord(store, record));
  return summarize(record);
}

export async function removeQueuedProjectCapture(id: string) {
  await withStore("readwrite", (store) => deleteRecord(store, id));
}
