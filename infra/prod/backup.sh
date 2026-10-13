#!/usr/bin/env bash
# Baza va shifrlangan fayllarni bitta shifrlangan arxivga zaxiralaydi.
#
#   NWI_BACKUP_PASSPHRASE="..." bash infra/prod/backup.sh
#
# Zaxira paroli (NWI_BACKUP_PASSPHRASE) va DATA_ENCRYPTION_KEY ni zaxira fayllardan
# ALOHIDA, xavfsiz joyda saqlang — ularsiz zaxirani ochib bo'lmaydi.
set -euo pipefail
cd "$(dirname "$0")/../.."

COMPOSE="docker compose --env-file ${NWI_ENV_FILE:-.env.production} -f ${NWI_COMPOSE:-docker-compose.prod.yml}"
BACKUP_DIR="${NWI_BACKUP_DIR:-./backups}"
RETENTION_DAYS="${NWI_BACKUP_RETENTION_DAYS:-30}"
: "${NWI_BACKUP_PASSPHRASE:?Zaxira parolini NWI_BACKUP_PASSPHRASE muhit ozgaruvchisida bering}"

mkdir -p "$BACKUP_DIR"
stamp=$(date +%Y%m%d-%H%M%S)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Bazani zaxiralash..."
$COMPOSE exec -T db pg_dump -U nwi -d nwi -Fc > "$tmp/db.dump"
echo "Fayllarni zaxiralash..."
$COMPOSE exec -T api tar -C /data -cf - storage > "$tmp/storage.tar"

out="$BACKUP_DIR/nwi-backup-$stamp.tar.enc"
tar -C "$tmp" -cf - db.dump storage.tar \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "env:NWI_BACKUP_PASSPHRASE" > "$out"
echo "Zaxira tayyor: $out ($(du -h "$out" | cut -f1))"

# Eski zaxiralarni tozalash.
find "$BACKUP_DIR" -name 'nwi-backup-*.tar.enc' -type f -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true
