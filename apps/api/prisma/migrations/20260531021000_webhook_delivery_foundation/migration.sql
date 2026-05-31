ALTER TABLE "WebhookEndpoint" ADD COLUMN "secretCiphertext" TEXT;

CREATE TABLE "WebhookDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "webhookId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "deliveryId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "headers" JSONB,
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "responseStatus" INTEGER,
  "responseBody" TEXT,
  "errorMessage" TEXT,
  "nextAttemptAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebhookDeliveryAttempt_deliveryId_key" ON "WebhookDeliveryAttempt"("deliveryId");
CREATE INDEX "WebhookDeliveryAttempt_webhookId_createdAt_idx" ON "WebhookDeliveryAttempt"("webhookId", "createdAt");
CREATE INDEX "WebhookDeliveryAttempt_status_nextAttemptAt_idx" ON "WebhookDeliveryAttempt"("status", "nextAttemptAt");

ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
