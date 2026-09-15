CREATE TABLE "OnCallWorkspace" (
  "id" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "externalEnabled" BOOLEAN NOT NULL DEFAULT false,
  "accessHash" TEXT,
  "accessRevision" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnCallWorkspace_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OnCallAccessAttempt" (
  "id" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnCallAccessAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OnCallAccessAttempt_expiresAt_idx" ON "OnCallAccessAttempt"("expiresAt");
