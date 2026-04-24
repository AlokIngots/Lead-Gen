#!/usr/bin/env bash
# VPS setup script for alok_lms
# Run once on the VPS after cloning the repo
#
# Prerequisites:
#   - Docker + Docker Compose installed
#   - MySQL running on host with database alok_lms
#   - Nginx installed
#   - Node.js 18+ installed

set -euo pipefail

APP_DIR="/home/ubuntu/alok_lms"

echo "=== Alok LMS VPS Setup ==="

# 1. Pull latest code
echo "[1/7] Pulling latest code..."
cd "$APP_DIR"
git pull origin main

# 2. Build frontend
echo "[2/7] Building frontend..."
cd "$APP_DIR/frontend"
npm install --production=false
npm run build
echo "Frontend built at $APP_DIR/frontend/dist"

# 3. Check backend .env exists
echo "[3/7] Checking backend .env..."
if [ ! -f "$APP_DIR/backend/.env" ]; then
  echo "ERROR: $APP_DIR/backend/.env not found!"
  echo "Create it from .env.example and fill in real values."
  echo "  cp $APP_DIR/backend/.env.example $APP_DIR/backend/.env"
  echo "  nano $APP_DIR/backend/.env"
  exit 1
fi
echo "backend/.env found"

# 4. Build and start Docker
echo "[4/7] Starting Docker containers..."
cd "$APP_DIR"
docker compose up -d --build
echo "Backend running on port 8001"

# 5. Setup nginx
echo "[5/7] Configuring nginx..."
cp "$APP_DIR/nginx/lms.conf" /etc/nginx/sites-enabled/lms.conf
nginx -t && nginx -s reload
echo "Nginx configured"

# 6. Setup daily backup cron
echo "[6/7] Setting up daily backup..."
chmod +x "$APP_DIR/scripts/backup-db.sh"
mkdir -p /backups/alok_lms
# Add cron job if not already present
CRON_CMD="0 2 * * * $APP_DIR/scripts/backup-db.sh >> /var/log/alok_lms_backup.log 2>&1"
(crontab -l 2>/dev/null | grep -v "backup-db.sh" ; echo "$CRON_CMD") | crontab -
echo "Daily backup scheduled at 2:00 AM"

# 7. Health check
echo "[7/7] Health check..."
sleep 3
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/docs | grep -q "200"; then
  echo "Backend API is UP"
else
  echo "WARNING: Backend may not be running. Check: docker compose logs backend"
fi

echo ""
echo "=== Setup complete ==="
echo "Next steps:"
echo "  1. Set INTERAKT_API_KEY and SMS_MODE=interakt in backend/.env"
echo "  2. Run: docker compose restart"
echo "  3. Setup SSL: certbot --nginx -d lms.alokindia.co.in"
echo "  4. Test: https://lms.alokindia.co.in"
