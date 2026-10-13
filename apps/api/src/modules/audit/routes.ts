import { Router } from 'express';
import { z } from 'zod';
import { cursorArgs, pageQuery, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/auth';

export const auditRouter = Router();

const query = pageQuery.extend({
  actorUserId: z.uuid().optional(),
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(100).optional(),
  entityId: z.string().trim().max(100).optional(),
  outcome: z.enum(['SUCCESS', 'FAILURE', 'DENIED']).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

auditRouter.get('/', requirePermission('audit.view'), async (req, res) => {
  const q = parse(query, req.query);
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
      // "auth." kabi prefiks bilan butun guruhni tanlash mumkin.
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.outcome ? { outcome: q.outcome } : {}),
      ...(q.from || q.to
        ? {
            occurredAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lt: new Date(q.to) } : {}),
            },
          }
        : {}),
    },
    // UUIDv7 vaqt bo'yicha tartiblangan, shuning uchun id bo'yicha kamayish — eng yangisi birinchi.
    orderBy: { id: 'desc' },
    include: { actorUser: { select: { id: true, fullName: true, email: true } } },
    ...cursorArgs(q),
  });
  res.json(toPage(rows, q.limit));
});
