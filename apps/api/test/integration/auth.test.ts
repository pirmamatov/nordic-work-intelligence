import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { totpAt, totpStep } from '../../src/lib/totp';
import {
  app,
  client,
  createUser,
  DEFAULT_PASSWORD,
  loginAs,
  prisma,
  resetDb,
  sessionFor,
} from '../helpers';

beforeEach(resetDb);

const login = (email: string, password = DEFAULT_PASSWORD) =>
  request(app).post('/api/auth/login').send({ email, password });

function cookieOf(res: request.Response): string {
  const header = res.get('Set-Cookie')?.[0] ?? '';
  return header.split(';')[0] ?? '';
}

describe('kirish', () => {
  it('to‘g‘ri ma’lumot bilan sessiya ochadi va xavfsiz cookie o‘rnatadi', async () => {
    const user = await createUser({ email: 'aziz@nordic.test' });
    const res = await login('aziz@nordic.test');

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: user.id,
      email: 'aziz@nordic.test',
      roles: ['EMPLOYEE'],
    });
    expect(res.body.csrfToken).toEqual(expect.any(String));
    const setCookie = res.get('Set-Cookie')?.[0] ?? '';
    expect(setCookie).toMatch(/^nwi_sid=/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');

    const me = await request(app).get('/api/auth/me').set('Cookie', cookieOf(res));
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
  });

  it('elektron pochta katta-kichik harfga bog‘liq emas', async () => {
    await createUser({ email: 'aziz@nordic.test' });
    expect((await login('  AZIZ@Nordic.Test ')).status).toBe(200);
  });

  it('noto‘g‘ri parol va mavjud bo‘lmagan hisob uchun bir xil javob qaytaradi', async () => {
    await createUser({ email: 'aziz@nordic.test' });
    const wrong = await login('aziz@nordic.test', 'Notogri-Parol-2026!');
    const unknown = await login('yoq@nordic.test');

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error).toMatchObject({
      code: wrong.body.error.code,
      message: wrong.body.error.message,
    });
    expect(wrong.get('Set-Cookie')).toBeUndefined();
  });

  it('faol bo‘lmagan foydalanuvchini kiritmaydi', async () => {
    await createUser({ email: 'aziz@nordic.test', isActive: false });
    expect((await login('aziz@nordic.test')).status).toBe(401);
  });

  it('5 ta xato urinishdan keyin hisobni bloklaydi — to‘g‘ri parol ham o‘tmaydi', async () => {
    await createUser({ email: 'aziz@nordic.test' });
    for (let i = 0; i < 5; i += 1) {
      expect((await login('aziz@nordic.test', 'Notogri-Parol-2026!')).status).toBe(401);
    }
    const locked = await login('aziz@nordic.test');
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');

    await prisma.user.update({
      where: { email: 'aziz@nordic.test' },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    expect((await login('aziz@nordic.test')).status).toBe(200);
  });

  it('noto‘g‘ri so‘rovni 422 bilan rad etadi', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'pochta-emas' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
    );
  });

  it('kirish urinishlarini audit jurnaliga yozadi, parolni yozmaydi', async () => {
    const user = await createUser({ email: 'aziz@nordic.test' });
    await login('aziz@nordic.test', 'Notogri-Parol-2026!');
    await login('aziz@nordic.test');

    const logs = await prisma.auditLog.findMany({
      where: { action: 'auth.login' },
      orderBy: { id: 'asc' },
    });
    expect(logs.map((l) => l.outcome)).toEqual(['FAILURE', 'SUCCESS']);
    expect(logs.every((l) => l.actorUserId === user.id)).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('Parol-2026');
  });
});

describe('sessiya', () => {
  it('sessiyasiz so‘rov 401 qaytaradi', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/users')).status).toBe(401);
  });

  it('chiqishdan keyin sessiya ishlamaydi', async () => {
    const { session, api } = await loginAs();
    expect((await api.post('/api/auth/logout')).status).toBe(204);
    expect((await client(session).get('/api/auth/me')).status).toBe(401);
  });

  it('harakatsizlik muddati o‘tgan sessiyani rad etadi', async () => {
    const { session, api } = await loginAs();
    await prisma.session.update({
      where: { id: session.sessionId },
      data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) },
    });
    expect((await api.get('/api/auth/me')).status).toBe(401);
  });

  it('mutlaq muddati o‘tgan sessiyani rad etadi', async () => {
    const { session, api } = await loginAs();
    await prisma.session.update({
      where: { id: session.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await api.get('/api/auth/me')).status).toBe(401);
  });

  it('foydalanuvchi o‘chirilganda mavjud sessiya ham ishlamaydi', async () => {
    const { user, api } = await loginAs();
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect((await api.get('/api/auth/me')).status).toBe(401);
  });

  it('o‘z sessiyalarini ko‘radi va boshqasini bekor qiladi; birovnikini bekor qila olmaydi', async () => {
    const { user, api } = await loginAs();
    const second = await sessionFor(user.id);
    const stranger = await loginAs();

    const list = await api.get('/api/auth/sessions');
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    expect((await api.delete(`/api/auth/sessions/${stranger.session.sessionId}`)).status).toBe(404);
    expect((await api.delete(`/api/auth/sessions/${second.sessionId}`)).status).toBe(204);
    expect((await client(second).get('/api/auth/me')).status).toBe(401);
    expect((await stranger.api.get('/api/auth/me')).status).toBe(200);
  });
});

describe('CSRF va Origin himoyasi', () => {
  it('CSRF tokenisiz holatni o‘zgartiruvchi so‘rovni rad etadi', async () => {
    const { session } = await loginAs();
    const res = await request(app).post('/api/auth/logout').set('Cookie', session.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
    expect((await client(session).get('/api/auth/me')).status).toBe(200);
  });

  it('boshqa sessiyaning CSRF tokenini qabul qilmaydi', async () => {
    const a = await loginAs();
    const b = await loginAs();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', a.session.cookie)
      .set('X-CSRF-Token', b.session.csrf);
    expect(res.status).toBe(403);
  });

  it('ruxsat etilmagan Origin’dan kelgan so‘rovni rad etadi', async () => {
    await createUser({ email: 'aziz@nordic.test' });
    const evil = await login('aziz@nordic.test').set('Origin', 'https://yovuz.test');
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect((await login('aziz@nordic.test').set('Origin', 'https://panel.test')).status).toBe(200);
    // Panelning o'zidan (bir xil xost) kelgan so'rov ham qabul qilinadi.
    expect(
      (await login('aziz@nordic.test').set('Host', 'nwi.ichki').set('Origin', 'http://nwi.ichki'))
        .status,
    ).toBe(200);
    expect(
      (
        await login('aziz@nordic.test')
          .set('Host', 'nwi.ichki')
          .set('Origin', 'http://nwi.ichki.yovuz.test')
      ).status,
    ).toBe(403);
  });
});

describe('parolni almashtirish', () => {
  it('vaqtinchalik parol bilan kirgan foydalanuvchi parolni almashtirmaguncha API’dan foydalana olmaydi', async () => {
    const { api } = await loginAs({ mustChangePassword: true });
    const blocked = await api.get('/api/departments');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const changed = await api
      .post('/api/auth/change-password')
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'Yangi-Kuchli-Parol-77' });
    expect(changed.status).toBe(204);
    expect((await api.get('/api/departments')).status).toBe(200);
  });

  it('parol almashganda boshqa sessiyalar bekor qilinadi va eski parol ishlamaydi', async () => {
    const { user, api } = await loginAs({ email: 'aziz@nordic.test' });
    const other = await sessionFor(user.id);

    await api
      .post('/api/auth/change-password')
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'Yangi-Kuchli-Parol-77' })
      .expect(204);

    expect((await client(other).get('/api/auth/me')).status).toBe(401);
    expect((await api.get('/api/auth/me')).status).toBe(200);
    expect((await login('aziz@nordic.test')).status).toBe(401);
    expect((await login('aziz@nordic.test', 'Yangi-Kuchli-Parol-77')).status).toBe(200);
  });

  it('noto‘g‘ri joriy parol, zaif yoki o‘zgarmagan yangi parolni rad etadi', async () => {
    const { api } = await loginAs();
    const post = (currentPassword: string, newPassword: string) =>
      api.post('/api/auth/change-password').send({ currentPassword, newPassword });

    expect((await post('Notogri-Parol-2026!', 'Yangi-Kuchli-Parol-77')).body.error.code).toBe(
      'INVALID_CURRENT_PASSWORD',
    );
    expect((await post(DEFAULT_PASSWORD, 'qisqa')).body.error.code).toBe('WEAK_PASSWORD');
    expect((await post(DEFAULT_PASSWORD, DEFAULT_PASSWORD)).body.error.code).toBe(
      'PASSWORD_UNCHANGED',
    );
  });
});

describe('ikki bosqichli tasdiqlash (MFA)', () => {
  const currentCode = (secret: string) => totpAt(secret, totpStep(Date.now()));

  it('MFA talab qiladigan rol sozlamaguncha himoyalangan yo‘llarga kira olmaydi', async () => {
    const { api } = await loginAs({ roles: ['SUPER_ADMIN'], mfa: false });
    const blocked = await api.get('/api/users');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('MFA_SETUP_REQUIRED');

    const setup = await api.post('/api/auth/mfa/setup');
    expect(setup.status).toBe(200);
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/');

    expect((await api.post('/api/auth/mfa/enable').send({ code: '000000' })).status).toBe(400);
    const enabled = await api
      .post('/api/auth/mfa/enable')
      .send({ code: currentCode(setup.body.secret) });
    expect(enabled.status).toBe(200);
    expect(enabled.body.recoveryCodes).toHaveLength(10);
    expect((await api.get('/api/users')).status).toBe(200);
  });

  it('MFA siri bazada ochiq holda saqlanmaydi', async () => {
    const { user, api } = await loginAs({ mfa: false });
    const setup = await api.post('/api/auth/mfa/setup');
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.mfaSecretEnc).toEqual(expect.any(String));
    expect(row.mfaSecretEnc).not.toContain(setup.body.secret);
  });

  it('MFA yoqilgan foydalanuvchi kod kiritmaguncha kira olmaydi; kod qayta ishlatilmaydi', async () => {
    const user = await createUser({ email: 'admin@nordic.test', roles: ['SUPER_ADMIN'] });
    const secret = user.mfaSecret ?? '';

    const first = await login('admin@nordic.test');
    expect(first.body.user.mfaPending).toBe(true);
    const pending = client({
      token: '',
      sessionId: '',
      cookie: cookieOf(first),
      csrf: first.body.csrfToken,
    });

    const blocked = await pending.get('/api/users');
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe('MFA_REQUIRED');
    expect((await pending.post('/api/auth/mfa/verify').send({ code: '000000' })).status).toBe(401);

    const code = currentCode(secret);
    expect((await pending.post('/api/auth/mfa/verify').send({ code })).status).toBe(204);
    expect((await pending.get('/api/users')).status).toBe(200);

    // Xuddi shu kod boshqa sessiyada qayta ishlatilsa rad etiladi.
    const second = await login('admin@nordic.test');
    const replay = client({
      token: '',
      sessionId: '',
      cookie: cookieOf(second),
      csrf: second.body.csrfToken,
    });
    expect((await replay.post('/api/auth/mfa/verify').send({ code })).status).toBe(401);
  });

  it('zaxira kodi faqat bir marta ishlaydi', async () => {
    const { user, api } = await loginAs({ email: 'admin@nordic.test', mfa: false });
    const setup = await api.post('/api/auth/mfa/setup');
    const enabled = await api
      .post('/api/auth/mfa/enable')
      .send({ code: currentCode(setup.body.secret) });
    const recoveryCode: string = enabled.body.recoveryCodes[0];

    const stored = await prisma.mfaRecoveryCode.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(10);
    expect(stored.some((c) => c.codeHash === recoveryCode)).toBe(false);

    const verifyWith = async (code: string) => {
      const session = await sessionFor(user.id, { mfaVerified: false });
      return client(session).post('/api/auth/mfa/verify').send({ code });
    };
    expect((await verifyWith(recoveryCode)).status).toBe(204);
    expect((await verifyWith(recoveryCode)).status).toBe(401);
  });

  it('MFA kodini noto‘g‘ri kiritish ham hisobni bloklaydi', async () => {
    const user = await createUser({ roles: ['SUPER_ADMIN'] });
    const session = await sessionFor(user.id, { mfaVerified: false });
    for (let i = 0; i < 5; i += 1) {
      expect(
        (await client(session).post('/api/auth/mfa/verify').send({ code: '000000' })).status,
      ).toBe(401);
    }
    const locked = await client(session)
      .post('/api/auth/mfa/verify')
      .send({ code: currentCode(user.mfaSecret ?? '') });
    expect(locked.status).toBe(423);
  });
});
