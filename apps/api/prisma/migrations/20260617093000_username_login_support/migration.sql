ALTER TABLE "User"
ADD COLUMN "username" TEXT;

UPDATE "User"
SET "username" = LOWER("email")
WHERE "username" IS NULL;

ALTER TABLE "User"
ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

ALTER TABLE "User"
ALTER COLUMN "email" DROP NOT NULL;
