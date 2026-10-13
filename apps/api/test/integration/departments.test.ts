import { beforeEach, describe, expect, it } from 'vitest';
import { createDepartment, createUser, loginAs, prisma, resetDb } from '../helpers';

beforeEach(resetDb);

describe('bo‘limlar', () => {
  it('administrator bo‘lim yaratadi, tahrirlaydi va o‘chiradi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const head = await createUser({ roles: ['DEPARTMENT_HEAD'] });

    const created = await admin.api
      .post('/api/departments')
      .send({ name: 'Axborot texnologiyalari', code: 'it' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ code: 'IT', employeeCount: 0, head: null });

    const updated = await admin.api
      .patch(`/api/departments/${created.body.id}`)
      .send({ headUserId: head.id });
    expect(updated.body.head).toMatchObject({ id: head.id });

    expect((await admin.api.get('/api/departments')).body.items).toHaveLength(1);
    expect((await admin.api.delete(`/api/departments/${created.body.id}`)).status).toBe(204);
    expect(await prisma.department.count()).toBe(0);
  });

  it('takroriy kod va noto‘g‘ri ma’lumotni rad etadi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    await createDepartment('IT');
    expect(
      (await admin.api.post('/api/departments').send({ name: 'Boshqa', code: 'IT' })).body.error
        .code,
    ).toBe('DEPARTMENT_CODE_TAKEN');
    expect((await admin.api.post('/api/departments').send({ name: 'X', code: '!' })).status).toBe(
      422,
    );
  });

  it('ierarxiyada halqa hosil bo‘lishiga yo‘l qo‘ymaydi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const a = await createDepartment('A');
    const b = await createDepartment('B', { parentId: a.id });
    const c = await createDepartment('C', { parentId: b.id });

    expect(
      (await admin.api.patch(`/api/departments/${a.id}`).send({ parentId: c.id })).body.error.code,
    ).toBe('DEPARTMENT_CYCLE');
    expect(
      (await admin.api.patch(`/api/departments/${a.id}`).send({ parentId: a.id })).body.error.code,
    ).toBe('DEPARTMENT_CYCLE');
    expect(
      (await admin.api.patch(`/api/departments/${c.id}`).send({ parentId: a.id })).status,
    ).toBe(200);
  });

  it('xodimi yoki quyi bo‘limi bor bo‘limni o‘chirmaydi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const parent = await createDepartment('IT');
    const child = await createDepartment('IT-DEV', { parentId: parent.id });
    await createUser({ departmentId: child.id });

    expect((await admin.api.delete(`/api/departments/${parent.id}`)).body.error.code).toBe(
      'DEPARTMENT_HAS_CHILDREN',
    );
    expect((await admin.api.delete(`/api/departments/${child.id}`)).body.error.code).toBe(
      'DEPARTMENT_NOT_EMPTY',
    );
    expect(await prisma.department.count()).toBe(2);
  });

  it('oddiy xodim ro‘yxatni ko‘radi, lekin o‘zgartira olmaydi', async () => {
    const employee = await loginAs();
    const dept = await createDepartment('IT');
    expect((await employee.api.get('/api/departments')).status).toBe(200);
    expect(
      (await employee.api.post('/api/departments').send({ name: 'Yangi', code: 'NEW' })).status,
    ).toBe(403);
    expect(
      (await employee.api.patch(`/api/departments/${dept.id}`).send({ name: 'Buzilgan' })).status,
    ).toBe(403);
    expect((await employee.api.delete(`/api/departments/${dept.id}`)).status).toBe(403);
  });
});
