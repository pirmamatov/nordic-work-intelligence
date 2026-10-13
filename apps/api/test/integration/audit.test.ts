import { beforeEach, describe, expect, it } from 'vitest';
import { createDepartment, loginAs, prisma, resetDb } from '../helpers';

beforeEach(resetDb);

describe('audit jurnali', () => {
  it('faqat audit.view ruxsati borlar ko‘ra oladi', async () => {
    for (const role of [
      'EMPLOYEE',
      'DEPARTMENT_HEAD',
      'HR_ANALYST',
      'LEADERSHIP',
      'ACCREDITATION_COORDINATOR',
    ] as const) {
      const actor = await loginAs({ roles: [role] });
      expect((await actor.api.get('/api/audit-logs')).status, role).toBe(403);
    }
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    expect((await admin.api.get('/api/audit-logs')).status).toBe(200);
  });

  it('amal, obyekt va natija bo‘yicha filtrlaydi; eng yangisi birinchi keladi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const a = await admin.api.post('/api/departments').send({ name: 'Birinchi', code: 'A1' });
    await admin.api.post('/api/departments').send({ name: 'Ikkinchi', code: 'B1' });
    await admin.api.patch(`/api/departments/${a.body.id}`).send({ name: 'Birinchi (yangi)' });

    const all = await admin.api.get('/api/audit-logs').query({ action: 'department.' });
    expect(all.body.items.map((l: { action: string }) => l.action)).toEqual([
      'department.update',
      'department.create',
      'department.create',
    ]);
    expect(all.body.items[0]).toMatchObject({
      entityType: 'Department',
      entityId: a.body.id,
      outcome: 'SUCCESS',
      actorUser: { id: admin.user.id },
    });
    expect(all.body.items[0].requestId).toEqual(expect.any(String));

    const byEntity = await admin.api.get('/api/audit-logs').query({ entityId: a.body.id });
    expect(byEntity.body.items).toHaveLength(2);

    const page = await admin.api.get('/api/audit-logs').query({ action: 'department.', limit: 2 });
    expect(page.body.items).toHaveLength(2);
    const rest = await admin.api
      .get('/api/audit-logs')
      .query({ action: 'department.', limit: 2, cursor: page.body.nextCursor });
    expect(rest.body.items).toHaveLength(1);
    expect(rest.body.nextCursor).toBeNull();
  });

  it('bekor bo‘lgan amal audit yozuvini qoldirmaydi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    await createDepartment('IT');
    await admin.api.post('/api/departments').send({ name: 'Takror', code: 'IT' }).expect(409);
    expect(await prisma.auditLog.count({ where: { action: 'department.create' } })).toBe(0);
  });

  it('audit yozuvlarini API orqali o‘zgartirish yoki o‘chirish yo‘li yo‘q', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    await admin.api.post('/api/departments').send({ name: 'Birinchi', code: 'A1' });
    const log = await prisma.auditLog.findFirstOrThrow();
    expect((await admin.api.delete(`/api/audit-logs/${log.id}`)).status).toBe(404);
    expect((await admin.api.patch(`/api/audit-logs/${log.id}`).send({ action: 'x' })).status).toBe(
      404,
    );
    expect(await prisma.auditLog.count()).toBe(1);
  });
});
