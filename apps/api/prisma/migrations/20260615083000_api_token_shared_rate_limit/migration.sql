CREATE TABLE "ApiTokenRateLimitWindow" (
  "id" TEXT NOT NULL,
  "apiTokenId" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ApiTokenRateLimitWindow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiTokenRateLimitWindow_apiTokenId_windowStartedAt_key"
ON "ApiTokenRateLimitWindow"("apiTokenId", "windowStartedAt");

CREATE INDEX "ApiTokenRateLimitWindow_windowStartedAt_idx"
ON "ApiTokenRateLimitWindow"("windowStartedAt");

ALTER TABLE "ApiTokenRateLimitWindow"
ADD CONSTRAINT "ApiTokenRateLimitWindow_apiTokenId_fkey"
FOREIGN KEY ("apiTokenId") REFERENCES "ApiToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
