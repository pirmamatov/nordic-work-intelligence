import { readFile } from 'node:fs/promises';
import path from 'node:path';
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

async function seed() {
  const dept = await createDepartment('IT');
  const other = await createDepartment('HR');
  const owner = await createUser({ departmentId: dept.id, fullName: 'Mas’ul Xodim' });
  const outsider = await createUser({ departmentId: other.id });
  const coordinator = await loginAs({
    roles: ['ACCREDITATION_COORDINATOR'],
    fullName: 'Koordinator',
  });
  const created = await coordinator.api.post('/api/tasks').send({
    title: 'Akkreditatsiya hisoboti',
    ownerId: owner.employeeId,
    dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  const ownerApi = client(await sessionFor(owner.id));
  const outsiderApi = client(await sessionFor(outsider.id));
  return { taskId: created.body.id as string, owner, ownerApi, outsiderApi, coordinator };
}

type Api = ReturnType<typeof client>;
const upload = (
  api: Api,
  url: string,
  fileName: string,
  content: string,
  extra: Record<string, string> = {},
) =>
  api
    .post(url)
    .query({ fileName, ...extra })
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from(content));

const binary = (
  res: { on: (event: string, cb: (chunk?: Buffer) => void) => void },
  cb: (err: null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (c) => c && chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('hujjatlar va versiyalar', () => {
  it('hujjat shifrlab saqlanadi va faqat topshiriqni ko‘ra oladiganlar yuklab oladi', async () => {
    const { taskId, ownerApi, outsiderApi, coordinator } = await seed();
    const created = await upload(
      ownerApi,
      `/api/tasks/${taskId}/documents`,
      'hisobot.docx',
      'MAXFIY hisobot matni',
      { title: 'Hisobot' },
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ versionNo: 1, duplicate: false });

    const version = await prisma.documentVersion.findFirstOrThrow();
    const onDisk = await readFile(path.resolve('/tmp/nwi-test-storage', version.storageKey));
    expect(onDisk.includes(Buffer.from('MAXFIY'))).toBe(false);

    const url = `/api/documents/${created.body.id}/versions/${version.id}/download`;
    const file = await coordinator.api.get(url).buffer(true).parse(binary);
    expect(file.status).toBe(200);
    expect((file.body as Buffer).toString()).toBe('MAXFIY hisobot matni');
    expect(file.get('Content-Disposition')).toContain("attachment; filename*=UTF-8''hisobot.docx");
    expect(file.get('X-Content-Type-Options')).toBe('nosniff');

    expect((await outsiderApi.get(url)).status).toBe(404);
    expect((await upload(outsiderApi, `/api/tasks/${taskId}/documents`, 'a.pdf', 'x')).status).toBe(
      404,
    );
    expect(await prisma.auditLog.count({ where: { action: 'document.download' } })).toBe(1);
  });

  it('bir xil faylni qayta yuklash yangi hujjat ham, yangi versiya ham hisoblanmaydi', async () => {
    const { taskId, ownerApi, coordinator } = await seed();
    const doc = await upload(
      ownerApi,
      `/api/tasks/${taskId}/documents`,
      'hisobot.docx',
      'birinchi matn',
    );
    const versions = `/api/documents/${doc.body.id}/versions`;

    const same = await upload(ownerApi, versions, 'hisobot (1).docx', 'birinchi matn');
    expect(same.status).toBe(200);
    expect(same.body).toMatchObject({ versionNo: 1, duplicate: true });

    const changed = await upload(ownerApi, versions, 'hisobot.docx', 'ikkinchi matn', {
      note: 'Xulosa qo‘shildi',
    });
    expect(changed.status).toBe(201);
    expect(changed.body).toMatchObject({ versionNo: 2, duplicate: false });

    // Eski mazmunga qaytish ham yangi versiya emas.
    expect((await upload(ownerApi, versions, 'hisobot.docx', 'birinchi matn')).body).toMatchObject({
      versionNo: 1,
      duplicate: true,
    });

    const task = (await coordinator.api.get(`/api/tasks/${taskId}`)).body;
    expect(task.documents).toHaveLength(1);
    expect(task.documents[0].versions.map((v: { versionNo: number }) => v.versionNo)).toEqual([
      2, 1,
    ]);
    expect((await coordinator.api.get('/api/tasks')).body.items[0].documentCount).toBe(1);
    expect(await prisma.document.count()).toBe(1);
  });

  it('xavfli fayl turlarini rad etadi va fayl nomidan yo‘lni olib tashlaydi', async () => {
    const { taskId, ownerApi } = await seed();
    const url = `/api/tasks/${taskId}/documents`;
    for (const name of ['virus.exe', 'sahifa.html', 'rasm.svg', 'skript.js', 'nomsiz', '.pdf']) {
      const res = await upload(ownerApi, url, name, 'x');
      expect(res.body.error?.code, name).toBe('UNSUPPORTED_FILE_TYPE');
    }
    expect((await upload(ownerApi, url, 'bosh.pdf', '')).status).toBe(400);
    await upload(ownerApi, url, '..\\..\\Windows\\..//etc/hisobot.PDF', 'matn').expect(201);
    const version = await prisma.documentVersion.findFirstOrThrow();
    expect(version).toMatchObject({ fileName: 'hisobot.PDF', mimeType: 'application/pdf' });
    expect(version.storageKey).toMatch(/^documents\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.bin$/);
  });

  it('tekshiruv: mas’ul o‘z hujjatini tasdiqlay olmaydi; vakolatli shaxs baho bilan tasdiqlaydi', async () => {
    const { taskId, ownerApi, coordinator } = await seed();
    const doc = await upload(ownerApi, `/api/tasks/${taskId}/documents`, 'hisobot.pdf', 'matn');
    const id = doc.body.id as string;
    const review = (api: Api, body: Record<string, unknown>) =>
      api.post(`/api/documents/${id}/review`).send(body);

    expect((await review(coordinator.api, { decision: 'APPROVED' })).body.error.code).toBe(
      'DOCUMENT_NOT_SUBMITTED',
    );
    await ownerApi.post(`/api/documents/${id}/submit`).expect(204);
    expect((await ownerApi.post(`/api/documents/${id}/submit`)).status).toBe(409);
    expect((await review(ownerApi, { decision: 'APPROVED' })).status).toBe(403);

    expect((await review(coordinator.api, { decision: 'NEEDS_FIX' })).body.error.code).toBe(
      'NOTE_REQUIRED',
    );
    await review(coordinator.api, { decision: 'NEEDS_FIX', note: 'Jadvalni to‘ldiring' }).expect(
      204,
    );
    await ownerApi.post(`/api/documents/${id}/submit`).expect(204);
    expect((await review(coordinator.api, { decision: 'APPROVED', qualityScore: 9 })).status).toBe(
      422,
    );
    await review(coordinator.api, { decision: 'APPROVED', qualityScore: 4 }).expect(204);

    const row = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: 'APPROVED',
      qualityScore: 4,
      reviewerId: coordinator.user.id,
    });

    // Tasdiqlangandan keyin mazmun o'zgarsa, tasdiq bekor bo'ladi.
    await upload(ownerApi, `/api/documents/${id}/versions`, 'hisobot.pdf', 'o‘zgargan matn').expect(
      201,
    );
    expect((await prisma.document.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');
  });

  it('tasdiqlangan hujjat bo‘lsa topshiriq izohsiz yakunlanadi; yakunlangach hujjat qo‘shilmaydi', async () => {
    const { taskId, ownerApi, coordinator } = await seed();
    const doc = await upload(ownerApi, `/api/tasks/${taskId}/documents`, 'hisobot.pdf', 'matn');
    await ownerApi.post(`/api/documents/${doc.body.id}/submit`).expect(204);
    await coordinator.api
      .post(`/api/documents/${doc.body.id}/review`)
      .send({ decision: 'APPROVED' })
      .expect(204);

    const move = (api: Api, status: string) =>
      api.post(`/api/tasks/${taskId}/status`).send({ status });
    await move(ownerApi, 'IN_PROGRESS').expect(200);
    await move(ownerApi, 'IN_REVIEW').expect(200);
    await move(coordinator.api, 'APPROVED').expect(200);
    expect((await move(coordinator.api, 'DONE')).body.status).toBe('DONE');

    expect(
      (await upload(ownerApi, `/api/tasks/${taskId}/documents`, 'yana.pdf', 'x')).body.error.code,
    ).toBe('TASK_CLOSED');
    expect(
      (await upload(ownerApi, `/api/documents/${doc.body.id}/versions`, 'hisobot.pdf', 'yangi'))
        .body.error.code,
    ).toBe('TASK_CLOSED');
  });
});

describe('akkreditatsiya mezonlari', () => {
  it('koordinator mezonlarni boshqaradi; boshqalar faqat ko‘radi', async () => {
    const { ownerApi, coordinator } = await seed();
    const parent = await coordinator.api
      .post('/api/accreditation/criteria')
      .send({ code: '3.2', title: 'Ta’lim sifati' });
    expect(parent.status).toBe(201);
    const child = await coordinator.api
      .post('/api/accreditation/criteria')
      .send({ code: '3.2.1', title: 'O‘quv dasturlari', parentId: parent.body.id });
    expect(child.status).toBe(201);

    expect(
      (
        await coordinator.api
          .post('/api/accreditation/criteria')
          .send({ code: '3.2', title: 'Takror' })
      ).body.error.code,
    ).toBe('CRITERION_CODE_TAKEN');
    expect(
      (
        await coordinator.api
          .patch(`/api/accreditation/criteria/${parent.body.id}`)
          .send({ parentId: child.body.id })
      ).body.error.code,
    ).toBe('CRITERION_CYCLE');
    expect(
      (await coordinator.api.delete(`/api/accreditation/criteria/${parent.body.id}`)).body.error
        .code,
    ).toBe('CRITERION_HAS_CHILDREN');

    expect((await ownerApi.get('/api/accreditation/criteria')).body).toMatchObject({
      canManage: false,
    });
    expect(
      (await ownerApi.post('/api/accreditation/criteria').send({ code: '9', title: 'Ruxsatsiz' }))
        .status,
    ).toBe(403);
    expect((await ownerApi.delete(`/api/accreditation/criteria/${child.body.id}`)).status).toBe(
      403,
    );
  });

  it('mezon bo‘yicha bajarilish foydalanuvchi ko‘ra oladigan topshiriqlardan hisoblanadi', async () => {
    const { taskId, ownerApi, outsiderApi, coordinator } = await seed();
    const criterion = await coordinator.api
      .post('/api/accreditation/criteria')
      .send({ code: '3.2.1', title: 'O‘quv dasturlari' });
    await coordinator.api
      .patch(`/api/tasks/${taskId}`)
      .send({ criterionId: criterion.body.id })
      .expect(200);

    const row = async (api: Api) =>
      (await api.get('/api/accreditation/criteria')).body.items[0].tasks;
    expect(await row(coordinator.api)).toEqual({
      total: 1,
      done: 0,
      inReview: 0,
      overdue: 0,
      completionPct: 0,
    });
    expect(await row(ownerApi)).toMatchObject({ total: 1 });
    // Topshiriqni ko'ra olmaydigan xodim uchun raqamlar yo'q, foiz hisoblanmaydi.
    expect(await row(outsiderApi)).toEqual({
      total: 0,
      done: 0,
      inReview: 0,
      overdue: 0,
      completionPct: null,
    });

    expect(
      (await coordinator.api.delete(`/api/accreditation/criteria/${criterion.body.id}`)).body.error
        .code,
    ).toBe('CRITERION_IN_USE');
  });
});
