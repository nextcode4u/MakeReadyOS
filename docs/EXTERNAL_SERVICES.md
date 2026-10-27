# External Services

MakeReadyOS stays self-hosted. These services have separate, optional roles:

| Service | Purpose | Current support |
| --- | --- | --- |
| Cloudflare Tunnel | Publish the existing web/API origin over HTTPS | Supported deployment topology |
| Resend | Deliver account invitations and password resets through SMTP | Supported |
| Firebase Cloud Messaging (FCM) | Deliver native Android work alerts | Optional SDK setup in beta.3; delivery not implemented in Android or the API |
| Browser Web Push | Deliver notifications to supported browsers/installed PWAs | Supported separately with VAPID |

## Setup Guides

- [Cloudflare Tunnel](CLOUDFLARE_TUNNEL.md): connector, routing, origin settings, recovery.
- [Resend email](RESEND_EMAIL.md): DNS verification, SMTP, testing and rotation.
- [Firebase Android notifications](FIREBASE_ANDROID.md): project registration, credential boundaries and implementation gates.
- [Browser notifications](PUSH_NOTIFICATIONS.md): existing browser/PWA feature, not native APK push.

Configure HTTPS before testing email links or device notifications. Existing
working Cloudflare and Resend installations do not need to be recreated to add FCM.
No Firebase Hosting, database, authentication migration or Cloud Functions
deployment is planned for Android push.

## Keep Operations Private

Public guides use example.com placeholders. Never commit actual hostnames,
addresses, tunnel IDs/tokens, SMTP keys, service-account keys, device registration
tokens, exported residents, deployment logs or account screenshots.

Keep deployment secrets in private environment files or an external secret store,
not app assets. Use separate test and production credentials, least privilege,
protected backups and provider account MFA. Ignore rules are a guardrail, not a
substitute for reviewing staged files with git diff --cached.

Provider outages should not prevent local MakeReadyOS operation: email and push
are delivery channels, not the source of work records. Tunnel failure does affect
access through the public hostname. Test each channel separately and keep a
private recovery record; do not publish that record with these guides.
