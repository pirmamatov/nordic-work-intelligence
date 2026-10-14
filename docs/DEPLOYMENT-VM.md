# Serverga o'rnatish — Nordic Work Intelligence (native VM)

Bu yo'riqnoma Ubuntu/Debian VM'ga, lokal PostgreSQL bilan o'rnatish uchun.
HTTPS'ni asosiy serverdagi **Kerio Control** proksi boshqaradi; bu VM faqat HTTP (port 80) va ilova (port 5084) bilan ishlaydi.

- Domen: **https://work-intelligence.nordicuniversity.org**
- Ilova porti: **5084** (faqat 127.0.0.1, nginx orqali ko'rinadi)
- PostgreSQL: lokal — `postgres` / `root` / `work-intelligence`
- Yuklanadigan/yuklab olinadigan fayllar: **/mnt/work-intelligence-files**

## 0. Oldindan (bir marta)

- VM'da PostgreSQL o'rnatilgan va ishlab turgan bo'lsin; `postgres` foydalanuvchisining paroli `root`.
- VM'da `sudo` huquqi bo'lsin. `deploy.sh` qolgan hamma narsani (Node.js, nginx, git) o'zi o'rnatadi.
- Kerio Control'da `work-intelligence.nordicuniversity.org` uchun reverse proxy VM'ning 80-portiga yo'naltirilsin (HTTPS Kerio tomonida tugaydi).

> Huquqiy eslatma: monitoring universitet buyrug'ida belgilanib, xodimlar imzo bilan tanishtirilishi kerak. Server O'zbekiston hududida bo'lishi shart.

## 1. Birinchi o'rnatish

```bash
# Kodni olish
cd /opt
sudo git clone https://github.com/pirmamatov/nordic-work-intelligence.git work-intelligence
cd work-intelligence

# Deploy (hamma ishni shu skript bajaradi)
sudo ./deploy.sh
```

`deploy.sh` ketma-ket bajaradi:

1. Node.js 24, nginx, postgresql-client, git o'rnatadi (yo'q bo'lsa).
2. `/mnt/work-intelligence-files` papkasini yaratadi.
3. `work-intelligence` bazasini yaratadi (yo'q bo'lsa).
4. `.env.production` ni yaratadi va maxfiy kalitlarni **bir marta** generatsiya qiladi.
5. `npm ci`, Prisma mijozi, baza migratsiyalari.
6. Rollar/ruxsatlarni sinxronlaydi va **birinchi administratorni** yaratadi.
7. Admin panelni yig'adi.
8. `work-intelligence` systemd xizmatini sozlab ishga tushiradi.
9. nginx saytini sozlab, `nginx -t` va `reload` qiladi.
10. Ilova 5084-portda javob berishini tekshiradi.

**Oxirida chiqadigan administrator parolini xavfsiz joyga ko'chiring** — u faqat bir marta ko'rsatiladi.

Keyin brauzerda **https://work-intelligence.nordicuniversity.org** ni oching, `admin@nordicuniversity.org` va chiqgan parol bilan kiring. Birinchi kirishda parol almashtiriladi va ikki bosqichli tasdiqlash (MFA) sozlanadi — autentifikator ilovasi kerak.

## 2. nginx faylini qo'lda sozlash (deploy.sh o'zi qiladi, lekin kerak bo'lsa)

`deploy.sh` nginx saytini avtomatik yozadi. Qo'lda qilish kerak bo'lsa:

```bash
# 1. Konfiguratsiyani sites-available ichiga nusxalash
sudo cp infra/nginx/work-intelligence.nordicuniversity.org.conf \
        /etc/nginx/sites-available/work-intelligence.nordicuniversity.org

# 2. Fayldagi /OPT/WORK-INTELLIGENCE o'rniga haqiqiy yo'lni yozing
sudo sed -i 's#/OPT/WORK-INTELLIGENCE#/opt/work-intelligence#' \
        /etc/nginx/sites-available/work-intelligence.nordicuniversity.org

# 3. sites-enabled ga ulash (symlink)
sudo ln -s /etc/nginx/sites-available/work-intelligence.nordicuniversity.org \
           /etc/nginx/sites-enabled/

# 4. Konfiguratsiyani tekshirish
sudo nginx -t

# 5. nginx'ni qayta yuklash
sudo systemctl reload nginx
```

nginx fayli: [infra/nginx/work-intelligence.nordicuniversity.org.conf](../infra/nginx/work-intelligence.nordicuniversity.org.conf).

## 3. Yangilanishlar (keyingi safar)

Kod o'zgarganda xuddi shu skript ishlatiladi:

```bash
cd /opt/work-intelligence
sudo git pull
sudo ./deploy.sh
```

`deploy.sh` yangilanishda:

- Kodni oladi (`git pull` siz qilgansiz), `npm ci` ni yangilaydi.
- Yangi migratsiyalarni qo'llaydi.
- Rollar/ruxsatlarni sinxronlaydi (admin allaqachon bor — qayta yaratmaydi).
- Panelni qayta yig'adi.
- Xizmatni qayta ishga tushiradi, nginx'ni yangilaydi.

**Maxfiy kalitlar (`.env.production`) saqlanib qoladi** — ekran tasvirlari va MFA ishlashda davom etadi.

> Katta yangilanishdan oldin zaxira oling (4-bo'lim).

## 4. Zaxira va tiklash

Zaxira skriptlari Docker uchun yozilgan edi; lokal PostgreSQL uchun oddiy variant:

```bash
# Zaxira (baza + fayllar)
sudo -u postgres pg_dump -Fc work-intelligence > /mnt/work-intelligence-files/../wi-db-$(date +%F).dump
sudo tar -C /mnt -czf /root/wi-files-$(date +%F).tar.gz work-intelligence-files

# Tiklash (baza)
sudo -u postgres pg_restore -d work-intelligence --clean --no-owner /path/wi-db-YYYY-MM-DD.dump
```

Zaxiralarni boshqa serverga ko'chiring. `.env.production` dagi `DATA_ENCRYPTION_KEY` ni ham alohida saqlang — **u yo'qolsa ekran tasvirlari va MFA sirlarini ochib bo'lmaydi.**

Har kuni avtomatik zaxira uchun `cron` (misol):

```cron
0 2 * * *  sudo -u postgres pg_dump -Fc work-intelligence > /backup/wi-$(date +\%F).dump
```

## 5. Boshqarish buyruqlari

```bash
# Holat va jurnal
sudo systemctl status work-intelligence
sudo journalctl -u work-intelligence -f

# To'xtatish / ishga tushirish / qayta ishga tushirish
sudo systemctl stop work-intelligence
sudo systemctl start work-intelligence
sudo systemctl restart work-intelligence

# Agent uchun konfiguratsiya kaliti (agentlarni yig'ishda kerak)
cd /opt/work-intelligence && npm run agent:pubkey -w @nwi/api
```

Agentlarni o'rnatish: [README.md](../README.md), 2-bo'lim. Ishlab chiqarishda agent HTTPS domeniga (`https://work-intelligence.nordicuniversity.org`) ulanadi, `--allow-http` ishlatilmaydi.

## 6. Nosozliklar

| Belgi                                             | Yechim                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `deploy.sh` "root bilan ishga tushirilishi kerak" | `sudo ./deploy.sh` bilan ishga tushiring                                                                                      |
| Baza ulanmayapti                                  | PostgreSQL ishlab turganini va `postgres`/`root` to'g'riligini tekshiring: `PGPASSWORD=root psql -U postgres -h localhost -l` |
| Panel ochilmayapti                                | `sudo systemctl status work-intelligence` va `sudo journalctl -u work-intelligence -n 50`                                     |
| 502 Bad Gateway (nginx)                           | Ilova 5084-portda ishlayaptimi: `curl http://127.0.0.1:5084/api/health`                                                       |
| Admin parolini unutdim                            | `cd /opt/work-intelligence && sudo -E npm run admin:create -w @nwi/api` bilan yangi admin yarating (yoki bazadan tiklang)     |
| Kirishda "xavfsiz bo'lmagan" xato                 | Kerio HTTPS'ni to'g'ri uzatayotganini va domen `work-intelligence.nordicuniversity.org` ekanini tekshiring                             |
