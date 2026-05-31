import { Prisma, UserRole } from "@prisma/client";
import { authConfig } from "./lib/config.js";
import { hashPassword } from "./lib/password.js";
import { prisma } from "./lib/prisma.js";
import { computeDerivedFields } from "./lib/board.js";
import { evaluateAndPersistItemRisk } from "./lib/risk.js";

const labelSeed = {
  vacancyStatus: [
    ["VACANT", "#46d39c", "#06291c"],
    ["VACANT LEASED", "#4bd58e", "#06291c"],
    ["OCCUPIED", "#e86a7f", "#2d0912"],
    ["TO WALK", "#2d92c9", "#eaf7ff"],
    ["NTV", "#ffb357", "#371900"],
    ["NTV LEASED", "#ffcc80", "#371900"],
  ],
  completionStatus: [
    ["YES", "#46d39c", "#06291c"],
    ["NO", "#8d93a8", "#f4f6fa"],
  ],
  sheetrockStatus: [
    ["GOOD", "#46d39c", "#06291c"],
    ["SMALL REPAIRS", "#ffc673", "#3a1f00"],
    ["MEDIUM REPAIRS", "#e86a7f", "#2d0912"],
    ["MAJOR REPAIRS", "#58a6de", "#041f31"],
    ["TEXTURE ONLY", "#bf8dff", "#1e0a35"],
  ],
  pestStatus: [
    ["NONE", "#46d39c", "#06291c"],
    ["ROACHES", "#ffc673", "#3a1f00"],
    ["ANTS", "#e86a7f", "#2d0912"],
    ["BED BUGS", "#58a6de", "#041f31"],
    ["FLEAS", "#bf8dff", "#1e0a35"],
  ],
  pestTreated: [
    ["", "#8d93a8", "#f4f6fa"],
    ["TREATED", "#4fae7f", "#05170f"],
  ],
  trashOutStatus: [
    ["DONE", "#46d39c", "#06291c"],
    ["TINY", "#ffc673", "#3a1f00"],
    ["MEDIUM", "#e86a7f", "#2d0912"],
    ["MAJOR", "#58a6de", "#041f31"],
    ["XXXL!!", "#bf8dff", "#1e0a35"],
  ],
  floorsStatus: [
    ["GOOD", "#46d39c", "#06291c"],
    ["CLEAN CARPETS", "#ffc673", "#3a1f00"],
    ["REPAIR PLANK", "#e86a7f", "#2d0912"],
    ["REPLACE CARPET", "#58a6de", "#041f31"],
    ["REPAIR ALL", "#4fae7f", "#05170f"],
    ["REPAIR CARPET", "#bf8dff", "#1e0a35"],
  ],
  makeReadyStatus: [
    ["DONE", "#46d39c", "#06291c"],
    ["EASY", "#58a6de", "#041f31"],
    ["LITE", "#bf8dff", "#1e0a35"],
    ["MEDIUM", "#ffc673", "#3a1f00"],
    ["MAJOR", "#e86a7f", "#2d0912"],
  ],
  cleaningStatus: [
    ["DONE", "#46d39c", "#06291c"],
    ["LITE", "#58a6de", "#041f31"],
    ["MEDIUM", "#ffc673", "#3a1f00"],
    ["MAJOR", "#e86a7f", "#2d0912"],
  ],
  keysMadeStatus: [
    ["MADE", "#b9df61", "#1d2900"],
    ["WORK ORDER IN", "#46d39c", "#06291c"],
    ["STUCK", "#e86a7f", "#2d0912"],
  ],
  cabinetsStatus: [
    ["GOOD", "#46d39c", "#06291c"],
    ["SMALL REPAIRS", "#ffc673", "#3a1f00"],
    ["MAJOR REPAIRS", "#e86a7f", "#2d0912"],
    ["JUST PAINT", "#58a6de", "#041f31"],
    ["DELAMINATION", "#bf8dff", "#1e0a35"],
  ],
  countertopsStatus: [
    ["GOOD", "#46d39c", "#06291c"],
    ["SMALL REPAIRS", "#ffc673", "#3a1f00"],
    ["NEED REPLACEMENT", "#e86a7f", "#2d0912"],
    ["HAVE", "#58a6de", "#041f31"],
    ["STOCK", "#bf8dff", "#1e0a35"],
  ],
  appliancesStatus: [
    ["GOOD", "#46d39c", "#06291c"],
    ["APPLICABLE", "#ffc673", "#3a1f00"],
    ["NOT APPLICABLE", "#8d93a8", "#f4f6fa"],
  ],
  paintStatus: [
    ["GOOD", "#46d39c", "#06291c"],
    ["MAJOR TU", "#ffc673", "#3a1f00"],
    ["FULL PAINT", "#e86a7f", "#2d0912"],
    ["MED TU", "#58a6de", "#041f31"],
    ["LITE TU", "#bf8dff", "#1e0a35"],
    ["TOUCH UP", "#4fae7f", "#05170f"],
  ],
  doorsStatus: [
    ["GOOD", "#46d39c", "#06291c"],
    ["NEEDS PAINT", "#ffc673", "#3a1f00"],
    ["NEED REPLACEMENT", "#e86a7f", "#2d0912"],
  ],
  moveInFlag: [
    ["YES", "#46d39c", "#06291c"],
    ["NO", "#8d93a8", "#f4f6fa"],
  ],
  scopeLevel: [
    ["EASY", "#58a6de", "#041f31"],
    ["LITE", "#bf8dff", "#1e0a35"],
    ["MEDIUM", "#ffc673", "#3a1f00"],
    ["MAJOR", "#e86a7f", "#2d0912"],
  ],
} as const;

const columnSeed = [
  ["unitNumber", "Item"], ["floorPlan", "Floor Plan"], ["applicant", "Applicant"], ["moveOutDate", "NTV / Expected Vacate"],
  ["vacancyStatus", "Vacancy"], ["vacatedDate", "Vacated"], ["daysVacant", "Days Vacant"], ["assignedTech", "Assigned"],
  ["scopeLevel", "Scope"], ["makeReadyDate", "Make Ready"], ["moveInDate", "Move-In"], ["paintStatus", "Paint"],
  ["doorsStatus", "Doors"], ["completionStatus", "Completed"], ["sheetrockStatus", "Sheetrock"], ["pestStatus", "Pest"],
  ["pestTreated", "Pest Treated"], ["trashOutStatus", "Trash Out"], ["floorsStatus", "Floors"], ["flooringDate", "Flooring Date"],
  ["makeReadyStatus", "Make Ready Scope"], ["cleaningStatus", "Cleaning"], ["keysMadeStatus", "Keys Made"], ["cabinetsStatus", "Cabinets"],
  ["countertopsStatus", "Countertops"], ["appliancesStatus", "Appliances"], ["notes", "Notes"],
] as const;

const scheduleTrackSeed = [
  ["moveOutDate", "NTV / Notice to Vacate", "STATUS"],
  ["vacatedDate", "Vacated", "STATUS"],
  ["makeReadyDate", "Make Ready", "STATUS"],
  ["moveInDate", "Move-In", "STATUS"],
  ["flooringDate", "Flooring", "STATUS"],
  ["vendorScheduledDate", "Vendor Scheduled", "NEUTRAL"],
  ["vendorDueDate", "Vendor Due", "NEUTRAL"],
] as const;

type SeedChecklistTemplate = {
  name: string;
  scope: string;
  items: readonly (readonly [label: string, tradeCategory: string])[];
};

const makeReadyQaChecklistTemplates = [
  {
    name: "Make Ready QA - Resident Front Sheet",
    scope: "QA_RESIDENT",
    items: [
      ["Pre-walk and documentation completed", "GENERAL"],
      ["All left-behind items removed", "GENERAL"],
      ["Lights, outlets, switches, breakers, and exterior lighting checked", "SAFETY"],
      ["Smoke and carbon monoxide detectors functional and in service life", "SAFETY"],
      ["HVAC operational, filter replaced, spare filter left if required", "HVAC"],
      ["Water heater operational with no leaks or corrosion", "PLUMBING"],
      ["Windows and doors open, close, lock, and seal properly", "GENERAL"],
      ["Flooring, walls, paint, trim, shelves, rods, and brackets finished", "MAKE_READY"],
      ["Kitchen appliances, sink, disposal, cabinets, and drawers checked", "KITCHEN"],
      ["Bathroom drains, fixtures, caulk/grout, fans, and cabinets checked", "BATHROOM"],
      ["Living areas, bedrooms, fans, coverings, and screens checked", "INTERIOR"],
      ["Pest concerns cleared or preventive treatment completed if required", "PEST"],
      ["Final clean completed; unit odor-free and move-in ready", "CLEANING"],
      ["Locks/rekey, mailbox, keys/codes/tags, remotes, and required copies ready", "KEYS"],
      ["Final supervisor walk completed and sign-off ready", "QC"],
    ],
  },
  {
    name: "Make Ready QA - Internal Scope & Follow-Up",
    scope: "QA_INTERNAL",
    items: [
      [
        "Scope unit first with blue painter's tape; label tape with the needed part, size, location, or note, and pull tape only after the concern is corrected",
        "SCOPE",
      ],
      ["Record make-ready work still needed", "MAKE_READY"],
      ["Record cleaning work still needed", "CLEANING"],
      ["Record trash-out work still needed", "TRASH_OUT"],
      ["Record painting/sheetrock work still needed", "PAINT"],
      ["Record parts needed with size/location notes", "PARTS"],
      ["Record material needed for orders or pending upgrades", "MATERIALS"],
      ["Record rework/follow-up items for office or supervisor handoff", "QC"],
      ["Record general notes that should stay internal", "NOTES"],
      ["Confirm all tape is pulled before the unit is marked ready", "QC"],
    ],
  },
] as const satisfies readonly SeedChecklistTemplate[];

async function ensureChecklistTemplate(template: SeedChecklistTemplate) {
  const existing = await prisma.checklistTemplate.findFirst({
    where: { propertyId: null, name: template.name },
    include: { items: true },
  });
  if (existing) {
    if (existing.items.length === 0) {
      await prisma.checklistItem.createMany({
        data: template.items.map(([label, tradeCategory], sortOrder) => ({
          templateId: existing.id,
          label,
          tradeCategory,
          sortOrder,
          required: true,
        })),
      });
    }
    return;
  }
  await prisma.checklistTemplate.create({
    data: {
      name: template.name,
      scope: template.scope,
      items: {
        create: template.items.map(([label, tradeCategory], sortOrder) => ({
          label,
          tradeCategory,
          sortOrder,
          required: true,
        })),
      },
    },
  });
}

async function ensureDefaultChecklistTemplates() {
  await ensureChecklistTemplate({
    name: "Standard Make Ready",
    scope: "TURN",
    items: [
      ["Trash out and inspect", "MAKE_READY"],
      ["Complete scheduled paint and flooring work", "TURN"],
      ["Final clean, keys, and finish photos", "QC"],
    ],
  });
  for (const template of makeReadyQaChecklistTemplates) {
    await ensureChecklistTemplate(template);
  }
}

function d(date: string) {
  return new Date(`${date}T12:00:00.000Z`);
}

function defaultSections(propertyId: string, code: string) {
  const entries = code === "TA"
    ? [["READY_UNITS_TA", "READY", "Ready Units"], ["MAKE_READY_BOARD_TA", "MAKE_READY", "Make Ready"], ["DOWN_AND_MODELS", "DOWN", "Down Units"], ["ARCHIVE_TA", "ARCHIVE", "Archive"]]
    : code === "VAB"
      ? [["READY_UNITS_VAB", "READY", "Ready Units"], ["MAKE_READY_BOARD_VAB", "MAKE_READY", "Make Ready"], ["VAB_DOWN_UNITS", "DOWN", "Down Units"], ["ARCHIVE_VAB", "ARCHIVE", "Archive"]]
      : [[`${code}_READY_UNITS`, "READY", "Ready Units"], [`${code}_MAKE_READY`, "MAKE_READY", "Make Ready"], [`${code}_DOWN_UNITS`, "DOWN", "Down Units"], [`${code}_ARCHIVE`, "ARCHIVE", "Archive"]];
  return entries.map(([key, sectionType, displayName], sortOrder) => ({ propertyId, key, sectionType, displayName, sortOrder }));
}

async function main() {
  const adminPasswordHash = await hashPassword(authConfig.adminPassword);
  const existingAdmin = await prisma.user.findUnique({
    where: { email: authConfig.adminEmail },
  });
  let adminUserId: string;

  if (existingAdmin) {
    const updated = await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
    adminUserId = updated.id;
  } else {
    const created = await prisma.user.create({
      data: {
        email: authConfig.adminEmail,
        passwordHash: adminPasswordHash,
        fullName: "Default Admin",
        role: UserRole.ADMIN,
      },
    });
    adminUserId = created.id;
  }

  let demoTechUserId: string | null = null;
  let demoLeasingUserId: string | null = null;
  let demoCleanerUserId: string | null = null;
  if (authConfig.demoTechEmail && authConfig.demoTechPassword) {
    const demoTechPasswordHash = await hashPassword(authConfig.demoTechPassword);
    const existingTech = await prisma.user.findUnique({
      where: { email: authConfig.demoTechEmail },
    });

    if (existingTech) {
      const updated = await prisma.user.update({
        where: { id: existingTech.id },
        data: {
          passwordHash: demoTechPasswordHash,
          fullName: "Demo Tech",
          role: UserRole.TECH,
          isActive: true,
        },
      });
      demoTechUserId = updated.id;
    } else {
      const created = await prisma.user.create({
        data: {
          email: authConfig.demoTechEmail,
          passwordHash: demoTechPasswordHash,
          fullName: "Demo Tech",
          role: UserRole.TECH,
        },
      });
      demoTechUserId = created.id;
    }
  }

  const optionalDemoUsers = [
    { email: authConfig.demoLeasingEmail, password: authConfig.demoLeasingPassword, fullName: "Demo Leasing", role: UserRole.LEASING },
    { email: authConfig.demoCleanerEmail, password: authConfig.demoCleanerPassword, fullName: "Demo Cleaner", role: UserRole.CLEANER },
  ];
  for (const demoUser of optionalDemoUsers) {
    if (!demoUser.email || !demoUser.password) continue;
    const passwordHash = await hashPassword(demoUser.password);
    const existing = await prisma.user.findUnique({ where: { email: demoUser.email } });
    const saved = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash, fullName: demoUser.fullName, role: demoUser.role, isActive: true },
        })
      : await prisma.user.create({
          data: { email: demoUser.email, passwordHash, fullName: demoUser.fullName, role: demoUser.role },
        });
    if (demoUser.role === UserRole.LEASING) demoLeasingUserId = saved.id;
    if (demoUser.role === UserRole.CLEANER) demoCleanerUserId = saved.id;
  }

  await prisma.boardColumnDefinition.createMany({
    data: columnSeed.map(([fieldKey, label]) => ({ fieldKey, label })),
    skipDuplicates: true,
  });
  await prisma.boardColumnDefinition.updateMany({
    where: { fieldKey: "vacatedDate", label: "Vacated / Possession" },
    data: { label: "Vacated" },
  });
  await prisma.scheduleTrack.createMany({
    data: scheduleTrackSeed.map(([sourceField, displayName, colorBasis], sortOrder) => ({
      sourceField,
      displayName,
      colorBasis,
      sortOrder,
    })),
    skipDuplicates: true,
  });
  await prisma.scheduleTrack.updateMany({
    where: { sourceField: "vacatedDate", displayName: "Vacated / Possession" },
    data: { displayName: "Vacated" },
  });
  await ensureDefaultChecklistTemplates();

  const existingProperties = await prisma.property.count();
  if (existingProperties > 0) {
    const existingPropertyRows = await prisma.property.findMany({ select: { id: true, code: true } });
    for (const property of existingPropertyRows) {
      await prisma.boardSection.createMany({ data: defaultSections(property.id, property.code), skipDuplicates: true });
    }
    await prisma.notification.upsert({
      where: { userId_dedupeKey: { userId: adminUserId, dedupeKey: "seed:admin:operations-inbox" } },
      create: {
        userId: adminUserId, category: "AUTOMATION_WARNING", title: "Operations inbox ready",
        message: "Notifications surface assignments, date risk, and automation attention items.", dedupeKey: "seed:admin:operations-inbox",
      },
      update: {},
    });
    if (demoTechUserId) {
      const properties = await prisma.property.findMany({
        select: { id: true },
      });
      await prisma.userPropertyAccess.createMany({
        data: properties.map((property) => ({
          userId: demoTechUserId!,
          propertyId: property.id,
          role: UserRole.TECH,
        })),
        skipDuplicates: true,
      });
    }

    const existingViews = await prisma.savedView.count();
    if (existingViews === 0) {
      await prisma.savedView.createMany({
        data: [
          {
            ownerUserId: adminUserId,
            name: "All Make Readies",
            module: "make-ready",
            viewType: "table",
            filters: {},
            sorts: { key: "moveInDate", direction: "asc" },
            grouping: Prisma.DbNull,
            isShared: true,
            isDefault: true,
          },
          {
            ownerUserId: adminUserId,
            name: "Move-Ins This Week",
            module: "make-ready",
            viewType: "calendar",
            filters: { moveInThisWeek: true },
            sorts: { key: "moveInDate", direction: "asc" },
            grouping: { calendarField: "moveInDate" },
            isShared: true,
          },
          {
            ownerUserId: adminUserId,
            name: "Overdue Make Readies",
            module: "make-ready",
            viewType: "table",
            filters: { overdueOnly: true },
            sorts: { key: "makeReadyDate", direction: "asc" },
            isShared: true,
          },
          {
            ownerUserId: adminUserId,
            name: "Major Scope",
            module: "make-ready",
            viewType: "kanban",
            filters: { scopeLevel: "MAJOR" },
            sorts: { key: "priority", direction: "desc" },
            grouping: { kanbanBy: "assignedTech" },
            isShared: true,
          },
          {
            ownerUserId: adminUserId,
            name: "By Property",
            module: "make-ready",
            viewType: "kanban",
            filters: {},
            sorts: { key: "moveInDate", direction: "asc" },
            grouping: { kanbanBy: "property" },
            isShared: true,
          },
        ],
      });
    }
    return;
  }

  for (const [fieldKey, values] of Object.entries(labelSeed)) {
    await prisma.labelDefinition.createMany({
      data: values.map(([value, color, textColor], index) => ({
        fieldKey,
        value,
        color,
        textColor,
        sortOrder: index,
      })),
    });
  }

  const [ta, vab] = await Promise.all([
    prisma.property.create({
      data: {
        name: "Town Arlington",
        code: "TA",
      },
    }),
    prisma.property.create({
      data: {
        name: "Vanderbilt at Brook",
        code: "VAB",
      },
    }),
  ]);
  await prisma.boardSection.createMany({ data: [...defaultSections(ta.id, ta.code), ...defaultSections(vab.id, vab.code)] });
  await prisma.notification.create({
    data: {
      userId: adminUserId, category: "AUTOMATION_WARNING", title: "Operations inbox ready",
      message: "Notifications surface assignments, date risk, and automation attention items.", dedupeKey: "seed:admin:operations-inbox",
    },
  });

  await prisma.floorPlan.createMany({
    data: [
      { propertyId: ta.id, name: "TA B1 2|2 1186SQFT", bedrooms: 2, bathrooms: 2, squareFeet: 1186 },
      { propertyId: ta.id, name: "TA B2 2|2 1246SQFT", bedrooms: 2, bathrooms: 2, squareFeet: 1246 },
      { propertyId: ta.id, name: "TA B3 2|2 1247SQFT", bedrooms: 2, bathrooms: 2, squareFeet: 1247 },
      { propertyId: ta.id, name: "TA C1 3|2 1344SQFT", bedrooms: 3, bathrooms: 2, squareFeet: 1344 },
      { propertyId: vab.id, name: "VAB C1 3|2.5 1535SQFT", bedrooms: 3, bathrooms: 2.5, squareFeet: 1535 },
      { propertyId: vab.id, name: "VAB C2 3|2.5 1636SQFT", bedrooms: 3, bathrooms: 2.5, squareFeet: 1636 },
      { propertyId: vab.id, name: "VAB C3 3|2.5B 1647SQFT", bedrooms: 3, bathrooms: 2.5, squareFeet: 1647 },
      { propertyId: vab.id, name: "VAB D1 4|2.5 1872SQFT", bedrooms: 4, bathrooms: 2.5, squareFeet: 1872 },
    ],
  });

  if (demoTechUserId) {
    await prisma.userPropertyAccess.createMany({
      data: [
        { userId: demoTechUserId, propertyId: ta.id, role: UserRole.TECH },
        { userId: demoTechUserId, propertyId: vab.id, role: UserRole.TECH },
      ],
      skipDuplicates: true,
    });
  }
  for (const demoAccess of [
    { userId: demoLeasingUserId, role: UserRole.LEASING },
    { userId: demoCleanerUserId, role: UserRole.CLEANER },
  ]) {
    if (!demoAccess.userId) continue;
    await prisma.userPropertyAccess.createMany({
      data: [
        { userId: demoAccess.userId, propertyId: ta.id, role: demoAccess.role },
        { userId: demoAccess.userId, propertyId: vab.id, role: demoAccess.role },
      ],
      skipDuplicates: true,
    });
  }

  await prisma.unit.createMany({
    data: [
      { propertyId: ta.id, number: "TA 081", floorPlan: "TA B1 2|2 1186SQFT", squareFeet: 1186, bedrooms: 2, bathrooms: 2 },
      { propertyId: ta.id, number: "TA 103", floorPlan: "TA B1 2|2 1186SQFT", squareFeet: 1186, bedrooms: 2, bathrooms: 2 },
      { propertyId: ta.id, number: "TA 124", floorPlan: "TA B1 2|2 1186SQFT", squareFeet: 1186, bedrooms: 2, bathrooms: 2 },
      { propertyId: ta.id, number: "TA 130", floorPlan: "TA B2 2|2 1246SQFT", squareFeet: 1246, bedrooms: 2, bathrooms: 2 },
      { propertyId: ta.id, number: "TA 161", floorPlan: "TA B1 2|2 1186SQFT", squareFeet: 1186, bedrooms: 2, bathrooms: 2 },
      { propertyId: ta.id, number: "TA 164", floorPlan: "TA C1 3|2 1344SQFT", squareFeet: 1344, bedrooms: 3, bathrooms: 2 },
      { propertyId: ta.id, number: "TA 180", floorPlan: "TA C1 3|2 1344SQFT", squareFeet: 1344, bedrooms: 3, bathrooms: 2 },
      { propertyId: ta.id, number: "TA 181", floorPlan: "TA B3 2|2 1247SQFT", squareFeet: 1247, bedrooms: 2, bathrooms: 2 },
      { propertyId: ta.id, number: "TA 222", floorPlan: "TA B3 2|2 1247SQFT", squareFeet: 1247, bedrooms: 2, bathrooms: 2 },
      { propertyId: ta.id, number: "TA 272", floorPlan: "TA B3 2|2 1247SQFT", squareFeet: 1247, bedrooms: 2, bathrooms: 2 },
      { propertyId: ta.id, number: "TA 284", floorPlan: "TA B3 2|2 1247SQFT", squareFeet: 1247, bedrooms: 2, bathrooms: 2 },
      { propertyId: vab.id, number: "VAB 2902E", floorPlan: "VAB C2 3|2.5 1636SQFT", squareFeet: 1636, bedrooms: 3, bathrooms: 2.5 },
      { propertyId: vab.id, number: "VAB 2920E", floorPlan: "VAB C1 3|2.5 1535SQFT", squareFeet: 1535, bedrooms: 3, bathrooms: 2.5 },
      { propertyId: vab.id, number: "VAB 2942E", floorPlan: "VAB D1 4|2.5 1872SQFT", squareFeet: 1872, bedrooms: 4, bathrooms: 2.5 },
      { propertyId: vab.id, number: "VAB 4106H", floorPlan: "VAB D1 4|2.5 1872SQFT", squareFeet: 1872, bedrooms: 4, bathrooms: 2.5 },
      { propertyId: vab.id, number: "VAB 4107F", floorPlan: "VAB D1 4|2.5 1872SQFT", squareFeet: 1872, bedrooms: 4, bathrooms: 2.5 },
      { propertyId: vab.id, number: "VAB 4108M", floorPlan: "VAB D1 4|2.5 1872SQFT", squareFeet: 1872, bedrooms: 4, bathrooms: 2.5 },
      { propertyId: vab.id, number: "VAB 4118R", floorPlan: "VAB C3 3|2.5B 1647SQFT", squareFeet: 1647, bedrooms: 3, bathrooms: 2.5 },
      { propertyId: vab.id, number: "VAB 4123H", floorPlan: "VAB C3 3|2.5B 1647SQFT", squareFeet: 1647, bedrooms: 3, bathrooms: 2.5 },
      { propertyId: vab.id, number: "VAB 4125F", floorPlan: "VAB C1 3|2.5 1535SQFT", squareFeet: 1535, bedrooms: 3, bathrooms: 2.5 },
      { propertyId: vab.id, number: "VAB 4126H", floorPlan: "VAB C3 3|2.5B 1647SQFT", squareFeet: 1647, bedrooms: 3, bathrooms: 2.5 },
    ],
  });

  const units = await prisma.unit.findMany();

  const byNumber = new Map(units.map((unit) => [unit.number, unit]));

  const items = [
    {
      propertyId: ta.id,
      unitId: byNumber.get("TA 284")?.id,
      boardGroup: "READY_UNITS_TA",
      itemName: "TA 284",
      unitNumber: "TA 284",
      floorPlan: "TA B3 2|2 1247SQFT",
      applicant: "OVERSTREET",
      vacancyStatus: "VACANT LEASED",
      vacatedDate: d("2025-12-31"),
      makeReadyDate: d("2026-01-01"),
      moveInDate: d("2026-01-06"),
      completionStatus: "YES",
      sheetrockStatus: "GOOD",
      pestStatus: "NONE",
      trashOutStatus: "DONE",
      floorsStatus: "GOOD",
      makeReadyStatus: "DONE",
      cleaningStatus: "DONE",
      keysMadeStatus: "MADE",
      cabinetsStatus: "GOOD",
      countertopsStatus: "GOOD",
      appliancesStatus: "GOOD",
      paintStatus: "GOOD",
      doorsStatus: "GOOD",
      assignedTech: "Marco",
      scopeLevel: "LITE",
    },
    {
      propertyId: ta.id,
      unitId: byNumber.get("TA 130")?.id,
      boardGroup: "READY_UNITS_TA",
      itemName: "TA 130",
      unitNumber: "TA 130",
      floorPlan: "TA B2 2|2 1246SQFT",
      applicant: "CECI",
      vacancyStatus: "VACANT LEASED",
      vacatedDate: d("2026-02-15"),
      makeReadyDate: d("2026-02-17"),
      moveInDate: d("2026-02-23"),
      completionStatus: "YES",
      sheetrockStatus: "GOOD",
      pestStatus: "NONE",
      trashOutStatus: "DONE",
      floorsStatus: "GOOD",
      makeReadyStatus: "DONE",
      cleaningStatus: "DONE",
      keysMadeStatus: "MADE",
      cabinetsStatus: "GOOD",
      countertopsStatus: "GOOD",
      appliancesStatus: "GOOD",
      paintStatus: "GOOD",
      doorsStatus: "GOOD",
      assignedTech: "Luis",
      scopeLevel: "EASY",
    },
    {
      propertyId: ta.id,
      unitId: byNumber.get("TA 081")?.id,
      boardGroup: "MAKE_READY_BOARD_TA",
      itemName: "TA 081",
      unitNumber: "TA 081",
      floorPlan: "TA B1 2|2 1186SQFT",
      vacancyStatus: "TO WALK",
      vacatedDate: d("2026-05-04"),
      makeReadyDate: d("2026-05-05"),
      moveInDate: d("2026-05-08"),
      paintStatus: "LITE TU",
      doorsStatus: "GOOD",
      completionStatus: "NO",
      sheetrockStatus: "GOOD",
      pestStatus: "NONE",
      trashOutStatus: "DONE",
      floorsStatus: "GOOD",
      makeReadyStatus: "LITE",
      cleaningStatus: "LITE",
      assignedTech: "Luis",
      scopeLevel: "LITE",
      notes: "Move-in soon. Keep cleaning cadence tight.",
    },
    {
      propertyId: ta.id,
      unitId: byNumber.get("TA 272")?.id,
      boardGroup: "MAKE_READY_BOARD_TA",
      itemName: "TA 272",
      unitNumber: "TA 272",
      floorPlan: "TA B3 2|2 1247SQFT",
      applicant: "CHAMBERS",
      vacancyStatus: "TO WALK",
      vacatedDate: d("2026-05-09"),
      makeReadyDate: d("2026-05-12"),
      moveInDate: d("2026-05-15"),
      paintStatus: "LITE TU",
      doorsStatus: "GOOD",
      completionStatus: "NO",
      sheetrockStatus: "GOOD",
      pestStatus: "NONE",
      trashOutStatus: "DONE",
      floorsStatus: "GOOD",
      makeReadyStatus: "EASY",
      cleaningStatus: "LITE",
      assignedTech: "Jose",
      scopeLevel: "LITE",
    },
    {
      propertyId: ta.id,
      unitId: byNumber.get("TA 161")?.id,
      boardGroup: "MAKE_READY_BOARD_TA",
      itemName: "TA 161",
      unitNumber: "TA 161",
      floorPlan: "TA B1 2|2 1186SQFT",
      vacancyStatus: "TO WALK",
      vacatedDate: d("2026-05-06"),
      makeReadyDate: d("2026-05-07"),
      moveInDate: d("2026-05-12"),
      paintStatus: "LITE TU",
      doorsStatus: "GOOD",
      completionStatus: "NO",
      sheetrockStatus: "GOOD",
      pestStatus: "NONE",
      trashOutStatus: "DONE",
      floorsStatus: "GOOD",
      makeReadyStatus: "EASY",
      cleaningStatus: "LITE",
      assignedTech: "Marco",
      scopeLevel: "LITE",
    },
    {
      propertyId: ta.id,
      unitId: byNumber.get("TA 164")?.id,
      boardGroup: "MAKE_READY_BOARD_TA",
      itemName: "TA 164",
      unitNumber: "TA 164",
      floorPlan: "TA C1 3|2 1344SQFT",
      vacancyStatus: "TO WALK",
      vacatedDate: d("2026-05-19"),
      makeReadyDate: d("2026-05-20"),
      moveInDate: d("2026-05-25"),
      completionStatus: "NO",
      sheetrockStatus: "GOOD",
      pestStatus: "NONE",
      trashOutStatus: "DONE",
      floorsStatus: "GOOD",
      makeReadyStatus: "MEDIUM",
      cleaningStatus: "LITE",
      assignedTech: "Andre",
      scopeLevel: "MEDIUM",
    },
    {
      propertyId: ta.id,
      unitId: byNumber.get("TA 124")?.id,
      boardGroup: "MAKE_READY_BOARD_TA",
      itemName: "TA 124",
      unitNumber: "TA 124",
      floorPlan: "TA B1 2|2 1186SQFT",
      vacancyStatus: "TO WALK",
      vacatedDate: d("2026-05-20"),
      makeReadyDate: d("2026-05-21"),
      moveInDate: d("2026-05-26"),
      completionStatus: "NO",
      sheetrockStatus: "GOOD",
      pestStatus: "NONE",
      trashOutStatus: "DONE",
      floorsStatus: "GOOD",
      makeReadyStatus: "EASY",
      cleaningStatus: "LITE",
      assignedTech: "Andre",
      scopeLevel: "EASY",
    },
    {
      propertyId: ta.id,
      unitId: byNumber.get("TA 222")?.id,
      boardGroup: "MAKE_READY_BOARD_TA",
      itemName: "TA 222",
      unitNumber: "TA 222",
      floorPlan: "TA B3 2|2 1247SQFT",
      applicant: "WILSON",
      vacancyStatus: "NTV",
      vacatedDate: d("2026-06-01"),
      makeReadyDate: d("2026-06-03"),
      moveInDate: d("2026-06-08"),
      completionStatus: "NO",
      paintStatus: "",
      assignedTech: "Marco",
      scopeLevel: "MAJOR",
      floorsStatus: "REPLACE CARPET",
      pestStatus: "ROACHES",
      notes: "Needs flooring date before final scheduling.",
    },
    {
      propertyId: ta.id,
      unitId: byNumber.get("TA 180")?.id,
      boardGroup: "MAKE_READY_BOARD_TA",
      itemName: "TA 180",
      unitNumber: "TA 180",
      floorPlan: "TA C1 3|2 1344SQFT",
      applicant: "WILLIAMS",
      vacancyStatus: "NTV",
      vacatedDate: d("2026-05-30"),
      makeReadyDate: d("2026-06-02"),
      moveInDate: d("2026-06-05"),
      completionStatus: "NO",
      paintStatus: "",
      assignedTech: "Luis",
      scopeLevel: "MEDIUM",
      floorsStatus: "GOOD",
      pestStatus: "NONE",
    },
    {
      propertyId: vab.id,
      unitId: byNumber.get("VAB 4125F")?.id,
      boardGroup: "READY_UNITS_VAB",
      itemName: "VAB 4125F",
      unitNumber: "VAB 4125F",
      floorPlan: "VAB C1 3|2.5 1535SQFT",
      vacancyStatus: "VACANT",
      vacatedDate: d("2026-01-13"),
      makeReadyDate: d("2026-01-28"),
      moveInDate: d("2026-02-04"),
      completionStatus: "YES",
      paintStatus: "GOOD",
      doorsStatus: "GOOD",
      sheetrockStatus: "GOOD",
      pestStatus: "NONE",
      trashOutStatus: "DONE",
      floorsStatus: "GOOD",
      makeReadyStatus: "DONE",
      cleaningStatus: "DONE",
      keysMadeStatus: "MADE",
      cabinetsStatus: "GOOD",
      countertopsStatus: "GOOD",
      appliancesStatus: "GOOD",
      assignedTech: "Luis",
      scopeLevel: "EASY",
    },
    {
      propertyId: vab.id,
      unitId: byNumber.get("VAB 4106H")?.id,
      boardGroup: "READY_UNITS_VAB",
      itemName: "VAB 4106H",
      unitNumber: "VAB 4106H",
      floorPlan: "VAB D1 4|2.5 1872SQFT",
      applicant: "EWOVAN",
      vacancyStatus: "VACANT LEASED",
      vacatedDate: d("2026-02-28"),
      makeReadyDate: d("2026-03-11"),
      moveInDate: d("2026-03-16"),
      completionStatus: "YES",
      paintStatus: "GOOD",
      doorsStatus: "GOOD",
      sheetrockStatus: "GOOD",
      pestStatus: "NONE",
      trashOutStatus: "DONE",
      floorsStatus: "GOOD",
      makeReadyStatus: "DONE",
      cleaningStatus: "DONE",
      keysMadeStatus: "MADE",
      cabinetsStatus: "GOOD",
      countertopsStatus: "GOOD",
      appliancesStatus: "GOOD",
      assignedTech: "Andre",
      scopeLevel: "EASY",
    },
    {
      propertyId: vab.id,
      unitId: byNumber.get("VAB 2942E")?.id,
      boardGroup: "READY_UNITS_VAB",
      itemName: "VAB 2942E",
      unitNumber: "VAB 2942E",
      floorPlan: "VAB D1 4|2.5 1872SQFT",
      vacancyStatus: "VACANT",
      vacatedDate: d("2026-04-27"),
      makeReadyDate: d("2026-04-28"),
      moveInDate: d("2026-05-03"),
      completionStatus: "YES",
      paintStatus: "GOOD",
      doorsStatus: "GOOD",
      sheetrockStatus: "GOOD",
      pestStatus: "NONE",
      trashOutStatus: "DONE",
      floorsStatus: "GOOD",
      makeReadyStatus: "DONE",
      cleaningStatus: "DONE",
      keysMadeStatus: "MADE",
      cabinetsStatus: "GOOD",
      countertopsStatus: "GOOD",
      appliancesStatus: "GOOD",
      assignedTech: "Marco",
      scopeLevel: "EASY",
    },
    {
      propertyId: vab.id,
      unitId: byNumber.get("VAB 4108M")?.id,
      boardGroup: "READY_UNITS_VAB",
      itemName: "VAB 4108M",
      unitNumber: "VAB 4108M",
      floorPlan: "VAB D1 4|2.5 1872SQFT",
      applicant: "ARORA",
      vacancyStatus: "VACANT",
      vacatedDate: d("2026-04-24"),
      makeReadyDate: d("2026-04-28"),
      moveInDate: d("2026-05-01"),
      completionStatus: "YES",
      paintStatus: "GOOD",
      doorsStatus: "GOOD",
      sheetrockStatus: "GOOD",
      pestStatus: "NONE",
      trashOutStatus: "DONE",
      floorsStatus: "GOOD",
      makeReadyStatus: "DONE",
      cleaningStatus: "DONE",
      keysMadeStatus: "MADE",
      cabinetsStatus: "GOOD",
      countertopsStatus: "GOOD",
      appliancesStatus: "GOOD",
      assignedTech: "Jose",
      scopeLevel: "LITE",
    },
    {
      propertyId: vab.id,
      unitId: byNumber.get("VAB 4107F")?.id,
      boardGroup: "READY_UNITS_VAB",
      itemName: "VAB 4107F",
      unitNumber: "VAB 4107F",
      floorPlan: "VAB D1 4|2.5 1872SQFT",
      applicant: "SMITH",
      vacancyStatus: "VACANT",
      vacatedDate: d("2026-05-11"),
      makeReadyDate: d("2026-05-13"),
      moveInDate: d("2026-05-18"),
      completionStatus: "YES",
      paintStatus: "GOOD",
      doorsStatus: "GOOD",
      sheetrockStatus: "GOOD",
      pestStatus: "NONE",
      trashOutStatus: "DONE",
      floorsStatus: "GOOD",
      makeReadyStatus: "DONE",
      cleaningStatus: "DONE",
      keysMadeStatus: "MADE",
      cabinetsStatus: "GOOD",
      countertopsStatus: "GOOD",
      appliancesStatus: "GOOD",
      assignedTech: "Andre",
      scopeLevel: "LITE",
    },
    {
      propertyId: vab.id,
      unitId: byNumber.get("VAB 2902E")?.id,
      boardGroup: "MAKE_READY_BOARD_VAB",
      itemName: "VAB 2902E",
      unitNumber: "VAB 2902E",
      floorPlan: "VAB C2 3|2.5 1636SQFT",
      applicant: "OKUO",
      vacancyStatus: "NTV",
      vacatedDate: d("2026-06-21"),
      makeReadyDate: d("2026-06-23"),
      moveInDate: d("2026-06-26"),
      completionStatus: "NO",
      assignedTech: "Jose",
      scopeLevel: "MEDIUM",
      floorsStatus: "GOOD",
      pestStatus: "NONE",
      notes: "Lease is set. Prep crew staged.",
    },
    {
      propertyId: vab.id,
      unitId: byNumber.get("VAB 2920E")?.id,
      boardGroup: "MAKE_READY_BOARD_VAB",
      itemName: "VAB 2920E",
      unitNumber: "VAB 2920E",
      floorPlan: "VAB C1 3|2.5 1535SQFT",
      applicant: "OKU",
      vacancyStatus: "NTV",
      vacatedDate: d("2026-06-11"),
      makeReadyDate: d("2026-06-16"),
      moveInDate: d("2026-06-19"),
      completionStatus: "NO",
      assignedTech: "Marco",
      scopeLevel: "MEDIUM",
      floorsStatus: "GOOD",
      pestStatus: "NONE",
    },
    {
      propertyId: vab.id,
      unitId: byNumber.get("VAB 4123H")?.id,
      boardGroup: "MAKE_READY_BOARD_VAB",
      itemName: "VAB 4123H",
      unitNumber: "VAB 4123H",
      floorPlan: "VAB C3 3|2.5B 1647SQFT",
      vacancyStatus: "NTV",
      vacatedDate: d("2026-06-03"),
      makeReadyDate: d("2026-06-09"),
      moveInDate: d("2026-06-12"),
      completionStatus: "NO",
      assignedTech: "Andre",
      scopeLevel: "MAJOR",
      floorsStatus: "REPLACE CARPET",
      pestStatus: "BED BUGS",
      notes: "Vendor coordination needed.",
    },
    {
      propertyId: vab.id,
      unitId: byNumber.get("VAB 4118R")?.id,
      boardGroup: "MAKE_READY_BOARD_VAB",
      itemName: "VAB 4118R",
      unitNumber: "VAB 4118R",
      floorPlan: "VAB C3 3|2.5B 1647SQFT",
      vacancyStatus: "NTV",
      vacatedDate: d("2026-05-28"),
      makeReadyDate: d("2026-05-28"),
      moveInDate: d("2026-06-02"),
      completionStatus: "NO",
      assignedTech: "Luis",
      scopeLevel: "LITE",
      floorsStatus: "GOOD",
      pestStatus: "NONE",
    },
    {
      propertyId: vab.id,
      unitId: byNumber.get("VAB 4126H")?.id,
      boardGroup: "MAKE_READY_BOARD_VAB",
      itemName: "VAB 4126H",
      unitNumber: "VAB 4126H",
      floorPlan: "VAB C3 3|2.5B 1647SQFT",
      vacancyStatus: "NTV",
      vacatedDate: d("2026-07-14"),
      makeReadyDate: d("2026-07-15"),
      moveInDate: d("2026-07-20"),
      completionStatus: "NO",
      assignedTech: "Jose",
      scopeLevel: "EASY",
      floorsStatus: "GOOD",
      pestStatus: "NONE",
    },
    {
      propertyId: ta.id,
      unitId: byNumber.get("TA 103")?.id,
      boardGroup: "DOWN_AND_MODELS",
      itemName: "TA 103",
      unitNumber: "TA 103",
      floorPlan: "TA B1 2|2 1186SQFT",
      vacancyStatus: "VACANT",
      completionStatus: "NO",
      assignedTech: "Model",
      scopeLevel: "LITE",
      notes: "Model touchups stay separate from active turnover board.",
    },
  ];

  await prisma.makeReadyItem.createMany({
    data: items.map((item) => {
      const derived = computeDerivedFields(item as never, d("2026-05-23"));
      return {
        ...item,
        ...derived,
      };
    }),
  });

  const createdItems = await prisma.makeReadyItem.findMany();
  for (const item of createdItems) {
    await evaluateAndPersistItemRisk(item.id, { notify: false });
  }

  await prisma.savedView.createMany({
    data: [
      {
        ownerUserId: adminUserId,
        name: "All Make Readies",
        module: "make-ready",
        viewType: "table",
        filters: {},
        sorts: { key: "moveInDate", direction: "asc" },
        grouping: Prisma.DbNull,
        isShared: true,
        isDefault: true,
      },
      {
        ownerUserId: adminUserId,
        name: "Move-Ins This Week",
        module: "make-ready",
        viewType: "calendar",
        filters: { moveInThisWeek: true },
        sorts: { key: "moveInDate", direction: "asc" },
        grouping: { calendarField: "moveInDate" },
        isShared: true,
      },
      {
        ownerUserId: adminUserId,
        name: "Overdue Make Readies",
        module: "make-ready",
        viewType: "table",
        filters: { overdueOnly: true },
        sorts: { key: "makeReadyDate", direction: "asc" },
        isShared: true,
      },
      {
        ownerUserId: adminUserId,
        name: "Major Scope",
        module: "make-ready",
        viewType: "kanban",
        filters: { scopeLevel: "MAJOR" },
        sorts: { key: "priority", direction: "desc" },
        grouping: { kanbanBy: "assignedTech" },
        isShared: true,
      },
      {
        ownerUserId: adminUserId,
        name: "By Property",
        module: "make-ready",
        viewType: "kanban",
        filters: {},
        sorts: { key: "moveInDate", direction: "asc" },
        grouping: { kanbanBy: "property" },
        isShared: true,
      },
    ],
  });

  const [rule1, rule2, rule3, rule4] = await Promise.all([
    prisma.automationRule.create({
      data: {
        name: "Set NTV leased when move-in exists before vacancy",
        description: "If move-in is scheduled and vacated date has not happened, set vacancy status to NTV LEASED.",
        triggerType: "ITEM_UPDATED",
        conditions: {
          all: [{ field: "moveInDate", operator: "notEmpty" }, { field: "vacatedDate", operator: "isEmpty" }],
        },
        actions: [{ type: "setField", field: "vacancyStatus", value: "NTV LEASED" }],
      },
    }),
    prisma.automationRule.create({
      data: {
        name: "Raise priority for major scope",
        description: "Scope MAJOR units get higher priority.",
        triggerType: "ITEM_UPDATED",
        conditions: {
          all: [{ field: "scopeLevel", operator: "equals", value: "MAJOR" }],
        },
        actions: [{ type: "setPriority", value: 3 }],
      },
    }),
    prisma.automationRule.create({
      data: {
        name: "Flag pest treatment",
        description: "Pest treatment required for roaches, bed bugs, or fleas.",
        triggerType: "ITEM_UPDATED",
        conditions: {
          all: [{ field: "pestStatus", operator: "in", value: ["ROACHES", "BED BUGS", "FLEAS"] }],
        },
        actions: [{ type: "setField", field: "pestTreated", value: "TREATED" }],
      },
    }),
    prisma.automationRule.create({
      data: {
        name: "Require flooring date note",
        description: "Replace carpet should be paired with flooring date.",
        triggerType: "ITEM_UPDATED",
        conditions: {
          all: [
            { field: "floorsStatus", operator: "equals", value: "REPLACE CARPET" },
            { field: "flooringDate", operator: "isEmpty" },
          ],
        },
        actions: [{ type: "appendNote", value: "Automation: flooring date required for replace carpet." }],
      },
    }),
    prisma.automationRule.create({
      data: {
        name: "Scheduled overdue make-ready check",
        description: "Records attention when an incomplete turn is past its make-ready date.",
        triggerType: "SCHEDULED_CHECK",
        conditions: {
          all: [
            { field: "makeReadyDate", operator: "dateBeforeToday" },
            { field: "completionStatus", operator: "notEquals", value: "DONE" },
            { field: "completionStatus", operator: "notEquals", value: "YES" },
          ],
        },
        actions: [{ type: "addAuditNote", value: "Scheduled check: make-ready date is past due and work is incomplete." }],
      },
    }),
    prisma.automationRule.create({
      data: {
        name: "Scheduled move-in soon check",
        description: "Records attention when an incomplete turn has a move-in within seven days.",
        triggerType: "SCHEDULED_CHECK",
        conditions: {
          all: [
            { field: "moveInDate", operator: "dateWithinNextDays", value: 7 },
            { field: "completionStatus", operator: "notEquals", value: "DONE" },
            { field: "completionStatus", operator: "notEquals", value: "YES" },
          ],
        },
        actions: [{ type: "addAuditNote", value: "Scheduled check: move-in is within seven days and work is incomplete." }],
      },
    }),
    prisma.automationRule.create({
      data: {
        name: "Scheduled missing make-ready date check",
        description: "Records attention when an active turn has no make-ready schedule date.",
        triggerType: "SCHEDULED_CHECK",
        conditions: {
          all: [
            { field: "makeReadyDate", operator: "dateMissing" },
            { field: "completionStatus", operator: "notEquals", value: "DONE" },
            { field: "completionStatus", operator: "notEquals", value: "YES" },
          ],
        },
        actions: [{ type: "addAuditNote", value: "Scheduled check: make-ready date is missing." }],
      },
    }),
  ]);

  await prisma.automationRun.createMany({
    data: [
      {
        ruleId: rule2.id,
        itemId: createdItems.find((item) => item.unitNumber === "TA 222")?.id,
        message: "Seeded major scope priority example",
        success: true,
      },
      {
        ruleId: rule3.id,
        itemId: createdItems.find((item) => item.unitNumber === "VAB 4123H")?.id,
        message: "Seeded pest escalation example",
        success: true,
      },
      {
        ruleId: rule4.id,
        itemId: createdItems.find((item) => item.unitNumber === "TA 222")?.id,
        message: "Seeded flooring date requirement example",
        success: true,
      },
      {
        ruleId: rule1.id,
        itemId: createdItems.find((item) => item.unitNumber === "VAB 4126H")?.id,
        message: "Seeded move-in scheduling example",
        success: true,
      },
    ],
  });

  await prisma.propertyNote.createMany({
    data: [
      {
        propertyId: ta.id,
        title: "Filter sizes",
        body: "TA B1: 16x25x1, TA B3: 20x25x1, stock in maintenance room 2.",
        noteType: "WIKI",
      },
      {
        propertyId: vab.id,
        title: "Gate access",
        body: "Use south gate after 6 PM. Vendor code rotates monthly.",
        noteType: "ACCESS",
      },
    ],
  });

  await prisma.checklistTemplate.create({
    data: {
      propertyId: ta.id,
      name: "Standard Turn Walk",
      scope: "LITE",
      items: {
        create: [
          { label: "Verify appliances functional", sortOrder: 1 },
          { label: "Confirm paint touch-ups complete", sortOrder: 2 },
          { label: "Final clean and photo set", sortOrder: 3 },
        ],
      },
    },
  });

  const [flooringVendor, pestVendor] = await Promise.all([
    prisma.vendor.create({
      data: {
        name: "Metro Flooring Pros",
        trade: "Flooring",
        phone: "555-0142",
        email: "dispatch@metro-flooring.example",
        notes: "Preferred for carpet replacement and plank repairs.",
        isPreferred: true,
        insuranceExpiresAt: d("2026-09-30"),
        serviceAreas: { create: [{ propertyId: ta.id }, { propertyId: vab.id }] },
      },
    }),
    prisma.vendor.create({
      data: {
        name: "Shield Pest Services",
        trade: "Pest",
        phone: "555-0188",
        email: "service@shield-pest.example",
        notes: "Use for roaches, bed bugs, fleas, and follow-up treatment.",
        isPreferred: true,
        licenseExpiresAt: d("2026-08-15"),
        serviceAreas: { create: [{ propertyId: ta.id }, { propertyId: vab.id }] },
      },
    }),
  ]);

  const ta222 = createdItems.find((item) => item.unitNumber === "TA 222");
  const vab4123h = createdItems.find((item) => item.unitNumber === "VAB 4123H");
  if (ta222) {
    await prisma.vendorAssignment.create({
      data: {
        vendorId: flooringVendor.id,
        propertyId: ta222.propertyId,
        itemId: ta222.id,
        trade: "Flooring",
        status: "SCHEDULED",
        scheduledDate: d("2026-06-04"),
        dueDate: d("2026-06-05"),
        notes: "Replace carpet before final clean.",
      },
    });
  }
  if (vab4123h) {
    await prisma.vendorAssignment.create({
      data: {
        vendorId: pestVendor.id,
        propertyId: vab4123h.propertyId,
        itemId: vab4123h.id,
        trade: "Pest",
        status: "FOLLOW_UP_NEEDED",
        scheduledDate: d("2026-06-04"),
        dueDate: d("2026-06-05"),
        notes: "Bed bug follow-up required before make-ready closeout.",
      },
    });
  }
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    await prisma.$disconnect();
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
