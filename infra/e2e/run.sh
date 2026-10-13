#!/usr/bin/env bash
# Haqiqiy brauzerda to'liq oqim sinovi (Playwright). Alohida vaqtinchalik bazada (nwi_e2e)
# ishlaydi va tugagach uni o'chiradi — asosiy bazaga tegmaydi.
#
#   bash infra/e2e/run.sh
#
# Natija: e2e/out/steps.txt (qadamlar) va e2e/out/*.png (ekran suratlari).
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="$PWD/e2e/out"
rm -rf "$OUT" && mkdir -p "$OUT"
PG=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2)
E2E_URL="postgresql://nwi:$PG@db:5432/nwi_e2e"
export ADMIN_EMAIL="e2e-admin@nordic.test"
export ADMIN_PASSWORD="E2e-Sinov-$(openssl rand -hex 6)"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.64.0-noble"

cleanup() {
  docker rm -f nwi-e2e-api nwi-e2e-admin nwi-e2e-browser >/dev/null 2>&1 || true
  docker compose exec -T db psql -U nwi -d nwi -q -c 'DROP DATABASE IF EXISTS nwi_e2e WITH (FORCE)' >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker compose up -d db >/dev/null 2>&1
docker compose exec -T db psql -U nwi -d nwi -q -c 'CREATE DATABASE nwi_e2e'
api() { docker compose run --rm -T --no-deps -e DATABASE_URL="$E2E_URL" "$@"; }
api -w /workspace/apps/api api npx prisma migrate deploy >/dev/null 2>&1
api -e ADMIN_EMAIL -e ADMIN_PASSWORD -e ADMIN_FULL_NAME="E2E Admin" api npm run -s admin:create -w @nwi/api >/dev/null 2>&1
KEY=$(api api npm run -s agent:pubkey -w @nwi/api 2>/dev/null | tail -1)

docker compose run -d --no-deps --name nwi-e2e-api -e DATABASE_URL="$E2E_URL" -e STORAGE_DIR=/tmp/e2e-storage api npm run -s start -w @nwi/api >/dev/null 2>&1
docker compose run -d --no-deps --name nwi-e2e-admin -e API_PROXY_TARGET=http://nwi-e2e-api:4000 -e DEV_ALLOWED_HOSTS=nwi-e2e-admin admin >/dev/null 2>&1
for _ in $(seq 1 30); do
  docker exec nwi-e2e-api node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && break
  sleep 2
done
API_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' nwi-e2e-api)

docker run --rm --name nwi-e2e-browser --network nwi_default -v "$PWD/e2e":/e2e:ro -v "$OUT":/out \
  -e PANEL_URL=http://nwi-e2e-admin:5173 -e ADMIN_EMAIL -e ADMIN_PASSWORD "$PLAYWRIGHT_IMAGE" \
  sh -c 'mkdir /work && cd /work && npm init -y >/dev/null && npm i --silent playwright@1.64.0 >/dev/null 2>&1 && cp /e2e/panel.e2e.mjs . && node panel.e2e.mjs' &
BROWSER_PID=$!

# Brauzer panel orqali ro'yxatdan o'tish kodini yaratguncha kutiladi, so'ng agent ishga tushadi.
for _ in $(seq 1 120); do
  [ -f "$OUT/enrollment-code.txt" ] && break
  kill -0 $BROWSER_PID 2>/dev/null || break
  sleep 2
done
if [ -f "$OUT/enrollment-code.txt" ]; then
  CODE=$(cat "$OUT/enrollment-code.txt")
  docker run --rm --network nwi_default -v "$PWD/agent":/agent:ro -w /agent \
    -e NWI_AGENT_HOME=/tmp/agent-home -e NWI_AGENT_FAKE_PLATFORM=1 -e NWI_AGENT_FAKE_SCREEN_FILE=/tmp/screen.jpg -e PYTHONDONTWRITEBYTECODE=1 \
    python:3.12-slim sh -c "
      pip install -q --root-user-action=ignore cryptography tzdata pillow 2>&1 | grep -v notice
      python -c \"
from PIL import Image, ImageDraw
img = Image.new('RGB', (1280, 720), '#f6f8f7')
d = ImageDraw.Draw(img)
d.rectangle((0, 0, 1280, 60), fill='#087268')
d.text((24, 22), 'E2E sinov ekrani (haqiqiy ekran emas)', fill='white')
for i in range(8): d.rectangle((60, 120 + i * 60, 1220 - i * 90, 150 + i * 60), fill='#c5d3d0')
img.save('/tmp/screen.jpg', quality=70)\"
      python -m nwi_agent enroll --server http://$API_IP:4000 --code $CODE --public-key $KEY --allow-http --accept | tail -1
      timeout -s TERM 75 python -m nwi_agent run --no-ui || true
    "
fi
touch "$OUT/agent-done"

STATUS=0
wait $BROWSER_PID || STATUS=$?
echo "--- konsol xatolari:"; cat "$OUT/console-errors.txt" 2>/dev/null || true
exit $STATUS
