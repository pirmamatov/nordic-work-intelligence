import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { localDate } from '../../src/lib/time';
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

const base = new Date(Date.now() - 2 * 86_400_000);
base.setUTCHours(6, 0, 0, 0);
const day = localDate(base, 'Asia/Tashkent');
const at = (minutes: number) => new Date(base.getTime() + minutes * 60_000).toISOString();

async function record(employeeId: string, processName: string, activeSec: number) {
  const agent = await enrollAgent(employeeId);
  await agent
    .post('/api/agent/v1/events')
    .send({
      sentAt: new Date().toISOString(),
      events: [
        {
          id: randomUUID(),
          sessionId: randomUUID(),
          processName,
          startedAt: at(0),
          endedAt: at(60),
          activeSec,
          idleSec: 3600 - activeSec,
          state: 'ACTIVE',
        },
      ],
    })
    .expect(200);
}

async function seed() {
  const it_ = await createDepartment('IT');
  const hr = await createDepartment('HR');
  const head = await createUser({
    roles: ['DEPARTMENT_HEAD'],
    departmentId: it_.id,
    fullName: 'IT Rahbari',
  });
  await prisma.department.update({ where: { id: it_.id }, data: { headUserId: head.id } });
  const itEmp = await createUser({ departmentId: it_.id, fullName: 'IT Xodimi' });
  const hrEmp = await createUser({ departmentId: hr.id, fullName: 'HR Xodimi' });
  await record(itEmp.employeeId ?? '', 'winword.exe', 3000);
  await record(hrEmp.employeeId ?? '', 'excel.exe', 1800);
  await record(head.employeeId ?? '', 'chrome.exe', 600);
  return { it_, hr, head, itEmp, hrEmp };
}

const range = { from: day, to: day };
const names = (body: { items: { fullName: string }[] }) => body.items.map((i) => i.fullName).sort();

describe('faoliyat analitikasi — ma’lumotlarni ajratish', () => {
  it('rahbariyat barcha xodimlarni ko‘radi', async () => {
    await seed();
    const leader = await loginAs({ roles: ['LEADERSHIP'] });
    const res = await leader.api
      .get('/api/activity/summary')
      .query({ ...range, groupBy: 'employee' });
    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(['HR Xodimi', 'IT Rahbari', 'IT Xodimi']);
    expect(res.body.meta).toMatchObject({ from: day, to: day, timezone: 'Asia/Tashkent' });
    expect(res.body.meta.definitions.activeSec).toEqual(expect.any(String));
  });

  it('bo‘lim rahbari faqat o‘z bo‘limini ko‘radi; filtr bilan ham chiqib keta olmaydi', async () => {
    const org = await seed();
    const api = client(await sessionFor(org.head.id));

    expect(
      names((await api.get('/api/activity/summary').query({ ...range, groupBy: 'employee' })).body),
    ).toEqual(['IT Rahbari', 'IT Xodimi']);
    const other = await api
      .get('/api/activity/summary')
      .query({ ...range, groupBy: 'employee', employeeId: org.hrEmp.employeeId });
    expect(other.body.items).toEqual([]);
    const otherDept = await api
      .get('/api/activity/summary')
      .query({ ...range, departmentId: org.hr.id });
    expect(otherDept.body.items).toEqual([]);

    expect(
      (
        await api
          .get('/api/activity/timeline')
          .query({ employeeId: org.itEmp.employeeId, date: day })
      ).status,
    ).toBe(200);
    expect(
      (
        await api
          .get('/api/activity/timeline')
          .query({ employeeId: org.hrEmp.employeeId, date: day })
      ).status,
    ).toBe(404);
    const days = await api.get('/api/activity/work-days').query(range);
    expect(days.body.items.map((d: { employeeId: string }) => d.employeeId).sort()).toEqual(
      [org.head.employeeId, org.itEmp.employeeId].sort(),
    );
  });

  it('oddiy xodim faqat o‘z ma’lumotini ko‘radi', async () => {
    const org = await seed();
    const api = client(await sessionFor(org.itEmp.id));

    const apps = await api.get('/api/activity/summary').query(range);
    expect(apps.body.items).toHaveLength(1);
    expect(apps.body.items[0]).toMatchObject({
      application: { processName: 'winword.exe' },
      activeSec: 3000,
      idleSec: 600,
    });

    const timeline = await api
      .get('/api/activity/timeline')
      .query({ employeeId: org.itEmp.employeeId, date: day });
    expect(timeline.body.items).toHaveLength(1);
    expect(timeline.body.items[0]).toMatchObject({
      state: 'ACTIVE',
      source: 'AGENT',
      confidence: 'HIGH',
    });
    for (const other of [org.hrEmp, org.head]) {
      expect(
        (await api.get('/api/activity/timeline').query({ employeeId: other.employeeId, date: day }))
          .status,
      ).toBe(404);
    }
  });

  it('faoliyatni ko‘rish ruxsati yo‘q rol (akkreditatsiya koordinatori) faqat o‘zinikini ko‘radi', async () => {
    const org = await seed();
    const coordinator = await loginAs({ roles: ['ACCREDITATION_COORDINATOR'] });
    const res = await coordinator.api
      .get('/api/activity/summary')
      .query({ ...range, groupBy: 'employee' });
    expect(res.body.items).toEqual([]);
    expect(
      (
        await coordinator.api
          .get('/api/activity/timeline')
          .query({ employeeId: org.itEmp.employeeId, date: day })
      ).status,
    ).toBe(404);
  });

  it('kategoriya va kun bo‘yicha guruhlaydi; noto‘g‘ri davrni rad etadi', async () => {
    await seed();
    const hr = await loginAs({ roles: ['HR_ANALYST'] });
    const byCategory = await hr.api
      .get('/api/activity/summary')
      .query({ ...range, groupBy: 'category' });
    expect(byCategory.body.items).toEqual([
      { category: 'OFFICE', activeSec: 4800, idleSec: 2400, eventCount: 2 },
      { category: 'BROWSER', activeSec: 600, idleSec: 3000, eventCount: 1 },
    ]);
    const byDay = await hr.api.get('/api/activity/summary').query({ ...range, groupBy: 'day' });
    expect(byDay.body.items).toEqual([
      { date: day, activeSec: 5400, idleSec: 5400, eventCount: 3 },
    ]);

    expect(
      (await hr.api.get('/api/activity/summary').query({ from: day, to: '2020-01-01' })).status,
    ).toBe(422);
    expect(
      (await hr.api.get('/api/activity/summary').query({ from: '2020-01-01', to: day })).body.error
        .code,
    ).toBe('RANGE_TOO_LARGE');
  });

  it('dastur kategoriyasini faqat ruxsati bor foydalanuvchi o‘zgartiradi', async () => {
    await seed();
    const app = await prisma.application.findUniqueOrThrow({
      where: { processName: 'chrome.exe' },
    });
    const employee = await loginAs();
    expect((await employee.api.get('/api/applications')).body.items).toHaveLength(3);
    expect(
      (await employee.api.patch(`/api/applications/${app.id}`).send({ workRelevance: 'WORK' }))
        .status,
    ).toBe(403);

    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const res = await admin.api
      .patch(`/api/applications/${app.id}`)
      .send({ workRelevance: 'WORK' });
    expect(res.body).toMatchObject({ processName: 'chrome.exe', workRelevance: 'WORK' });
    expect(
      await prisma.auditLog.count({ where: { action: 'application.update', entityId: app.id } }),
    ).toBe(1);
  });

  it('dashboard raqamlari foydalanuvchi doirasi bilan cheklanadi', async () => {
    const org = await seed();
    const leader = await loginAs({ roles: ['LEADERSHIP'] });
    const all = await leader.api.get('/api/dashboard');
    expect(all.status).toBe(200);
    expect(all.body.employees.total).toBe(4);
    expect(all.body.agents).toEqual({ online: 3, offline: 0 });
    expect(all.body.week).toHaveLength(7);
    const weekTotal = all.body.week.reduce(
      (s: number, d: { activeSec: number }) => s + d.activeSec,
      0,
    );
    expect(weekTotal).toBe(5400);

    const head = await client(await sessionFor(org.head.id)).get('/api/dashboard');
    expect(head.body.employees.total).toBe(2);
    expect(head.body.agents.online).toBe(2);
    expect(head.body.week.reduce((s: number, d: { activeSec: number }) => s + d.activeSec, 0)).toBe(
      3600,
    );

    const self = await client(await sessionFor(org.hrEmp.id)).get('/api/dashboard');
    expect(self.body.employees.total).toBe(1);
    expect(self.body.week.reduce((s: number, d: { activeSec: number }) => s + d.activeSec, 0)).toBe(
      1800,
    );
  });
});
