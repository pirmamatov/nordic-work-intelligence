import { Router } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { addDays, dateOnly, localDate } from '../../lib/time';
import { getAuth, requireAuth } from '../../middleware/auth';
import { employeeWhere, resolveScope } from '../rbac/scope';
import { taskStats } from '../tasks/service';

export const dashboardRouter = Router();

// Barcha ko'rsatkichlar foydalanuvchi doirasi ichida hisoblanadi: bo'lim rahbari faqat
// o'z bo'limi, oddiy xodim faqat o'zi bo'yicha raqamlarni ko'radi.
dashboardRouter.get('/', requireAuth, async (req, res) => {
  const auth = getAuth(req);
  const employees = employeeWhere(await resolveScope(auth, 'employees.view'));
  const activity = employeeWhere(await resolveScope(auth, 'activity.view'));

  const today = localDate(new Date(), env.ORG_TIMEZONE);
  const weekStart = addDays(today, -6);
  const onlineSince = new Date(Date.now() - env.AGENT_ONLINE_WINDOW_SEC * 1000);
  const activeAgents = { status: 'ACTIVE' as const, workstation: { employee: employees } };

  const [totalEmployees, activeToday, agentsOnline, agentsTotal, week, apps, tasks] =
    await Promise.all([
      prisma.employeeProfile.count({
        where: { AND: [employees, { isActive: true, user: { isActive: true } }] },
      }),
      prisma.dailyWorkSummary.count({
        where: { date: dateOnly(today), activeSec: { gt: 0 }, employee: activity },
      }),
      prisma.agentInstallation.count({
        where: { ...activeAgents, lastSeenAt: { gte: onlineSince } },
      }),
      prisma.agentInstallation.count({ where: activeAgents }),
      prisma.dailyWorkSummary.groupBy({
        by: ['date'],
        where: { date: { gte: dateOnly(weekStart), lte: dateOnly(today) }, employee: activity },
        _sum: { activeSec: true, idleSec: true },
        orderBy: { date: 'asc' },
      }),
      prisma.dailyActivitySummary.groupBy({
        by: ['applicationId'],
        where: { date: dateOnly(today), employee: activity },
        _sum: { activeSec: true },
        orderBy: { _sum: { activeSec: 'desc' } },
        take: 8,
      }),
      taskStats(auth),
    ]);

  const appInfo = await prisma.application.findMany({
    where: { id: { in: apps.map((a) => a.applicationId) } },
    select: { id: true, displayName: true, category: true },
  });
  const appById = new Map(appInfo.map((a) => [a.id, a]));
  const byDate = new Map(week.map((w) => [w.date.toISOString().slice(0, 10), w._sum]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  res.json({
    date: today,
    timezone: env.ORG_TIMEZONE,
    generatedAt: new Date().toISOString(),
    employees: { total: totalEmployees, activeToday },
    tasks,
    agents: { online: agentsOnline, offline: agentsTotal - agentsOnline },
    today: {
      activeSec: byDate.get(today)?.activeSec ?? 0,
      idleSec: byDate.get(today)?.idleSec ?? 0,
    },
    week: days.map((date) => ({
      date,
      activeSec: byDate.get(date)?.activeSec ?? 0,
      idleSec: byDate.get(date)?.idleSec ?? 0,
    })),
    topApplications: apps.map((a) => ({
      displayName: appById.get(a.applicationId)?.displayName ?? '—',
      category: appById.get(a.applicationId)?.category ?? 'OTHER',
      activeSec: a._sum.activeSec ?? 0,
    })),
  });
});
