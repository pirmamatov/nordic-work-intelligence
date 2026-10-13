# PRD — Nordic Work Intelligence

Tashkilot: Nordic International University
Hujjat holati: 1-bosqich (tahlil) natijasi, 2026-10-13

## 1. Mahsulot nima

Nordic Work Intelligence — universitet xodimlarining ish vaqti, dasturlardan foydalanishi, topshiriqlari va akkreditatsiya hujjatlarini bitta tizimda bog‘laydigan korporativ platforma. Uch qismdan iborat:

1. **Windows agent** — xodim kompyuterida ochiq (yashirin emas) ishlaydigan dastur. Faqat metama’lumot yig‘adi: qaysi dastur, qancha vaqt, faol yoki nofaol.
2. **Server (API)** — ma’lumotlarni qabul qiladi, saqlaydi, hisoblaydi, ruxsatlarni nazorat qiladi.
3. **Admin panel** — rahbariyat va vakolatli xodimlar uchun veb-interfeys (o‘zbek tili, lotin yozuvi).

## 2. Asosiy tamoyil

Kompyuterdagi faollik samaradorlik isboti emas. Tizim to‘rt narsani bir-biriga bog‘laydi: **vaqt → topshiriq → hujjat → tasdiqlangan natija**. Topshiriq faqat belgilangan mezonlar bajarilib, vakolatli shaxs tasdiqlagandan keyin yakunlangan hisoblanadi.

## 3. Foydalanuvchilar

| Rol                         | Nima qiladi                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Super administrator         | Tizimni sozlaydi, foydalanuvchi va rollarni boshqaradi, monitoring siyosatini belgilaydi |
| Universitet rahbariyati     | Butun universitet bo‘yicha hisobot va dashboardni ko‘radi                                |
| Bo‘lim rahbari              | Faqat o‘z bo‘limi xodimlarini ko‘radi, topshiriq beradi va natijani tasdiqlaydi          |
| Akkreditatsiya koordinatori | Mezonlar, topshiriqlar va hujjatlarni boshqaradi                                         |
| HR / vakolatli tahlilchi    | Ish vaqti va analitika hisobotlarini tuzadi                                              |
| Oddiy xodim                 | O‘z ma’lumotlarini, topshiriqlarini ko‘radi, natija va hujjat topshiradi                 |

## 4. Funksional doira

### 4.1. Faoliyat monitoringi

- Faol (oldingi plandagi) dastur va jarayon nomi, boshlanish/tugash vaqti.
- Faol va nofaol vaqt: oxirgi kiritish vaqtiga qarab (klaviatura yoki sichqoncha qachon ishlatilgani; nima bosilgani emas).
- Dastur kategoriyasi (ofis, brauzer, AI, aloqa, boshqa) va ish bilan bog‘liqlik kategoriyasi — administrator belgilaydi.
- Brauzer: faqat administrator tasdiqlagan domenlar nomi bilan qayd etiladi; qolganlari domen ko‘rsatilmasdan «Boshqa veb-faoliyat» sifatida sanaladi.
- Har bir yozuvda ma’lumot manbasi va ishonchlilik darajasi.

### 4.2. Ekran tasvirlari (ixtiyoriy modul, sukut bo‘yicha o‘chirilgan)

- Faqat monitoring siyosati yoqqan bo‘lsa, ish vaqtida, belgilangan intervalda.
- Xodim ekranida doimiy ko‘rinadigan indikator.
- Istisno ro‘yxatidagi ilovalar va autentifikatsiya oynalarida olinmaydi.
- Shifrlangan saqlash, har bir ko‘rish audit jurnalida, muddat tugagach avtomatik o‘chirish.

### 4.3. AI vositalari (Claude va boshqalar)

- Kim, qachon, qancha faol vaqt foydalangan — metama’lumot darajasida.
- Foydalanish topshiriq bilan bog‘lanadi (xodim tanlaydi yoki natija topshirganda ko‘rsatadi).
- Hujjatlar soni faqat universitet boshqaradigan omborga topshirilgan hujjatlardan sanaladi.
- Ishonchli manba bo‘lmagan ko‘rsatkich «Aniqlanmadi» yoki «Ma’lumot mavjud emas» deb chiqadi.

### 4.4. Topshiriqlar va akkreditatsiya

- Topshiriq maydonlari: nom, tavsif, yo‘nalish, mezon, mas’ul, birgalikda ishlovchilar, muddat, ustuvorlik, kutilayotgan natija, hujjatlar, bajarilish foizi, holat, izohlar, tasdiqlash tarixi, kechikish sababi, qabul qilgan shaxs.
- Holatlar: Yangi, Rejalashtirilgan, Jarayonda, Tekshiruvda, Tuzatish talab qilinadi, Tasdiqlangan, Bajarildi, Kechiktirilgan, Bekor qilingan.
- Holat o‘tishlari qoidalar bilan cheklangan (masalan, «Bajarildi»ga faqat «Tasdiqlangan»dan o‘tiladi).
- Hujjat versiyalari: bitta hujjatni qayta saqlash yoki qayta yuklash yangi hujjat emas, yangi versiya (mazmun xeshi bir xil bo‘lsa, versiya ham qo‘shilmaydi).

### 4.5. Dashboard, xodimlar, profil, analitika

Talabnomaning 7-bo‘limidagi barcha ko‘rsatkich va kesimlar. Eksport: CSV, Excel, PDF. Har bir hisobotda davr, yangilangan vaqt, metrikalar ta’rifi va ma’lumot to‘liqligi ko‘rsatiladi.

### 4.6. Samaradorlik ko‘rsatkichlari

- Avtomatik yashirin reyting yo‘q.
- Ko‘rsatkichlar: o‘z vaqtida bajarish, tasdiqlangan hujjatlar, hujjat sifati (tekshiruvchi bahosi), kechikishlar, ish vaqti to‘liqligi, ma’lumot uzilishlari.
- Umumiy ball ixtiyoriy; formulasi va vaznlari administratorga ko‘rinadi va o‘zgartiriladi.
- Ma’lumot yetarli bo‘lmasa ball hisoblanmaydi, sababi ko‘rsatiladi.

## 5. Metrikalar ta’rifi

| Metrika              | Ta’rif                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Ish vaqti            | Siyosatdagi ish jadvali ichida agent ishlab turgan vaqt                                                   |
| Faol vaqt            | Ish vaqti ichida oxirgi kiritishdan beri nofaollik chegarasidan (sukut bo‘yicha 5 daqiqa) kam o‘tgan vaqt |
| Nofaol vaqt          | Ish vaqti ichida nofaollik chegarasidan oshgan vaqt                                                       |
| Dastur vaqti         | Dastur oldingi planda bo‘lgan faol vaqt                                                                   |
| Ochiq turgan vaqt    | Dastur oldingi planda, lekin nofaol holatda bo‘lgan vaqt                                                  |
| Ma’lumot to‘liqligi  | Ish vaqtining agentdan ma’lumot kelgan qismi, foizda                                                      |
| O‘z vaqtida bajarish | Muddatidan oldin tasdiqlangan topshiriqlar ÷ muddati kelgan topshiriqlar                                  |

## 6. Doiradan tashqari (yaratilmaydi)

- Klaviatura bosishlarini yozish, clipboard, parollar, shaxsiy fayl va yozishmalar mazmuni.
- Yashirin skrinshot, agentni Task Manager yoki antivirusdan yashirish.
- Claude suhbatlari va promptlarini brauzerdan o‘qish, cookie olish, autentifikatsiyani chetlab o‘tish.
- Brauzer tarixini to‘liq yig‘ish.
- macOS va Linux agentlari.

## 7. Qabul mezonlari

Talabnomaning 16-bo‘limidagi 14 mezon. Har biri qaysi bosqichda va qaysi test bilan tekshirilishi `IMPLEMENTATION_PLAN.md` da ko‘rsatilgan.

## 8. Universitetdan kutilayotgan qarorlar

1. Universitetda Claude’ning qaysi tarifi bor (shaxsiy hisoblar, Team, Enterprise, yoki API tashkiloti)? Bu 5-bosqichdagi integratsiya usulini belgilaydi.
2. Hujjatlar ombori: tizimning o‘z ombori yetarlimi yoki mavjud ombor (SharePoint, Google Drive va h.k.) bilan ulash kerakmi?
3. Ekran tasvirlari moduli pilotda yoqiladimi?
4. Server qayerda joylashadi (universitet ichki serveri yoki VPS)?
5. Agentni imzolash uchun kod imzolash sertifikati (Authenticode) olinadimi?
6. Monitoring siyosati va xodimlarni xabardor qilish tartibini universitet yuristi tasdiqlaydimi?
