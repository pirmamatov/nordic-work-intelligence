# ARCHITECTURE — Nordic Work Intelligence

## 1. Umumiy ko‘rinish

```
 Xodim kompyuteri (Windows)                 Universitet serveri
┌──────────────────────────┐        ┌────────────────────────────────────┐
│ Windows agent (Python)   │  TLS   │ Reverse proxy (Caddy, HTTPS)       │
│  ├ kollektor (Win32 API) ├───────►│  ├ /api  → API (Node.js, Express)  │
│  ├ mahalliy navbat SQLite│        │  └ /     → Admin panel (statik)    │
│  ├ sinxronlash           │        │                                    │
│  └ tray indikator        │        │ API ── Prisma ── PostgreSQL        │
└──────────────────────────┘        │  ├ fon vazifalari (agregatsiya,    │
                                    │  │   saqlash muddati, eslatmalar)  │
 Administrator brauzeri             │  └ fayl ombori (shifrlangan)       │
┌──────────────────────────┐  TLS   │                                    │
│ Admin panel (React SPA)  ├───────►│ Zaxira: pg_dump + shifrlash        │
└──────────────────────────┘        └────────────────────────────────────┘
```

## 2. Repozitoriy tuzilishi

```
windows-screen/
├ apps/
│  ├ api/          Node.js + TypeScript + Express + Prisma
│  └ admin/        React + TypeScript + Vite + Tailwind + shadcn/ui
├ packages/
│  └ shared/       Zod sxemalari va umumiy turlar (API va panel bir xil sxemadan foydalanadi)
├ agent/           Python Windows agenti
├ infra/           Docker Compose, Caddy, zaxira/tiklash skriptlari
├ docs/            Loyihalash hujjatlari
└ README.md
```

npm workspaces ishlatiladi. Barcha paket versiyalari `package-lock.json` da, agent bog‘liqliklari xeshlari bilan `requirements.lock` da mahkamlanadi. Aniq versiyalar 2-bosqichda o‘rnatish paytida tanlanadi va o‘zaro mosligi tekshiriladi; hujjatga xotiradan versiya yozilmaydi.

## 3. Texnologik qarorlar

| Qaror                    | Tanlov                                                                      | Sabab                                                                                         |
| ------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Node.js                  | Faol LTS tarmog‘i                                                           | Uzoq muddatli qo‘llab-quvvatlash                                                              |
| Admin autentifikatsiyasi | Server sessiyasi, `HttpOnly` + `Secure` + `SameSite=Strict` cookie          | Sessiyani darhol bekor qilish mumkin; JWT’da bu qiyin. Token JavaScript’ga ko‘rinmaydi        |
| CSRF                     | Double-submit token + `SameSite=Strict`                                     | Cookie asosidagi sessiya uchun zarur                                                          |
| Parol xeshi              | Argon2id                                                                    | Hozirgi tavsiya etilgan algoritm                                                              |
| MFA                      | TOTP (RFC 6238), zaxira kodlari                                             | Qo‘shimcha xizmatga bog‘liq emas                                                              |
| Agent autentifikatsiyasi | Bir martalik ro‘yxatdan o‘tish kodi → qurilma tokeni (serverda faqat xeshi) | Token Windows DPAPI bilan himoyalanadi, server uni istalgan payt bekor qiladi                 |
| Real vaqt                | Server-Sent Events                                                          | Yangilanish faqat serverdan panelga oqadi; WebSocket’dan sodda, proksi bilan muammosiz        |
| Validatsiya              | Zod, `packages/shared` da                                                   | Bitta sxema: API tekshiradi, panel formalarda ishlatadi, OpenAPI shundan generatsiya qilinadi |
| Loglash                  | pino (JSON), maxfiy maydonlar redaksiya qilinadi                            | Structured logging talabi                                                                     |
| Fayl ombori              | Mahalliy disk yoki S3-mos ombor, abstraksiya orqali                         | Ichki serverda ham, VPS’da ham ishlaydi                                                       |
| Fon vazifalari           | PostgreSQL asosidagi navbat (pg-boss)                                       | Alohida Redis kerak emas                                                                      |
| Agent mahalliy navbati   | SQLite (WAL rejimi)                                                         | Tranzaksiyali, elektr uzilishiga chidamli                                                     |

## 4. Telemetriya oqimi

1. Agent har soniyada oldingi plandagi oyna jarayonini va oxirgi kiritish vaqtini so‘raydi (`GetForegroundWindow`, `GetLastInputInfo`). Klaviatura yoki sichqoncha hodisalari mazmuni olinmaydi.
2. Holat o‘zgarganda (boshqa dastur, faol ↔ nofaol, ekran qulflandi) joriy segment yopiladi va yangi segment ochiladi. Segment — `ActivityEvent`.
3. Har bir segment mijozda yaratilgan UUID (`clientEventId`) bilan SQLite navbatiga yoziladi.
4. Sinxronlash: navbatdan to‘plam (500 tagacha) olinadi va `POST /api/agent/v1/events` ga yuboriladi.
5. Server `(agentInstallationId, clientEventId)` unikal cheklovi bilan `INSERT ... ON CONFLICT DO NOTHING` qiladi va qabul qilingan identifikatorlarni qaytaradi. Agent faqat tasdiqlanganlarini navbatdan o‘chiradi.
6. Tarmoq uzilsa, navbat diskda qoladi; qayta urinish eksponensial kechikish bilan.

Natija: bir xil hodisa necha marta yuborilsa ham bazada bitta yozuv bo‘ladi; tasdiq kelmagan hodisa yo‘qolmaydi.

## 5. Vaqt va vaqt zonasi

- Barcha vaqtlar bazada UTC (`timestamptz`).
- Agent har bir hodisada mahalliy soatni ham, monoton soat davomiyligini ham yuboradi; server qabul vaqtini qayd etadi. Soat farqi chegaradan oshsa, hodisa «ishonchlilik: past» deb belgilanadi.
- Ish kuni chegarasi tashkilot vaqt zonasida (sukut bo‘yicha `Asia/Tashkent`) hisoblanadi. Yarim tundan o‘tgan segment agregatsiyada ikki kunga bo‘linadi.

## 6. Agregatsiya va katta hajm

- `ActivityEvent` oy bo‘yicha partitsiyalanadi (PostgreSQL declarative partitioning; Prisma migratsiyasida qo‘lda yozilgan SQL).
- Fon vazifasi `DailyActivitySummary` jadvalini (xodim × kun × dastur) yangilab turadi. Dashboard va hisobotlar shu jadvaldan o‘qiydi, xom hodisalardan emas.
- Saqlash muddati tugagan partitsiyalar `DROP PARTITION` bilan o‘chiriladi (qatorma-qator `DELETE` emas), kunlik yig‘malar uzoqroq saqlanadi.

## 7. Windows agent tuzilishi

```
agent/nwi_agent/
├ core/        platformadan mustaqil: segmentlash, navbat, sinxronlash, konfiguratsiya tekshiruvi
├ windows/     Win32 chaqiruvlari (oldingi plan oynasi, nofaollik, sessiya qulfi, DPAPI)
├ ui/          tray belgisi, holat oynasi, ekran tasviri indikatori
└ main.py
```

- `core` qatlami interfeys orqali ishlaydi, shuning uchun testlar istalgan OTda ishga tushadi; `windows` qatlami faqat Windows’da sinovdan o‘tadi.
- Agent foydalanuvchi sessiyasida ishlaydi (oldingi plandagi oynani faqat shu sessiyadan ko‘rish mumkin), kirishda Task Scheduler orqali ishga tushadi. Windows Service sessiya 0 da ishlaydi va foydalanuvchi oynalarini ko‘ra olmaydi, shuning uchun asosiy variant emas.
- Agent Task Manager’da o‘z nomi bilan ko‘rinadi, tray’da doimiy belgi turadi, «Nima yig‘iladi» oynasi bor.
- Serverdan kelgan konfiguratsiya Ed25519 imzosi bilan tekshiriladi; imzo noto‘g‘ri bo‘lsa qo‘llanmaydi.
- Yangilanish: imzolangan manifest (versiya, SHA-256, URL) → yuklab olish → xesh va imzo tekshiruvi → o‘rnatish.

## 8. Xavfli yoki to‘liq bajarib bo‘lmaydigan talablar va muqobillari

| Talab                                    | Muammo                                                                                                 | Yechim                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude’da kim nima qilganini ko‘rish     | Shaxsiy claude.ai hisoblarida tashqi audit imkoniyati yo‘q. Brauzerdan o‘qish taqiqlangan va noqonuniy | Agent faqat Claude ilovasi yoki tasdiqlangan domendagi faol vaqtni o‘lchaydi. Tashkilot tarifi bo‘lsa, uning rasmiy audit/foydalanish API’si ulanadi (aniq imkoniyatlar tarifga bog‘liq, 5-bosqichda rasmiy hujjat bo‘yicha tekshiriladi). Mazmun bo‘yicha ma’lumot: xodim topshirgan natija                                 |
| Claude’da yaratilgan hujjatlar soni      | Ishonchli aniqlab bo‘lmaydi                                                                            | Faqat omborga topshirilgan hujjatlar sanaladi; qolgani «Aniqlanmadi»                                                                                                                                                                                                                                                         |
| Brauzerda ish saytlarini kategoriyalash  | Jarayon nomi domenni bermaydi; oyna sarlavhasida shaxsiy mazmun bo‘lishi mumkin                        | Oyna sarlavhalari yig‘ilmaydi. Domen faqat tasdiqlangan ro‘yxatga mos kelsa yuboriladi. Buning uchun tashkilot siyosati bilan o‘rnatiladigan brauzer kengaytmasi kerak (4-bosqichda); usiz brauzer vaqti bitta kategoriya bo‘lib qoladi                                                                                      |
| Skrinshotda maxfiy ma’lumotni himoyalash | Har qanday maxfiy mazmunni avtomatik aniqlab bo‘lmaydi                                                 | Istisno ro‘yxatidagi jarayon oldingi planda bo‘lsa, ekran qulflangan yoki UAC oynasi ochiq bo‘lsa tasvir olinmaydi. Brauzerda qaysi sayt ochiqligini agent bilmaydi (kengaytma hali yo‘q), shuning uchun brauzerni suratga olmaslik kerak bo‘lsa, u istisno ro‘yxatiga qo‘shiladi. Qoldiq xavf `SECURITY.md` da qayd etilgan |
| «Faol» va «shunchaki ochiq»ni ajratish   | O‘qish, video-uchrashuv kiritishsiz ham ish                                                            | Uchrashuv ilovalari uchun alohida qoida; har bir yozuvda ishonchlilik darajasi; hisobotda bu cheklov yoziladi                                                                                                                                                                                                                |
| Imzolangan yangilanish                   | Windows ishonchi uchun Authenticode sertifikati kerak, uni universitet sotib oladi                     | Manifest imzosi (Ed25519) tizimning o‘zida. Authenticode sertifikati olinmaguncha SmartScreen ogohlantirishi chiqadi                                                                                                                                                                                                         |
| Agentni PyInstaller bilan yig‘ish        | Windows `.exe` faqat Windows’da yig‘iladi; hozirgi ishlab chiqish muhiti macOS                         | Yig‘ish Windows mashinasida yoki CI’ning Windows runner’ida. Skript va yo‘riqnoma tayyorlanadi                                                                                                                                                                                                                               |
| «Buglarsiz»                              | Kafolatlab bo‘lmaydi                                                                                   | Test qamrovi, CI, qabul mezonlari; o‘tmagan test bo‘lsa «tayyor» deyilmaydi                                                                                                                                                                                                                                                  |

## 9. Joylashtirish

- **Lokal:** `docker compose up` — PostgreSQL, API, admin panel.
- **Ishlab chiqarish:** Docker Compose, Caddy avtomatik TLS bilan (ichki tarmoqda universitet sertifikati). Maxfiy qiymatlar `.env` (fayl ruxsati cheklangan) yoki secrets manager.
- **Zaxira:** kunlik `pg_dump`, shifrlangan (age), alohida joyga ko‘chiriladi; tiklash skripti va uni tekshiradigan avtomatik test.
