#!/usr/bin/env bash
# Daily MySQL backup for alok_lms
# Keeps 7 days of backups, compresses with gzip
#
# Install: add to crontab on VPS
#   crontab -e
#   0 2 * * * /home/ubuntu/alok_lms/scripts/backup-db.sh >> /var/log/alok_lms_backup.log 2>&1

set -euo pipefail

BACKUP_DIR="/backups/alok_lms"
DB_NAME="alok_lms"
DB_USER="lms_user"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

mysqldump \
  --user="$DB_USER" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  "$DB_NAME" | gzip > "$BACKUP_FILE"

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup complete: $BACKUP_FILE ($FILE_SIZE)"

# Delete backups older than retention period
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
echo "[$(date)] Cleaned up $DELETED old backups (>${RETENTION_DAYS} days)"

echo "[$(date)] Done. Current backups:"
ls -lh "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null | tail -10
