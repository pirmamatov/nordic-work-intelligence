import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { cursorArgs, pageQuery, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { parse } from '../../lib/validate';
import { getAuth, requireAuth } from '../../middleware/auth';

export const notificationsRouter = Router();

const listQuery = pageQuery.extend({ unread: z.stringbool().optional() });
const idParams = z.object({ id: z.uuid() });

// Har kim faqat o'z bildirishnomalarini ko'radi.
notificationsRouter.get('/', requireAuth, async (req, res) => {
  const auth = getAuth(req);
  const q = parse(listQuery, req.query);
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: auth.userId, ...(q.unread ? { readAt: null } : {}) },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        readAt: true,
        createdAt: true,
      },
      ...cursorArgs(q),
    }),
    prisma.notification.count({ where: { userId: auth.userId, readAt: null } }),
  ]);
  res.json({ ...toPage(rows, q.limit), unreadCount });
});

notificationsRouter.post('/read-all', requireAuth, async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: getAuth(req).userId, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ updated: result.count });
});

notificationsRouter.post('/:id/read', requireAuth, async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { id: parse(idParams, req.params).id, userId: getAuth(req).userId },
    data: { readAt: new Date() },
  });
  if (result.count === 0) throw notFound('Bildirishnoma');
  res.status(204).end();
});
