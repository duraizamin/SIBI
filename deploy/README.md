# Sibi Sports Club deployment notes

The current deployment target is Vercel Functions with Neon Postgres. Follow
the Vercel + Neon setup in [README_START_HERE.txt](../README_START_HERE.txt).
The Oracle VM documents below are retained only for an optional legacy setup;
they are not required for the Vercel deployment.

The legacy `compose.yaml` stack below runs Sibi, OpenWA and HTTPS together on
one Linux VPS. OpenWA needs a continuously running Docker host and persistent
session storage; do not deploy OpenWA itself to Vercel.

The VPS needs Docker Compose, a public IP, a hostname with DNS pointing to that
IP, and inbound TCP ports 80/443. OpenWA's web/API port is bound to VPS
localhost only; Sibi calls the OpenWA API over a private Docker network.

## Free-tier caveat

Oracle Cloud Always Free compute may be suitable, but account approval, ARM
capacity and uninterrupted availability are not guaranteed. Oracle may reclaim
instances that meet its published idle criteria. Keep the VM shape and storage
within the console's Always Free eligibility indicators and review Oracle's
current terms. This is not an uptime guarantee.

## 1. Prepare the VM and DNS

Create an Ubuntu ARM VM in Oracle Cloud and confirm the selected shape is marked
Always Free eligible. Assign a public IP. In the VM firewall/security list,
allow SSH (TCP 22) only from your own IP, and allow inbound TCP 80 and 443.
Do not open port 2785 to the public internet.

Point a hostname you control at the VM's public IP using a DNS A record. Wait
for DNS to resolve before enabling HTTPS. Caddy obtains and renews the TLS
certificate automatically.

## 2. Put both source trees on the VM

Install Docker Engine and the Docker Compose plugin on the Ubuntu VM. Then clone
the Sibi repository into `/opt/sibi` and OpenWA into `/opt/OpenWA`. The expected
layout is:

```text
/opt/
  OpenWA/
  sibi/
    Admin/
    deploy/
```

The OpenWA repository is separate because it is maintained upstream. The
Compose file builds both projects from source.

## 3. Configure and start the stack

From `/opt/sibi`, copy `deploy/.env.example` to `deploy/.env`. Set the hostname,
admin email, a unique strong admin password, and a random session secret. Keep
this file private; never commit it or paste secrets into chat.

Generate a session secret on the VM with:

```sh
openssl rand -hex 32
```

Start the stack:

```sh
cd /opt/sibi/deploy
docker compose -f compose.yaml up -d --build
```

The first build can take several minutes. Check:

```sh
docker compose -f compose.yaml ps
docker compose -f compose.yaml logs --tail=100 sibi
docker compose -f compose.yaml logs --tail=100 openwa
```

## 4. Link the WhatsApp account on the VPS

Read the generated OpenWA key on the VM. Do not share or publish it:

```sh
docker compose -f compose.yaml exec -T openwa cat /app/data/.api-key
```

To open the OpenWA dashboard securely from your own computer, create an SSH
port forward (replace the key path, VM address and SSH username):

```powershell
ssh -i "C:\path\to\oracle-key.key" -L 2785:127.0.0.1:2785 ubuntu@YOUR_VM_PUBLIC_IP
```

Keep that SSH window open and visit `http://localhost:2785` on your computer.
Sign in with the OpenWA key, create a session, and scan its QR using the
WhatsApp phone you intend to link. Pairing is performed on the VPS; after setup,
the WhatsApp session data remains in the VPS's `openwa_data` volume.

Copy the session ID shown in OpenWA. On the VM, edit `deploy/.env` and set
`OPENWA_API_KEY` and `OPENWA_SESSION_ID`. Recreate Sibi so it receives those
values:

```sh
docker compose -f compose.yaml up -d --force-recreate sibi
```

Open the Sibi site at `https://YOUR_HOSTNAME`, sign in to Admin, and check
Message Center for the OpenWA connected/ready status. Test one message to a
recipient who has opted in before using automatic or bulk sends.

## 5. Operations

- Both applications start again after a VM reboot (`restart: unless-stopped`).
- `openwa_data` persists the OpenWA account/session, media and configuration.
- `sibi_data` persists the Sibi SQLite database and admin/member data.
- Back up both volumes. A persistent disk is not a substitute for backups.
- Do not run multiple Sibi instances against this SQLite scheduler; that can
  duplicate scheduled messages.
- To update code, pull both repositories and rebuild with
  `docker compose -f compose.yaml up -d --build`.
- OpenWA is an unofficial WhatsApp Web gateway. Session disconnections and
  account restrictions are possible; keep a fallback for important messages.

## Deployment boundaries

Vercel can serve suitable frontend projects, but it does not run this persistent
Docker stack. This Compose deployment serves the existing Sibi Express site and
backend together on the VPS, so its scheduled-message worker and SQLite database
remain available while your own computer is off.
