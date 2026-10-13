import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { env } from '../../config/env';
import { decryptBlob, encryptBlob, sha256Hex } from '../../lib/crypto';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { cursorArgs, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { getObject, putObject, removeObject } from '../../lib/storage';
import { recordAudit } from '../audit/service';
import type { AgentContext, AuthContext } from '../auth/context';
import { effectivePolicy } from '../policies/service';
import { employeeInScope, resolveScope } from '../rbac/scope';

const FUTURE_TOLERANCE_MS = 5 * 60_000;

/** Fayl mazmunining boshidagi imzo bo'yicha turini aniqlaydi (agent yuborgan sarlavhaga ishonilmaydi). */
export function sniffImageType(data: Buffer): 'image/jpeg' | 'image/png' | null {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return 'image/jpeg';
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    return 'image/png';
  return null;
}

export async function retentionDays(): Promise<number> {
  const row = await prisma.retentionPolicy.findUnique({ where: { dataType: 'screenshots' } });
  return row?.retainDays ?? env.SCREENSHOT_RETENTION_DAYS;
}

/** Agentdan kelgan ekran tasvirini shifrlab saqlaydi. Qayta yuborish xavfsiz (clientCaptureId bo'yicha). */
export async function storeScreenshot(
  agent: AgentContext,
  captureId: string,
  capturedAt: Date,
  image: Buffer,
) {
  // Siyosat serverda ham tekshiriladi: o'chirilgan bo'lsa, agent yuborsa ham qabul qilinmaydi.
  const policy = await effectivePolicy(agent.employeeId);
  if (!policy.screenshotsEnabled) {
    throw forbidden('SCREENSHOTS_DISABLED', 'Bu xodim uchun ekran tasvirlari o‘chirilgan');
  }
  if (!sniffImageType(image)) throw badRequest('Fayl JPEG yoki PNG tasvir emas', 'INVALID_IMAGE');
  const now = Date.now();
  const maxAgeMs = (await retentionDays()) * 86_400_000;
  if (capturedAt.getTime() > now + FUTURE_TOLERANCE_MS || capturedAt.getTime() < now - maxAgeMs) {
    throw badRequest('Tasvir vaqti qabul qilinadigan oraliqdan tashqarida', 'INVALID_CAPTURE_TIME');
  }

  const key = {
    agentInstallationId_clientCaptureId: {
      agentInstallationId: agent.installationId,
      clientCaptureId: captureId,
    },
  };
  const existing = await prisma.screenshot.findUnique({ where: key, select: { id: true } });
  if (existing) return { id: existing.id, duplicate: true };

  const { sealed, wrappedKey } = encryptBlob(image);
  const day = capturedAt.toISOString().slice(0, 10).replaceAll('-', '/');
  const storageKey = `screenshots/${day}/${randomUUID()}.bin`;
  await putObject(storageKey, sealed);
  try {
    const row = await prisma.screenshot.create({
      data: {
        agentInstallationId: agent.installationId,
        clientCaptureId: captureId,
        employeeId: agent.employeeId,
        capturedAt,
        storageKey,
        encKeyWrapped: wrappedKey,
        sha256: sha256Hex(image),
        sizeBytes: image.length,
        expiresAt: new Date(capturedAt.getTime() + maxAgeMs),
      },
      select: { id: true },
    });
    return { id: row.id, duplicate: false };
  } catch (err) {
    // Yozuv yaratilmasa (masalan, parallel so'rov ulgurgan), fayl yetim qolmasligi kerak.
    await removeObject(storageKey);
    const again = await prisma.screenshot.findUnique({ where: key, select: { id: true } });
    if (again) return { id: again.id, duplicate: true };
    throw err;
  }
}

/**
 * Kim ko'ra oladi: xodim — faqat o'zinikini; boshqalar — `screenshots.view` alohida ruxsati
 * bo'lsa va xodim ularning faoliyatni ko'rish doirasida bo'lsa. Aks holda "topilmadi".
 */
async function assertMayView(auth: AuthContext, employeeId: string): Promise<void> {
  if (auth.employeeId === employeeId) return;
  if (!auth.permissions.has('screenshots.view')) throw notFound('Xodim');
  const scope = await resolveScope(auth, 'activity.view').catch(() => null);
  if (!scope || !(await employeeInScope(scope, employeeId))) throw notFound('Xodim');
}

export interface ListFilter {
  employeeId: string;
  from?: string | undefined;
  to?: string | undefined;
  limit: number;
  cursor?: string | undefined;
}

export async function listScreenshots(auth: AuthContext, filter: ListFilter) {
  await assertMayView(auth, filter.employeeId);
  const rows = await prisma.screenshot.findMany({
    where: {
      employeeId: filter.employeeId,
      deletedAt: null,
      ...(filter.from || filter.to
        ? {
            capturedAt: {
              ...(filter.from ? { gte: new Date(filter.from) } : {}),
              ...(filter.to ? { lt: new Date(filter.to) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, capturedAt: true, sizeBytes: true, expiresAt: true },
    ...cursorArgs(filter),
  });
  return toPage(rows, filter.limit);
}

/** Tasvirni ochib qaytaradi. Har bir ko'rish alohida yozuv va audit jurnaliga tushadi. */
export async function viewScreenshot(req: Request, auth: AuthContext, id: string) {
  const shot = await prisma.screenshot.findUnique({ where: { id } });
  if (!shot || shot.deletedAt) throw notFound('Ekran tasviri');
  await assertMayView(auth, shot.employeeId);

  const image = decryptBlob(await getObject(shot.storageKey), shot.encKeyWrapped);
  if (sha256Hex(image) !== shot.sha256)
    throw new AppError(500, 'INTEGRITY_ERROR', 'Tasvir yaxlitligi buzilgan');

  await prisma.$transaction(async (tx) => {
    await tx.screenshotView.create({
      data: { screenshotId: id, viewerId: auth.userId, ip: req.ip ?? null },
    });
    await recordAudit(
      req,
      {
        action: 'screenshot.view',
        entityType: 'Screenshot',
        entityId: id,
        diff: { employeeId: shot.employeeId },
      },
      tx,
    );
  });
  return { image, contentType: sniffImageType(image) ?? 'application/octet-stream' };
}

/** Saqlash muddati tugagan tasvirlarni o'chiradi: avval fayl, keyin yozuv belgilanadi. */
export async function purgeExpiredScreenshots(now = new Date()): Promise<number> {
  let purged = 0;
  for (;;) {
    const batch = await prisma.screenshot.findMany({
      where: { deletedAt: null, expiresAt: { lte: now } },
      select: { id: true, storageKey: true },
      take: 200,
    });
    if (batch.length === 0) break;
    for (const shot of batch) {
      await removeObject(shot.storageKey);
      await prisma.screenshot.update({ where: { id: shot.id }, data: { deletedAt: now } });
      purged += 1;
    }
  }
  if (purged > 0) {
    await prisma.auditLog.create({
      data: { action: 'retention.screenshots.purge', entityType: 'Screenshot', diff: { purged } },
    });
    logger.info({ purged }, 'Muddati o‘tgan ekran tasvirlari o‘chirildi');
  }
  return purged;
}
