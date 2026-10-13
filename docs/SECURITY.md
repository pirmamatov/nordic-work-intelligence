# SECURITY — Nordic Work Intelligence

## 1. Himoyalanadigan ma’lumotlar

| Ma’lumot                     | Sezgirlik            | Himoya                                                                      |
| ---------------------------- | -------------------- | --------------------------------------------------------------------------- |
| Ekran tasvirlari             | Juda yuqori          | AES-256-GCM, alohida ruxsat, har bir ko‘rish auditda, qisqa saqlash muddati |
| Faoliyat yozuvlari           | Yuqori (shaxsga oid) | RBAC, bo‘lim doirasi, saqlash muddati                                       |
| Parollar                     | Juda yuqori          | Faqat Argon2id xeshi                                                        |
| MFA sirlari, agent tokenlari | Juda yuqori          | Sirlar shifrlangan, tokenlarning faqat xeshi saqlanadi                      |
| Hujjatlar                    | O‘rta–yuqori         | RBAC, versiya tarixi, xesh                                                  |
| Audit jurnali                | Yuqori               | Faqat qo‘shiladi; o‘zgartirish va o‘chirish ilova darajasida yo‘q           |

## 2. Yig‘ilmaydigan ma’lumotlar

Klaviatura bosishlari, clipboard, parollar, oyna sarlavhalari, fayl nomlari va mazmuni, yozishmalar, tasdiqlanmagan domenlar, AI suhbatlari mazmuni, veb-kamera va mikrofon. Bu funksiyalar kodda mavjud emas — sozlama bilan yoqib bo‘lmaydi.

## 3. Shaffoflik

- Agent yashirilmaydi: tray belgisi, Task Manager’da o‘z nomi, «O‘rnatilgan dasturlar»da ko‘rinadi.
- Agentdagi «Nima yig‘iladi» oynasi amaldagi siyosatni ko‘rsatadi.
- Ekran tasviri yoqilgan bo‘lsa, ekranda doimiy indikator turadi va har bir tasvir olinganda bildirishnoma chiqadi.
- Xodim o‘zi haqida yig‘ilgan ma’lumotni panelda ko‘ra oladi.
- Ro‘yxatdan o‘tishda xodim monitoring shartlari bilan tanishganini tasdiqlaydi; tasdiq vaqti saqlanadi.

## 4. Autentifikatsiya

**Panel foydalanuvchilari**

- Parol: kamida 12 belgi, ommaga tarqalgan parollar ro‘yxatiga tekshiriladi, Argon2id.
- MFA (TOTP): super administrator, rahbariyat, HR va ekran tasvirlariga ruxsati bor har bir kishi uchun majburiy.
- Sessiya: server tomonida, tasodifiy 256-bit identifikator, cookie `HttpOnly; Secure; SameSite=Strict`. Harakatsizlik va mutlaq muddat. Parol o‘zgarganda barcha sessiyalar bekor qilinadi; administrator istalgan sessiyani bekor qila oladi.
- Kirish urinishlari: IP va hisob bo‘yicha cheklov, ketma-ket xatolardan keyin vaqtinchalik bloklash.
- Birinchi administrator: buyruq satri orqali yaratiladi (`npm run admin:create`), sukut bo‘yicha parol yo‘q.

**Agent**

- Administrator bir martalik, muddati cheklangan ro‘yxatdan o‘tish kodi yaratadi.
- Agent kod bilan ro‘yxatdan o‘tadi, qurilma tokenini oladi; serverda faqat SHA-256 xeshi saqlanadi.
- Token kompyuterda Windows DPAPI bilan shifrlanadi.
- Har bir so‘rov: `Authorization: Bearer <token>`, faqat TLS orqali.
- Administrator agentni bekor qilsa, token darhol ishlamay qoladi.

## 5. Avtorizatsiya (RBAC)

Har bir so‘rov ikki tekshiruvdan o‘tadi: **ruxsat** (nima qila oladi) va **doira** (kimning ma’lumotida).

| Ruxsat                                         | Super admin    | Rahbariyat     | Bo‘lim rahbari              | Akkr. koordinatori | HR / tahlilchi | Xodim    |
| ---------------------------------------------- | -------------- | -------------- | --------------------------- | ------------------ | -------------- | -------- |
| Foydalanuvchi va rollarni boshqarish           | ✔              | —              | —                           | —                  | —              | —        |
| Monitoring siyosatini o‘zgartirish             | ✔              | —              | —                           | —                  | —              | —        |
| Faoliyat statistikasini ko‘rish                | barchasi       | barchasi       | o‘z bo‘limi                 | —                  | barchasi       | o‘ziniki |
| Ekran tasvirlarini ko‘rish                     | alohida ruxsat | alohida ruxsat | alohida ruxsat, o‘z bo‘limi | —                  | —              | o‘ziniki |
| Topshiriq yaratish va biriktirish              | ✔              | ✔              | o‘z bo‘limi                 | ✔                  | —              | —        |
| Natijani tasdiqlash                            | ✔              | ✔              | o‘z bo‘limi                 | ✔                  | —              | —        |
| Akkreditatsiya mezonlarini boshqarish          | ✔              | —              | —                           | ✔                  | —              | —        |
| Hisobot va eksport                             | barchasi       | barchasi       | o‘z bo‘limi                 | akkreditatsiya     | barchasi       | o‘ziniki |
| Audit jurnalini ko‘rish                        | ✔              | —              | —                           | —                  | —              | —        |
| O‘z topshirig‘ini yangilash, hujjat topshirish | ✔              | ✔              | ✔                           | ✔                  | ✔              | ✔        |

- Doira tekshiruvi servis qatlamida so‘rov shartiga qo‘shiladi; faqat interfeysda yashirish bilan cheklanilmaydi.
- Ruxsati yo‘q yozuv so‘ralganda `404` qaytadi (yozuv borligi oshkor qilinmaydi).
- Ekran tasvirlari roldan mustaqil alohida ruxsat (`screenshots.view`) — hech bir rolda sukut bo‘yicha yo‘q.

## 6. Tahdidlar va choralar

| Tahdid                                  | Chora                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| SQL injection                           | Prisma parametrlangan so‘rovlari; xom SQL faqat doimiy matn va parametrlar bilan                                                           |
| XSS                                     | React avtomatik ekranlash, `dangerouslySetInnerHTML` yo‘q, qat’iy Content-Security-Policy                                                  |
| CSRF                                    | `SameSite=Strict` + double-submit token, `Origin` tekshiruvi                                                                               |
| Parol tanlash                           | Rate limiting, bloklash, MFA                                                                                                               |
| Boshqa xodim ma’lumotini ko‘rish (IDOR) | Servis qatlamida doira tekshiruvi, har bir endpoint uchun ruxsatsiz kirish testi                                                           |
| Soxta agent yoki soxta hodisalar        | Qurilma tokeni, hodisalarni tekshirish (vaqt oralig‘i, davomiylik chegaralari), bekor qilish                                               |
| Agentga zararli konfiguratsiya          | Konfiguratsiya Ed25519 bilan imzolanadi, agent sxema va imzoni tekshiradi                                                                  |
| Zararli yangilanish                     | Imzolangan manifest + SHA-256; Authenticode imzosi                                                                                         |
| Fayl yuklash orqali hujum               | Tur va hajm cheklovi, fayl nomi server tomonida generatsiya qilinadi, veb-ildizdan tashqarida saqlanadi, `Content-Disposition: attachment` |
| Log orqali sir oqishi                   | pino redaksiyasi: parol, token, cookie, MFA kodi loglanmaydi                                                                               |
| Zaxira nusxa o‘g‘irlanishi              | Zaxira shifrlanadi, kalit serverdan alohida saqlanadi                                                                                      |
| Administrator suiiste’moli              | Barcha administrator harakatlari va cheklangan ma’lumotni har bir ko‘rish audit jurnaliga yoziladi                                         |

## 7. Shifrlash

- **Uzatishda:** TLS 1.2+; agent sertifikatni tekshiradi, tekshiruvni o‘chirish sozlamasi yo‘q. Yagona istisno — sinov rejimi: `--allow-http` aniq berilganda va faqat ichki tarmoq manzillariga shifrlanmagan HTTP ruxsat etiladi. Ishlab chiqarishda ishlatilmaydi.
- **Saqlashda:** ekran tasvirlari va MFA sirlari AES-256-GCM bilan (har bir obyekt uchun alohida kalit, u asosiy kalit bilan o‘ralgan). Asosiy kalit muhit o‘zgaruvchisi yoki secrets manager’da. Disk darajasidagi shifrlash server tomonida tavsiya etiladi.

## 8. Audit jurnali

Qayd etiladi: kirish va chiqish, muvaffaqiyatsiz urinishlar, foydalanuvchi/rol/ruxsat o‘zgarishlari, monitoring siyosati o‘zgarishlari, ekran tasvirini ko‘rish, eksport, topshiriq holati va tasdiqlar, agentni ro‘yxatdan o‘tkazish va bekor qilish, sozlamalar o‘zgarishi.
Har bir yozuv: kim, qachon, IP, harakat, obyekt, natija, o‘zgarish (maxfiy maydonlarsiz).

## 9. Saqlash muddatlari (sukut bo‘yicha, administrator o‘zgartiradi)

| Ma’lumot                 | Muddat                           |
| ------------------------ | -------------------------------- |
| Ekran tasvirlari         | 14 kun                           |
| Xom faoliyat hodisalari  | 90 kun                           |
| Kunlik yig‘ma statistika | 2 yil                            |
| Audit jurnali            | 3 yil                            |
| Topshiriq va hujjatlar   | Akkreditatsiya siyosati bo‘yicha |

## 10. Huquqiy muvofiqlik

Bu bo‘lim yuridik maslahat emas; joriy etishdan oldin universitet yuristi ko‘rib chiqishi shart.

- O‘zbekiston Respublikasining «Shaxsga doir ma’lumotlar to‘g‘risida»gi qonuni (O‘RQ-547): ishlov berish maqsadi, subyektni xabardor qilish va roziligi, ma’lumotlar bazasini ro‘yxatdan o‘tkazish, fuqarolarning shaxsga doir ma’lumotlarini O‘zbekiston hududidagi serverlarda saqlash talabi. Shu sababli server mamlakat ichida joylashishi kerak.
- Mehnat qonunchiligi: monitoring ichki mehnat tartibi qoidalarida yoki alohida buyruqda belgilanishi, xodimlar imzo bilan tanishtirilishi.
- Tizim bunga texnik asos beradi: tanishish tasdig‘i, yig‘iladigan ma’lumotning ochiq ro‘yxati, saqlash muddati, xodimning o‘z ma’lumotini ko‘rishi.

## 11. Qoldiq xavflar

1. Ekran tasvirida istisno ro‘yxatiga kirmagan ilovadagi shaxsiy ma’lumot tushib qolishi mumkin. Shuning uchun modul sukut bo‘yicha o‘chirilgan, indikator doimiy, saqlash muddati qisqa.
2. Administrator huquqiga ega xodim agentni to‘xtatishi mumkin. Tizim buni to‘smaydi (to‘sish yashirin nazoratga yaqinlashadi), lekin ma’lumot uzilishi sifatida ko‘rsatadi.
3. Faol vaqt o‘lchovi taxminiy: kiritishsiz ish (o‘qish, uchrashuv) nofaol bo‘lib ko‘rinishi mumkin.
