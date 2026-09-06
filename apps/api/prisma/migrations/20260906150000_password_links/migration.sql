ALTER TABLE "User" ADD COLUMN "passwordResetHash" TEXT,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_passwordResetHash_key" ON "User"("passwordResetHash");
