# Nordic Work Intelligence

Nordic International University xodimlarining ish vaqti, dasturlardan foydalanishi, topshiriqlari va akkreditatsiya hujjatlarini bog‘laydigan tizim.

Loyiha hali to‘liq tugamagan. Hozirgi holat va qolgan ishlar: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

| Qism          | Papka        | Holat                                                                                                                                                                      |
| ------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server (API)  | `apps/api`   | Kirish, rollar, xodimlar, bo‘limlar, agent, faoliyat, ekran tasvirlari, topshiriqlar, akkreditatsiya, hujjatlar tayyor. AI statistikasi va hisobotlar hali yo‘q            |
| Admin panel   | `apps/admin` | Kirish, bosh sahifa, xodimlar, xodim profili (faoliyat, ekran tasvirlari), topshiriqlar, akkreditatsiya, bo‘limlar, agentlar, monitoring siyosati, dasturlar, audit tayyor |
| Windows agent | `agent`      | Kod yozilgan va yadrosi sinovdan o‘tgan. Windows’ga xos qismi haqiqiy Windows’da hali sinalmagan                                                                           |

Loyihalash hujjatlari: [PRD](docs/PRD.md), [arxitektura](docs/ARCHITECTURE.md), [xavfsizlik](docs/SECURITY.md), [ma’lumotlar modeli](docs/DATA_MODEL.md).

## 1. Serverni ishga tushirish

Kerak: [Docker Desktop](https://www.docker.com/products/docker-desktop/). Node.js va PostgreSQL alohida o‘rnatilmaydi — ular Docker ichida ishlaydi.

Buyruqlar macOS/Linux terminalida ham, Windows PowerShell’da ham bir xil.

```powershell
# 1. Sozlamalar fayli
Copy-Item .env.example .env        # macOS/Linux: cp .env.example .env
```

`.env` ichida uchta maxfiy qiymatni to‘ldiring. Har birini alohida yarating:

| O‘zgaruvchi                | Qanday yaratiladi                          |
| -------------------------- | ------------------------------------------ |
| `POSTGRES_PASSWORD`        | Ixtiyoriy uzun parol (faqat harf va raqam) |
| `DATA_ENCRYPTION_KEY`      | `openssl rand -base64 32`                  |
| `AGENT_CONFIG_SIGNING_KEY` | `openssl rand -base64 32`                  |

PowerShell’da `openssl` bo‘lmasa:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

`DATABASE_URL` dagi `PAROL` o‘rniga `POSTGRES_PASSWORD` qiymatini, `localhost` o‘rniga `db` ni yozing.

```powershell
# 2. Ishga tushirish
docker compose up -d
docker compose run --rm api npm run migrate:deploy -w @nwi/api

# 3. Birinchi administrator (parolni o‘zingiz kiritasiz, kamida 12 belgi)
docker compose run --rm api npm run admin:create -w @nwi/api

# 4. Tekshirish
curl http://127.0.0.1:4000/api/health      # {"status":"ok"}
```

`DATA_ENCRYPTION_KEY` yo‘qolsa, saqlangan ekran tasvirlari va MFA sirlarini ochib bo‘lmaydi. Uni xavfsiz joyda saqlang.

Admin panel: brauzerda **http://localhost:5173** ni oching va yaratilgan administrator bilan kiring. Birinchi kirishda ikki bosqichli tasdiqlashni (MFA) sozlash so‘raladi — telefonga autentifikator ilovasi (Google Authenticator yoki Microsoft Authenticator) kerak bo‘ladi.

Bu ishlab chiqish rejimi: panel faqat shu kompyuterdan ochiladi. Ishlab chiqarish uchun HTTPS bilan joylashtirish hali tayyorlanmagan.

## 2. Windows agentni sinab ko‘rish

### 2.1. Serverda (shu kompyuterda)

```powershell
# API'ni mahalliy tarmoqqa ochish (faqat sinov uchun, shifrlanmagan HTTP)
docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d

# Agent yig'ilishiga kerak bo'ladigan konfiguratsiya kaliti
docker compose run --rm api npm run agent:pubkey -w @nwi/api
```

Keyin admin panelda (http://localhost:5173):

1. **Bo‘limlar** → bo‘lim qo‘shing (ixtiyoriy).
2. **Xodimlar → Xodim qo‘shish** → sinov xodimini yarating.
3. **Monitoring siyosati → Siyosat qo‘shish** → ish kunlari va soatlarini belgilang; skrinshot kerak bo‘lsa “Ekran tasvirlarini olish” ni yoqing; “Sukut bo‘yicha siyosat” ni belgilang.
4. Xodim profilini oching → **Agent** bo‘limi → **Ro‘yxatdan o‘tish kodini yaratish**. Kod bir marta ko‘rsatiladi.
5. Skrinshotlarni ko‘rish uchun: Xodimlar ro‘yxatida o‘zingizni oching → **Ekran tasvirlarini ko‘rish ruxsati → Ruxsat berish**.

Shu kompyuterning tarmoqdagi manzilini bilib oling (macOS: `ipconfig getifaddr en0`, Windows: `ipconfig`). Ikkala kompyuter bitta tarmoqda bo‘lishi kerak.

Panel o‘rniga buyruq satri bilan ham tayyorlash mumkin:

```powershell
docker compose run --rm -e EMPLOYEE_EMAIL=xodim@nordic.uz -e EMPLOYEE_NAME="Ism Familiya" -e SCREENSHOTS=on api npm run trial:setup -w @nwi/api
```

### 2.2. Windows kompyuterda

1. [Python 3.12 yoki yangiroq](https://www.python.org/downloads/windows/) ni o‘rnating. O‘rnatishda **“Add python.exe to PATH”** ni belgilang.
2. Loyihadagi `agent` papkasini Windows kompyuterga ko‘chiring.
3. PowerShell’ni shu papkada oching:

```powershell
# Agar skriptlar bloklangan bo'lsa (faqat shu oyna uchun ruxsat beradi)
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# Yig'ish: manzil va kalitni o'zingiznikiga almashtiring
.\build.ps1 -ServerUrl "http://192.168.1.20:4000" -ConfigPublicKey "KONFIGURATSIYA_KALITI"

# Ishga tushirish (HTTP faqat sinov uchun, shuning uchun aniq ruxsat beriladi)
.\dist\NordicWorkIntelligence\NordicWorkIntelligence.exe run --allow-http
```

Ochilgan oynada yig‘iladigan ma’lumotlar ro‘yxati chiqadi. Kodni kiriting, “tanishdim” ni belgilang va ro‘yxatdan o‘ting.

Shundan keyin:

- vazifalar panelida (soat yonida) yashil belgi paydo bo‘ladi; ustiga ikki marta bossangiz holat oynasi ochiladi;
- ekran tasvirlari yoqilgan bo‘lsa, ekranning yuqori o‘ng burchagida qizil **“Ekran tasviri yoqilgan”** yozuvi doim turadi va har bir tasvirda **“Ekran tasviri olindi”** ga o‘zgaradi;
- agent jurnali: `%LOCALAPPDATA%\NordicWorkIntelligence\agent.log`.

Yig‘ishsiz, to‘g‘ridan-to‘g‘ri Python orqali ham ishga tushirish mumkin:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m nwi_agent enroll --server "http://192.168.1.20:4000" --code "KOD" --public-key "KALIT" --allow-http
.\.venv\Scripts\python.exe -m nwi_agent run
```

### 2.3. Natijani ko‘rish

Admin panelda:

- **Bosh sahifa** — bugungi faol vaqt, agentlar holati, eng ko‘p ishlatilgan dasturlar;
- **Xodimlar** — har bir xodimning agent holati va bugungi vaqti;
- xodim profili → **Dasturlar**, **Xronologiya**, **Ekran tasvirlari** (tasvir “Ko‘rish” bosilganda ochiladi va bu audit jurnaliga yoziladi).

Agent ma’lumotni taxminan har 30 soniyada yuboradi, lekin bitta dasturda uzluksiz ishlaganda yozuv 5 daqiqagacha ochiq turadi. Shuning uchun birinchi raqamlar bir necha daqiqada paydo bo‘ladi.

### 2.4. Sinovdan keyin

```powershell
# Windows'da: agentni Task Manager orqali yoping, so'ng ma'lumotlarini o'chiring
Remove-Item -Recurse "$env:LOCALAPPDATA\NordicWorkIntelligence"

# Serverda: API'ni yana faqat shu kompyuterga yopish
docker compose up -d
```

Agentni har safar kirishda avtomatik ishga tushirish: `.\install-task.ps1`, olib tashlash: `.\install-task.ps1 -Remove`.

## 3. Testlar

```powershell
# Server: unit va integration testlar (haqiqiy PostgreSQL bilan, alohida test bazasida)
docker compose run --rm api npm test -w @nwi/api

# Server: tur tekshiruvi va lint
docker compose run --rm api npm run typecheck
docker compose run --rm api npm run lint

# Admin panel: komponent testlari
docker compose run --rm api npm test -w @nwi/admin

# To'liq oqim haqiqiy brauzerda (macOS/Linux; alohida vaqtinchalik bazada ishlaydi)
bash infra/e2e/run.sh

# Agent yadrosi (Windows'da, agent papkasida)
.\.venv\Scripts\python.exe -m pytest
```

## 4. Nosozliklar

| Belgi                                                    | Sabab va yechim                                                                                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Konfiguratsiya xatosi — DATA_ENCRYPTION_KEY...`         | `.env` dagi kalit 32 bayt emas. `openssl rand -base64 32` bilan qayta yarating                                                                                              |
| Agent: “Serverga ulanib bo‘lmadi”                        | Kompyuterlar bitta tarmoqda emas, manzil noto‘g‘ri yoki server `docker-compose.lan.yml` siz ishga tushgan. Windows’da `curl http://MANZIL:4000/api/health` bilan tekshiring |
| Agent: “kod noto‘g‘ri yoki muddati o‘tgan”               | Kod bir marta ishlaydi va 24 soat amal qiladi. `trial:setup` ni qayta ishga tushiring                                                                                       |
| Agent: “konfiguratsiyasi imzosi mos kelmadi”             | `-ConfigPublicKey` shu serverniki emas. `docker compose run --rm api npm run agent:pubkey -w @nwi/api` bilan qayta oling                                                    |
| Agent: “Server manzili https:// bilan boshlanishi kerak” | HTTP faqat `--allow-http` bilan va faqat ichki tarmoq manzillariga ruxsat etiladi                                                                                           |
| Windows SmartScreen ogohlantirishi                       | `.exe` kod imzolash sertifikati bilan imzolanmagan. Sinov uchun “More info → Run anyway”                                                                                    |
| Ekran tasviri kelmayapti                                 | Siyosatda o‘chirilgan (`SCREENSHOTS=on` bilan `trial:setup` ni qayta ishga tushiring; agent yangi siyosatni bir daqiqa ichida oladi) yoki ekran qulflangan                  |
