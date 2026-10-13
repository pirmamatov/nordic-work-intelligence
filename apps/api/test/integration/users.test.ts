import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  app,
  client,
  createDepartment,
  createUser,
  DEFAULT_PASSWORD,
  loginAs,
  prisma,
  resetDb,
  sessionFor,
} from '../helpers';

beforeEach(resetDb);

const newUser = (overrides: Record<string, unknown> = {}) => ({
  email: 'yangi@nordic.test',
  fullName: 'Yangi Xodim',
  password: 'Vaqtinchalik-Parol-55',
  roles: ['EMPLOYEE'],
  ...overrides,
});

describe('foydalanuvchi yaratish', () => {
  it('administrator xodimni bo‘limga biriktirib yaratadi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const dept = await createDepartment('IT');

    const res = await admin.api.post('/api/users').send(
      newUser({
        employee: { departmentId: dept.id, position: 'Dasturchi', hiredAt: '2025-09-01' },
      }),
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: 'yangi@nordic.test',
      roles: ['EMPLOYEE'],
      mustChangePassword: true,
      mfaEnabled: false,
      employee: {
        position: 'Dasturchi',
        hiredAt: '2025-09-01',
        department: { id: dept.id, code: 'IT' },
      },
    });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'yangi@nordic.test', password: 'Vaqtinchalik-Parol-55' });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
  });

  it('javobda parol xeshi yoki MFA siri hech qachon qaytmaydi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const created = await admin.api.post('/api/users').send(newUser());
    const list = await admin.api.get('/api/users');
    const one = await admin.api.get(`/api/users/${created.body.id}`);

    for (const body of [created.body, list.body, one.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/passwordHash|mfaSecret|argon2/i);
    }
  });

  it('takroriy pochta, zaif parol va noto‘g‘ri ma’lumotni rad etadi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    await admin.api.post('/api/users').send(newUser()).expect(201);

    const duplicate = await admin.api
      .post('/api/users')
      .send(newUser({ email: 'YANGI@nordic.test' }));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_TAKEN');

    const weak = await admin.api
      .post('/api/users')
      .send(newUser({ email: 'b@nordic.test', password: 'qisqa' }));
    expect(weak.body.error.code).toBe('WEAK_PASSWORD');

    const invalid = await admin.api
      .post('/api/users')
      .send(newUser({ email: 'c@nordic.test', roles: ['YOQ_ROL'] }));
    expect(invalid.status).toBe(422);

    const noDept = await admin.api.post('/api/users').send(
      newUser({
        email: 'd@nordic.test',
        employee: { departmentId: '01900000-0000-7000-8000-000000000000' },
      }),
    );
    expect(noDept.body.error.code).toBe('DEPARTMENT_NOT_FOUND');
    expect(await prisma.user.count({ where: { email: 'd@nordic.test' } })).toBe(0);
  });

  it('ruxsati yo‘q rollar foydalanuvchi yarata olmaydi', async () => {
    for (const role of [
      'EMPLOYEE',
      'DEPARTMENT_HEAD',
      'HR_ANALYST',
      'LEADERSHIP',
      'ACCREDITATION_COORDINATOR',
    ] as const) {
      const actor = await loginAs({ roles: [role] });
      const res = await actor.api
        .post('/api/users')
        .send(newUser({ email: `${role.toLowerCase()}@nordic.test` }));
      expect(res.status, role).toBe(403);
    }
    expect(await prisma.user.count({ where: { fullName: 'Yangi Xodim' } })).toBe(0);
  });
});

describe('foydalanuvchini tahrirlash', () => {
  it('bo‘limni, lavozimni va rolni o‘zgartiradi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const [it_, hr] = [await createDepartment('IT'), await createDepartment('HR')];
    const target = await createUser({ departmentId: it_.id });

    const res = await admin.api.patch(`/api/users/${target.id}`).send({
      fullName: 'Yangilangan Ism',
      roles: ['EMPLOYEE', 'DEPARTMENT_HEAD'],
      employee: { departmentId: hr.id, position: 'Bosh mutaxassis' },
    });

    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('Yangilangan Ism');
    expect(res.body.roles.sort()).toEqual(['DEPARTMENT_HEAD', 'EMPLOYEE']);
    expect(res.body.employee).toMatchObject({
      position: 'Bosh mutaxassis',
      department: { code: 'HR' },
    });
  });

  it('foydalanuvchi o‘chirilganda sessiyalari bekor qilinadi va u kira olmaydi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const target = await loginAs({ email: 'ketgan@nordic.test' });

    await admin.api.patch(`/api/users/${target.user.id}`).send({ isActive: false }).expect(200);

    expect((await target.api.get('/api/auth/me')).status).toBe(401);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ketgan@nordic.test', password: DEFAULT_PASSWORD });
    expect(login.status).toBe(401);
  });

  it('administrator o‘zini o‘chira olmaydi va o‘zidan super administrator rolini ola olmaydi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const deactivate = await admin.api
      .patch(`/api/users/${admin.user.id}`)
      .send({ isActive: false });
    expect(deactivate.body.error.code).toBe('SELF_DEACTIVATION');
    const demote = await admin.api
      .patch(`/api/users/${admin.user.id}`)
      .send({ roles: ['EMPLOYEE'] });
    expect(demote.body.error.code).toBe('SELF_DEMOTION');
  });

  it('parolni tiklash barcha sessiyalarni bekor qiladi va almashtirishni majburlaydi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const target = await loginAs({ email: 'unutgan@nordic.test' });

    await admin.api
      .post(`/api/users/${target.user.id}/reset-password`)
      .send({ newPassword: 'Tiklangan-Parol-88' })
      .expect(204);

    expect((await target.api.get('/api/auth/me')).status).toBe(401);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unutgan@nordic.test', password: 'Tiklangan-Parol-88' });
    expect(login.body.user.mustChangePassword).toBe(true);
  });

  it('alohida ruxsat (ekran tasvirlari) faqat aniq berilganda paydo bo‘ladi va MFA talab qiladi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const head = await loginAs({ roles: ['DEPARTMENT_HEAD'] });
    expect((await admin.api.get('/api/auth/me')).body.user.permissions).not.toContain(
      'screenshots.view',
    );
    expect((await head.api.get('/api/auth/me')).body.user.permissions).not.toContain(
      'screenshots.view',
    );

    await admin.api
      .put(`/api/users/${head.user.id}/permissions`)
      .send({ permissions: ['screenshots.view'] })
      .expect(204);

    const me = await head.api.get('/api/auth/me');
    expect(me.body.user.permissions).toContain('screenshots.view');
    expect(me.body.user.mfaSetupRequired).toBe(true);
    expect((await head.api.get('/api/users')).body.error.code).toBe('MFA_SETUP_REQUIRED');
  });

  it('administrator amallari audit jurnaliga yoziladi, parol yozilmaydi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const created = await admin.api.post('/api/users').send(newUser());
    await admin.api.patch(`/api/users/${created.body.id}`).send({ fullName: 'Boshqa Ism' });
    await admin.api
      .post(`/api/users/${created.body.id}/reset-password`)
      .send({ newPassword: 'Tiklangan-Parol-88' });

    const logs = await prisma.auditLog.findMany({
      where: { entityId: created.body.id },
      orderBy: { id: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual([
      'user.create',
      'user.update',
      'user.password.reset',
    ]);
    expect(logs.every((l) => l.actorUserId === admin.user.id)).toBe(true);
    expect(JSON.stringify(logs)).not.toMatch(/Vaqtinchalik-Parol|Tiklangan-Parol/);
  });
});

describe('ma’lumotlarni ajratish', () => {
  async function seedOrg() {
    const it_ = await createDepartment('IT');
    const itSub = await createDepartment('IT-DEV', { parentId: it_.id });
    const hr = await createDepartment('HR');
    const head = await createUser({
      roles: ['DEPARTMENT_HEAD'],
      departmentId: it_.id,
      fullName: 'IT Rahbari',
    });
    await prisma.department.update({ where: { id: it_.id }, data: { headUserId: head.id } });
    const itEmployee = await createUser({ departmentId: it_.id, fullName: 'IT Xodimi' });
    const devEmployee = await createUser({ departmentId: itSub.id, fullName: 'Dev Xodimi' });
    const hrEmployee = await createUser({ departmentId: hr.id, fullName: 'HR Xodimi' });
    return { head, itEmployee, devEmployee, hrEmployee };
  }

  it('oddiy xodim ro‘yxatda faqat o‘zini ko‘radi, boshqa xodim "topilmadi" bo‘ladi', async () => {
    const org = await seedOrg();
    const api = client(await sessionFor(org.itEmployee.id));

    const list = await api.get('/api/users');
    expect(list.body.items.map((u: { id: string }) => u.id)).toEqual([org.itEmployee.id]);
    expect((await api.get(`/api/users/${org.itEmployee.id}`)).status).toBe(200);
    expect((await api.get(`/api/users/${org.devEmployee.id}`)).status).toBe(404);
    expect((await api.get(`/api/users/${org.hrEmployee.id}`)).status).toBe(404);
  });

  it('bo‘lim rahbari o‘z bo‘limi va quyi bo‘limlarini ko‘radi, boshqa bo‘limni ko‘rmaydi', async () => {
    const org = await seedOrg();
    const api = client(await sessionFor(org.head.id));

    const list = await api.get('/api/users');
    const names = list.body.items.map((u: { fullName: string }) => u.fullName).sort();
    expect(names).toEqual(['Dev Xodimi', 'IT Rahbari', 'IT Xodimi']);

    expect((await api.get(`/api/users/${org.devEmployee.id}`)).status).toBe(200);
    expect((await api.get(`/api/users/${org.hrEmployee.id}`)).status).toBe(404);
    // Filtr orqali ham boshqa bo'limga o'tib bo'lmaydi.
    const filtered = await api.get('/api/users').query({ q: 'HR' });
    expect(filtered.body.items).toHaveLength(0);
  });

  it('HR tahlilchisi barcha xodimlarni ko‘radi, lekin tahrirlay olmaydi', async () => {
    const org = await seedOrg();
    const hr = await loginAs({ roles: ['HR_ANALYST'] });
    expect((await hr.api.get('/api/users')).body.items.length).toBeGreaterThanOrEqual(4);
    expect(
      (await hr.api.patch(`/api/users/${org.itEmployee.id}`).send({ fullName: 'Buzilgan' })).status,
    ).toBe(403);
  });

  it('ro‘yxat filtrlanadi va sahifalanadi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'], fullName: 'Admin' });
    const dept = await createDepartment('IT');
    for (let i = 0; i < 5; i += 1)
      await createUser({ departmentId: dept.id, fullName: `Xodim ${i}` });

    const first = await admin.api.get('/api/users').query({ departmentId: dept.id, limit: 2 });
    expect(first.body.items.map((u: { fullName: string }) => u.fullName)).toEqual([
      'Xodim 0',
      'Xodim 1',
    ]);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await admin.api
      .get('/api/users')
      .query({ departmentId: dept.id, limit: 2, cursor: first.body.nextCursor });
    expect(second.body.items.map((u: { fullName: string }) => u.fullName)).toEqual([
      'Xodim 2',
      'Xodim 3',
    ]);

    const search = await admin.api.get('/api/users').query({ q: 'xodim 4' });
    expect(search.body.items).toHaveLength(1);
    expect((await admin.api.get('/api/users').query({ limit: 1000 })).status).toBe(422);
  });
});
