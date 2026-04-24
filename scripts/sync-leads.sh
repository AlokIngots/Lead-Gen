#!/usr/bin/env bash
# One-time sync: export leads from source DB, import to VPS
#
# Usage:
#   ./sync-leads.sh <source_host> <source_user> <source_db> <source_password>
#
# Example:
#   ./sync-leads.sh 192.168.1.50 root alok_lms 'MyPass123'
#
# This dumps the leads table from source and imports it on localhost.

set -euo pipefail

SRC_HOST="${1:?Usage: $0 <source_host> <source_user> <source_db> <source_password>}"
SRC_USER="${2:?}"
SRC_DB="${3:?}"
SRC_PASS="${4:?}"

DST_DB="alok_lms"
DST_USER="lms_user"
DUMP_FILE="/tmp/leads_sync_$(date +%Y%m%d_%H%M%S).sql"

echo "[$(date)] Exporting leads from ${SRC_HOST}/${SRC_DB}..."

mysqldump \
  --host="$SRC_HOST" \
  --user="$SRC_USER" \
  --password="$SRC_PASS" \
  --single-transaction \
  --quick \
  --no-create-info \
  --set-gtid-purged=OFF \
  "$SRC_DB" leads > "$DUMP_FILE"

ROW_COUNT=$(grep -c "^INSERT" "$DUMP_FILE" || echo "0")
FILE_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "[$(date)] Exported: $FILE_SIZE ($ROW_COUNT INSERT statements)"

echo "[$(date)] Importing into local ${DST_DB}..."
mysql --user="$DST_USER" "$DST_DB" < "$DUMP_FILE"

FINAL_COUNT=$(mysql --user="$DST_USER" "$DST_DB" -N -e "SELECT COUNT(*) FROM leads")
echo "[$(date)] Import complete. Total leads in destination: $FINAL_COUNT"

rm -f "$DUMP_FILE"
echo "[$(date)] Cleaned up temp file. Done."
