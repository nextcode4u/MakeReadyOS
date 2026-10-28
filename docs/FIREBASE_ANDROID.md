# Firebase Android Notifications

## Status

The implementation now includes session-bound Android registration, an HTTP v1
sender through the existing delivery queue, and native background alerts and
foreground toasts. Android 0.1.0-beta.4 introduces this implementation; beta.3 is
SDK-only. Live delivery requires matching client/server Firebase
configuration and verification on a Google Play services device.

The delivery path is existing MakeReadyOS API -> FCM -> Android notification.
MakeReadyOS remains the authority for accounts, work, permissions and preferences.
Firebase is a delivery dependency, not another deployment of the application.
See [FCM architecture](https://firebase.google.com/docs/cloud-messaging/fcm-architecture).

## Register the Android App

For a publisher-built app shared by unrelated servers, see
[Shared Android Push Relay](PUSH_RELAY.md). That optional mode keeps the sender key
on one relay and gives each approved server a separate revocable credential. The
steps below describe direct Firebase delivery and the publisher's relay sender.

An owner must complete these steps using their own Google account:

1. Open the [Firebase console](https://console.firebase.google.com/) and create a project owned by your organization.
2. Choose a project name such as MakeReadyOS Notifications; keep the actual project identifier private in deployment notes.
3. Google Analytics is not needed for this integration. Do not enable Hosting, Firestore, Firebase Authentication or Crashlytics just to enable messaging.
4. Add an Android application with package name **com.makereadyos.android**. Do not register the old test package ending in .pilot.
5. Use MakeReadyOS Android as the nickname. Signing fingerprints are not required merely to configure FCM; do not replace or regenerate the release signing key.
6. Download google-services.json and place it in the Android checkout at nonpublish/google-services.json. The folder is ignored; optional SDK builds use it only with -PfirebaseNotifications=true.
7. In project settings, check Cloud Messaging and ensure the Firebase Cloud Messaging API (HTTP v1) is enabled.

The package name must match exactly. Follow the official
[Android project setup](https://firebase.google.com/docs/android/setup) and
[FCM client setup](https://firebase.google.com/docs/cloud-messaging/android/get-started)
if console labels change. A phone or emulator with Google Play services is needed
for FCM testing; a plain AOSP emulator is not sufficient.

## Two Different Files

| File | Purpose | Handling |
| --- | --- | --- |
| google-services.json | Android project identifiers/client configuration | Keep out of this repository to avoid publishing operator-specific metadata; client values are packaged in Firebase-enabled APKs and can be extracted |
| Service-account JSON private key | Authorizes the API server to send messages | Server-only secret; never include in the APK, web bundle, Git, screenshots or chat |

The Android client configuration is not a server credential and cannot be made
secret once included in an APK. Security must rely on server authorization, not
hiding that file. Avoid downloading broad administrator credentials prematurely.
For a self-hosted sender, prepare a dedicated service account with only the
permissions needed to send FCM messages in the matching project. Prefer keyless
credentials where the host supports them; otherwise store a protected key outside
the repository and mount it read-only into the API.
See [HTTP v1 authorization](https://firebase.google.com/docs/cloud-messaging/send/v1-api).

Never put a service-account key in a VITE_* variable or use a legacy server key.
Do not share one production sender credential with unrelated self-hosted operators.
Each distribution needs an explicit matching client-project/sender configuration.
The domain-entry screen is not permission to register a phone with arbitrary
projects or bypass the selected server's normal authentication.

## Server Setup

### Create a Dedicated Sender

1. Open the same Firebase project used for the Android client, then **Project settings > Service accounts**.
2. Follow the service-accounts link to Google Cloud. If it opens IAM, choose **Service Accounts** in the left sidebar.
3. Choose **Create service account** and name it `makereadyos-push`.
4. Under Permissions, select **Firebase Cloud Messaging API Admin** (`roles/firebasecloudmessaging.admin`). Do not add Owner, Editor or general Firebase Admin permissions.
5. Leave IAM conditions and optional principals empty for this setup, then finish creation. Do not change the existing Firebase Admin SDK account.
6. Open the new account, select **Keys > Add key > Create new key > JSON**, and download the credential.
7. Store it outside the source repositories on the server, with owner-only permissions. Do not paste its contents into chat, screenshots, tickets or logs. Do not replace the Android `google-services.json` with this file.

See Google's [messaging role reference](https://firebase.google.com/docs/projects/iam/roles-predefined-product)
and [service-account key guidance](https://cloud.google.com/iam/docs/creating-managing-service-account-keys).
If organizational policy prohibits key creation, consult the organization's cloud
administrator rather than weakening that policy.

The Android repository ignores everything in `nonpublish/` except `.gitkeep`.
That can serve as temporary local staging, but the sender credential belongs on
the server, not in an Android build. Git ignore rules do not protect against
force-adding files; review staged files before every push.

### Configure the API

Apply database migrations before starting the updated API. Set `FCM_PROJECT_ID`
to the Android client's project and `FCM_SERVICE_ACCOUNT_FILE` to the credential
path **inside** the API container. Both variables default to empty (disabled).
Use a private Compose override, outside the repository, to mount the service-account
file read-only. For example, mount `/private/firebase-sender.json` on the host at
`/run/secrets/firebase-sender.json` in the API container and set the latter path
as `FCM_SERVICE_ACCOUNT_FILE`. Ensure the API process can read it; do not widen
permissions to other host users. Never mount the secret in the web container.

Example private override (replace the placeholders; do not commit this file):

```yaml
services:
  api:
    environment:
      FCM_PROJECT_ID: your-firebase-project-id
      FCM_SERVICE_ACCOUNT_FILE: /run/secrets/firebase-sender.json
    volumes:
      - /private/firebase-sender.json:/run/secrets/firebase-sender.json:ro
```

Merge these settings into your existing private Compose configuration without
replacing unrelated environment variables or mounts. If using a separate override
outside the checkout, pass it with `docker compose -f docker-compose.yml -f
/private/firebase.compose.yml` on **every** Compose command, also preserving any
other overrides your deployment needs. Validate with `config --quiet`, then recreate
the API using `up -d --no-build --wait api` with those same files. A plain container
restart does not apply changed environment variables or mounts. Preserve your
deployment's build metadata when recreating containers.

Verify the API is healthy and can read the credential. An authenticated FCM HTTP v1
request with `validate_only: true` checks sending authorization without delivering
a notification. A 200 response confirms that check, not delivery to a phone. Never
print the OAuth access token or private key while diagnosing authorization failures.

### Build and Test the App

From the Android repository, use the documented [build presets](https://github.com/nextcode4u/makereadyos-android/blob/main/BUILDING.md):

```sh
node scripts/build.mjs --profile firebase-release --web-source /path/to/MakeReadyOS
```

Configure signing inputs privately first. The APK and checksum are saved under
`nonpublish/builds/`; the generic GitHub release APK has no operator Firebase
configuration. Install the Firebase-enabled APK over the previous signed beta
without uninstalling, after syncing pending work.

1. Open the app, sign in, and open **Alerts**.
2. Select **Check status** if the app was open before the server was configured.
3. Choose **Enable notifications**, allow Android permission, and tap Enable again if requested.
4. Select **Send test notification**. Keep the app foregrounded to check the in-app toast.
5. Wait at least a minute before another test, then press Home after requesting it to check the background system notification. Allow time for the delivery worker; do not force-stop the app.
6. Tap the notification and confirm that it opens Alerts under the correct signed-in account.

Quiet hours, category preferences and Android notification settings still apply
to tests. Check those before assuming delivery failed. Project mismatch means the
APK and server must be configured for the same Firebase project. A generic APK
must be replaced with a Firebase-enabled build; entering a domain does not change
the Firebase project compiled into an installed APK.

Build Android with `-PfirebaseNotifications=true` and the current web bundle.
Sign in, open Alerts, and choose Enable notifications. If Android asks permission,
allow it and tap Enable again. Send test notification queues a rate-limited test;
preferences and quiet hours still apply. Disable stops local display immediately.
Logout clears the local binding; server session expiry/revocation stops sending.
Tokens are refreshed when the signed-in app opens or notification status is checked.
Registration never exposes another user's tokens. Tokens are stored server-side
and must be protected like browser push subscriptions in backups and database access.

Messages contain only an opaque binding, notification identifier and short expiry.
They do not contain record details or navigation URLs. A previously accepted message
can arrive shortly after remote session revocation, but opening the app still requires
valid authentication. This is not a live remote-wipe protocol.

## Release Gates

Before publishing a notification-enabled release:

- Add optional Android messaging configuration; unconfigured builds must remain usable and report push unavailable honestly.
- Request Android notification permission only after a user action, with enable/disable/test controls and no repeated prompts.
- Bind device tokens to the authenticated server/account/session, handle rotation, and stop delivery after logout, revocation or account changes.
- Send only need-to-know alerts through the existing recipient, category, property-access and quiet-hours checks; suppress routine status noise.
- Prefer generic lock-screen text. Never include resident names, access codes, private notes or full record payloads.
- Tapping opens the correct workspace and revalidates authentication and record access; a push message is not authorization.
- Show foreground alerts once as accessible in-app feedback rather than duplicate toasts and system notifications.
- Handle expired tokens and bounded retries without logging tokens, keys or resident data.
- Preserve existing browser Web Push and support missing Google Play services gracefully.

## Acceptance and Recovery

Use synthetic records. Verify a foreground toast, a background alert, normal
process termination, denied permission, disabled notification channel, offline
delivery/reconnection, session revocation, account switch, quiet hours and token
rotation. Android force-stop and device restrictions can prevent delivery; push
is not an emergency paging guarantee. A successful server send is not proof that
the user saw a notification.

Record outcomes privately. Do not deploy or advertise native push until an actual
device receives an authorized test and the negative cases pass. If a server key
leaks, revoke it, replace it privately and verify delivery without widening IAM.
Keep the Android signing key unchanged so future updates remain installable.
