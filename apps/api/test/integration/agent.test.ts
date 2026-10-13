import { randomUUID, verify, createPublicKey } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { agentConfigPublicKey } from '../../src/lib/signing';
import {
  app,
  createDepartment,
  createUser,
  enrollAgent,
  loginAs,
  prisma,
  resetDb,
} from '../helpers';

beforeEach(resetDb);

const SESSION = '01900000-0000-7000-8000-00000000aaaa';
// Sinovlar "hozir"ga nisbatan yaqin o'tmishda bo'lishi kerak (kelajak va juda eski hodisalar rad etiladi).
const base = new Date(Date.now() - 3 * 86_400_000);
base.setUTCHours(6, 0, 0, 0); // Toshkent vaqti bilan 11:00
const at = (minutes: number) => new Date(base.getTime() + minutes * 60_000).toISOString();

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    sessionId: SESSION,
    processName: 'WINWORD.EXE',
    startedAt: at(0),
    endedAt: at(10),
    activeSec: 540,
    idleSec: 60,
    state: 'ACTIVE',
    ...overrides,
  };
}

const batch = (events: unknown[]) => ({ sentAt: new Date().toISOString(), events });

describe('agentni ro‘yxatdan o‘tkazish', () => {
  const enrollBody = (code: string, extra: Record<string, unknown> = {}) => ({
    code,
    hostname: 'PC-101',
    osVersion: 'Windows 11',
    machineId: 'machine-guid-0001',
    agentVersion: '1.0.0',
    consentAcknowledged: true,
    ...extra,
  });

  async function issueCode() {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const employee = await createUser();
    const res = await admin.api
      .post('/api/agents/enrollment-codes')
      .send({ employeeId: employee.employeeId });
    expect(res.status).toBe(201);
    return { admin, employee, code: res.body.code as string };
  }

  it('bir martalik kod bilan ro‘yxatdan o‘tadi; kod bazada ochiq saqlanmaydi va qayta ishlamaydi', async () => {
    const { employee, code } = await issueCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(await prisma.agentEnrollmentCode.count({ where: { codeHash: code } })).toBe(0);

    const res = await request(app).post('/api/agent/v1/enroll').send(enrollBody(code));
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(await prisma.agentInstallation.count({ where: { tokenHash: res.body.token } })).toBe(0);

    const profile = await prisma.employeeProfile.findUniqueOrThrow({
      where: { id: employee.employeeId ?? '' },
    });
    expect(profile.monitoringConsentAt).toBeInstanceOf(Date);

    const again = await request(app)
      .post('/api/agent/v1/enroll')
      .send(enrollBody(code, { machineId: 'machine-guid-0002' }));
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe('INVALID_ENROLLMENT_CODE');

    const hb = await request(app)
      .post('/api/agent/v1/heartbeat')
      .set('Authorization', `Bearer ${res.body.token}`)
      .send({ agentVersion: '1.0.1', queueDepth: 3 });
    expect(hb.status).toBe(200);
  });

  it('muddati o‘tgan yoki noto‘g‘ri kodni va rozilik tasdig‘isiz so‘rovni rad etadi', async () => {
    const { code } = await issueCode();
    expect(
      (await request(app).post('/api/agent/v1/enroll').send(enrollBody('AAAA-BBBB-CCCC'))).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/agent/v1/enroll')
          .send(enrollBody(code, { consentAcknowledged: false }))
      ).status,
    ).toBe(422);

    await prisma.agentEnrollmentCode.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await request(app).post('/api/agent/v1/enroll').send(enrollBody(code))).status).toBe(
      401,
    );
    expect(await prisma.agentInstallation.count()).toBe(0);
  });

  it('shu kompyuterda qayta o‘rnatilganda eski token bekor bo‘ladi', async () => {
    const first = await issueCode();
    const a = await request(app).post('/api/agent/v1/enroll').send(enrollBody(first.code));
    const res2 = await first.admin.api
      .post('/api/agents/enrollment-codes')
      .send({ employeeId: first.employee.employeeId });
    const b = await request(app).post('/api/agent/v1/enroll').send(enrollBody(res2.body.code));

    const hb = (token: string) =>
      request(app)
        .post('/api/agent/v1/heartbeat')
        .set('Authorization', `Bearer ${token}`)
        .send({ agentVersion: '1.0.0' });
    expect((await hb(a.body.token)).status).toBe(401);
    expect((await hb(b.body.token)).status).toBe(200);
    expect(await prisma.workstation.count()).toBe(1);
  });

  it('faqat agents.manage ruxsati borlar kod yarata va agentni bekor qila oladi', async () => {
    const employee = await createUser();
    const agent = await enrollAgent(employee.employeeId ?? '');
    for (const role of ['EMPLOYEE', 'DEPARTMENT_HEAD', 'HR_ANALYST', 'LEADERSHIP'] as const) {
      const actor = await loginAs({ roles: [role] });
      expect(
        (
          await actor.api
            .post('/api/agents/enrollment-codes')
            .send({ employeeId: employee.employeeId })
        ).status,
      ).toBe(403);
      expect((await actor.api.post(`/api/agents/${agent.installationId}/revoke`)).status).toBe(403);
    }
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    expect((await admin.api.post(`/api/agents/${agent.installationId}/revoke`)).status).toBe(204);
    expect(
      (await agent.post('/api/agent/v1/heartbeat').send({ agentVersion: '1.0.0' })).status,
    ).toBe(401);
  });

  it('tokensiz, noto‘g‘ri tokenli va faol bo‘lmagan xodimning agenti rad etiladi', async () => {
    const employee = await createUser();
    const agent = await enrollAgent(employee.employeeId ?? '');
    expect(
      (
        await request(app)
          .post('/api/agent/v1/events')
          .send(batch([event()]))
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/agent/v1/events')
          .set('Authorization', 'Bearer notogri')
          .send(batch([event()]))
      ).status,
    ).toBe(401);
    await prisma.user.update({ where: { id: employee.id }, data: { isActive: false } });
    expect((await agent.post('/api/agent/v1/events').send(batch([event()]))).status).toBe(401);
    expect(await prisma.activityEvent.count()).toBe(0);
  });

  it('konfiguratsiya Ed25519 bilan imzolangan va aynan shu o‘rnatishga bog‘langan', async () => {
    const employee = await createUser();
    const agent = await enrollAgent(employee.employeeId ?? '');
    const res = await agent.get('/api/agent/v1/config');
    expect(res.status).toBe(200);

    const spki = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(agentConfigPublicKey, 'base64'),
    ]);
    const key = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    const signature = Buffer.from(res.body.signature, 'base64');
    expect(verify(null, Buffer.from(res.body.payload), key, signature)).toBe(true);
    expect(
      verify(null, Buffer.from(res.body.payload.replace('false', 'true')), key, signature),
    ).toBe(false);

    const config = JSON.parse(res.body.payload);
    expect(config).toMatchObject({
      installationId: agent.installationId,
      screenshots: { enabled: false },
      timezone: 'Asia/Tashkent',
    });
  });
});

describe('monitoring siyosati', () => {
  it('xodimga biriktirilgan siyosat bo‘limnikidan, bo‘limniki sukut bo‘yichadan ustun', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const dept = await createDepartment('IT');
    const employee = await createUser({ departmentId: dept.id });
    const agent = await enrollAgent(employee.employeeId ?? '');
    const schedule = { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' };
    const idle = async () =>
      JSON.parse((await agent.get('/api/agent/v1/config')).body.payload).idleThresholdSec;

    expect(await idle()).toBe(300);
    const def = await admin.api
      .post('/api/policies')
      .send({ name: 'Umumiy', workSchedule: schedule, idleThresholdSec: 120, isDefault: true });
    expect(def.status).toBe(201);
    expect(await idle()).toBe(120);

    const deptPolicy = await admin.api
      .post('/api/policies')
      .send({ name: 'IT', workSchedule: schedule, idleThresholdSec: 240 });
    await admin.api
      .put('/api/policies/assignments')
      .send({ policyId: deptPolicy.body.id, departmentId: dept.id })
      .expect(204);
    expect(await idle()).toBe(240);

    const own = await admin.api
      .post('/api/policies')
      .send({ name: 'Shaxsiy', workSchedule: schedule, idleThresholdSec: 600 });
    await admin.api
      .put('/api/policies/assignments')
      .send({ policyId: own.body.id, employeeId: employee.employeeId })
      .expect(204);
    expect(await idle()).toBe(600);

    const before = (await agent.get('/api/agent/v1/config')).body.configVersion;
    await admin.api
      .patch(`/api/policies/${own.body.id}`)
      .send({ idleThresholdSec: 900 })
      .expect(200);
    const after = await agent.get('/api/agent/v1/config');
    expect(after.body.configVersion).not.toBe(before);
    expect(JSON.parse(after.body.payload).idleThresholdSec).toBe(900);

    expect((await admin.api.delete(`/api/policies/${own.body.id}`)).body.error.code).toBe(
      'POLICY_IN_USE',
    );
  });

  it('noto‘g‘ri jadval va ruxsatsiz o‘zgartirishni rad etadi', async () => {
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    const bad = await admin.api
      .post('/api/policies')
      .send({ name: 'Xato', workSchedule: { days: [1], start: '18:00', end: '09:00' } });
    expect(bad.status).toBe(422);
    const leader = await loginAs({ roles: ['LEADERSHIP'] });
    const res = await leader.api
      .post('/api/policies')
      .send({ name: 'X1', workSchedule: { days: [1], start: '09:00', end: '18:00' } });
    expect(res.status).toBe(403);
  });
});

describe('faoliyat hodisalarini qabul qilish', () => {
  async function setup() {
    const employee = await createUser();
    const agent = await enrollAgent(employee.employeeId ?? '');
    return { employee, employeeId: employee.employeeId ?? '', agent };
  }

  it('hodisalarni saqlaydi, dasturni katalogga qo‘shadi va kunlik yig‘mani hisoblaydi', async () => {
    const { employeeId, agent } = await setup();
    const res = await agent.post('/api/agent/v1/events').send(
      batch([
        event(),
        event({ startedAt: at(10), endedAt: at(15), activeSec: 300, idleSec: 0 }),
        event({
          processName: 'chrome.exe',
          startedAt: at(15),
          endedAt: at(20),
          activeSec: 100,
          idleSec: 200,
          state: 'IDLE',
        }),
      ]),
    );
    expect(res.status).toBe(200);
    expect(res.body.accepted).toHaveLength(3);
    expect(res.body).toMatchObject({ duplicates: 0, rejected: [] });

    const word = await prisma.application.findUniqueOrThrow({
      where: { processName: 'winword.exe' },
    });
    expect(word).toMatchObject({
      displayName: 'Microsoft Word',
      category: 'OFFICE',
      workRelevance: 'WORK',
    });

    const perApp = await prisma.dailyActivitySummary.findMany({
      where: { employeeId },
      include: { application: true },
    });
    const byApp = Object.fromEntries(
      perApp.map((r) => [r.application.processName, [r.activeSec, r.idleSec, r.eventCount]]),
    );
    expect(byApp).toEqual({ 'winword.exe': [840, 60, 2], 'chrome.exe': [100, 200, 1] });

    const dayRow = await prisma.dailyWorkSummary.findFirstOrThrow({ where: { employeeId } });
    expect(dayRow).toMatchObject({ activeSec: 940, idleSec: 260, observedSec: 1200 });
    expect(dayRow.firstSeenAt?.toISOString()).toBe(at(0));
    expect(dayRow.lastSeenAt?.toISOString()).toBe(at(20));
  });

  it('bir xil to‘plam qayta yuborilganda dublikat yozilmaydi va yig‘ma o‘zgarmaydi', async () => {
    const { employeeId, agent } = await setup();
    const events = [event(), event({ startedAt: at(10), endedAt: at(20) })];

    const first = await agent.post('/api/agent/v1/events').send(batch(events));
    const second = await agent.post('/api/agent/v1/events').send(batch(events));
    const third = await agent
      .post('/api/agent/v1/events')
      .send(batch([...events, event({ startedAt: at(20), endedAt: at(30) })]));

    expect(first.body.duplicates).toBe(0);
    expect(second.body).toMatchObject({ duplicates: 2, rejected: [] });
    expect(second.body.accepted).toHaveLength(2);
    expect(third.body.duplicates).toBe(2);

    expect(await prisma.activityEvent.count()).toBe(3);
    const summary = await prisma.dailyActivitySummary.findFirstOrThrow({ where: { employeeId } });
    expect(summary).toMatchObject({ activeSec: 1620, idleSec: 180, eventCount: 3 });
    expect(await prisma.activitySession.count()).toBe(1);
  });

  it('parallel yuborilgan bir xil to‘plamlar ham dublikat bermaydi', async () => {
    const { employeeId, agent } = await setup();
    const events = Array.from({ length: 20 }, (_, i) =>
      event({ startedAt: at(i), endedAt: at(i + 1), activeSec: 60, idleSec: 0 }),
    );
    const results = await Promise.all(
      Array.from({ length: 5 }, () => agent.post('/api/agent/v1/events').send(batch(events))),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await prisma.activityEvent.count()).toBe(20);
    const summary = await prisma.dailyActivitySummary.findFirstOrThrow({ where: { employeeId } });
    expect(summary).toMatchObject({ activeSec: 1200, eventCount: 20 });
  });

  it('yaroqsiz hodisa rad etiladi, qolganlari qabul qilinadi', async () => {
    const { agent } = await setup();
    const good = event();
    const res = await agent.post('/api/agent/v1/events').send(
      batch([
        good,
        { ...good },
        event({ startedAt: at(10), endedAt: at(5) }),
        event({ activeSec: 9999 }),
        event({
          startedAt: new Date(Date.now() + 3_600_000).toISOString(),
          endedAt: new Date(Date.now() + 3_660_000).toISOString(),
          activeSec: 10,
          idleSec: 0,
        }),
        event({ startedAt: '2020-01-01T00:00:00Z', endedAt: '2020-01-01T00:10:00Z' }),
        event({ processName: 'C:\\Users\\aziz\\app.exe' }),
        { id: 'uuid-emas' },
      ]),
    );
    expect(res.status).toBe(200);
    expect(res.body.accepted).toEqual([good.id]);
    expect(res.body.rejected.map((r: { reason: string }) => r.reason)).toEqual([
      'DUPLICATE_IN_BATCH',
      'INVALID_INTERVAL',
      'INVALID_DURATION',
      'FUTURE_TIMESTAMP',
      'TOO_OLD',
      'INVALID_FORMAT',
      'INVALID_FORMAT',
    ]);
    expect(await prisma.activityEvent.count()).toBe(1);
  });

  it('yarim tundan o‘tgan hodisa ikki kunga mutanosib bo‘linadi (Toshkent vaqti)', async () => {
    const { employeeId, agent } = await setup();
    // Toshkent vaqti bilan 23:50 – 00:20: 10 daqiqa birinchi kunga, 20 daqiqa ikkinchisiga.
    const start = new Date(base);
    start.setUTCHours(18, 50, 0, 0);
    const end = new Date(start.getTime() + 30 * 60_000);
    await agent
      .post('/api/agent/v1/events')
      .send(
        batch([
          event({
            startedAt: start.toISOString(),
            endedAt: end.toISOString(),
            activeSec: 1500,
            idleSec: 300,
          }),
        ]),
      )
      .expect(200);

    const rows = await prisma.dailyActivitySummary.findMany({
      where: { employeeId },
      orderBy: { date: 'asc' },
    });
    expect(rows.map((r) => [r.activeSec, r.idleSec, r.eventCount])).toEqual([
      [500, 100, 1],
      [1000, 200, 0],
    ]);
    const dayDiff = ((rows[1]?.date.getTime() ?? 0) - (rows[0]?.date.getTime() ?? 0)) / 86_400_000;
    expect(dayDiff).toBe(1);
    expect(rows.reduce((sum, r) => sum + r.activeSec + r.idleSec, 0)).toBe(1800);
  });

  it('ekran qulflangan vaqt ish vaqtiga qo‘shilmaydi', async () => {
    const { employeeId, agent } = await setup();
    await agent
      .post('/api/agent/v1/events')
      .send(
        batch([
          event(),
          event({
            startedAt: at(10),
            endedAt: at(40),
            activeSec: 0,
            idleSec: 1800,
            state: 'LOCKED',
          }),
        ]),
      )
      .expect(200);
    expect(await prisma.activityEvent.count()).toBe(2);
    const dayRow = await prisma.dailyWorkSummary.findFirstOrThrow({ where: { employeeId } });
    expect(dayRow.observedSec).toBe(600);
  });

  it('xodim tokendan aniqlanadi: so‘rov tanasi orqali boshqa xodimga yozib bo‘lmaydi', async () => {
    const { employeeId, agent } = await setup();
    const victim = await createUser();
    await agent
      .post('/api/agent/v1/events')
      .send(batch([event({ employeeId: victim.employeeId, agentInstallationId: randomUUID() })]))
      .expect(200);
    const stored = await prisma.activityEvent.findFirstOrThrow();
    expect(stored.employeeId).toBe(employeeId);
    expect(stored.agentInstallationId).toBe(agent.installationId);
  });

  it('faqat siyosatda tasdiqlangan domen saqlanadi', async () => {
    const { employeeId, agent } = await setup();
    const policy = await prisma.monitoringPolicy.create({
      data: {
        name: 'Domenlar',
        workSchedule: { days: [1], start: '09:00', end: '18:00' },
        allowedDomains: ['claude.ai'],
      },
    });
    await prisma.policyAssignment.create({ data: { policyId: policy.id, employeeId } });
    await agent
      .post('/api/agent/v1/events')
      .send(
        batch([
          event({ processName: 'chrome.exe', domain: 'claude.ai' }),
          event({
            processName: 'chrome.exe',
            domain: 'shaxsiy-sayt.example.com',
            startedAt: at(10),
            endedAt: at(20),
          }),
        ]),
      )
      .expect(200);
    const domains = (await prisma.activityEvent.findMany({ orderBy: { startedAt: 'asc' } })).map(
      (e) => e.domain,
    );
    expect(domains).toEqual(['claude.ai', null]);
  });

  it('agent soati serverdan uzoq bo‘lsa ishonchlilik darajasi pasayadi', async () => {
    const { agent } = await setup();
    await agent
      .post('/api/agent/v1/events')
      .send({ sentAt: new Date(Date.now() - 3_600_000).toISOString(), events: [event()] })
      .expect(200);
    expect((await prisma.activityEvent.findFirstOrThrow()).confidence).toBe('LOW');
  });

  it('hodisalar oylik partitsiyaga tushadi; oy chegarasidan o‘tganda yangi partitsiya yaratiladi', async () => {
    const { agent } = await setup();
    const prevMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 1, 15, 6));
    await agent
      .post('/api/agent/v1/events')
      .send(
        batch([
          event(),
          event({
            startedAt: prevMonth.toISOString(),
            endedAt: new Date(prevMonth.getTime() + 600_000).toISOString(),
          }),
        ]),
      )
      .expect(200);

    const parts = await prisma.$queryRaw<{ part: string; n: bigint }[]>`
      SELECT tableoid::regclass::text AS part, count(*) AS n FROM "ActivityEvent" GROUP BY 1 ORDER BY 1`;
    const names = parts.map((p) => p.part.replace(/"/g, ''));
    const ym = (d: Date) => `ActivityEvent_${d.toISOString().slice(0, 7).replace('-', '_')}`;
    expect(names.sort()).toEqual([ym(prevMonth), ym(base)].sort());
    expect(names).not.toContain('ActivityEvent_default');
  });

  it('500 ta hodisali to‘plamni qabul qiladi, undan kattasini rad etadi', async () => {
    const { agent } = await setup();
    const many = Array.from({ length: 500 }, (_, i) =>
      event({
        startedAt: at(i / 6),
        endedAt: at((i + 1) / 6),
        activeSec: 10,
        idleSec: 0,
        processName: `app${i % 7}.exe`,
      }),
    );
    const ok = await agent.post('/api/agent/v1/events').send(batch(many));
    expect(ok.status).toBe(200);
    expect(ok.body.accepted).toHaveLength(500);
    expect(await prisma.activityEvent.count()).toBe(500);

    expect((await agent.post('/api/agent/v1/events').send(batch([...many, event()]))).status).toBe(
      422,
    );
  });

  it('agent xatolari va holati saqlanadi; ro‘yxatda onlayn/oflayn ko‘rinadi', async () => {
    const { agent } = await setup();
    const admin = await loginAs({ roles: ['SUPER_ADMIN'] });
    await agent
      .post('/api/agent/v1/heartbeat')
      .send({
        agentVersion: '1.2.0',
        queueDepth: 7,
        errors: [{ code: 'SYNC_FAILED', message: 'Tarmoq uzildi', occurredAt: at(0) }],
      })
      .expect(200);

    let list = await admin.api.get('/api/agents');
    expect(list.body.items[0]).toMatchObject({
      agentVersion: '1.2.0',
      queueDepth: 7,
      online: true,
    });
    expect(await prisma.agentErrorReport.count()).toBe(1);

    await prisma.agentInstallation.updateMany({
      data: { lastSeenAt: new Date(Date.now() - 600_000) },
    });
    list = await admin.api.get('/api/agents');
    expect(list.body.items[0].online).toBe(false);
  });
});
