CREATE TABLE "ManagementCompany" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "logo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ManagementCompany_name_key" ON "ManagementCompany"("name");
CREATE TABLE "PropertyBranding" (
  "propertyId" TEXT NOT NULL PRIMARY KEY REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "managementCompanyId" TEXT REFERENCES "ManagementCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "logo" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PropertyBranding_managementCompanyId_idx" ON "PropertyBranding"("managementCompanyId");
