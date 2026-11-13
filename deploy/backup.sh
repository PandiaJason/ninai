#!/usr/bin/env bash
# Nightly database backup for the NINAI API host (Amazon Linux 2023).
#
# Writes a compressed dump to /var/backups/ninai and, when the instance has an
# IAM role with S3 access, uploads a copy to the backup bucket.
#
# Cron (root):
#   10 3 * * * /opt/ninai/deploy/backup.sh >> /var/log/ninai-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="/var/backups/ninai"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-7}"
BACKUP_BUCKET="${BACKUP_BUCKET:-}"       # e.g. s3://ninai-backups
ENV_FILE="${ENV_FILE:-/etc/ninai/api.env}"

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DUMP="${BACKUP_DIR}/ninai-${STAMP}.dump"

log() { echo "[backup $(date -u +%H:%M:%S)] $*"; }

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

# Load the database credentials from the systemd environment file.
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

export PGPASSWORD="${DB_PASSWORD}"
SSL_OPTS="sslmode=verify-full&sslrootcert=/etc/ninai/global-bundle.pem"

log "starting ${STAMP}"

# 1. take the dump
if ! pg_dump --format=custom --compress=9 --no-owner --no-privileges \
        --file="${DUMP}" \
        "postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}?${SSL_OPTS}"; then
    log "FAILED: pg_dump errored"
    exit 1
fi
chmod 600 "${DUMP}"
log "dump written: ${DUMP} ($(stat -c %s "${DUMP}") bytes)"

# 2. prove it is readable before we trust it
ENTRIES=$(pg_restore --list "${DUMP}" | wc -l)
if [ "${ENTRIES}" -lt 5 ]; then
    log "FAILED: dump looks empty (${ENTRIES} entries)"
    exit 1
fi
log "dump verified: ${ENTRIES} entries"

# 3. upload a copy when the instance has S3 credentials
if [ -n "${BACKUP_BUCKET}" ] && aws sts get-caller-identity >/dev/null 2>&1; then
    if aws s3 cp "${DUMP}" "${BACKUP_BUCKET}/ninai/${STAMP}.dump" \
            --storage-class STANDARD_IA --only-show-errors; then
        log "uploaded to ${BACKUP_BUCKET}/ninai/${STAMP}.dump"
    else
        log "WARNING: S3 upload failed (local copy kept)"
    fi
else
    log "no S3 credentials on this host — local copy only"
fi

# 4. prune old local dumps
find "${BACKUP_DIR}" -maxdepth 1 -name 'ninai-*.dump' -mtime "+${LOCAL_RETENTION_DAYS}" -delete
KEPT=$(find "${BACKUP_DIR}" -maxdepth 1 -name 'ninai-*.dump' | wc -l)
log "done. ${KEPT} local dump(s) retained"
