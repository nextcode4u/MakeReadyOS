# Resend Email

## Scope

MakeReadyOS supports Resend through its existing SMTP transport. It currently
sends account invitations and password-reset emails, not every work alert.
No Resend SDK, additional web deployment or Android credential is required.

## Provider Setup

1. Sign in to Resend and add a domain you control. A dedicated sending subdomain can isolate mail reputation from other mail.
2. Add the exact DNS verification records shown by Resend to your DNS provider. Do not replace existing mailbox MX records or add conflicting SPF records.
3. Wait for the sender domain to verify. If using Cloudflare DNS, email records are DNS records, not a Tunnel application route; proxyable mail records should be DNS-only.
4. Create a sending API key restricted to the intended domain where available. Store it privately.
5. Use a From address under the verified domain. Set Reply-To to a monitored mailbox.

References: [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction)
and [SMTP connection settings](https://resend.com/docs/send-with-smtp).

## MakeReadyOS Configuration

Edit the deployment's private .env, using your own values instead of these examples:

```dotenv
APP_URL=https://app.example.com
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=REPLACE_WITH_PRIVATE_RESEND_API_KEY
SMTP_FROM="MakeReadyOS <notifications@mail.example.com>"
SMTP_REPLY_TO=office@example.com
```

Port 465 uses TLS immediately. Resend also supports port 587 with STARTTLS;
for that port use SMTP_SECURE=false (not true). The existing Compose file already
passes these SMTP variables into the API. Recreate it after changing values:

```sh
docker compose up -d --no-deps --force-recreate api
```

Run this from the same directory and with the same Compose overrides used for the
deployment. A container restart alone does not reload changed Compose environment
values. Keep APP_URL set to the real HTTPS origin so emailed links reach the app.

## Test and Troubleshoot

Use an authorized test recipient. In Admin -> User Management, send an invitation
or resend an existing invitation. Confirm delivery in Resend and in the inbox,
then verify the link's domain and one-hour expiry. Test password reset separately.
Invite links are single-use; do not publish them in logs or screenshots.

An SMTP acceptance response does not guarantee inbox delivery. Check Resend's
email dashboard, spam folder, domain verification and account sending limits.
For authentication failures, verify SMTP_USER=resend and the API key permissions.
For TLS errors, check the port/SMTP_SECURE pairing and outbound firewall access.
If account creation succeeded but email failed, resend the invite instead of
creating a duplicate account. The current invite resend cooldown is one minute.

To rotate: create a replacement sending key, update the private configuration,
recreate the API, send a controlled test, then revoke the old key. Revoke first if
compromise is suspected. To disable email, clear SMTP settings and recreate the
API; maintain an authorized manual account-management path. Keep real addresses,
message contents and provider logs out of public support issues.
