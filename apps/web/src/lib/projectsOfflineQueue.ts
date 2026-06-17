import type { ProjectAttachmentType, ProjectBidStatus, ProjectRecordType, ProjectExecutionType, ProjectPriority, ProjectSource, UserRole } from "./api";
import {
  enqueueProjectAttachmentUpload as enqueueSharedProjectAttachmentUpload,
  enqueueProjectCreate,
  getOfflineSyncJobs,
  removeOfflineSyncJob,
  type OfflineSyncJob,
} from "./offlineSync";

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

function isProjectJob(job: OfflineSyncJob) {
  return job.payload.kind === "projectCreate" || job.payload.kind === "projectUpload";
}

function isProjectCreateJob(job: OfflineSyncJob): job is OfflineSyncJob & { payload: Extract<OfflineSyncJob["payload"], { kind: "projectCreate" }> } {
  return job.payload.kind === "projectCreate";
}

function isProjectUploadJob(job: OfflineSyncJob): job is OfflineSyncJob & { payload: Extract<OfflineSyncJob["payload"], { kind: "projectUpload" }> } {
  return job.payload.kind === "projectUpload";
}

function mapSharedJob(job: OfflineSyncJob): QueuedProjectCapture {
  if (isProjectCreateJob(job)) {
    return {
      id: job.id,
      createdAt: job.createdAt,
      job: {
        kind: "createRecord",
        recordInput: job.payload.input,
      },
      attachments: job.payload.files.map((file) => ({
        name: file.name,
        mimeType: file.mimeType,
        lastModified: file.lastModified,
        attachmentType: file.attachmentType,
        caption: file.caption,
        blob: file.blob,
      })),
    };
  }
  if (!isProjectUploadJob(job)) {
    throw new Error("Tried to map a non-project offline job as a project upload.");
  }
  return {
    id: job.id,
    createdAt: job.createdAt,
    job: {
      kind: "uploadAttachments",
      propertyId: job.payload.propertyId,
      recordId: job.payload.recordId,
      recordTitle: job.payload.recordTitle,
    },
    attachments: job.payload.files.map((file) => ({
      name: file.name,
      mimeType: file.mimeType,
      lastModified: file.lastModified,
      attachmentType: file.attachmentType,
      caption: file.caption,
      blob: file.blob,
    })),
  };
}

export async function listQueuedProjectCaptures() {
  const jobs = await getOfflineSyncJobs();
  return jobs
    .filter(isProjectJob)
    .map((job) => {
      if (isProjectCreateJob(job)) {
        return {
          id: job.id,
          createdAt: job.createdAt,
          propertyId: job.payload.input.propertyId,
          title: job.payload.input.title,
          kind: "createRecord" as const,
          fileCount: job.payload.files.length,
        };
      }
      if (!isProjectUploadJob(job)) {
        throw new Error("Unexpected non-project upload job in project queue.");
      }
      return {
        id: job.id,
        createdAt: job.createdAt,
        propertyId: job.payload.propertyId,
        title: job.payload.recordTitle,
        kind: "uploadAttachments" as const,
        fileCount: job.payload.files.length,
      };
    });
}

export async function getQueuedProjectCaptures() {
  const jobs = await getOfflineSyncJobs();
  return jobs.filter(isProjectJob).map(mapSharedJob);
}

export async function enqueueProjectCapture(input: {
  recordInput: ProjectRecordInput;
  files: File[];
  attachmentType?: ProjectAttachmentType;
  caption?: string | null;
}) {
  return enqueueProjectCreate(input);
}

export async function enqueueProjectAttachmentUpload(input: {
  propertyId: string;
  recordId: string;
  recordTitle: string;
  files: Array<{ file: File; attachmentType?: ProjectAttachmentType; caption?: string | null }>;
}) {
  return enqueueSharedProjectAttachmentUpload(input);
}

export async function removeQueuedProjectCapture(id: string) {
  await removeOfflineSyncJob(id);
}
