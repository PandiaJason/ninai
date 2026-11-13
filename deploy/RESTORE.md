# Restore procedure

Two kinds of restore, depending on what broke.

---

## A. Recover the database into RDS (the common case)

Use this after data loss, corruption, or a bad migration.

**Prerequisites:** the backup bucket, the AWS CLI, and credentials that can
read it. The RDS instance must accept a connection from where you run this
(it is inside the VPC, so run it from the API host or over an SSH tunnel).

### A1. Pick the file to restore

```bash
aws s3 ls s3://ninai-backups/ninai/ --recursive
# copy the newest object you want, e.g.
aws s3 cp s3://ninai-backups/ninai/2026-11-13T03:00:00Z.dump /tmp/restore.dump
```

### A2. Take a safety copy of what is there now

Never restore over data without a way back:

```bash
pg_dump --format=custom --file=/tmp/pre-restore-$(date +%s).dump \
        "postgresql://ninai_app@$PGHOST:5432/ninai"
aws s3 cp /tmp/pre-restore-*.dump s3://ninai-backups/ninai/
```

### A3. Restore

```bash
# stop writes first, so nothing lands mid-restore
sudo systemctl stop ninai-api

psql "postgresql://<admin>@$PGHOST:5432/ninai" <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
SQL

pg_restore --dbname "postgresql://<admin>@$PGHOST:5432/ninai" \
           --no-owner --no-privileges --clean --if-exists \
           /tmp/restore.dump
```

> Use an admin role, not `ninai_app` — the application role cannot drop
> schemas.

### A4. Fix ownership and grants

```bash
psql "postgresql://<admin>@$PGHOST:5432/ninai" <<'SQL'
GRANT USAGE ON SCHEMA public TO ninai_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ninai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leads TO ninai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lead_notes TO ninai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ninai_app;
SQL
```

### A5. Verify before opening the doors

```bash
psql "postgresql://<admin>@$PGHOST:5432/ninai" \
  -c "SELECT count(*) FROM users;" \
  -c "SELECT count(*) FROM leads;"
sudo systemctl start ninai-api
curl -s https://api.<domain>/api/health
```

Then sign in through the app and spot-check a few records.

---

## B. Point-in-time recovery (PITR)

RDS keeps a continuous transaction log, so you can rewind to any second
inside the retention window instead of to the last nightly dump.

1. RDS → your instance → **Restore** → **Point in time restore**
2. Pick the timestamp, the subnet group and a **new** instance name
3. Wait for it to become available
4. Verify the data on the new instance
5. Switch the API over: update `DB_HOST` in `/etc/ninai/api.env` to the new
   instance's endpoint, then `sudo systemctl restart ninai-api`

The old instance stays untouched until you delete it — keep it for a few days
as a second safety net.

---

## C. Restore onto a local machine (forensics)

```bash
createdb -h 127.0.0.1 -U postgres ninai_restore
pg_restore --dbname "postgresql://postgres@127.0.0.1:5432/ninai_restore" \
           --no-owner --no-privileges /tmp/restore.dump
```

---

## The monthly drill

A backup nobody has restored is a hypothesis, not a backup. Once a month:

1. Restore the newest dump into a **scratch** database on the RDS instance
   (`CREATE DATABASE ninai_drill;` then `pg_restore` into it)
2. Run the checks in A5 against it and compare row counts with production
3. Record the result and the time it took
4. `DROP DATABASE ninai_drill;`

If a drill fails, fix it before trusting the next backup.

---

## Where the backups live

| Layer | What it protects | Where |
|---|---|---|
| RDS automated backups + PITR | The shared CRM rows | AWS-managed, 7+ day retention |
| Nightly `pg_dump` to S3 | Same data, independent copy | `s3://<bucket>/ninai/` |
| Workspace snapshots (Cloudflare R2 / S3) | The data that never reaches Postgres — notes, projects, tasks | Settings → Versions & backup |

The third layer matters: those records exist only on each laptop, so the
snapshot is their only off-device copy.
