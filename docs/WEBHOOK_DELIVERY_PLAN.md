# Webhook Delivery Plan

Webhook endpoints can be registered in the Admin Integrations area. Delivery is intentionally explicit and script-driven so self-hosted deployments can schedule it with cron/systemd without making normal board writes wait on external HTTP calls.

## Current State

- Webhook endpoint metadata can be created and revoked.
- New webhook endpoints store a one-way hash for identification plus an encrypted signing secret for HMAC delivery.
- Event type subscriptions are stored as configuration.
- Admins can create signed `DRY_RUN` test payload records, queue signed test payloads, and inspect webhook health/delivery history from the Integrations UI.
- `GET /api/admin/integrations/webhooks/:id/health` returns endpoint state, status counts, event counts, pending work, and latest failure metadata.
- Admins can queue a signed test payload with `POST /api/admin/integrations/webhooks/:id/test-payload` and `{"enqueue": true}`.
- `./run-webhooks.sh` processes queued attempts from inside the API container, signs payloads, applies an HTTP timeout, records responses, and retries failures with bounded backoff.
- Core application writes now queue subscribed webhook events for item create/update/assignment/archive/restore, risk-level changes, comment creation, attachment create/delete, checklist item completion, vendor assignment changes, project record lifecycle, pest issue lifecycle, PM template/task lifecycle, and pool log entry creation.

## Runner Configuration

Environment variables:

- `WEBHOOK_SECRET_ENCRYPTION_KEY`: stable key used to decrypt webhook signing secrets. If it changes, endpoints must be rotated.
- `WEBHOOK_DELIVERY_BATCH_SIZE`: maximum attempts processed per run, default `25`.
- `WEBHOOK_DELIVERY_TIMEOUT_MS`: outbound HTTP timeout, default `5000`.
- `WEBHOOK_DELIVERY_MAX_ATTEMPTS`: retry cap before an attempt becomes `GAVE_UP`, default `5`.
- `WEBHOOK_AUTO_DISABLE_FAILURES`: consecutive endpoint failures before the runner disables that webhook endpoint, default `0` which means disabled. Use a positive value such as `25` for public integrations where a broken endpoint should stop receiving new queued work until reviewed.
- `WEBHOOK_ALLOW_PRIVATE_URLS`: whether webhook registration/delivery may target localhost, private networks, link-local addresses, and hostnames that resolve to private addresses. Default `true` keeps trusted self-hosted/NAS/LAN workflows simple. Set `false` for internet-facing deployments.
- `WEBHOOK_ALLOWED_HOSTS`: comma-separated hostnames/IPs that remain allowed when `WEBHOOK_ALLOW_PRIVATE_URLS=false`. Exact hosts and `*.example.com` wildcards are supported.

Run manually:

```bash
./run-webhooks.sh
```

The script writes `logs/webhooks-run-<timestamp>.txt` and exits nonzero only for runner-level failures. Individual endpoint failures are recorded on the delivery attempt and do not corrupt board data. If `WEBHOOK_AUTO_DISABLE_FAILURES` is positive, the runner disables an endpoint after that many consecutive failures; a later successful delivery resets the counter to zero. When private URL blocking is enabled, delivery re-checks DNS so a hostname that resolves to a private/local address is rejected before outbound HTTP is attempted.

## Scheduling Examples

Cron every minute:

```cron
* * * * * cd /opt/makereadyos && ./run-webhooks.sh >> /opt/makereadyos/logs/webhooks-cron.log 2>&1
```

Systemd service:

```ini
[Unit]
Description=MakeReadyOS webhook delivery runner
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/makereadyos
ExecStart=/opt/makereadyos/run-webhooks.sh
```

Systemd timer:

```ini
[Unit]
Description=Run MakeReadyOS webhook delivery every minute

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
Unit=makereadyos-webhooks.service

[Install]
WantedBy=timers.target
```

## Delivery Statuses

- `DRY_RUN`: signed payload was generated for inspection only.
- `PENDING`: delivery is queued.
- `DELIVERED`: endpoint returned HTTP 2xx.
- `FAILED`: delivery failed and is eligible for retry after `nextAttemptAt`.
- `GAVE_UP`: delivery reached the retry cap.

## Remaining Work

- Add optional per-event delivery trend charts only if public integrations need more than the current health endpoint plus Integrations UI status/event/failure diagnostics.

## Safety Rules

- Webhook delivery never executes remote code.
- Webhook delivery does not block primary user actions.
- Secrets, API tokens, passwords, sessions, CSRF tokens, and private environment values must never appear in payloads.
- Public deployments should set `WEBHOOK_ALLOW_PRIVATE_URLS=false` to reduce SSRF risk from webhook endpoints that point back into local infrastructure.
- Failed delivery should be observable but should not corrupt operational board data.

Integrations that need a guaranteed current snapshot should still poll the scoped API using API tokens and bounded `limit`/`offset` queries; webhooks are an event signal, not a replacement for reconciliation.
