# Ishlab chiqarishga joylashtirish — Nordic Work Intelligence

Bu yo'riqnoma universitetning o'z serveriga (Linux, Docker bilan) o'rnatish uchun. Barcha buyruqlar server terminalida bajariladi.

Oldindan: 50 tagacha xodim, ekran tasvirlari yoqilgan. Katta miqyos uchun serverni kuchaytiring.

## 0. Huquqiy tayyorgarlik (texnik ishdan oldin)

- Monitoring universitet buyrug'ida belgilanishi va xodimlar imzo bilan tanishtirilishi kerak.
- Shaxsga doir ma'lumotlar qonuni bo'yicha server O'zbekiston hududida bo'lishi shart.
- Monitoring siyosatini (yig'iladigan ma'lumot, saqlash muddati, ekran tasvirlari) yurist tasdiqlasin.

## 1. Server talablari

- Linux (Ubuntu 22.04+ yoki shunga o'xshash), Docker va Docker Compose o'rnatilgan.
- Kamida 2 yadro, 4 GB RAM, 40 GB disk (ekran tasvirlari ko'p joy olishi mumkin).
- Ichki domen, masalan `nwi.nordic.uz`, serverga yo'naltirilgan.
- Shu domen uchun TLS sertifikati (universitetning sertifikat markazidan yoki tijorat).

## 2. Kodni serverga olish

```bash
git clone <repozitoriya manzili> nwi
cd nwi
```

## 3. Sozlash

```bash
cp .env.production.example .env.production
```

`.env.production` ni tahrirlang. Maxfiy qiymatlarni alohida yarating:

```bash
openssl rand -base64 32   # DATA_ENCRYPTION_KEY uchun
openssl rand -base64 32   # AGENT_CONFIG_SIGNING_KEY uchun
openssl rand -hex 16      # POSTGRES_PASSWORD uchun
```

To'ldirish shart:

- `NWI_DOMAIN` — domeningiz (sertifikatdagi nom bilan bir xil).
- `ALLOWED_ORIGINS` — `https://<domeningiz>`.
- `POSTGRES_PASSWORD` va `DATABASE_URL` dagi parol (ikkalasi bir xil).
- `DATA_ENCRYPTION_KEY`, `AGENT_CONFIG_SIGNING_KEY`.

> **DATA_ENCRYPTION_KEY yo'qolsa, ekran tasvirlari, hujjatlar va MFA sirlarini ochib bo'lmaydi.** Uni zaxira nusxalardan alohida, xavfsiz joyda saqlang.

## 4. Sertifikat

Sertifikat va kalit fayllarini quyidagi joyga qo'ying:

```
infra/prod/certs/cert.pem    # sertifikat (zanjiri bilan)
infra/prod/certs/key.pem     # maxfiy kalit
```

Sertifikat hali yo'q bo'lsa, vaqtinchalik ichki sinov uchun `infra/docker/Caddyfile` dagi `tls ...` qatorini `tls internal` bilan almashtirish mumkin (brauzer ishonmaydi, faqat sinovga).

## 5. Ishga tushirish

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Birinchi ishga tushishda baza migratsiyalari avtomatik qo'llanadi. Holatni tekshirish:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -k https://<domeningiz>/api/health
```

## 6. Birinchi administrator

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec api npm run admin:create -w @nwi/api
```

Elektron pochta, ism va parol (kamida 12 belgi) so'raladi. Keyin brauzerda `https://<domeningiz>` ni oching va kiring. Birinchi kirishda ikki bosqichli tasdiqlash (MFA) sozlanadi — autentifikator ilovasi kerak.

## 7. Agent kaliti

Agentlarni yig'ish uchun konfiguratsiya imzosi ochiq kalitini oling:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec api npm run agent:pubkey -w @nwi/api
```

Agentlarni o'rnatish: `README.md`, 2-bo'lim. Ishlab chiqarishda `--allow-http` ishlatilmaydi — agent HTTPS domeniga ulanadi.

## 8. Zaxira nusxa (har kuni)

```bash
export NWI_BACKUP_PASSPHRASE="<uzun-maxfiy-parol>"
bash infra/prod/backup.sh
```

Zaxira `backups/` papkasiga shifrlangan holda yoziladi. Uni boshqa serverga yoki tashqi diskka ko'chiring. `NWI_BACKUP_PASSPHRASE` ni zaxira fayllardan alohida saqlang.

Har kuni avtomatik ishga tushirish uchun `cron`:

```cron
0 2 * * *  cd /path/to/nwi && NWI_BACKUP_PASSPHRASE="..." bash infra/prod/backup.sh >> backups/backup.log 2>&1
```

Eski zaxiralar 30 kundan keyin o'chadi (`NWI_BACKUP_RETENTION_DAYS` bilan o'zgartiriladi).

## 9. Tiklash

```bash
export NWI_BACKUP_PASSPHRASE="<o'sha parol>"
bash infra/prod/restore.sh backups/nwi-backup-YYYYMMDD-HHMMSS.tar.enc
docker compose --env-file .env.production -f docker-compose.prod.yml restart api
```

Tiklash joriy baza va fayllarni butunlay almashtiradi, shuning uchun tasdiq so'raydi.

Zaxiralarni muntazam tekshiring: tiklashni sinov serverida yoki alohida test bazasida sinab ko'ring.

## 10. Yangilash

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Migratsiyalar avtomatik qo'llanadi. Katta yangilanishdan oldin zaxira oling.

## 11. Xizmatlarni kuzatish

```bash
# Jurnallar
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api

# To'xtatish / ishga tushirish
docker compose --env-file .env.production -f docker-compose.prod.yml stop
docker compose --env-file .env.production -f docker-compose.prod.yml start
```

Barcha muhim amallar panelning **Audit jurnali** bo'limida ham ko'rinadi.

## 12. Qoldiq vazifalar (hali qilinmagan)

- AI/Claude foydalanish statistikasi.
- Hisobotlarni CSV, Excel, PDF qilib eksport qilish.
- Tizim sozlamalari sahifasi (siyosat sozlamalari hozircha API/baza orqali).
- Agentning imzolangan `.exe` o'rnatuvchisi va avtomatik yangilanishi (hozir Python orqali qo'lda).
- Yuklama testi (300+ xodim rejalashtirilsa).
