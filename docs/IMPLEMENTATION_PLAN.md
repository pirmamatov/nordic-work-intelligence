# IMPLEMENTATION PLAN — Nordic Work Intelligence

## 1. Boshlang‘ich holat (2026-10-13)

| Narsa                     | Holat                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| Loyiha papkasi            | Bo‘sh edi — loyiha noldan quriladi                                                             |
| Ishlab chiqish kompyuteri | macOS (arm64)                                                                                  |
| Docker, Docker Compose    | O‘rnatilgan va ishlayapti                                                                      |
| Node.js, npm              | O‘rnatilmagan → Docker konteyneri ichida ishlatiladi                                           |
| PostgreSQL                | O‘rnatilmagan → Docker konteyneri                                                              |
| Python                    | 3.9.6 (tizimniki) → agent uchun yangiroq versiya Docker ichida; Windows’da alohida o‘rnatiladi |
| Windows mashinasi         | Yo‘q — agentning Win32 qatlami va `.exe` yig‘ish shu yerda tekshirib bo‘lmaydi                 |

Oxirgi qator muhim cheklov: 4-bosqichda agentning platformadan mustaqil qismi (navbat, sinxronlash, segmentlash) shu yerda to‘liq testdan o‘tadi, lekin Windows’ga xos qismi va o‘rnatish paketi Windows kompyuterda yoki CI’ning Windows runner’ida tekshirilishi kerak.

## 2. Bosqichlar

### 1-bosqich — Tahlil ✅

Natija: `PRD.md`, `ARCHITECTURE.md`, `SECURITY.md`, `DATA_MODEL.md`, shu reja.

### 2-bosqich — Backend

**Holat (2026-10-13):** qisman bajarildi.

- ✅ Skelet, Docker Compose, Prisma sxemasi (barcha entitylar) va migratsiya, `ActivityEvent` partitsiyalari
- ✅ Autentifikatsiya (sessiya, MFA, bloklash, CSRF), RBAC va doira, audit jurnali
- ✅ API: Authentication, Users, Departments, Audit logs, Agent telemetry, Workstations/agentlar, Monitoring siyosati, Applications, Activity analytics, Screenshots (qabul qilish, ko‘rish, muddat bo‘yicha o‘chirish)
- ✅ API: Tasks (holat o‘tish qoidalari, tasdiqlash), Accreditation (mezonlar, bajarilish), Documents (versiyalar, shifrlangan saqlash, tekshiruv), Notifications
- ⏳ API: AI usage, Reports (CSV, Excel, PDF), Settings, samaradorlik formulasi
- ⏳ OpenAPI hujjati, eslatmalar uchun fon vazifalari

### 3-bosqich — Admin panel

**Holat (2026-10-13):** backendda tayyor bo‘lgan qismlar uchun bajarildi. Foydalanuvchi so‘rovi bilan 2-bosqich tugashidan oldin boshlandi.

- ✅ Kirish, MFA sozlash va tasdiqlash, majburiy parol almashtirish, Bosh sahifa, Xodimlar, Xodim profili (umumiy, dasturlar, xronologiya, ekran tasvirlari, agent, boshqaruv), Bo‘limlar, Agentlar, Monitoring siyosati, Dasturlar, Audit jurnali, Hisobim
- ✅ Komponent testlari (9) va haqiqiy brauzerdagi to‘liq oqim sinovi (21 qadam, `infra/e2e/run.sh`)
- ✅ Topshiriqlar (ro‘yxat, yaratish, holat amallari, hujjat yuklash va tekshirish, izohlar, tarix), Akkreditatsiya (mezonlar va bajarilish), Bildirishnomalar
- ⏳ AI statistikasi, Hisobotlar (CSV, Excel, PDF), Sozlamalar — backend moduli yozilgach
- ⏳ Ishlab chiqarish uchun yig‘ilgan panelni HTTPS bilan tarqatish (6-bosqich)

Login (MFA bilan), Dashboard, Xodimlar, Xodim profili (10 bo‘lim), Faoliyat analitikasi, Topshiriqlar, Akkreditatsiya, AI statistikasi, Hisobotlar (CSV, Excel, PDF), Sozlamalar. Har bir sahifada loading, empty, error, success holatlari; mobil va desktop.

Testlar: komponent testlari (Vitest + Testing Library), E2E (Playwright) — kirish, xodim qo‘shish, topshiriq yaratishdan tasdiqlashgacha.

### 4-bosqich — Windows agent

**Holat (2026-10-13):** kod yozilgan, Windows’da sinalmagan. Foydalanuvchi so‘rovi bilan 3-bosqichdan oldin bajarildi.

- ✅ Yadro (segmentlash, ish jadvali, SQLite navbati, sinxronlash, imzolangan konfiguratsiya, ekran tasviri qoidalari) — 59 test
- ✅ Haqiqiy API bilan jonli sinov (soxta platforma bilan): ro‘yxatdan o‘tish, hodisalar, shifrlangan ekran tasviri
- ⚠️ Windows qatlami (Win32 chaqiruvlari, DPAPI, ekran tasviri), tray va indikator oynalari, `build.ps1` — yozilgan, lekin hech qachon Windows’da ishga tushirilmagan
- ⏳ Imzolangan avtomatik yangilanish, brauzer kengaytmasi (domenlar uchun)

Ro‘yxatdan o‘tish, DPAPI bilan token saqlash, kollektor, SQLite navbati, sinxronlash, imzolangan konfiguratsiya, tray indikatori va «Nima yig‘iladi» oynasi, ekran tasviri moduli (indikator bilan), yangilanish, PyInstaller skripti, Task Scheduler vazifasi.

Testlar: segmentlash, offline navbat, qayta yuborishda dublikat yo‘qligi, soat o‘zgarishi, konfiguratsiya imzosi rad etilishi. Windows’da: qo‘lda tekshirish ro‘yxati.

### 5-bosqich — Claude va hujjatlar integratsiyasi

Hujjatlar ombori va versiyalar, topshiriq bilan bog‘lash, natijani topshirish va tasdiqlash, AI foydalanish sessiyalari (agent metama’lumotidan), rasmiy API adapteri (universitet tarifi aniqlangach).

### 6-bosqich — QA va ishga tushirish

Barcha testlar, yuklama testi (katta hajm), zaxira va tiklash testi, xavfsizlik tekshiruvi, CI, `README.md` (PowerShell buyruqlari bilan), pilot yo‘riqnomasi.

## 3. Qabul mezonlari qayerda tekshiriladi

| №   | Mezon                                              | Bosqich | Tekshiruv                                  |
| --- | -------------------------------------------------- | ------- | ------------------------------------------ |
| 1   | Administrator xavfsiz kiradi                       | 2, 3    | Auth integration + E2E                     |
| 2   | Xodim qo‘shish, tahrirlash, bo‘limga biriktirish   | 2, 3    | API testi + E2E                            |
| 3   | Agent server bilan xavfsiz aloqa qiladi            | 4       | Agent ↔ API integration; Windows’da qo‘lda |
| 4   | Dastur vaqti to‘g‘ri hisoblanadi                   | 2, 4    | Segmentlash va agregatsiya unit testlari   |
| 5   | Offline ma’lumot yo‘qolmaydi                       | 4       | Offline navbat testi                       |
| 6   | Topshiriqlar to‘liq boshqariladi                   | 2, 3    | Holat o‘tishlari testi + E2E               |
| 7   | Hujjatlar topshiriqqa bog‘lanadi                   | 5       | API testi                                  |
| 8   | Claude statistikasi faqat tasdiqlangan ma’lumotdan | 5       | «Aniqlanmadi» holati testi                 |
| 9   | Hisobotlar real bazadan                            | 2, 3    | Integration testi                          |
| 10  | Ruxsatsiz foydalanuvchi boshqalarni ko‘rmaydi      | 2       | Har bir endpoint uchun ajratish testi      |
| 11  | Audit jurnali ishlaydi                             | 2       | Integration testi                          |
| 12  | Asosiy testlar o‘tadi                              | 6       | CI                                         |
| 13  | Toza muhitda o‘rnatiladi                           | 6       | README bo‘yicha noldan o‘rnatish           |
| 14  | Zaxira va tiklash amalda tekshirilgan              | 6       | Avtomatik tiklash testi                    |

## 4. Har bir bosqich yakunidagi hisobot

1. Nimalar yaratildi.
2. Qaysi fayllar o‘zgardi.
3. Qaysi testlar ishga tushirildi.
4. Test natijalari.
5. Qolgan muammolar.
6. Keyingi bosqich.

## 5. Ochiq savollar

`PRD.md` 8-bo‘limida. 2-bosqichni hech biri to‘xtatmaydi; 1- va 2-savol 5-bosqichdan oldin, 5-savol 6-bosqichdan oldin hal bo‘lishi kerak.
