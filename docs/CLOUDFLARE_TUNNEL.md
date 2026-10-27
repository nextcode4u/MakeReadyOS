# Cloudflare Tunnel

## Topology

Cloudflare Tunnel publishes the existing MakeReadyOS web container. It does not
host the database or replace application login:

Browser / Android -> HTTPS hostname -> Cloudflare -> cloudflared -> web -> API

Use a stable hostname under a domain you control, not a temporary Quick Tunnel.
The connector establishes outbound connectivity; do not expose database ports or
add router port-forwarding solely for the tunnel.

## Configure

1. Confirm the local Compose deployment is healthy and the web service responds.
2. In Cloudflare's tunnel dashboard, create a remotely managed cloudflared tunnel.
3. Follow Cloudflare's connector installation instructions for the host OS and register it as a persistent service.
4. Treat the connector installation token as a password. Do not paste the token-bearing command in issues, docs, recordings or shared shell history.
5. Add a published application route for a hostname such as app.example.com, pointing to the web service, not directly to the API or database.
6. Verify the connector is healthy and the hostname reaches MakeReadyOS.

See Cloudflare's maintained [dashboard tunnel setup](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)
for current installation commands and navigation labels.

Choose the origin address based on where cloudflared runs:

| Connector location | Example origin |
| --- | --- |
| Host service, default web port | http://127.0.0.1:8080 |
| Container on the same Compose network | http://web:80 |

Inside a connector container, localhost refers to that container, not the host
or the MakeReadyOS web container. A separate container must join the intended
network and have a restart policy. Do not disable TLS verification to work around
an incorrect origin. Host-loopback HTTP or an isolated container-network hop is
different from exposing unencrypted traffic across an untrusted network.

## Application Settings

Set these values in the deployment's private .env:

```dotenv
APP_URL=https://app.example.com
SELF_HOSTED=true
TRUST_PROXY=true
```

Keep the web API base as /api. Route the whole hostname to web so API requests,
reports, uploaded photos and browser assets share the same origin.
After configuration changes, recreate the API using the deployment's normal
Compose configuration. See [Deployment](DEPLOYMENT.md).

The default Compose file publishes API and web host ports. A tunnel does not
automatically secure those ports: restrict their bindings/firewall access to the
intended local proxy/network. In particular, do not leave the direct API publicly
reachable while trusting forwarded headers. Do not expose PostgreSQL.

Avoid rules that cache authenticated API responses or private attachments. Check
upload-size and timeout limits in the Cloudflare plan; unlimited app-level uploads
do not remove upstream limits. Do not disable all WAF protection to fix one route.

Cloudflare Access browser challenges are a separate access-control layer.
The native Android app currently does not implement an Access sign-in flow;
putting an interactive challenge in front of its API can prevent connection.
Do not embed Access service tokens in the APK. Design and test that integration
before enforcing it for mobile users.

## Verification and Recovery

- Check the public page, login, API requests, one authorized photo upload, PDF export and live updates.
- Anonymous GET /api/auth/me should return an authentication error, not a cached signed-in user or an HTML challenge.
- Reboot during a maintenance window and confirm Docker, MakeReadyOS and the connector recover. See [Boot startup](BOOT_STARTUP.md).
- For a gateway error, check tunnel health and whether the connector can reach its configured web origin.
- For repeated login redirects or cookie failures, check APP_URL, forwarded HTTPS headers and conflicting Access/security rules.
- Rotate a leaked tunnel token and replace the connector's private credentials; keep access and recovery instructions outside Git.

Tunnel outages can interrupt public access while the local application still runs.
Keep backups and an authorized private recovery path. Never publish actual host
addresses, connector identifiers, tunnel tokens or operational screenshots.
