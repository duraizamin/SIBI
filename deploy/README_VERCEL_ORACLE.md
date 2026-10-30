# Vercel frontend + Oracle VM backend (without OpenWA)

> Legacy alternative only. The selected deployment is Vercel Functions + Neon
> Postgres; see [README_START_HERE.txt](../README_START_HERE.txt). An Oracle VM
> is not needed for that setup.

This deployment keeps the public website on Vercel and runs the existing
Express/SQLite backend on an Oracle Cloud VM. The backend's SQLite database and
scheduled-message worker stay on the VM's persistent Docker volume. WhatsApp
is set to manual mode; no OpenWA service or WhatsApp automation is started.

Oracle Cloud Always Free compute may be suitable, but account approval, ARM
capacity and uninterrupted availability are not guaranteed. Oracle may reclaim
instances that meet its published idle criteria. Check that the selected VM and
storage are marked Always Free in the console, review current terms, and keep
backups.

## 1. Create the VM and DNS record

Create an Ubuntu VM in Oracle Cloud with an Always Free-eligible shape and
public IPv4 address. In the network security rules, allow SSH (TCP 22) only
from your own IP, and allow inbound TCP 80 and 443. Do not expose port 3000.

In GoDaddy DNS, add an A record:

| Type | Name | Value |
|---|---|---|
| A | `api` | The Oracle VM public IPv4 address |

This makes the backend available at `api.sibisportsclub.com`. Keep the site's
apex and `www` records pointed at Vercel as shown in the Vercel Domains panel.
Do not remove or change MX/TXT records used for email.

Wait for `api.sibisportsclub.com` to resolve to the VM before starting Caddy;
Caddy obtains the HTTPS certificate automatically.

## 2. Install Docker and get the project on the VM

Install Docker Engine and the Docker Compose plugin on Ubuntu. Clone the Sibi
repository into `/opt/sibi`; the expected layout includes `/opt/sibi/Admin`
and `/opt/sibi/deploy`.

## 3. Configure and start the backend

From `/opt/sibi/deploy`, create the private environment file:

```sh
cp .env.example .env
```

Set `SITE_DOMAIN=api.sibisportsclub.com`, a unique admin email and strong
password, and a random session secret. Generate the secret on the VM:

```sh
openssl rand -hex 32
```

Do not copy the development `Admin/.env` to the VM, commit secrets, or put
backend credentials in Vercel. OpenWA variables are not needed.

Start the backend and HTTPS reverse proxy:

```sh
docker compose --env-file .env -f compose.vercel-backend.yaml up -d --build
```

Check service health and logs:

```sh
docker compose --env-file .env -f compose.vercel-backend.yaml ps
docker compose --env-file .env -f compose.vercel-backend.yaml logs --tail=100 sibi
docker compose --env-file .env -f compose.vercel-backend.yaml logs --tail=100 caddy
```

Verify the API health endpoint returns JSON:

```sh
curl -f https://api.sibisportsclub.com/health
```

## 4. Connect Vercel to the backend

In the Vercel project settings, add `SIBI_API_URL` with the value:

```text
https://api.sibisportsclub.com
```

Apply it to Production (and Preview if desired), then redeploy the Vercel
project. The Vercel `/api/*` proxy forwards requests to this backend. The admin
login, member registration, enquiries, and saved records use the backend and
SQLite volume. Sign in with the admin credentials configured in the VM's
`deploy/.env`.

If requests fail, first confirm the health endpoint, the GoDaddy `api` A
record, the Vercel environment variable, and the backend logs. Never expose
session secrets or passwords when requesting help.

## 5. WhatsApp and operations

`WHATSAPP_PROVIDER=manual` is fixed in this Compose file. OpenWA is not
started, and automatic WhatsApp sending is disabled. Admin users can still
prepare messages for manual handling.

The backend runs persistently, so its internal scheduled-message worker
continues to process due items while the VM is up. Keep one Sibi instance to
avoid duplicate scheduled processing. The `sibi_data` volume stores SQLite
records; back it up regularly. Docker services restart after VM reboots.
