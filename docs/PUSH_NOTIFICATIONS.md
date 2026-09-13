# Desktop and Mobile Notifications

Device push uses the existing in-app notification recipients and categories:
assignments, final-walk readiness/handoffs, parts needing an order, schedule and
risk alerts, comments, and other workflows that create notifications. It does not
invent new recipients or email every alert.

## Server Setup

Use the public HTTPS app address. Generate a VAPID key pair once:

```sh
npm --prefix apps/api exec -- web-push generate-vapid-keys --json
```

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in the deployment's
private `.env`. Subject must be a contact `mailto:` address or HTTPS URL. Keep the
private key out of Git, chat, screenshots, and logs. Back up the keys securely;
rotating keys requires devices to unsubscribe and enable notifications again.
Recreate the API container after changing environment values. Apply migrations
as part of normal deployment. The API starts its durable delivery worker itself.
Outbound HTTPS to browser push services is required; no inbound port is needed.

## Enable Each Device

Open **Alerts**, select **Enable on this device**, and accept the browser's
permission prompt. Use **Send test notification** to queue a test for that device.
The worker checks every 15 seconds. A queued test is not proof of OS delivery.
The test respects the Assignment category and quiet hours.

On iPhone/iPad (iOS/iPadOS 16.4+), first open the app in Safari and use
**Share > Add to Home Screen**. Open that installed app to enable notifications.
Desktop and Android support depends on the browser and OS notification settings.
Focus/Do Not Disturb, power restrictions, network access, and browser permissions
can delay or suppress alerts. Push is best effort, not an emergency paging system.

## Privacy and Lifecycle

- Lock-screen alerts contain generic text only, never resident names or unit codes.
- Clicking opens Alerts in the app; normal authentication and access checks apply.
- Subscriptions belong to a login session. Logout, password/session revocation,
  expiration, and user deactivation stop further delivery. Enable again after a
  new login. An already displayed or in-flight OS notification cannot be recalled.
- Disable on each shared device before switching accounts. A subscription cannot
  be taken over by a different account while the original session still exists.
- Category/property preferences and quiet hours are checked again before sending.
  Quiet hours currently use the deployment server's local clock; suppressed alerts
  are not replayed later. Existing in-app quiet-hours behavior is unchanged.
- Historical alerts are not pushed when this feature is installed or a device is
  enabled. Read, stale, superseded, and inaccessible alerts are skipped.
- Transient failures retry up to five attempts. Expired endpoints are removed.
  Delivery records are retained for seven days. Database backups contain device
  subscription credentials and must be protected like session credentials.

## Verification

Automated tests use mocked push transports, never send to real devices, and cover
access checks, preferences, retries, endpoint validation, and service-worker clicks.
After deployment, test one real desktop and one installed mobile app, including
with the app closed. Notification permission cannot be granted remotely for users.

References: [WebKit iOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
and [web-push library](https://github.com/web-push-libs/web-push).
