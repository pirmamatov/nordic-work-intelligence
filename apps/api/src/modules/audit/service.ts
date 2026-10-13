import type { Request } from 'express';
import { prisma, type Db, type Prisma } from '../../lib/prisma';
import type { AuditOutcome } from '../../generated/prisma/enums';

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  outcome?: AuditOutcome;
  /** O'zgarish tafsiloti. Maxfiy maydonlar (parol, token, sir) bu yerga berilmaydi. */
  diff?: Prisma.InputJsonValue;
  /** Sessiya hali yo'q holatlar uchun (masalan, kirish urinishi). */
  actorUserId?: string | null;
}

/**
 * Audit jurnaliga yozadi. Tranzaksiya ichidagi amallar uchun `db` sifatida
 * tranzaksiya mijozini bering — amal bekor bo'lsa, yozuv ham bekor bo'ladi.
 */
export async function recordAudit(req: Request, entry: AuditEntry, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      outcome: entry.outcome ?? 'SUCCESS',
      ...(entry.diff !== undefined ? { diff: entry.diff } : {}),
      actorUserId: entry.actorUserId !== undefined ? entry.actorUserId : (req.auth?.userId ?? null),
      actorAgentId: req.agent?.installationId ?? null,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
      requestId: req.requestId,
    },
  });
}
