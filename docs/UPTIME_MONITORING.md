# Uptime Monitoring

MakeReadyOS exposes read-only health checks through the existing web proxy.
Replace `https://app.example.com` below with your app address. No login, cookie,
API token, or database password is needed.

## Uptime Kuma Setup

Create HTTP(s) monitors using these URLs:

| Monitor | URL | What it checks |
| --- | --- | --- |
| Website | `https://app.example.com/` | The web page responds |
| API | `https://app.example.com/api/health` | The API process responds |
| Database | `https://app.example.com/api/health/database` | A read-only `SELECT 1` succeeds |
| Upload storage | `https://app.example.com/api/health/uploads` | The configured upload root is a readable, traversable directory |
| Overall readiness | `https://app.example.com/api/health/ready` | Both database and upload checks succeed |

Use a 60-second heartbeat, a 10-second request timeout, 3 retries, and accepted
status code 200. Keep TLS verification enabled. Select your notification channel
and save. To avoid duplicate alerts, notify on either overall readiness or the
individual dependency monitors, not both. Website and API monitors can remain
separate to identify web/proxy failures versus backend failures.

Ready checks return HTTP 200 on success and 503 on failure. Component endpoints
return only `{"ok":true}` or `{"ok":false}`. The overall endpoint returns:

```json
{"ok":true,"checks":{"api":true,"database":true,"uploads":true}}
```

## Limits And Privacy

Dependency results are cached in memory for 10 seconds. Checks run concurrently
with a 3-second timeout per dependency. Concurrent polls share probes, and a
timed-out probe is not restarted until the underlying operation settles. Browser
and proxy response caching is disabled with `Cache-Control: no-store`.

The public responses contain no resident data, credentials, filesystem paths,
database addresses, exception messages, or build metadata. Health requests bypass
session loading so an expired cookie or unavailable session database does not
break the process-only check. Normal application authentication is unchanged.

Storage checks do not write files, create directories, verify free space, inspect
property-specific subdirectories, or prove that an expected network mount is
present. An accessible fallback directory can still pass if a mount disappears.
Check the actual mount and disk capacity separately in your infrastructure tools.
Database readiness does not validate schema compatibility or every application
workflow. Background job freshness is not checked by these endpoints.

The existing `/health` process-only endpoint remains unchanged for container
health checks. Public monitors should use the `/api/health` URLs above; no direct
database or API port exposure is needed.

Run Kuma on a different machine if you want alerts when the application host
shuts down. Kuma must also be able to reach your chosen app address.
