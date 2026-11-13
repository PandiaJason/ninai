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

## The sandbox

The API does not run as a bare process. systemd starts it inside **nsjail**:

- new **PID, mount, UTS, IPC and user namespaces** — the process is isolated
- the **user namespace** maps the app to uid 993 (`ninai`), so it holds no
  privileges over the host
- **mount namespace**: only `/usr`, `/lib`, `/lib64`, `/etc`, `/dev`,
  `/run/systemd/resolve` and the app directory are visible; `/opt/ninai` is
  read-only except `logs/`
- `/etc/ninai`, `/home/ec2-user` and `/root` are **tmpfs overlays**, so the
  secrets file and the SSH keys are invisible to the running process even
  though the parent shell can read them
- **rlimits** on address space, CPU, file size, open files and processes
- the network namespace is deliberately **shared**, because the service has to
  reach the database and accept connections from the local reverse proxy

Verified on the running instance:

```
mnt: isolated   pid: isolated   uts: isolated
ipc: isolated   user: isolated  net: shared (as intended)
uid inside: 993
/etc/ninai/api.env      -> (blocked: ENOENT)
/home/ec2-user/.ssh     -> (blocked: ENOENT)
/root/.ssh              -> (blocked: ENOENT)
```

## One-time setup on the instance

Amazon Linux 2023 (the AMI used here):

```bash
# 1. packages
sudo dnf install -y nodejs npm git cronie postgresql18
#    (Node 22 from NodeSource: rpm.nodesource.com/setup_22.x)

# 2. service user
sudo useradd --system --home /opt/ninai --shell /sbin/nologin ninai

# 3. application
sudo -u ninai git clone <repo> /opt/ninai
cd /opt/ninai && sudo -u ninai npm ci --omit=dev

# 4. secrets
sudo install -d -m 750 /etc/ninai
sudo install -m 600 /dev/null /etc/ninai/api.env
sudo nano /etc/ninai/api.env     # DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET, PORT

# 4b. the RDS certificate bundle, so the database link is verified
#     Keep it outside /etc/ninai: the sandbox masks that directory, and the
#     process would not be able to read it from there.
sudo curl -fsSL -o /etc/ssl/certs/rds-global-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
sudo chmod 644 /etc/ssl/certs/rds-global-bundle.pem
# then add this line to /etc/ninai/api.env:
#   DB_SSL_CA=/etc/ssl/certs/rds-global-bundle.pem

# 4c. who is an administrator (the users table has no role column yet)
#   ADMIN_EMAILS=cmo@example.com,ceo@example.com

# 5. nsjail
git clone --depth 1 https://github.com/google/nsjail.git /tmp/nsjail
cd /tmp/nsjail && sudo dnf install -y flex bison && sudo make -j2 nsjail
sudo install -m 755 /tmp/nsjail/nsjail /usr/local/bin/nsjail

# 6. systemd
sudo cp /opt/ninai/deploy/ninai-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ninai-api

# 7. TLS
sudo cp /opt/ninai/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

`JWT_SECRET` is generated with `openssl rand -hex 32`. Changing it signs
every one of your team out, so treat it as permanent.


## Removing a person

`DELETE /api/users/:id` revokes an account. It is administrator-only, and
the decision is made on the server from the token the server issued.

Until the `users` table has an `active` column, the removal is recorded in
`/etc/ninai/revoked.json` — a list of addresses the server refuses to sign
in. Restore with `POST /api/users/:id/restore`.

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
