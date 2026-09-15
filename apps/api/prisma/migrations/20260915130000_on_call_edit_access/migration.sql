ALTER TABLE "OnCallWorkspace" ADD COLUMN "editHash" TEXT;
ALTER TABLE "OnCallWorkspace" ADD COLUMN "editRevision" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE "OnCallWorkspace" ALTER COLUMN "editRevision" DROP DEFAULT;
