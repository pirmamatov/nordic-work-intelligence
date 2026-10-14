#!/usr/bin/env bash
#
# Nordic Work Intelligence — native deploy (Ubuntu/Debian VM, lokal PostgreSQL).
# HTTPS asosiy serverdagi Kerio Control proksi orqali, bu yerda faqat HTTP.
#
# Ishlatish (root yoki sudo bilan):
#   sudo ./deploy.sh
#
# Birinchi ishga tushirishda: bog'liqliklar, baza, migratsiya, seed, admin panel yig'ish,
# systemd xizmati va nginx sozlanadi. Keyingi ishga tushirishlarda: kod yangilanadi,
# migratsiya qo'llanadi va xizmat qayta ishga tushadi. Maxfiy kalitlar saqlanib qoladi.
set -euo pipefail

# ─────────────────────────── Sozlamalar ───────────────────────────
DOMAIN="work-intelligence.nordicuniversity.org"
APP_PORT="5084"
DB_USER="postgres"
DB_PASSWORD="root"
DB_NAME="work-intelligence"
DB_HOST="localhost"
DB_PORT="5432"
FILES_DIR="/mnt/work-intelligence-files"
ORG_TIMEZONE="Asia/Tashkent"
NODE_MAJOR="24"
SERVICE_NAME="work-intelligence"

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$APP_DIR/.env.production"
# Xizmatni ishga tushiruvchi foydalanuvchi: sudo chaqirgan foydalanuvchi yoki papka egasi.
APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR")}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31mXATO: %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "deploy.sh root bilan ishga tushirilishi kerak: sudo ./deploy.sh"

# ─────────────────── 1. Tizim bog'liqliklari ───────────────────
log "Tizim bog'liqliklari tekshirilmoqda"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git openssl postgresql-client nginx >/dev/null

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  log "Node.js ${NODE_MAJOR} o'rnatilmoqda"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node: $(node -v), npm: $(npm -v)"
NPM_BIN="$(command -v npm)"

# ─────────────────── 2. Fayllar papkasi ───────────────────
log "Fayllar papkasi: $FILES_DIR"
mkdir -p "$FILES_DIR"
chown -R "$APP_USER" "$FILES_DIR"
chmod 750 "$FILES_DIR"

# ─────────────────── 3. PostgreSQL bazasi ───────────────────
log "PostgreSQL bazasi tekshirilmoqda: $DB_NAME"
export PGPASSWORD="$DB_PASSWORD"
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  echo "Baza yaratilmoqda..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\"" >/dev/null
else
  echo "Baza allaqachon mavjud."
fi
unset PGPASSWORD

# ─────────────────── 4. Sozlamalar fayli (.env.production) ───────────────────
# Maxfiy kalitlar faqat BIR MARTA yaratiladi. Qayta yaratilsa, saqlangan ekran
# tasvirlari va MFA sirlarini ochib bo'lmaydi — shuning uchun mavjud bo'lsa saqlanadi.
if [ ! -f "$ENV_FILE" ]; then
  log "Sozlamalar fayli yaratilmoqda (maxfiy kalitlar generatsiya qilinadi)"
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
HOST=127.0.0.1
PORT=${APP_PORT}
LOG_LEVEL=info
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
ALLOWED_ORIGINS=https://${DOMAIN}
COOKIE_SECURE=true
TRUST_PROXY=1
DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)
AGENT_CONFIG_SIGNING_KEY=$(openssl rand -base64 32)
SESSION_IDLE_MINUTES=30
SESSION_ABSOLUTE_HOURS=12
MFA_ENFORCED=true
ORG_TIMEZONE=${ORG_TIMEZONE}
LOGIN_RATE_LIMIT=20
STORAGE_DIR=${FILES_DIR}
SCREENSHOT_RETENTION_DAYS=14
AGENT_ONLINE_WINDOW_SEC=180
ACTIVITY_MAX_AGE_DAYS=90
ENV
  chmod 600 "$ENV_FILE"
  chown "$APP_USER" "$ENV_FILE"
else
  echo "Sozlamalar fayli mavjud — saqlab qolindi: $ENV_FILE"
fi

# ─────────────────── 5. Bog'liqliklar va yig'ish ───────────────────
log "npm bog'liqliklari o'rnatilmoqda"
npm ci --no-audit --no-fund

log "Prisma mijozi yaratilmoqda"
set -a; . "$ENV_FILE"; set +a
npm run --silent prisma:generate -w @nwi/api

log "Baza migratsiyalari qo'llanmoqda"
npm run --silent migrate:deploy -w @nwi/api

log "Rollar/ruxsatlar va administrator (seed)"
npm run --silent seed -w @nwi/api

log "Admin panel yig'ilmoqda"
npm run --silent build -w @nwi/admin

# Repo va node_modules xizmat foydalanuvchisiga o'qilishi uchun.
chown -R "$APP_USER" "$APP_DIR/node_modules" "$APP_DIR/apps/admin/dist" 2>/dev/null || true

# ─────────────────── 6. systemd xizmati ───────────────────
log "systemd xizmati sozlanmoqda: ${SERVICE_NAME}"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=Nordic Work Intelligence API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${NPM_BIN} run --silent start -w @nwi/api
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ReadWritePaths=${FILES_DIR}

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1 || true
systemctl restart "${SERVICE_NAME}"

# ─────────────────── 7. nginx ───────────────────
log "nginx sozlanmoqda"
cat > "/etc/nginx/sites-available/${DOMAIN}" <<NGINX
# Nordic Work Intelligence — faqat HTTP. HTTPS'ni Kerio Control proksi boshqaradi.
server {
    listen 80;
    server_name ${DOMAIN};

    # Hujjat va ekran tasviri yuklash uchun (server cheklovidan biroz kattaroq).
    client_max_body_size 30m;

    # Admin panel (statik fayllar).
    root ${APP_DIR}/apps/admin/dist;
    index index.html;

    # API so'rovlari Node xizmatiga uzatiladi.
    location /api/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        # Tashqi ulanish Kerio orqali HTTPS, shuning uchun https deb bildiriladi.
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 300s;
    }

    # Qolgan barcha yo'llar — bitta sahifali ilova (deep-linklar uchun).
    location / {
        try_files \$uri /index.html;
    }
}
NGINX
ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
nginx -t
systemctl reload nginx

# ─────────────────── 8. Tekshiruv ───────────────────
log "Xizmat tekshirilmoqda"
sleep 3
for i in $(seq 1 10); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    echo "API javob bermoqda (port ${APP_PORT})."
    break
  fi
  [ "$i" -eq 10 ] && { journalctl -u "${SERVICE_NAME}" -n 30 --no-pager; die "API ishga tushmadi"; }
  sleep 2
done

log "Tayyor"
echo "Panel:   https://${DOMAIN}"
echo "Xizmat:  systemctl status ${SERVICE_NAME}"
echo "Jurnal:  journalctl -u ${SERVICE_NAME} -f"
echo "Agent kaliti: npm run agent:pubkey -w @nwi/api"
