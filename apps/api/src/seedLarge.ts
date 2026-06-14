import { Prisma } from "@prisma/client";
import { computeDerivedFields } from "./lib/board.js";
import { prisma } from "./lib/prisma.js";

const requestedCount = Number.parseInt(process.env.LARGE_SEED_COUNT || "250", 10);
const count = Number.isFinite(requestedCount) ? Math.min(Math.max(requestedCount, 1), 10000) : 250;
const prefix = (process.env.LARGE_SEED_PREFIX || "LOAD").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "LOAD";
const DAY_MS = 24 * 60 * 60 * 1000;

function offsetDays(days: number) {
  return new Date(Date.now() + days * DAY_MS);
}

async function main() {
  const property = await prisma.property.findFirst({
    where: { isActive: true },
    include: { floorPlans: { where: { isActive: true }, orderBy: { code: "asc" }, take: 1 } },
    orderBy: { code: "asc" },
  });
  if (!property) throw new Error("No active property exists. Run the normal seed before generating load data.");

  const section = await prisma.boardSection.findFirst({
    where: { propertyId: property.id, sectionType: "MAKE_READY", isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (!section) throw new Error(`No active Make Ready section exists for ${property.code}.`);

  const floorPlan = property.floorPlans[0];
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, orderBy: { createdAt: "asc" } });
  const template = await prisma.checklistTemplate.findFirst({
    where: { OR: [{ propertyId: null }, { propertyId: property.id }] },
    include: { items: { orderBy: { sortOrder: "asc" }, take: 3 } },
  });
  const textField = await prisma.customField.findFirst({
    where: { module: "make-ready", isArchived: false, fieldType: "TEXT" },
    orderBy: { sortOrder: "asc" },
  });

  let created = 0;
  let skipped = 0;
  for (let index = 1; index <= count; index += 1) {
    const unitNumber = `${prefix}-${String(index).padStart(5, "0")}`;
    const existing = await prisma.makeReadyItem.findFirst({ where: { propertyId: property.id, itemName: unitNumber } });
    if (existing) {
      skipped += 1;
      continue;
    }
    const unit = await prisma.unit.upsert({
      where: { propertyId_number: { propertyId: property.id, number: unitNumber } },
      update: {},
      create: {
        propertyId: property.id,
        number: unitNumber,
        floorPlanId: floorPlan?.id ?? null,
        floorPlan: floorPlan?.code ?? "Synthetic Plan",
        squareFeet: floorPlan?.squareFeet ?? 900,
        bedrooms: floorPlan?.bedrooms ?? 2,
        bathrooms: floorPlan?.bathrooms ?? 2,
      },
    });
    const source = {
      propertyId: property.id,
      unitId: unit.id,
      boardGroup: section.key,
      itemName: unitNumber,
      unitNumber,
      floorPlan: unit.floorPlan,
      assignedTech: index % 3 === 0 ? admin?.fullName ?? null : null,
      vacancyStatus: index % 4 === 0 ? "VACANT LEASED NOT READY" : "VACANT NOT LEASED NOT READY",
      scopeLevel: index % 7 === 0 ? "MAJOR" : index % 3 === 0 ? "MEDIUM" : "LITE",
      vacatedDate: offsetDays(-(index % 60)),
      makeReadyDate: offsetDays((index % 18) - 8),
      moveInDate: offsetDays((index % 30) + 1),
      makeReadyStatus: index % 6 === 0 ? "DONE" : "LITE",
      completionStatus: index % 6 === 0 ? "YES" : "NO",
      pestStatus: index % 20 === 0 ? "ROACHES" : "NONE",
      floorsStatus: index % 12 === 0 ? "REPLACE CARPET" : "GOOD",
      paintStatus: index % 10 === 0 ? "FULL PAINT" : "GOOD",
    };
    const item = await prisma.makeReadyItem.create({ data: { ...source, ...computeDerivedFields(source) } });
    if (admin && index % 10 === 0) {
      await prisma.itemComment.create({
        data: {
          itemId: item.id,
          propertyId: property.id,
          authorUserId: admin.id,
          authorName: admin.fullName,
          category: "SEED",
          body: "Synthetic load-test update for board performance validation.",
        },
      });
    }
    if (template && index % 12 === 0 && template.items.length > 0) {
      await prisma.checklistInstance.create({
        data: {
          itemId: item.id,
          propertyId: property.id,
          templateId: template.id,
          name: template.name,
          items: {
            create: template.items.map((task, taskIndex) => ({
              title: task.label,
              notes: task.notes,
              required: task.required,
              sortOrder: taskIndex,
              completed: taskIndex === 0 && index % 24 === 0,
              completedAt: taskIndex === 0 && index % 24 === 0 ? new Date() : null,
              completedById: taskIndex === 0 && index % 24 === 0 ? admin?.id ?? null : null,
            })),
          },
        },
      });
    }
    if (textField && index % 15 === 0) {
      await prisma.customFieldValue.create({
        data: { customFieldId: textField.id, itemId: item.id, value: "Synthetic load verification" as Prisma.InputJsonValue },
      });
    }
    created += 1;
  }
  console.log(`Large seed completed for ${property.code}: requested=${count} created=${created} skipped=${skipped} prefix=${prefix}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
