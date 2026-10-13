// Haqiqiy brauzerda to'liq oqim: kirish → MFA sozlash → bo'lim → xodim → siyosat → agent kodi →
// (agent ma'lumot yuboradi) → faoliyat va ekran tasvirini ko'rish → audit.
// Ishga tushirish: infra/e2e/run.sh (alohida vaqtinchalik bazada, asosiy bazaga tegmaydi).
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.PANEL_URL;
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
const OUT = process.env.OUT_DIR ?? '/out';
mkdirSync(OUT, { recursive: true });

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/\s/g, ''))
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

let mfaSecret = '';
const TASK = '3.2.1 mezon bo‘yicha hisobot tayyorlash';
const confirm = () =>
  page.getByRole('dialog').getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
const steps = [];
async function step(name, fn) {
  try {
    await fn();
    steps.push(`✓ ${name}`);
  } catch (error) {
    steps.push(`✗ ${name}: ${String(error).split('\n')[0]}`);
    throw error;
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 850 }, locale: 'uz-UZ' });
const consoleErrors = [];
page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()));
page.on('pageerror', (error) => consoleErrors.push(String(error)));
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

try {
  await step('kirish sahifasi va noto‘g‘ri parol', async () => {
    await page.goto(BASE);
    await page.getByLabel('Elektron pochta', { exact: true }).fill(ADMIN.email);
    await page.getByLabel('Parol', { exact: true }).fill('Notogri-Parol-0000');
    await page.getByRole('button', { name: 'Kirish' }).click();
    await page.getByRole('alert').filter({ hasText: 'noto‘g‘ri' }).waitFor();
    await shot('01-kirish-xato');
  });

  await step('kirish va majburiy MFA sozlash', async () => {
    await page.getByLabel('Parol', { exact: true }).fill(ADMIN.password);
    await page.getByRole('button', { name: 'Kirish' }).click();
    await page.getByRole('heading', { name: 'Ikki bosqichli tasdiqlashni yoqing' }).waitFor();
    await page.getByRole('button', { name: 'Sozlashni boshlash' }).click();
    await page.getByAltText('MFA sozlash uchun QR kod').waitFor();
    await shot('02-mfa-sozlash');
    const secret = await page.locator('code').first().innerText();
    mfaSecret = secret;
    await page.getByLabel('Tasdiqlash kodi', { exact: true }).fill(totp(secret));
    await page.getByRole('button', { name: 'Yoqish' }).click();
    await page.getByText('zaxira kodlarini').waitFor();
    if ((await page.locator('ul.font-mono li').count()) !== 10)
      throw new Error('10 ta zaxira kodi kutilgan edi');
    await page.getByRole('button', { name: /davom etish/ }).click();
    await page.getByRole('heading', { name: 'Bosh sahifa' }).waitFor();
  });

  await step('bo‘lim yaratish', async () => {
    await page.getByRole('link', { name: 'Bo‘limlar', exact: true }).click();
    await page.getByText('Bo‘limlar hali yaratilmagan').waitFor();
    await page.getByRole('button', { name: 'Bo‘lim qo‘shish' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nomi', { exact: true }).fill('Axborot texnologiyalari');
    await dialog.getByLabel('Kodi', { exact: true }).fill('it');
    await dialog.getByRole('button', { name: 'Saqlash' }).click();
    await page.getByRole('cell', { name: 'Axborot texnologiyalari', exact: true }).waitFor();
  });

  let employeeUrl = '';
  await step('xodim yaratish (forma tekshiruvi bilan)', async () => {
    await page.getByRole('link', { name: 'Xodimlar', exact: true }).click();
    await page.getByRole('button', { name: 'Xodim qo‘shish' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Ism-familiya', { exact: true }).fill('Aziz Karimov');
    await dialog.getByLabel('Elektron pochta', { exact: true }).fill('aziz.karimov@nordic.test');
    await dialog.getByLabel('Vaqtinchalik parol', { exact: true }).fill('qisqa');
    await dialog.getByRole('button', { name: 'Yaratish' }).click();
    await dialog.getByRole('alert').filter({ hasText: 'kamida 12' }).waitFor();
    await dialog.getByLabel('Vaqtinchalik parol', { exact: true }).fill('Vaqtinchalik-Parol-55');
    await dialog
      .getByLabel('Bo‘lim', { exact: true })
      .selectOption({ label: 'Axborot texnologiyalari' });
    await dialog.getByLabel('Lavozim', { exact: true }).fill('Dasturchi');
    await dialog.getByRole('button', { name: 'Yaratish' }).click();
    await page.getByRole('link', { name: 'Aziz Karimov', exact: true }).waitFor();
    await shot('03-xodimlar');
    await page.getByRole('link', { name: 'Aziz Karimov', exact: true }).click();
    await page.getByRole('heading', { name: 'Aziz Karimov' }).waitFor();
    employeeUrl = page.url();
  });

  let code = '';
  await step('agent uchun ro‘yxatdan o‘tish kodi', async () => {
    await page.getByRole('tab', { name: 'Agent' }).click();
    await page.getByText('Agent o‘rnatilmagan').waitFor();
    await page.getByRole('button', { name: 'Ro‘yxatdan o‘tish kodini yaratish' }).click();
    code = await page.locator('code.tracking-wider').innerText();
    if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code))
      throw new Error(`kod formati kutilmagan: ${code}`);
  });

  await step('ekran tasviri yoqilgan siyosat yaratish', async () => {
    await page.getByRole('link', { name: 'Monitoring siyosati', exact: true }).click();
    await page.getByText('Siyosat yaratilmagan').waitFor();
    await page.getByRole('button', { name: 'Siyosat qo‘shish' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nomi', { exact: true }).fill('Sinov siyosati');
    for (const day of ['Shanba', 'Yakshanba'])
      await dialog.getByLabel(day, { exact: true }).check();
    await dialog.getByLabel('Ish boshlanishi', { exact: true }).fill('00:00');
    await dialog.getByLabel('Ish tugashi', { exact: true }).fill('23:59');
    await dialog.getByLabel('Ekran tasvirlarini olish', { exact: true }).check();
    await dialog.getByLabel('Interval (daqiqa)', { exact: true }).fill('1');
    await dialog.getByLabel(/Sukut bo‘yicha siyosat/).check();
    await shot('04-siyosat-forma');
    await dialog.getByRole('button', { name: 'Saqlash' }).click();
    await page.getByText('Ekran tasviri: har 1 daqiqada').waitFor();
  });

  await step('agent ro‘yxatdan o‘tadi va 75 soniya ma’lumot yuboradi', async () => {
    writeFileSync(`${OUT}/enrollment-code.txt`, code);
    // run.sh shu faylni kutadi va agentni ishga tushiradi; tugagach belgi fayl yaratadi.
    const deadline = Date.now() + 180_000;
    for (;;) {
      try {
        execFileSync('test', ['-f', `${OUT}/agent-done`]);
        break;
      } catch {
        if (Date.now() > deadline) throw new Error('agent vaqtida tugamadi');
        await page.waitForTimeout(2000);
      }
    }
  });

  await step('bosh sahifada bugungi ko‘rsatkichlar', async () => {
    await page.getByRole('link', { name: 'Bosh sahifa', exact: true }).click();
    await page.getByText('Microsoft Word').first().waitFor();
    // Grafikda bugungi faol vaqt ustuni haqiqatan chizilgan (kutubxona klasslariga bog'lanmasdan tekshiriladi).
    await page.waitForFunction(() =>
      [...document.querySelectorAll('svg [fill="#087268"]')].some(
        (el) => el.getBoundingClientRect().height > 40,
      ),
    );
    await shot('05-bosh-sahifa');
  });

  await step('xodimlar ro‘yxatida agent holati va bugungi vaqt', async () => {
    await page.getByRole('link', { name: 'Xodimlar', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: 'Aziz Karimov' });
    await row.getByText('Onlayn').waitFor();
    await row.getByText(/1 daq/).first().waitFor();
  });

  await step('xodim profili: kunlik vaqt, dasturlar, xronologiya', async () => {
    await page.goto(employeeUrl);
    await page.getByRole('heading', { name: 'Kunlik ish vaqti' }).waitFor();
    await page.getByRole('tab', { name: 'Dasturlar' }).click();
    await page.getByRole('cell', { name: /Microsoft Word/ }).waitFor();
    await shot('06-profil-dasturlar');
    await page.getByRole('tab', { name: 'Xronologiya' }).click();
    await page
      .getByRole('row')
      .filter({ hasText: 'Microsoft Word' })
      .getByText('Faol', { exact: true })
      .waitFor();
  });

  await step('ruxsatsiz administrator ekran tasvirlari bo‘limini ko‘rmaydi', async () => {
    if ((await page.getByRole('tab', { name: 'Ekran tasvirlari' }).count()) !== 0)
      throw new Error('bo‘lim ruxsatsiz ko‘rinib qoldi');
  });

  await step('o‘ziga ekran tasvirlarini ko‘rish ruxsatini berish', async () => {
    await page.getByRole('link', { name: 'Xodimlar', exact: true }).click();
    await page.getByRole('link', { name: 'E2E Admin', exact: true }).click();
    await page.getByRole('button', { name: 'Ruxsat berish', exact: true }).click();
    await page.getByText('Ruxsat berilgan', { exact: true }).waitFor();
  });

  await step('ekran tasvirini ko‘rish', async () => {
    await page.goto(employeeUrl);
    await page.getByRole('tab', { name: 'Ekran tasvirlari' }).click();
    await page.getByRole('button', { name: 'Ko‘rish' }).first().click();
    const image = page.getByAltText('Ekran tasviri');
    await image.waitFor();
    await page.waitForFunction(() => {
      const img = document.querySelector('img[alt="Ekran tasviri"]');
      return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 100;
    });
    await shot('07-ekran-tasviri');
    await page.getByRole('button', { name: 'Yopish' }).click();
  });

  await step('audit jurnalida ko‘rish qayd etilgan', async () => {
    await page.getByRole('link', { name: 'Audit jurnali', exact: true }).click();
    await page.getByLabel('Amal turi', { exact: true }).selectOption({ label: 'Ekran tasvirlari' });
    await page
      .getByRole('row')
      .filter({ hasText: 'Ekran tasvirini ko‘rish' })
      .filter({ hasText: 'E2E Admin' })
      .first()
      .waitFor();
    await shot('08-audit');
  });

  await step('agentlar sahifasi', async () => {
    await page.getByRole('link', { name: 'Agentlar', exact: true }).click();
    await page.getByRole('row').filter({ hasText: 'FAKE-PC' }).getByText('Onlayn').waitFor();
  });

  await step('akkreditatsiya mezoni va topshiriq yaratish', async () => {
    await page.getByRole('link', { name: 'Akkreditatsiya', exact: true }).click();
    await page.getByRole('button', { name: 'Mezon qo‘shish' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Kodi', { exact: true }).fill('3.2.1');
    await dialog.getByLabel('Nomi', { exact: true }).fill('O‘quv dasturlari sifati');
    await dialog.getByRole('button', { name: 'Saqlash' }).click();
    await page.getByRole('cell', { name: '3.2.1', exact: true }).waitFor();
    // Topshiriq yo'q paytda foiz o'ylab topilmaydi.
    await page.getByText('Ma’lumot mavjud emas').waitFor();

    await page.getByRole('link', { name: 'Topshiriqlar', exact: true }).click();
    await page.getByRole('button', { name: 'Topshiriq qo‘shish' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Yaratish' }).click();
    await dialog.getByText('Mas’ul xodimni tanlang').waitFor();
    await dialog.getByLabel('Topshiriq nomi', { exact: true }).fill(TASK);
    await dialog
      .getByLabel('Mas’ul xodim', { exact: true })
      .selectOption({ label: 'Aziz Karimov' });
    await dialog.getByLabel('Akkreditatsiya mezoni', { exact: true }).selectOption({ index: 1 });
    await dialog
      .getByLabel('Muddat', { exact: true })
      .fill(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
    await dialog.getByLabel('Kutilayotgan natija', { exact: true }).fill('Tasdiqlangan hisobot');
    await dialog.getByRole('button', { name: 'Yaratish' }).click();
    await page.getByRole('link', { name: TASK }).waitFor();
    await shot('08b-topshiriqlar');
  });

  await step('telefon o‘lchamida gorizontal aylanma yo‘q va menyu ishlaydi', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(BASE);
    await page.getByRole('heading', { name: 'Bosh sahifa' }).waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (overflow > 1) throw new Error(`sahifa ${overflow}px ga kengroq`);
    await page.getByRole('button', { name: 'Menyuni ochish' }).click();
    await page.getByRole('link', { name: 'Audit jurnali', exact: true }).waitFor();
    await shot('09-telefon-menyu');
    await page.getByRole('link', { name: 'Xodimlar', exact: true }).click();
    await page.getByRole('link', { name: 'Aziz Karimov', exact: true }).waitFor();
    const overflow2 = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (overflow2 > 1) throw new Error(`xodimlar sahifasi ${overflow2}px ga kengroq`);
    await shot('10-telefon-xodimlar');
    await page.setViewportSize({ width: 1366, height: 850 });
  });

  await step('chiqish va sessiyasiz kirib bo‘lmasligi', async () => {
    await page.getByRole('button', { name: /Chiqish/ }).click();
    await page.getByRole('heading', { name: 'Tizimga kirish' }).waitFor();
    await page.goto(employeeUrl);
    await page.getByRole('heading', { name: 'Tizimga kirish' }).waitFor();
  });

  await step('yangi xodim: majburiy parol almashtirish va faqat o‘z ma’lumoti', async () => {
    await page.getByLabel('Elektron pochta', { exact: true }).fill('aziz.karimov@nordic.test');
    await page.getByLabel('Parol', { exact: true }).fill('Vaqtinchalik-Parol-55');
    await page.getByRole('button', { name: 'Kirish' }).click();
    await page.getByRole('heading', { name: 'Parolni almashtiring' }).waitFor();
    await page.getByLabel('Joriy parol', { exact: true }).fill('Vaqtinchalik-Parol-55');
    await page.getByLabel('Yangi parol', { exact: true }).fill('Xodimning-Yangi-Paroli-9');
    await page
      .getByLabel('Yangi parolni takrorlang', { exact: true })
      .fill('Xodimning-Yangi-Paroli-9');
    await page.getByRole('button', { name: 'Saqlash va davom etish' }).click();
    await page.getByRole('heading', { name: 'Bosh sahifa' }).waitFor();
    const links = await page
      .getByRole('navigation', { name: 'Asosiy menyu' })
      .getByRole('link')
      .allInnerTexts();
    if (
      links.join('|') !==
      'Bosh sahifa|Mening faoliyatim|Topshiriqlar|Akkreditatsiya|Bo‘limlar|Dasturlar|Hisobim'
    )
      throw new Error(`menyu: ${links.join('|')}`);
    await page.goto(`${BASE}/audit`);
    await page.getByRole('alert').filter({ hasText: 'ruxsat yo‘q' }).waitFor();
    // Xodim o'z ekran tasvirlarini ko'ra oladi.
    await page.getByRole('link', { name: 'Mening faoliyatim', exact: true }).click();
    await page.getByRole('tab', { name: 'Ekran tasvirlari' }).click();
    await page.getByRole('button', { name: 'Ko‘rish' }).first().waitFor();
    await shot('11-xodim-oz-profili');
  });
  await step('xodim topshiriqni bajaradi: holat, hujjat va versiyalar', async () => {
    await page.goto(BASE);
    await page.getByRole('link', { name: /Bildirishnomalar, 1 ta yangi/ }).waitFor();
    await page.getByRole('link', { name: 'Topshiriqlar', exact: true }).click();
    await page.getByRole('link', { name: TASK }).click();
    await page.getByRole('heading', { name: TASK }).waitFor();

    await page.getByRole('button', { name: 'Ishni boshlash / davom ettirish' }).click();
    await confirm();
    await page.getByText('Jarayonda', { exact: true }).first().waitFor();

    writeFileSync('/tmp/hisobot.docx', 'Hisobotning birinchi varianti');
    writeFileSync('/tmp/hisobot-2.docx', 'Hisobotning to‘ldirilgan varianti');
    const choose = async (button, file) => {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: button }).click(),
      ]);
      await chooser.setFiles(file);
    };
    await choose('Hujjat yuklash', '/tmp/hisobot.docx');
    await page.getByText('Hujjat qo‘shildi.').waitFor();
    // Xuddi shu faylni qayta yuklash yangi versiya bermaydi.
    await choose('Yangi versiya', '/tmp/hisobot.docx');
    await page.getByText(/yangi versiya yaratilmadi/).waitFor();
    await choose('Yangi versiya', '/tmp/hisobot-2.docx');
    await page.getByText('2-versiya qo‘shildi.').waitFor();
    // Ro'yxat yangilanishini kutib, so'ng versiyalar sonini tekshiramiz: aynan ikkita.
    await page.getByText('2-versiya', { exact: true }).waitFor();
    const versions = await page.getByText(/^\d+-versiya$/).allInnerTexts();
    if (versions.join(',') !== '2-versiya,1-versiya')
      throw new Error(`versiyalar: ${versions.join(',')}`);

    // Avval hujjat, keyin topshiriqning o'zi tekshiruvga yuboriladi.
    await page.getByRole('button', { name: 'Tekshiruvga yuborish' }).first().click();
    await page.getByText('Tekshiruvga yuborilgan', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Tekshiruvga yuborish' }).click();
    await confirm();
    await page.getByText('Tekshiruvda', { exact: true }).first().waitFor();

    // Mas'ul xodimda tasdiqlash tugmalari yo'q.
    for (const name of ['Natijani tasdiqlash', 'Tekshirish', 'Bajarildi deb yakunlash']) {
      if ((await page.getByRole('button', { name, exact: true }).count()) !== 0)
        throw new Error(`xodimda “${name}” tugmasi ko‘rindi`);
    }
    await shot('12-xodim-topshiriq');
    await page.getByRole('button', { name: /Chiqish/ }).click();
    await page.getByRole('heading', { name: 'Tizimga kirish' }).waitFor();
  });

  await step('administrator MFA kodi bilan kiradi, hujjat va natijani tasdiqlaydi', async () => {
    await page.getByLabel('Elektron pochta', { exact: true }).fill(ADMIN.email);
    await page.getByLabel('Parol', { exact: true }).fill(ADMIN.password);
    await page.getByRole('button', { name: 'Kirish' }).click();
    await page.getByRole('heading', { name: 'Ikki bosqichli tasdiqlash' }).waitFor();
    await page.getByLabel('Tasdiqlash kodi', { exact: true }).fill(totp(mfaSecret));
    await page.getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
    await page.getByRole('heading', { name: 'Bosh sahifa' }).waitFor();

    await page.getByRole('link', { name: 'Topshiriqlar', exact: true }).click();
    await page.getByRole('link', { name: TASK }).click();
    await page.getByRole('button', { name: 'Tekshirish', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Sifat bahosi (ixtiyoriy)', { exact: true })
      .selectOption('5');
    await confirm();
    await page.getByText('Sifat bahosi: 5/5').waitFor();

    await page.getByRole('button', { name: 'Natijani tasdiqlash' }).click();
    await confirm();
    await page.getByRole('button', { name: 'Bajarildi deb yakunlash' }).click();
    await confirm();
    await page.getByText('Hozir siz bajara oladigan amal yo‘q.').waitFor();
    await page.getByText('Bajarildi', { exact: true }).first().waitFor();
    await shot('13-topshiriq-bajarildi');

    await page.getByRole('link', { name: 'Akkreditatsiya', exact: true }).click();
    await page.getByRole('row').filter({ hasText: '3.2.1' }).getByText('100%').waitFor();
    await page.getByRole('link', { name: 'Bosh sahifa', exact: true }).click();
    await page.getByText('1 / 1 ta tasdiqlanib yakunlangan').waitFor();
    await shot('14-bosh-sahifa-yakun');
  });
} finally {
  writeFileSync(`${OUT}/console-errors.txt`, consoleErrors.join('\n'));
  writeFileSync(`${OUT}/steps.txt`, steps.join('\n'));
  console.log(steps.join('\n'));
  await browser.close();
}
