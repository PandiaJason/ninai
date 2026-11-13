#!/usr/bin/env bash
# Nightly database backup: Postgres -> compressed dump -> private S3 bucket.
#
# Run from cron on the API host:
#   0 3 * * * /opt/ninai/deploy/backup.sh >> /var/log/ninai-backup.log 2>&1
#
# Requires: pg_dump, aws cli, and credentials for the instance (an IAM role
# attached to the EC2 instance is preferred over static keys).

set -euo pipefail

# --- configuration ---------------------------------------------------------
: "${BACKUP_BUCKET:?BACKUP_BUCKET must be set, e.g. s3://ninai-backups}"
: "${PGHOST:?PGHOST must be set}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=ninai}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${LOCAL_RETENTION_DAYS:=3}"

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
WORKDIR="$(mktemp -d)"
DUMP="${WORKDIR}/ninai-${STAMP}.dump"
trap 'rm -rf "${WORKDIR}"' EXIT

echo "[backup] starting ${STAMP}"

# --- 1. take the dump ------------------------------------------------------
pg_dump --format=custom --compress=9 --no-owner --no-privileges \
        --file="${DUMP}" "postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"

SIZE_BYTES=$(stat -c %s "${DUMP}")
echo "[backup] dump written: ${DUMP} (${SIZE_BYTES} bytes)"

# --- 2. prove it is readable before it leaves the machine -------------------
# A dump that cannot be listed cannot be restored. Verify now, not at 3am.
ENTRIES=$(pg_restore --list "${DUMP}" | wc -l)
if [ "${ENTRIES}" -lt 5 ]; then
    echo "[backup] FAILED: dump looks empty (${ENTRIES} entries)"
    exit 1
fi
echo "[backup] dump verified: ${ENTRIES} entries"

# --- 3. upload --------------------------------------------------------------
aws s3 cp "${DUMP}" \
    "${BACKUP_BUCKET}/ninai/${STAMP}.dump" \
    --storage-class STANDARD_IA \
    --metadata "created=${STAMP}" \
    --only-show-errors

echo "[backup] uploaded to ${BACKUP_BUCKET}/ninai/${STAMP}.dump"

# --- 4. prune local copies older than the retention window -----------------
find "${WORKDIR:-/tmp}" -maxdepth 1 -name 'ninai-*.dump' -mtime "+${LOCAL_RETENTION_DAYS}" -delete 2>/dev/null || true

# --- 5. report --------------------------------------------------------------
LATEST=$(aws s3 ls "${BACKUP_BUCKET}/ninai/" 2>/dev/null | tail -n 1 | awk '{print $4}')
echo "[backup] done. newest object: ${LATEST:-unknown}"

# Retention is handled by an S3 lifecycle rule on the bucket:
#   daily objects      -> expire after 30 days
#   weekly objects    -> expire after 180 days
#   monthly objects   -> expire after 365 days
