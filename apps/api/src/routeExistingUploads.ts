import { access, mkdir, rename } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { prisma } from "./lib/prisma.js";
import { resolveStoredUploadPath, routedStoredName, uploadDir } from "./lib/uploadStorage.js";

type UploadRecord = {
  type: "attachment" | "propertyMap";
  id: string;
  propertyId: string;
  propertyCode: string;
  storedName: string;
  targetStoredName: string;
};

type MoveSummary = {
  checked: number;
  eligible: number;
  moved: number;
  skippedAlreadyRouted: number;
  skippedNoRoute: number;
  skippedNested: number;
  missingFiles: number;
  conflicts: number;
  errors: string[];
};

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function getOption(name: string) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function exists(storedName: string) {
  try {
    await access(resolveStoredUploadPath(storedName));
    return true;
  } catch {
    return false;
  }
}

function isNested(storedName: string) {
  return storedName.includes("/") || storedName.includes("\\");
}

async function buildRecords(propertyId?: string) {
  const records: UploadRecord[] = [];
  const attachments = await prisma.itemAttachment.findMany({
    where: { propertyId },
    include: {
      property: { select: { id: true, code: true, uploadStorageMode: true, uploadSubdir: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const attachment of attachments) {
    records.push({
      type: "attachment",
      id: attachment.id,
      propertyId: attachment.propertyId,
      propertyCode: attachment.property.code,
      storedName: attachment.storedName,
      targetStoredName: routedStoredName(attachment.property, basename(attachment.storedName)),
    });
  }

  const maps = await prisma.propertyMap.findMany({
    where: { propertyId, storedName: { not: null } },
    include: { property: { select: { id: true, code: true, uploadStorageMode: true, uploadSubdir: true } } },
    orderBy: { createdAt: "asc" },
  });

  for (const map of maps) {
    if (!map.storedName) continue;
    records.push({
      type: "propertyMap",
      id: map.id,
      propertyId: map.propertyId,
      propertyCode: map.property.code,
      storedName: map.storedName,
      targetStoredName: routedStoredName(map.property, basename(map.storedName)),
    });
  }

  return records;
}

async function moveRecord(record: UploadRecord) {
  const sourcePath = resolveStoredUploadPath(record.storedName);
  const targetPath = resolveStoredUploadPath(record.targetStoredName);
  await mkdir(dirname(targetPath), { recursive: true });
  await rename(sourcePath, targetPath);
  try {
    if (record.type === "attachment") {
      await prisma.itemAttachment.update({ where: { id: record.id }, data: { storedName: record.targetStoredName } });
    } else {
      await prisma.propertyMap.update({ where: { id: record.id }, data: { storedName: record.targetStoredName } });
    }
  } catch (error) {
    await rename(targetPath, sourcePath).catch(() => undefined);
    throw error;
  }
}

async function main() {
  if (hasFlag("-h") || hasFlag("--help")) {
    console.log("Usage: npm --prefix apps/api run uploads:route-existing -- [--apply] [--property-id PROPERTY_ID]");
    console.log("Dry-run is the default. Only root-level existing upload files are moved.");
    return;
  }

  const apply = hasFlag("--apply");
  const propertyId = getOption("--property-id");
  const records = await buildRecords(propertyId);
  const summary: MoveSummary = {
    checked: records.length,
    eligible: 0,
    moved: 0,
    skippedAlreadyRouted: 0,
    skippedNoRoute: 0,
    skippedNested: 0,
    missingFiles: 0,
    conflicts: 0,
    errors: [],
  };

  console.log(`Existing upload routing ${apply ? "apply" : "dry-run"} started: ${new Date().toISOString()}`);
  console.log(`Upload root: ${uploadDir}`);
  console.log(`Property filter: ${propertyId ?? "all routed properties"}`);
  console.log("");

  for (const record of records) {
    if (record.storedName === record.targetStoredName) {
      summary.skippedAlreadyRouted += 1;
      continue;
    }
    if (!record.targetStoredName.includes("/")) {
      summary.skippedNoRoute += 1;
      continue;
    }
    if (isNested(record.storedName)) {
      summary.skippedNested += 1;
      continue;
    }
    summary.eligible += 1;
    if (!(await exists(record.storedName))) {
      summary.missingFiles += 1;
      console.log(`MISSING ${record.type} ${record.id}: ${record.storedName}`);
      continue;
    }
    if (await exists(record.targetStoredName)) {
      summary.conflicts += 1;
      console.log(`CONFLICT ${record.type} ${record.id}: ${record.targetStoredName} already exists`);
      continue;
    }
    console.log(`${apply ? "MOVE" : "WOULD MOVE"} ${record.propertyCode} ${record.type} ${record.id}: ${record.storedName} -> ${record.targetStoredName}`);
    if (!apply) continue;
    try {
      await moveRecord(record);
      summary.moved += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push(`${record.type} ${record.id}: ${message}`);
    }
  }

  console.log("");
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
