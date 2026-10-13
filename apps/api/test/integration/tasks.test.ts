import { beforeEach, describe, expect, it } from 'vitest';
import {
  client,
  createDepartment,
  createUser,
  loginAs,
  prisma,
  resetDb,
  sessionFor,
} from '../helpers';

beforeEach(resetDb);

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function seed() {
  const it_ = await createDepartment('IT');
  const hr = await createDepartment('HR');
  const head = await createUser({
    roles: ['DEPARTMENT_HEAD'],
    departmentId: it_.id,
    fullName: 'IT Rahbari',
  });
  await prisma.department.update({ where: { id: it_.id }, data: { headUserId: head.id } });
  const owner = await createUser({ departmentId: it_.id, fullName: 'Mas’ul Xodim' });
  const helper = await createUser({ departmentId: it_.id, fullName: 'Yordamchi' });
  const outsider = await createUser({ departmentId: hr.id, fullName: 'HR Xodimi' });
  const coordinator = await loginAs({
    roles: ['ACCREDITATION_COORDINATOR'],
    fullName: 'Koordinator',
  });
  const as = async (user: { id: string }) => client(await sessionFor(user.id));
  return { it_, hr, head, owner, helper, outsider, coordinator, as };
}

type Org = Awaited<ReturnType<typeof seed>>;

async function createTask(org: Org, overrides: Record<string, unknown> = {}) {
  const res = await org.coordinator.api.post('/api/tasks').send({
    title: '3.2.1 mezon bo‘yicha hisobot tayyorlash',
    ownerId: org.owner.employeeId,
    collaboratorIds: [org.helper.employeeId],
    dueAt: inDays(7),
    priority: 'HIGH',
    expectedResult: 'Tasdiqlangan hisobot',
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

const move = (
  api: ReturnType<typeof client>,
  id: string,
  status: string,
  extra: Record<string, unknown> = {},
) => api.post(`/api/tasks/${id}/status`).send({ status, ...extra });

describe('topshiriq yaratish va ko‘rinishi', () => {
  it('koordinator topshiriq yaratadi; ishtirokchilar ko‘radi, boshqalar ko‘rmaydi', async () => {
    const org = await seed();
    const task = await createTask(org);

    for (const user of [org.owner, org.helper, org.head]) {
      const api = await org.as(user);
      expect((await api.get(`/api/tasks/${task.id}`)).status).toBe(200);
      expect((await api.get('/api/tasks')).body.items.map((t: { id: string }) => t.id)).toEqual([
        task.id,
      ]);
    }
    const outsider = await org.as(org.outsider);
    expect((await outsider.get(`/api/tasks/${task.id}`)).status).toBe(404);
    expect((await outsider.get('/api/tasks')).body.items).toEqual([]);

    const detail = (await org.coordinator.api.get(`/api/tasks/${task.id}`)).body;
    expect(detail).toMatchObject({
      status: 'NEW',
      progressPct: 0,
      priority: 'HIGH',
      overdue: false,
      owner: { fullName: 'Mas’ul Xodim' },
      collaborators: [{ fullName: 'Yordamchi' }],
    });
    expect(detail.statusHistory).toHaveLength(1);
  });

  it('oddiy xodim topshiriq yarata olmaydi; bo‘lim rahbari faqat o‘z bo‘limiga bera oladi', async () => {
    const org = await seed();
    const body = { title: 'Yangi topshiriq', dueAt: inDays(3) };
    const owner = await org.as(org.owner);
    expect(
      (await owner.post('/api/tasks').send({ ...body, ownerId: org.owner.employeeId })).status,
    ).toBe(403);

    const head = await org.as(org.head);
    expect(
      (await head.post('/api/tasks').send({ ...body, ownerId: org.owner.employeeId })).status,
    ).toBe(201);
    expect(
      (await head.post('/api/tasks').send({ ...body, ownerId: org.outsider.employeeId })).status,
    ).toBe(403);
    const mixed = await head
      .post('/api/tasks')
      .send({ ...body, ownerId: org.owner.employeeId, collaboratorIds: [org.outsider.employeeId] });
    expect(mixed.status).toBe(403);
    expect(await prisma.task.count()).toBe(1);
  });

  it('noto‘g‘ri ma’lumotni rad etadi', async () => {
    const org = await seed();
    const post = (body: Record<string, unknown>) =>
      org.coordinator.api.post('/api/tasks').send(body);
    expect(
      (await post({ title: 'X', ownerId: org.owner.employeeId, dueAt: inDays(1) })).status,
    ).toBe(422);
    expect((await post({ title: 'Topshiriq', ownerId: org.owner.employeeId })).status).toBe(422);
    const ghost = await post({
      title: 'Topshiriq',
      ownerId: '01900000-0000-7000-8000-000000000000',
      dueAt: inDays(1),
    });
    expect(ghost.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    const criterion = await post({
      title: 'Topshiriq',
      ownerId: org.owner.employeeId,
      dueAt: inDays(1),
      criterionId: '01900000-0000-7000-8000-000000000000',
    });
    expect(criterion.body.error.code).toBe('CRITERION_NOT_FOUND');
  });
});

describe('holat o‘tishlari', () => {
  it('to‘liq yo‘l: mas’ul bajaradi, vakolatli shaxs tasdiqlaydi', async () => {
    const org = await seed();
    const task = await createTask(org);
    const owner = await org.as(org.owner);

    expect((await move(owner, task.id, 'IN_PROGRESS')).body.status).toBe('IN_PROGRESS');
    expect((await move(owner, task.id, 'IN_REVIEW')).body.status).toBe('IN_REVIEW');

    // Mas'ul xodim o'z natijasini tasdiqlay olmaydi.
    const selfApprove = await move(owner, task.id, 'APPROVED');
    expect(selfApprove.status).toBe(403);
    expect(selfApprove.body.error.code).toBe('TRANSITION_FORBIDDEN');

    const approved = await move(org.coordinator.api, task.id, 'APPROVED');
    expect(approved.body).toMatchObject({
      status: 'APPROVED',
      acceptedBy: { fullName: 'Koordinator' },
    });

    // Tasdiqlangan hujjat ham, qabul izohi ham bo'lmasa "Bajarildi" bo'lmaydi.
    const noEvidence = await move(org.coordinator.api, task.id, 'DONE');
    expect(noEvidence.body.error.code).toBe('RESULT_EVIDENCE_REQUIRED');

    const done = await move(org.coordinator.api, task.id, 'DONE', {
      comment: 'Hisobot kengashda qabul qilindi',
    });
    expect(done.body).toMatchObject({ status: 'DONE', progressPct: 100 });
    expect(done.body.completedAt).toEqual(expect.any(String));
    expect(done.body.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual([
      'NEW',
      'IN_PROGRESS',
      'IN_REVIEW',
      'APPROVED',
      'DONE',
    ]);
    expect(done.body.permissions.allowedTransitions).toEqual([]);
  });

  it('ruxsat etilmagan o‘tishni rad etadi; yakunlangan topshiriq o‘zgarmaydi', async () => {
    const org = await seed();
    const task = await createTask(org);
    const jump = await move(org.coordinator.api, task.id, 'DONE', { comment: 'x' });
    expect(jump.status).toBe(409);
    expect(jump.body.error.code).toBe('INVALID_TRANSITION');

    await move(org.coordinator.api, task.id, 'CANCELLED').expect(200);
    expect((await move(org.coordinator.api, task.id, 'IN_PROGRESS')).status).toBe(409);
    expect(
      (await org.coordinator.api.patch(`/api/tasks/${task.id}`).send({ title: 'Boshqa nom' })).body
        .error.code,
    ).toBe('TASK_CLOSED');
  });

  it('kechiktirish sababi va tuzatish izohi majburiy', async () => {
    const org = await seed();
    const task = await createTask(org);
    const owner = await org.as(org.owner);
    await move(owner, task.id, 'IN_PROGRESS').expect(200);

    expect((await move(owner, task.id, 'DELAYED')).body.error.code).toBe('DELAY_REASON_REQUIRED');
    const delayed = await move(owner, task.id, 'DELAYED', {
      delayReason: 'Ma’lumot boshqa bo‘limdan kutilmoqda',
    });
    expect(delayed.body).toMatchObject({
      status: 'DELAYED',
      delayReason: 'Ma’lumot boshqa bo‘limdan kutilmoqda',
    });

    await move(owner, task.id, 'IN_REVIEW').expect(200);
    expect((await move(org.coordinator.api, task.id, 'NEEDS_FIX')).body.error.code).toBe(
      'COMMENT_REQUIRED',
    );
    const fix = await move(org.coordinator.api, task.id, 'NEEDS_FIX', {
      comment: '2-bo‘limni to‘ldiring',
    });
    expect(fix.body.status).toBe('NEEDS_FIX');
    expect(fix.body.statusHistory.at(-1).comment).toBe('2-bo‘limni to‘ldiring');
  });

  it('mas’ul bo‘lgan bo‘lim rahbari ham o‘z topshirig‘ini tasdiqlay olmaydi; boshqasinikini tasdiqlaydi', async () => {
    const org = await seed();
    const own = await createTask(org, { ownerId: org.head.employeeId, collaboratorIds: [] });
    const other = await createTask(org);
    const head = await org.as(org.head);
    const owner = await org.as(org.owner);

    await move(head, own.id, 'IN_PROGRESS').expect(200);
    await move(head, own.id, 'IN_REVIEW').expect(200);
    expect((await move(head, own.id, 'APPROVED')).status).toBe(403);

    await move(owner, other.id, 'IN_PROGRESS').expect(200);
    await move(owner, other.id, 'IN_REVIEW').expect(200);
    expect((await move(head, other.id, 'APPROVED')).status).toBe(200);
  });

  it('topshiriqqa aloqasi yo‘q xodim holatni o‘zgartira olmaydi', async () => {
    const org = await seed();
    const task = await createTask(org);
    const outsider = await org.as(org.outsider);
    expect((await move(outsider, task.id, 'IN_PROGRESS')).status).toBe(404);
    const hrAnalyst = await loginAs({ roles: ['HR_ANALYST'] });
    expect((await move(hrAnalyst.api, task.id, 'IN_PROGRESS')).status).toBe(404);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('NEW');
  });
});

describe('tahrirlash, izoh va bildirishnomalar', () => {
  it('ishtirokchi faqat bajarilish foizini o‘zgartiradi', async () => {
    const org = await seed();
    const task = await createTask(org);
    const owner = await org.as(org.owner);
    const progress = await owner.patch(`/api/tasks/${task.id}`).send({ progressPct: 40 });
    // Qisman tahrir boshqa maydonlarga (ishtirokchilar, ustuvorlik) tegmaydi.
    expect(progress.body).toMatchObject({
      progressPct: 40,
      priority: 'HIGH',
      collaborators: [{ fullName: 'Yordamchi' }],
    });
    expect((await owner.patch(`/api/tasks/${task.id}`).send({ progressPct: 140 })).status).toBe(
      422,
    );
    expect(
      (await owner.patch(`/api/tasks/${task.id}`).send({ title: 'Osonroq topshiriq' })).status,
    ).toBe(403);
    expect((await owner.patch(`/api/tasks/${task.id}`).send({ dueAt: inDays(60) })).status).toBe(
      403,
    );

    const edited = await org.coordinator.api
      .patch(`/api/tasks/${task.id}`)
      .send({ title: 'Yangilangan nom', collaboratorIds: [] });
    expect(edited.body).toMatchObject({ title: 'Yangilangan nom', collaborators: [] });
    const helper = await org.as(org.helper);
    expect((await helper.get(`/api/tasks/${task.id}`)).status).toBe(404);
  });

  it('bildirishnoma ishtirokchilarga boradi, amalni bajarganga emas; har kim faqat o‘zinikini ko‘radi', async () => {
    const org = await seed();
    const task = await createTask(org);
    const owner = await org.as(org.owner);
    const helper = await org.as(org.helper);

    let inbox = await owner.get('/api/notifications');
    expect(inbox.body.unreadCount).toBe(1);
    expect(inbox.body.items[0]).toMatchObject({
      type: 'task.assigned',
      link: `/topshiriqlar/${task.id}`,
    });
    expect((await org.coordinator.api.get('/api/notifications')).body.items).toEqual([]);

    await move(owner, task.id, 'IN_PROGRESS').expect(200);
    await owner
      .post(`/api/tasks/${task.id}/comments`)
      .send({ body: 'Ishni boshladim' })
      .expect(201);
    expect((await owner.get('/api/notifications')).body.unreadCount).toBe(1);
    expect((await helper.get('/api/notifications')).body.unreadCount).toBe(3);

    const foreign = inbox.body.items[0].id;
    expect((await helper.post(`/api/notifications/${foreign}/read`)).status).toBe(404);
    expect((await owner.post(`/api/notifications/${foreign}/read`)).status).toBe(204);
    inbox = await owner.get('/api/notifications').query({ unread: true });
    expect(inbox.body).toMatchObject({ items: [], unreadCount: 0 });
    expect((await helper.post('/api/notifications/read-all')).body.updated).toBe(3);
  });
});

describe('muddat va yig‘ma ko‘rsatkichlar', () => {
  it('muddati o‘tgan topshiriq belgilanadi; tasdiqlangan yoki yakunlangan — yo‘q', async () => {
    const org = await seed();
    const late = await createTask(org, { title: 'Kechikkan topshiriq', dueAt: inDays(-2) });
    const onTime = await createTask(org, { title: 'Muddatdagi topshiriq' });
    const finished = await createTask(org, { title: 'Yakunlangan topshiriq', dueAt: inDays(-1) });
    const owner = await org.as(org.owner);
    for (const status of ['IN_PROGRESS', 'IN_REVIEW'])
      await move(owner, finished.id, status).expect(200);
    await move(org.coordinator.api, finished.id, 'APPROVED').expect(200);

    const overdue = await org.coordinator.api.get('/api/tasks').query({ overdue: true });
    expect(overdue.body.items.map((t: { id: string }) => t.id)).toEqual([late.id]);
    const all = await org.coordinator.api.get('/api/tasks');
    const flags = Object.fromEntries(
      all.body.items.map((t: { id: string; overdue: boolean }) => [t.id, t.overdue]),
    );
    expect(flags).toEqual({ [late.id]: true, [onTime.id]: false, [finished.id]: false });

    await move(org.coordinator.api, finished.id, 'DONE', { comment: 'Qabul qilindi' }).expect(200);
    await move(org.coordinator.api, onTime.id, 'CANCELLED').expect(200);
    const stats = (await org.coordinator.api.get('/api/dashboard')).body.tasks;
    // Bekor qilingan topshiriq foizga kirmaydi: 2 tadan 1 tasi bajarilgan.
    expect(stats).toEqual({ total: 3, done: 1, inReview: 0, overdue: 1, completionPct: 50 });

    const outsiderStats = (await (await org.as(org.outsider)).get('/api/dashboard')).body.tasks;
    expect(outsiderStats).toEqual({
      total: 0,
      done: 0,
      inReview: 0,
      overdue: 0,
      completionPct: null,
    });
  });

  it('ro‘yxat holat va qidiruv bo‘yicha filtrlanadi', async () => {
    const org = await seed();
    const a = await createTask(org, { title: 'Hisobot A' });
    await createTask(org, { title: 'Jadval B' });
    await move(await org.as(org.owner), a.id, 'IN_PROGRESS').expect(200);
    const list = (query: Record<string, unknown>) =>
      org.coordinator.api.get('/api/tasks').query(query);
    expect((await list({ status: 'IN_PROGRESS' })).body.items).toHaveLength(1);
    expect((await list({ q: 'jadval' })).body.items[0].title).toBe('Jadval B');
    expect((await list({ ownerId: org.helper.employeeId })).body.items).toHaveLength(0);
    expect((await list({ status: 'YOQ' })).status).toBe(422);
  });
});
