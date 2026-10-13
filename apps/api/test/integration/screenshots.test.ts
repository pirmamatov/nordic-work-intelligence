import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { purgeExpiredScreenshots } from '../../src/modules/screenshots/service';
import {
  client,
  createDepartment,
  createUser,
  enrollAgent,
  loginAs,
  prisma,
  resetDb,
  sessionFor,
} from '../helpers';

beforeEach(resetDb);

// Eng kichik yaroqli JPEG sarlavhasi + farqlanadigan mazmun.
const jpeg = (marker = 'tasvir-mazmuni') =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from(`MAXFIY-${marker}`.repeat(20)),
    Buffer.from([0xff, 0xd9]),
  ]);

async function setup(options: { enabled?: boolean } = {}) {
  const dept = await createDepartment('IT');
  const employee = await createUser({ departmentId: dept.id });
  const employeeId = employee.employeeId ?? '';
  const policy = await prisma.monitoringPolicy.create({
    data: {
      name: 'Tasvirli',
      workSchedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
      screenshotsEnabled: options.enabled ?? true,
    },
  });
  await prisma.policyAssignment.create({ data: { policyId: policy.id, employeeId } });
  const agent = await enrollAgent(employeeId);
  const upload = (
    image: Buffer,
    id = randomUUID(),
    capturedAt = new Date().toISOString(),
    type = 'image/jpeg',
  ) =>
    agent
      .post('/api/agent/v1/screenshots')
      .query({ id, capturedAt })
      .set('Content-Type', type)
      .send(image);
  return { dept, employee, employeeId, agent, upload };
}

describe('ekran tasvirlarini qabul qilish', () => {
  it('tasvir diskda shifrlangan holda saqlanadi', async () => {
    const { upload } = await setup();
    const res = await upload(jpeg());
    expect(res.status).toBe(201);

    const row = await prisma.screenshot.findUniqueOrThrow({ where: { id: res.body.id } });
    const onDisk = await readFile(path.resolve('/tmp/nwi-test-storage', row.storageKey));
    expect(onDisk.includes(Buffer.from('MAXFIY'))).toBe(false);
    expect(onDisk.length).toBeGreaterThan(row.sizeBytes);
    expect(row.encKeyWrapped).toEqual(expect.any(String));
    expect(row.expiresAt.getTime() - row.capturedAt.getTime()).toBe(14 * 86_400_000);
  });

  it('siyosatda o‘chirilgan bo‘lsa, agent yuborgan tasvir qabul qilinmaydi', async () => {
    const { upload } = await setup({ enabled: false });
    const res = await upload(jpeg());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SCREENSHOTS_DISABLED');
    expect(await prisma.screenshot.count()).toBe(0);
  });

  it('qayta yuborilgan tasvir dublikat yaratmaydi', async () => {
    const { upload } = await setup();
    const id = randomUUID();
    const first = await upload(jpeg(), id);
    const second = await upload(jpeg(), id);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ id: first.body.id, duplicate: true });
    expect(await prisma.screenshot.count()).toBe(1);
  });

  it('tasvir bo‘lmagan fayl, noto‘g‘ri vaqt va tokensiz so‘rov rad etiladi', async () => {
    const { upload, agent } = await setup();
    expect((await upload(Buffer.from('bu tasvir emas, oddiy matn'))).body.error.code).toBe(
      'INVALID_IMAGE',
    );
    expect(
      (await upload(Buffer.from('<html>'), randomUUID(), new Date().toISOString(), 'text/html'))
        .body.error.code,
    ).toBe('INVALID_IMAGE');
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect((await upload(jpeg(), randomUUID(), future)).body.error.code).toBe(
      'INVALID_CAPTURE_TIME',
    );
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    expect((await upload(jpeg(), randomUUID(), old)).body.error.code).toBe('INVALID_CAPTURE_TIME');

    await prisma.agentInstallation.update({
      where: { id: agent.installationId },
      data: { status: 'REVOKED' },
    });
    expect((await upload(jpeg())).status).toBe(401);
    expect(await prisma.screenshot.count()).toBe(0);
  });
});

describe('ekran tasvirlarini ko‘rish', () => {
  it('alohida ruxsatsiz hech bir rol, shu jumladan super administrator, ko‘ra olmaydi', async () => {
    const { upload, employeeId } = await setup();
    const shot = await upload(jpeg());
    for (const role of [
      'SUPER_ADMIN',
      'LEADERSHIP',
      'HR_ANALYST',
      'DEPARTMENT_HEAD',
      'ACCREDITATION_COORDINATOR',
      'EMPLOYEE',
    ] as const) {
      const actor = await loginAs({ roles: [role] });
      expect((await actor.api.get('/api/screenshots').query({ employeeId })).status, role).toBe(
        404,
      );
      expect((await actor.api.get(`/api/screenshots/${shot.body.id}/image`)).status, role).toBe(
        404,
      );
    }
    expect(await prisma.screenshotView.count()).toBe(0);
  });

  it('ruxsat berilgan foydalanuvchi ko‘radi; har bir ko‘rish qayd etiladi', async () => {
    const { upload, employeeId } = await setup();
    const original = jpeg('asl');
    const shot = await upload(original);
    const viewer = await loginAs({ roles: ['LEADERSHIP'] });
    const perm = await prisma.permission.findUniqueOrThrow({ where: { code: 'screenshots.view' } });
    await prisma.userPermission.create({ data: { userId: viewer.user.id, permissionId: perm.id } });

    const list = await viewer.api.get('/api/screenshots').query({ employeeId });
    expect(list.body.items).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toMatch(/storageKey|encKeyWrapped/);

    const image = await viewer.api
      .get(`/api/screenshots/${shot.body.id}/image`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(image.status).toBe(200);
    expect(image.get('Content-Type')).toBe('image/jpeg');
    expect(image.get('Cache-Control')).toBe('no-store');
    expect(Buffer.compare(image.body as Buffer, original)).toBe(0);

    await viewer.api.get(`/api/screenshots/${shot.body.id}/image`);
    const views = await prisma.screenshotView.findMany();
    expect(views).toHaveLength(2);
    expect(views.every((v) => v.viewerId === viewer.user.id)).toBe(true);
    expect(
      await prisma.auditLog.count({ where: { action: 'screenshot.view', entityId: shot.body.id } }),
    ).toBe(2);
  });

  it('ruxsati bor bo‘lim rahbari boshqa bo‘lim xodimining tasvirini ko‘ra olmaydi', async () => {
    const { upload, employeeId, dept } = await setup();
    const shot = await upload(jpeg());
    const perm = await prisma.permission.findUniqueOrThrow({ where: { code: 'screenshots.view' } });

    const otherDept = await createDepartment('HR');
    const otherHead = await createUser({
      roles: ['DEPARTMENT_HEAD'],
      departmentId: otherDept.id,
      mfa: true,
    });
    await prisma.department.update({
      where: { id: otherDept.id },
      data: { headUserId: otherHead.id },
    });
    const ownHead = await createUser({
      roles: ['DEPARTMENT_HEAD'],
      departmentId: dept.id,
      mfa: true,
    });
    await prisma.department.update({ where: { id: dept.id }, data: { headUserId: ownHead.id } });
    await prisma.userPermission.createMany({
      data: [otherHead, ownHead].map((u) => ({ userId: u.id, permissionId: perm.id })),
    });

    const other = client(await sessionFor(otherHead.id));
    expect((await other.get('/api/screenshots').query({ employeeId })).status).toBe(404);
    expect((await other.get(`/api/screenshots/${shot.body.id}/image`)).status).toBe(404);
    const own = client(await sessionFor(ownHead.id));
    expect((await own.get(`/api/screenshots/${shot.body.id}/image`)).status).toBe(200);
  });

  it('xodim o‘z tasvirlarini ko‘ra oladi, boshqanikini emas', async () => {
    const { upload, employee, employeeId } = await setup();
    const shot = await upload(jpeg());
    const self = client(await sessionFor(employee.id));
    expect((await self.get('/api/screenshots').query({ employeeId })).body.items).toHaveLength(1);
    expect((await self.get(`/api/screenshots/${shot.body.id}/image`)).status).toBe(200);

    const colleague = await loginAs();
    expect((await colleague.api.get(`/api/screenshots/${shot.body.id}/image`)).status).toBe(404);
  });
});

describe('saqlash muddati', () => {
  it('muddati o‘tgan tasvir fayli o‘chiriladi va endi ko‘rinmaydi; yangisi qoladi', async () => {
    const { upload, employee, employeeId } = await setup();
    const oldShot = await upload(jpeg('eski'));
    const freshShot = await upload(jpeg('yangi'));
    await prisma.screenshot.update({
      where: { id: oldShot.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const row = await prisma.screenshot.findUniqueOrThrow({ where: { id: oldShot.body.id } });

    expect(await purgeExpiredScreenshots()).toBe(1);
    expect(await purgeExpiredScreenshots()).toBe(0);

    await expect(readFile(path.resolve('/tmp/nwi-test-storage', row.storageKey))).rejects.toThrow();
    const self = client(await sessionFor(employee.id));
    expect((await self.get(`/api/screenshots/${oldShot.body.id}/image`)).status).toBe(404);
    expect((await self.get(`/api/screenshots/${freshShot.body.id}/image`)).status).toBe(200);
    expect((await self.get('/api/screenshots').query({ employeeId })).body.items).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: 'retention.screenshots.purge' } })).toBe(
      1,
    );
  });
});
