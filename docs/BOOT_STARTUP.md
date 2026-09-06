# Linux Boot Startup

For an installation at `/home/USERNAME/MakeReadyOS`, install the template:

```sh
sudo install -m 644 deploy/examples/makereadyos@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now docker
sudo systemctl enable --now makereadyos@USERNAME
```

Replace `USERNAME` with the installation owner. That user must have Docker access.
Change the unit's working directory for installations outside `/home/USERNAME/MakeReadyOS`.
Do not put credentials in the service file; keep them in the installation's private `.env`.

The service waits for Docker/network startup, starts the existing Compose stack,
and retries failed starts. It does not pull code or rebuild images at boot.
Use `restart: unless-stopped` on the database, API, and web services for runtime recovery.
Configure database/API health checks and dependency health conditions in Compose.
If Cloudflare Tunnel is installed as a system service, enable it separately:

```sh
sudo systemctl enable --now cloudflared
systemctl is-enabled docker makereadyos@USERNAME cloudflared
systemctl status makereadyos@USERNAME --no-pager
```

BIOS automatic power-on after power restoration must also be enabled. Full-disk
encryption requiring a boot-time password can prevent unattended startup.
A real reboot test requires a planned interruption and confirms more than service
configuration checks alone.
