# Shared Android Push Relay

## Status and Purpose

Optional implementation for one publisher-built Firebase Android app serving
multiple self-hosted installations. It is not automatically deployed or a public
service enrollment offer. Existing direct Firebase and browser Web Push remain
unchanged unless an operator explicitly selects relay mode.

The publisher builds the app once with its Firebase client configuration. Users
install it and enter their MakeReadyOS domain; they do not compile an APK or create
a Firebase project. Each server operator needs an approved, revocable relay
credential, **not** the publisher's Firebase service-account key.

The shared relay is an additional operated service: it needs HTTPS, backups,
monitoring, abuse controls and a published privacy policy before public enrollment
or a Play Store launch. A live two-installation/device acceptance test is required;
automated tests with a simulated sender do not establish real FCM delivery.

## Security Boundary

- MakeReadyOS still authorizes accounts, sessions, property access, alert preferences and quiet hours before queuing delivery.
- Operator-approved enrollment binds each credential to one canonical HTTPS origin. There is no public enrollment or management endpoint. Verify control of the requested domain out of band; never approve arbitrary origins on request alone.
- The phone must receive an expiring FCM challenge for its current origin, pending nonce and account binding. The server cannot register an arbitrary phone by submitting only its FCM token. Proof is single-use and tied to the originating session.
- Each server receives opaque device handles. Sending and revocation require both its credential and its own handle; another tenant's handle is insufficient.
- The relay builds generic messages itself. It accepts no resident names, work descriptions, access codes, custom links, topics or notification text.
- The relay retains tenant origins, hashed credentials, device tokens, bindings and expiry dates in a private SQLite database. Device tokens are sensitive even though they are not account passwords. Only proof hashes are stored. Expired rows are cleaned during authenticated traffic.
- Registration expires with the application session (maximum 31 days). Revocation is immediate for future requests. Logout clears native state; queued old-binding alerts are discarded. Offline devices cannot receive revocation immediately.
- Per-tenant, per-token and per-device limits apply. Add edge request/body/rate limits and restrict unauthenticated traffic at the HTTPS proxy; application limits are not DDoS protection.

## Relay Operator Setup

Use Node 24. The relay uses built-in SQLite and is a **separate process**, not an
endpoint exposed by the application API. No application database access is needed.
Its startup never runs application migrations or seeds.

1. Create a dedicated Firebase sender using [the Firebase guide](FIREBASE_ANDROID.md), matching the publisher Android build. Mount its private credential read-only on the relay only.
2. Set `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_FILE` and an absolute `PUSH_RELAY_DB` path outside the checkout. Protect the containing directory and backups. The CLI creates the database with owner-only permissions.
3. Build the API (`npm --prefix apps/api run build`) and start `node apps/api/dist/relay/main.js serve`. The default listener is `127.0.0.1:3400`; `PUSH_RELAY_HOST` and `PUSH_RELAY_PORT` override it.
4. Put the listener behind your HTTPS reverse proxy or tunnel. Do not expose plaintext HTTP on a public interface. `/health` returns only a health flag. Disable authorization-header and request-body logging in proxies and tracing tools.
5. Alternatively use `deploy/examples/compose.push-relay.yml` as a separate Compose project. It builds a non-root relay image without Chromium and persists `/data` in a private volume. Ensure the mounted sender file is readable by container UID 1000 without making it world-readable.

Private operator commands, using the same `PUSH_RELAY_DB`:

```sh
# Output contains a one-time tenant secret. Run privately, redirect to a protected
# file outside Git, and transfer through a secure channel. Do not run in public CI.
node apps/api/dist/relay/main.js enroll https://example.com
node apps/api/dist/relay/main.js rotate TENANT_ID
node apps/api/dist/relay/main.js revoke TENANT_ID
```

Enrollment prints `{id, credential}` once; rotation prints a replacement credential.
Store the tenant ID privately for later revocation. Rotation invalidates the old
credential but retains devices; servers using the replacement credential re-verify
on their devices' next app connection. Revocation disables the tenant and removes its
devices/challenges. Restarting the relay preserves registrations and limits.
For Docker, use `docker compose ... exec push-relay node dist/relay/main.js ...`.

Back up SQLite with a consistent SQLite backup or stop the relay before copying its
database and WAL files. Never commit the database or any backup. Loss of relay state
requires re-enrollment/re-enabling devices. Monitor health, disk usage and delivery
failures without collecting credentials or payloads.

## Self-Hosted Server Setup

Mount a private file containing **only** the issued 64-character tenant credential
read-only into the API container. Configure these API-only environment variables:

```dotenv
ANDROID_PUSH_TRANSPORT=relay
# Optional override; empty derives https://push.<APP_URL hostname>.
PUSH_RELAY_URL=
PUSH_RELAY_CREDENTIAL_FILE=/run/secrets/push-relay-credential
FCM_PROJECT_ID=publisher-project-id
```

With `APP_URL=https://example.com`, an empty `PUSH_RELAY_URL` defaults to
`https://push.example.com`. This uses the server's configured `APP_URL`, not a
request header or a new setting in the Android app. It does not enable relay mode,
create DNS/tunnel routing, deploy the service or replace enrollment credentials.

The prefix is added to the entire hostname: `app.example.com` becomes
`push.app.example.com`. The inferred relay uses standard HTTPS port 443, not the
application's custom port. Localhost, IP addresses and non-HTTPS application URLs
are not inferred; configure an explicit HTTPS relay URL for those installations.
If several servers use one publisher-operated relay, set `PUSH_RELAY_URL` explicitly
to that shared address rather than deriving a different address for each server.

An explicit relay URL must be a root HTTPS origin without credentials, query or fragment.
An invalid explicit override disables relay configuration rather than falling back.
Use exactly the canonical application origin approved during enrollment, including
any non-default port. The app must connect to that origin, not an alias. Project ID
must match the installed publisher build. Never use `VITE_*` for server secrets.
In relay mode the API needs no Firebase service-account key. Invalid relay settings
fail closed; the API does not silently fall back to direct sending.

After restarting the API and installing a relay-capable Firebase Android build,
sign in and enable notifications from Alerts. Initial verification may take a few
seconds and requires Google Play services/network access. Test background delivery,
foreground toast, logout, account/domain switch, quiet hours and tenant revocation.
An old APK displays an update-required message instead of attempting enrollment.
Older beta releases do not implement the relay challenge exchange.

To return to direct Firebase, remove `ANDROID_PUSH_TRANSPORT=relay`, restore the
private direct-sender settings and re-enable notifications. Transport-specific
records do not inherit pending deliveries. Revoke unneeded relay credentials.

## Release Checklist

1. Choose and secure the relay host, canonical hostname and operator enrollment process.
2. Validate with two unrelated installations: A must never send to or revoke B's device.
3. Test delayed FCM challenges, token rotation, service restart, expiry and revoked credentials on physical devices.
4. Publish privacy/retention and support expectations, configure abuse limits and backups, and review sender permissions.
5. Produce the signed Firebase-enabled Play Store build with the existing signing identity. Client Firebase identifiers are extractable from the app; private sender and tenant credentials must never appear in it.

No Firebase billing, project permissions, production settings or Play Store
publication are changed merely by merging this implementation.
