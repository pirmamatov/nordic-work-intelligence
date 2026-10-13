import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { badRequest, notFound } from '../../lib/errors';
import { prisma, type Prisma } from '../../lib/prisma';
import { addDays, dateOnly, startOfLocalDay } from '../../lib/time';
import { parse } from '../../lib/validate';
import { getAuth, requirePermission } from '../../middleware/auth';
import type { AuthContext } from '../auth/context';
import { employeeInScope, employeeWhere, resolveScope } from '../rbac/scope';

export const activityRouter = Router();

const MAX_RANGE_DAYS = 366;
const day = z.iso.date('Sana YYYY-MM-DD ko‘rinishida bo‘lishi kerak');
const canView = requirePermission(
  'activity.view.all',
  'activity.view.department',
  'activity.view.self',
);

const rangeQuery = z
  .object({
    from: day,
    to: day,
    employeeId: z.uuid().optional(),
    departmentId: z.uuid().optional(),
  })
  .refine((v) => v.from <= v.to, {
    message: 'Boshlanish sanasi tugash sanasidan keyin bo‘lmasligi kerak',
    path: ['to'],
  });

const summaryQuery = rangeQuery.extend({
  groupBy: z.enum(['application', 'category', 'day', 'employee']).default('application'),
});

const timelineQuery = z.object({ employeeId: z.uuid(), date: day });

function assertRange(from: string, to: string): void {
  const days = (dateOnly(to).getTime() - dateOnly(from).getTime()) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS)
    throw badRequest(`Davr ${MAX_RANGE_DAYS} kundan oshmasligi kerak`, 'RANGE_TOO_LARGE');
}

/** So'ralgan filtrlar foydalanuvchi doirasi bilan kesishtiriladi — doiradan tashqariga chiqib bo'lmaydi. */
async function scopedEmployees(
  auth: AuthContext,
  filter: { employeeId?: string | undefined; departmentId?: string | undefined },
): Promise<Prisma.EmployeeProfileWhereInput> {
  const scope = await resolveScope(auth, 'activity.view');
  return {
    AND: [
      employeeWhere(scope),
      filter.employeeId ? { id: filter.employeeId } : {},
      filter.departmentId ? { departmentId: filter.departmentId } : {},
    ],
  };
}

const meta = (from: string, to: string) => ({
  from,
  to,
  timezone: env.ORG_TIMEZONE,
  generatedAt: new Date().toISOString(),
  definitions: {
    activeSec:
      'Dastur oldingi planda bo‘lib, nofaollik chegarasidan kam vaqt kiritishsiz o‘tgan soniyalar',
    idleSec: 'Dastur oldingi planda ochiq turgan, lekin kiritish bo‘lmagan soniyalar',
  },
});

activityRouter.get('/summary', canView, async (req, res) => {
  const q = parse(summaryQuery, req.query);
  assertRange(q.from, q.to);
  const where: Prisma.DailyActivitySummaryWhereInput = {
    date: { gte: dateOnly(q.from), lte: dateOnly(q.to) },
    employee: await scopedEmployees(getAuth(req), q),
  };
  const sums = { _sum: { activeSec: true, idleSec: true, eventCount: true } } as const;
  const totals = (s: {
    activeSec: number | null;
    idleSec: number | null;
    eventCount: number | null;
  }) => ({
    activeSec: s.activeSec ?? 0,
    idleSec: s.idleSec ?? 0,
    eventCount: s.eventCount ?? 0,
  });

  let items: unknown[];
  if (q.groupBy === 'day') {
    const rows = await prisma.dailyActivitySummary.groupBy({
      by: ['date'],
      where,
      ...sums,
      orderBy: { date: 'asc' },
    });
    items = rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), ...totals(r._sum) }));
  } else if (q.groupBy === 'employee') {
    const rows = await prisma.dailyActivitySummary.groupBy({ by: ['employeeId'], where, ...sums });
    const employees = await prisma.employeeProfile.findMany({
      where: { id: { in: rows.map((r) => r.employeeId) } },
      select: {
        id: true,
        user: { select: { fullName: true } },
        department: { select: { id: true, name: true } },
      },
    });
    const byId = new Map(employees.map((e) => [e.id, e]));
    items = rows
      .map((r) => ({
        employeeId: r.employeeId,
        fullName: byId.get(r.employeeId)?.user.fullName ?? null,
        department: byId.get(r.employeeId)?.department ?? null,
        ...totals(r._sum),
      }))
      .sort((a, b) => b.activeSec - a.activeSec);
  } else {
    const rows = await prisma.dailyActivitySummary.groupBy({
      by: ['applicationId'],
      where,
      ...sums,
    });
    const apps = await prisma.application.findMany({
      where: { id: { in: rows.map((r) => r.applicationId) } },
      select: {
        id: true,
        processName: true,
        displayName: true,
        category: true,
        workRelevance: true,
      },
    });
    const byId = new Map(apps.map((a) => [a.id, a]));
    const perApp = rows
      .map((r) => ({ application: byId.get(r.applicationId) ?? null, ...totals(r._sum) }))
      .sort((a, b) => b.activeSec - a.activeSec);
    if (q.groupBy === 'application') items = perApp;
    else {
      const perCategory = new Map<
        string,
        { category: string; activeSec: number; idleSec: number; eventCount: number }
      >();
      for (const row of perApp) {
        const category = row.application?.category ?? 'OTHER';
        const c = perCategory.get(category) ?? {
          category,
          activeSec: 0,
          idleSec: 0,
          eventCount: 0,
        };
        c.activeSec += row.activeSec;
        c.idleSec += row.idleSec;
        c.eventCount += row.eventCount;
        perCategory.set(category, c);
      }
      items = [...perCategory.values()].sort((a, b) => b.activeSec - a.activeSec);
    }
  }
  res.json({ meta: meta(q.from, q.to), groupBy: q.groupBy, items });
});

activityRouter.get('/work-days', canView, async (req, res) => {
  const q = parse(rangeQuery, req.query);
  assertRange(q.from, q.to);
  const rows = await prisma.dailyWorkSummary.findMany({
    where: {
      date: { gte: dateOnly(q.from), lte: dateOnly(q.to) },
      employee: await scopedEmployees(getAuth(req), q),
    },
    orderBy: [{ date: 'asc' }, { employeeId: 'asc' }],
    select: {
      employeeId: true,
      date: true,
      observedSec: true,
      activeSec: true,
      idleSec: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
  });
  res.json({
    meta: meta(q.from, q.to),
    items: rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) })),
  });
});

activityRouter.get('/timeline', canView, async (req, res) => {
  const q = parse(timelineQuery, req.query);
  const scope = await resolveScope(getAuth(req), 'activity.view');
  // Doiradan tashqaridagi xodim "topilmadi" bo'lib ko'rinadi.
  if (!(await employeeInScope(scope, q.employeeId))) throw notFound('Xodim');

  const from = startOfLocalDay(q.date, env.ORG_TIMEZONE);
  const to = startOfLocalDay(addDays(q.date, 1), env.ORG_TIMEZONE);
  const events = await prisma.activityEvent.findMany({
    where: { employeeId: q.employeeId, startedAt: { lt: to }, endedAt: { gt: from } },
    orderBy: { startedAt: 'asc' },
    take: 5000,
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      activeSec: true,
      idleSec: true,
      state: true,
      domain: true,
      source: true,
      confidence: true,
      monitoringStatus: true,
      application: {
        select: {
          id: true,
          displayName: true,
          processName: true,
          category: true,
          workRelevance: true,
        },
      },
    },
  });
  res.json({ meta: meta(q.date, q.date), items: events });
});
