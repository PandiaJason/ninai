# NINAI API — deployment notes

The shared API runs on a small EC2 instance in the same VPC as RDS. The
desktop app never talks to Postgres directly; it calls this service over
HTTPS.

## Topology

```
laptop / Mac ──HTTPS──▶ api.<domain>  (EC2, public IP, :443)
                                 │
                                 └──SQL (private route, :5432)──▶ RDS Postgres
```

- The RDS security group allows 5432 **only** from this instance, so no
  laptop IP ever has to be allow-listed and public IPs can rotate freely.
- The instance runs the API as an unprivileged user under systemd, behind
  Caddy for TLS.
- Secrets live in `/etc/ninai/api.env` (mode 600, owned by root, read by the
  service through `EnvironmentFile`). Nothing secret is in the repository.

## One-time setup on the instance

```bash
# 1. packages
sudo apt-get update && sudo apt-get install -y nodejs npm git

# 2. service user
sudo useradd --system --home /opt/ninai --shell /usr/sbin/nologin ninai

# 3. application
sudo -u ninai git clone <repo> /opt/ninai
cd /opt/ninai && sudo -u ninai npm ci --omit=dev

# 4. secrets
sudo install -d -m 750 /etc/ninai
sudo install -m 600 /dev/null /etc/ninai/api.env
sudo nano /etc/ninai/api.env     # DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET, PORT

# 4b. the RDS certificate bundle, so the database link is verified
curl -o /etc/ninai/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
# then add this line to /etc/ninai/api.env:
#   DB_SSL_CA=/etc/ninai/global-bundle.pem

# 5. systemd
sudo cp /opt/ninai/deploy/ninai-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ninai-api

# 6. TLS
sudo cp /opt/ninai/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

`JWT_SECRET` is generated with `openssl rand -hex 32`. Changing it signs
every one of your team out, so treat it as permanent.

## Everyday commands

```bash
sudo systemctl status ninai-api
sudo systemctl restart ninai-api
sudo journalctl -u ninai-api -f          # live logs
curl -s https://api.<domain>/api/health  # {"status":"ok","database":"connected"}
```

## Backups

Two layers, both required:

1. **RDS automated backups** — enable in the RDS console with a retention of
   at least 7 days and *deletion protection* on. This covers the shared CRM
   rows and gives point-in-time recovery.
2. **Nightly dump to S3** — `deploy/backup.sh` writes a compressed dump to a
   private bucket. This also captures anything the automated backups cannot
   restore into a scratch instance.

See `deploy/RESTORE.md` for the restore procedure and the drill.

## Pointing the app at this server

The desktop app reads the address in this order:

1. **Settings → Server** — saved on the device, wins over everything
2. `VITE_API_BASE` — baked in at build time
3. the Vite dev proxy (`/api` → `localhost:3001`) in development
4. `http://localhost:3001/api` as the fallback

For the packaged app, set `VITE_API_BASE=https://api.<domain>/api` at build
time so nobody has to configure anything, and keep the Settings field as the
escape hatch.
