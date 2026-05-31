import { authConfig } from "./lib/config.js";
import { prisma } from "./lib/prisma.js";
import { validateWebhookUrlForDelivery } from "./lib/webhookUrl.js";
import { buildWebhookHeaders, decryptWebhookSecret } from "./lib/webhooks.js";

const terminalStatuses = new Set(["DELIVERED", "DRY_RUN", "GAVE_UP"]);
const responseBodyLimit = 2_000;

function truncate(value: string) {
  return value.length > responseBodyLimit ? `${value.slice(0, responseBodyLimit)}...` : value;
}

function retryDelayMs(attemptNumber: number) {
  const base = 60_000;
  return Math.min(base * 2 ** Math.max(0, attemptNumber - 1), 60 * 60 * 1000);
}

function nextRetry(attemptNumber: number, maxAttempts: number) {
  if (attemptNumber >= maxAttempts) return null;
  return new Date(Date.now() + retryDelayMs(attemptNumber));
}

async function readResponseBody(response: Response) {
  try {
    return truncate(await response.text());
  } catch {
    return null;
  }
}

async function markFailure(input: {
  attemptId: string;
  webhookId: string;
  attemptNumber: number;
  maxAttempts: number;
  autoDisableFailures: number;
  responseStatus?: number | null;
  responseBody?: string | null;
  errorMessage: string;
}) {
  const nextAttemptAt = nextRetry(input.attemptNumber, input.maxAttempts);
  const status = nextAttemptAt ? "FAILED" : "GAVE_UP";
  const nextAttemptNumber = nextAttemptAt ? input.attemptNumber + 1 : input.attemptNumber;
  const result = await prisma.$transaction(async (tx) => {
    await tx.webhookDeliveryAttempt.update({
      where: { id: input.attemptId },
      data: {
        status,
        attemptNumber: nextAttemptNumber,
        responseStatus: input.responseStatus,
        responseBody: input.responseBody,
        errorMessage: truncate(input.errorMessage),
        nextAttemptAt,
      },
    });
    const endpoint = await tx.webhookEndpoint.update({
      where: { id: input.webhookId },
      data: { failureCount: { increment: 1 } },
      select: { failureCount: true, isEnabled: true },
    });
    const shouldDisable = input.autoDisableFailures > 0 && endpoint.failureCount >= input.autoDisableFailures;
    if (shouldDisable && endpoint.isEnabled) {
      await tx.webhookEndpoint.update({
        where: { id: input.webhookId },
        data: { isEnabled: false },
      });
    }
    return { status, disabled: shouldDisable, failureCount: endpoint.failureCount };
  });
  return result;
}

async function deliverAttempt(input: {
  attempt: Awaited<ReturnType<typeof findPendingAttempts>>[number];
  timeoutMs: number;
  maxAttempts: number;
}) {
  const { attempt, timeoutMs, maxAttempts } = input;
  if (terminalStatuses.has(attempt.status)) {
    return { status: "SKIPPED", message: "Attempt is already terminal" };
  }
  if (!attempt.webhook.isEnabled) {
    return { status: "SKIPPED", message: "Webhook endpoint is disabled" };
  }
  const webhookUrlError = await validateWebhookUrlForDelivery(attempt.webhook.url);
  if (webhookUrlError) {
    const result = await markFailure({
      attemptId: attempt.id,
      webhookId: attempt.webhookId,
      attemptNumber: attempt.attemptNumber,
      maxAttempts,
      autoDisableFailures: authConfig.webhookAutoDisableFailures,
      errorMessage: webhookUrlError,
    });
    return { status: result.status, message: result.disabled ? `${webhookUrlError}; endpoint auto-disabled after ${result.failureCount} consecutive failures` : webhookUrlError };
  }
  if (!attempt.webhook.secretCiphertext) {
    const result = await markFailure({
      attemptId: attempt.id,
      webhookId: attempt.webhookId,
      attemptNumber: attempt.attemptNumber,
      maxAttempts: 1,
      autoDisableFailures: authConfig.webhookAutoDisableFailures,
      errorMessage: "Webhook endpoint has no encrypted signing secret; recreate or rotate it before delivery.",
    });
    return { status: result.status, message: result.disabled ? "Missing encrypted signing secret; endpoint auto-disabled" : "Missing encrypted signing secret" };
  }

  const secret = decryptWebhookSecret(attempt.webhook.secretCiphertext);
  const headers = buildWebhookHeaders({
    deliveryId: attempt.deliveryId,
    eventType: attempt.eventType,
    payload: attempt.payload,
    secret,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(attempt.webhook.url, {
      method: "POST",
      headers,
      body: JSON.stringify(attempt.payload),
      signal: controller.signal,
    });
    const responseBody = await readResponseBody(response);
    if (response.ok) {
      await prisma.$transaction([
        prisma.webhookDeliveryAttempt.update({
          where: { id: attempt.id },
          data: {
            status: "DELIVERED",
            headers,
            responseStatus: response.status,
            responseBody,
            errorMessage: null,
            nextAttemptAt: null,
            deliveredAt: new Date(),
          },
        }),
        prisma.webhookEndpoint.update({
          where: { id: attempt.webhookId },
          data: { lastDeliveryAt: new Date(), failureCount: 0 },
        }),
      ]);
      return { status: "DELIVERED", message: `HTTP ${response.status}` };
    }
    const result = await markFailure({
      attemptId: attempt.id,
      webhookId: attempt.webhookId,
      attemptNumber: attempt.attemptNumber,
      maxAttempts,
      autoDisableFailures: authConfig.webhookAutoDisableFailures,
      responseStatus: response.status,
      responseBody,
      errorMessage: `Webhook endpoint returned HTTP ${response.status}`,
    });
    return { status: result.status, message: result.disabled ? `HTTP ${response.status}; endpoint auto-disabled after ${result.failureCount} consecutive failures` : `HTTP ${response.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = await markFailure({
      attemptId: attempt.id,
      webhookId: attempt.webhookId,
      attemptNumber: attempt.attemptNumber,
      maxAttempts,
      autoDisableFailures: authConfig.webhookAutoDisableFailures,
      errorMessage: message,
    });
    return { status: result.status, message: result.disabled ? `${message}; endpoint auto-disabled after ${result.failureCount} consecutive failures` : message };
  } finally {
    clearTimeout(timeout);
  }
}

async function findPendingAttempts() {
  const now = new Date();
  return prisma.webhookDeliveryAttempt.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      webhook: { isEnabled: true },
    },
    include: {
      webhook: {
        select: {
          id: true,
          name: true,
          url: true,
          isEnabled: true,
          secretCiphertext: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
    take: authConfig.webhookDeliveryBatchSize,
  });
}

try {
  const attempts = await findPendingAttempts();
  let delivered = 0;
  let failed = 0;
  let gaveUp = 0;
  console.log(`Webhook delivery run started: ${new Date().toISOString()}`);
  console.log(`Pending attempts selected: ${attempts.length}`);
  console.log(`Timeout: ${authConfig.webhookDeliveryTimeoutMs}ms, max attempts: ${authConfig.webhookDeliveryMaxAttempts}, auto-disable failures: ${authConfig.webhookAutoDisableFailures || "off"}`);
  console.log(`Private webhook URLs: ${authConfig.webhookAllowPrivateUrls ? "allowed" : "blocked"}${authConfig.webhookAllowedHosts.length ? `, allowed hosts: ${authConfig.webhookAllowedHosts.join(", ")}` : ""}`);
  for (const attempt of attempts) {
    const result = await deliverAttempt({
      attempt,
      timeoutMs: authConfig.webhookDeliveryTimeoutMs,
      maxAttempts: authConfig.webhookDeliveryMaxAttempts,
    });
    if (result.status === "DELIVERED") delivered += 1;
    if (result.status === "FAILED") failed += 1;
    if (result.status === "GAVE_UP") gaveUp += 1;
    console.log(`${attempt.deliveryId} ${attempt.eventType} -> ${result.status}: ${result.message}`);
  }
  console.log(`Webhook delivery run completed: delivered=${delivered} failed=${failed} gaveUp=${gaveUp}`);
} catch (error) {
  console.error("Webhook delivery run failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
