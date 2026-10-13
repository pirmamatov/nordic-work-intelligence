#!/usr/bin/env bash
# Zaxiradan tiklaydi. DIQQAT: joriy baza va fayllar BUTUNLAY almashtiriladi.
#
#   NWI_BACKUP_PASSPHRASE="..." bash infra/prod/restore.sh backups/nwi-backup-YYYYMMDD-HHMMSS.tar.enc
#
# Tasdiqsiz ishga tushirish uchun oxiriga --yes qo'shing (avtomatlashtirish uchun).
set -euo pipefail
cd "$(dirname "$0")/../.."

COMPOSE="docker compose --env-file ${NWI_ENV_FILE:-.env.production} -f ${NWI_COMPOSE:-docker-compose.prod.yml}"
: "${NWI_BACKUP_PASSPHRASE:?Zaxira parolini NWI_BACKUP_PASSPHRASE muhit ozgaruvchisida bering}"
FILE="${1:?Zaxira fayl yolini bering}"
[ -f "$FILE" ] || { echo "Fayl topilmadi: $FILE" >&2; exit 1; }

if [ "${2:-}" != "--yes" ]; then
  printf "DIQQAT: joriy baza va fayllar almashtiriladi. Davom etilsinmi? (ha/yoq): "
  read -r answer
  [ "$answer" = "ha" ] || { echo "Bekor qilindi."; exit 1; }
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "Zaxira ochilmoqda..."
openssl enc -d -aes-256-cbc -pbkdf2 -pass "env:NWI_BACKUP_PASSPHRASE" -in "$FILE" | tar -C "$tmp" -xf -

echo "Baza tiklanmoqda..."
$COMPOSE exec -T db psql -U nwi -d nwi -q -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
$COMPOSE exec -T db pg_restore -U nwi -d nwi --no-owner --no-privileges < "$tmp/db.dump"

echo "Fayllar tiklanmoqda..."
$COMPOSE exec -T api sh -c 'rm -rf /data/storage' || true
$COMPOSE exec -T api tar -C /data -xf - < "$tmp/storage.tar"

echo "Tiklandi. Serverni qayta ishga tushiring: $COMPOSE restart api"
