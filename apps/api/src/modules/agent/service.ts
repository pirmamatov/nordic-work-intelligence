import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { env } from '../../config/env';
import { randomToken, sha256Hex } from '../../lib/crypto';
import { badRequest, notFound, unauthenticated } from '../../lib/errors';
import { cursorArgs, toPage } from '../../lib/pagination';
import { prisma, type Prisma } from '../../lib/prisma';
import { signPayload } from '../../lib/signing';
import { apportion, dateOnly, splitByLocalDay } from '../../lib/time';
import { initialAppData } from '../applications/catalog';
import { recordAudit } from '../audit/service';
import type { AgentContext, AuthContext } from '../auth/context';
import { effectivePolicy } from '../policies/service';
import { employeeWhere, resolveScope } from '../rbac/scope';
import {
  eventSchema,
  MAX_BATCH_SIZE,
  type EnrollInput,
  type EventInput,
  type HeartbeatInput,
} from './schemas';

const ENROLLMENT_CODE_TTL_HOURS = 24;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_EVENT_SEC = 24 * 3600;
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const CLOCK_SKEW_LIMIT_MS = 2 * 60_000;

function newEnrollmentCode(): string {
  const chars = Array.from(randomBytes(12), (b) => CODE_ALPHABET.charAt(b % CODE_ALPHABET.length));
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)]
    .map((g) => g.join(''))
    .join('-');
}

// ───────────────────────── Administrator tomoni ─────────────────────────

export async function createEnrollmentCode(req: Request, auth: AuthContext, employeeId: string) {
  const employee = await prisma.employeeProfile.findUnique({
    where: { id: employeeId },
    select: { isActive: true, user: { select: { isActive: true } } },
  });
  if (!employee) throw notFound('Xodim');
  if (!employee.isActive || !employee.user.isActive)
    throw badRequest('Xodim faol emas', 'EMPLOYEE_INACTIVE');

  const code = newEnrollmentCode();
  const expiresAt = new Date(Date.now() + ENROLLMENT_CODE_TTL_HOURS * 3_600_000);
  const row = await prisma.agentEnrollmentCode.create({
    data: { codeHash: sha256Hex(code), employeeId, createdById: auth.userId, expiresAt },
  });
  await recordAudit(req, {
    action: 'agent.enrollment_code.create',
    entityType: 'EmployeeProfile',
    entityId: employeeId,
    diff: { codeId: row.id },
  });
  // Kod faqat shu javobda ko'rsatiladi; bazada xeshi saqlanadi.
  return { code, expiresAt };
}

export async function listAgents(
  auth: AuthContext,
  page: { limit: number; cursor?: string | undefined },
) {
  const scope = await resolveScope(auth, 'employees.view');
  const rows = await prisma.agentInstallation.findMany({
    where: { workstation: { employee: employeeWhere(scope) } },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      agentVersion: true,
      status: true,
      lastSeenAt: true,
      queueDepth: true,
      revokedAt: true,
      createdAt: true,
      workstation: {
        select: {
          id: true,
          hostname: true,
          osVersion: true,
          employee: {
            select: {
              id: true,
              user: { select: { fullName: true } },
              department: { select: { name: true } },
            },
          },
        },
      },
    },
    ...cursorArgs(page),
  });
  const onlineSince = Date.now() - env.AGENT_ONLINE_WINDOW_SEC * 1000;
  const result = toPage(rows, page.limit);
  return {
    ...result,
    items: result.items.map((a) => ({
      ...a,
      online:
        a.status === 'ACTIVE' && a.lastSeenAt !== null && a.lastSeenAt.getTime() >= onlineSince,
    })),
  };
}

export async function revokeAgent(req: Request, id: string): Promise<void> {
  const result = await prisma.agentInstallation.updateMany({
    where: { id, status: 'ACTIVE' },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
  if (result.count === 0) throw notFound('Agent');
  await recordAudit(req, { action: 'agent.revoke', entityType: 'AgentInstallation', entityId: id });
}

// ───────────────────────────── Agent tomoni ─────────────────────────────

/** Bearer token bo'yicha agentni aniqlaydi. Bekor qilingan yoki xodimi faol bo'lmagan agent rad etiladi. */
export async function authenticateAgent(token: string): Promise<AgentContext | null> {
  const installation = await prisma.agentInstallation.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: {
      id: true,
      status: true,
      workstationId: true,
      workstation: {
        select: {
          employee: { select: { id: true, isActive: true, user: { select: { isActive: true } } } },
        },
      },
    },
  });
  const employee = installation?.workstation.employee;
  if (
    !installation ||
    installation.status !== 'ACTIVE' ||
    !employee?.isActive ||
    !employee.user.isActive
  )
    return null;
  return {
    installationId: installation.id,
    workstationId: installation.workstationId,
    employeeId: employee.id,
  };
}

export async function signedConfig(agent: AgentContext) {
  const policy = await effectivePolicy(agent.employeeId);
  const configVersion = `${policy.id ?? 'builtin'}:${policy.version}`;
  return {
    configVersion,
    ...signPayload({
      configVersion,
      // Konfiguratsiya aynan shu o'rnatishga tegishli — boshqa qurilmada qayta ishlatib bo'lmaydi.
      installationId: agent.installationId,
      issuedAt: new Date().toISOString(),
      workSchedule: policy.workSchedule,
      timezone: policy.timezone,
      idleThresholdSec: policy.idleThresholdSec,
      screenshots: {
        enabled: policy.screenshotsEnabled,
        intervalSec: policy.screenshotIntervalSec,
      },
      excludedProcesses: policy.excludedProcesses,
      allowedDomains: policy.allowedDomains,
      heartbeatIntervalSec: 60,
      syncIntervalSec: 30,
      maxBatchSize: MAX_BATCH_SIZE,
    }),
  };
}

export async function enroll(req: Request, input: EnrollInput) {
  const invalid = () =>
    unauthenticated(
      'INVALID_ENROLLMENT_CODE',
      'Ro‘yxatdan o‘tish kodi noto‘g‘ri yoki muddati o‘tgan',
    );
  const token = randomToken(32);
  const now = new Date();

  const agent = await prisma.$transaction(async (tx) => {
    // Kod atomar tarzda "ishlatilgan" deb belgilanadi — parallel so'rovlardan faqat bittasi o'tadi.
    const claimed = await tx.agentEnrollmentCode.updateMany({
      where: { codeHash: sha256Hex(input.code), usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return null;
    const { employeeId } = await tx.agentEnrollmentCode.findUniqueOrThrow({
      where: { codeHash: sha256Hex(input.code) },
      select: { employeeId: true },
    });

    const machineIdHash = sha256Hex(input.machineId);
    const workstation = await tx.workstation.upsert({
      where: { machineIdHash },
      create: {
        machineIdHash,
        employeeId,
        hostname: input.hostname,
        osVersion: input.osVersion ?? null,
      },
      update: { employeeId, hostname: input.hostname, osVersion: input.osVersion ?? null },
    });
    // Shu kompyuterdagi avvalgi o'rnatishlar bekor qilinadi (qayta o'rnatish yoki boshqa xodimga o'tish).
    await tx.agentInstallation.updateMany({
      where: { workstationId: workstation.id, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: now },
    });
    const installation = await tx.agentInstallation.create({
      data: {
        workstationId: workstation.id,
        tokenHash: sha256Hex(token),
        agentVersion: input.agentVersion,
        lastSeenAt: now,
      },
    });
    await tx.employeeProfile.updateMany({
      where: { id: employeeId, monitoringConsentAt: null },
      data: { monitoringConsentAt: now },
    });
    req.agent = { installationId: installation.id, workstationId: workstation.id, employeeId };
    await recordAudit(
      req,
      {
        action: 'agent.enroll',
        entityType: 'AgentInstallation',
        entityId: installation.id,
        diff: { employeeId, hostname: input.hostname, agentVersion: input.agentVersion },
      },
      tx,
    );
    return req.agent;
  });

  if (!agent) {
    await recordAudit(req, {
      action: 'agent.enroll',
      outcome: 'FAILURE',
      diff: { hostname: input.hostname },
    });
    throw invalid();
  }
  return { installationId: agent.installationId, token, config: await signedConfig(agent) };
}

export async function heartbeat(agent: AgentContext, input: HeartbeatInput) {
  await prisma.$transaction(async (tx) => {
    await tx.agentInstallation.update({
      where: { id: agent.installationId },
      data: {
        lastSeenAt: new Date(),
        agentVersion: input.agentVersion,
        queueDepth: input.queueDepth ?? null,
      },
    });
    if (input.errors.length > 0) {
      await tx.agentErrorReport.createMany({
        data: input.errors.map((e) => ({
          agentInstallationId: agent.installationId,
          code: e.code,
          message: e.message,
          occurredAt: new Date(e.occurredAt),
        })),
      });
    }
  });
  const policy = await effectivePolicy(agent.employeeId);
  return {
    serverTime: new Date().toISOString(),
    configVersion: `${policy.id ?? 'builtin'}:${policy.version}`,
  };
}

type RejectReason =
  | 'INVALID_FORMAT'
  | 'INVALID_INTERVAL'
  | 'INVALID_DURATION'
  | 'FUTURE_TIMESTAMP'
  | 'TOO_OLD'
  | 'DUPLICATE_IN_BATCH';

interface ValidEvent extends EventInput {
  start: Date;
  end: Date;
}

function validateEvents(raw: unknown[], now: number) {
  const valid: ValidEvent[] = [];
  const rejected: { id: string | null; reason: RejectReason }[] = [];
  const seen = new Set<string>();
  const oldest = now - env.ACTIVITY_MAX_AGE_DAYS * 86_400_000;

  for (const item of raw) {
    const parsed = eventSchema.safeParse(item);
    if (!parsed.success) {
      const id = (item as { id?: unknown } | null)?.id;
      rejected.push({
        id: typeof id === 'string' ? id.slice(0, 64) : null,
        reason: 'INVALID_FORMAT',
      });
      continue;
    }
    const event = parsed.data;
    const start = new Date(event.startedAt);
    const end = new Date(event.endedAt);
    const durationSec = (end.getTime() - start.getTime()) / 1000;
    let reason: RejectReason | null = null;
    if (seen.has(event.id)) reason = 'DUPLICATE_IN_BATCH';
    else if (durationSec <= 0 || durationSec > MAX_EVENT_SEC) reason = 'INVALID_INTERVAL';
    else if (event.activeSec + event.idleSec > Math.ceil(durationSec)) reason = 'INVALID_DURATION';
    else if (end.getTime() > now + FUTURE_TOLERANCE_MS) reason = 'FUTURE_TIMESTAMP';
    else if (end.getTime() < oldest) reason = 'TOO_OLD';

    if (reason) rejected.push({ id: event.id, reason });
    else {
      seen.add(event.id);
      valid.push({ ...event, start, end });
    }
  }
  return { valid, rejected };
}

const ensuredPartitions = new Set<string>();

async function ensurePartitions(events: ValidEvent[]): Promise<void> {
  const months = new Set(events.map((e) => `${e.start.toISOString().slice(0, 7)}-01`));
  for (const month of months) {
    if (ensuredPartitions.has(month)) continue;
    await prisma.$executeRaw`SELECT nwi_ensure_activity_partition(${month}::date)`;
    ensuredPartitions.add(month);
  }
}

/**
 * Hodisalar to'plamini qabul qiladi. Qayta yuborish xavfsiz: (o'rnatish, clientEventId, startedAt)
 * unikal cheklovi tufayli avval yozilgan hodisa qayta yozilmaydi va yig'ma jadvallarga faqat
 * yangi qo'shilgan hodisalar ta'sir qiladi. Hammasi bitta tranzaksiyada.
 */
export async function ingestEvents(agent: AgentContext, sentAt: string, rawEvents: unknown[]) {
  const now = Date.now();
  const { valid, rejected } = validateEvents(rawEvents, now);
  if (valid.length === 0) {
    await prisma.agentInstallation.update({
      where: { id: agent.installationId },
      data: { lastSeenAt: new Date(now) },
    });
    return { accepted: [], duplicates: 0, rejected };
  }

  const policy = await effectivePolicy(agent.employeeId);
  const allowedDomains = new Set(policy.allowedDomains);
  // Agent soati serverdan sezilarli farq qilsa, vaqt belgilariga ishonch pasayadi.
  const confidence =
    Math.abs(new Date(sentAt).getTime() - now) > CLOCK_SKEW_LIMIT_MS ? 'LOW' : 'HIGH';
  await ensurePartitions(valid);

  const inserted = await prisma.$transaction(
    async (tx) => {
      // Bitta agentning parallel to'plamlari ketma-ket qayta ishlanadi.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${agent.installationId}, 0))`;

      const processNames = [...new Set(valid.map((e) => e.processName))];
      const reportedNames = new Map(valid.map((e) => [e.processName, e.appName]));
      await tx.application.createMany({
        data: processNames.map((name) => initialAppData(name, reportedNames.get(name))),
        skipDuplicates: true,
      });
      const apps = await tx.application.findMany({
        where: { processName: { in: processNames } },
        select: { id: true, processName: true },
      });
      const appIds = new Map(apps.map((a) => [a.processName, a.id]));

      const sessionIds = new Map<string, string>();
      for (const clientSessionId of new Set(valid.map((e) => e.sessionId))) {
        const own = valid.filter((e) => e.sessionId === clientSessionId);
        const startedAt = new Date(Math.min(...own.map((e) => e.start.getTime())));
        const endedAt = new Date(Math.max(...own.map((e) => e.end.getTime())));
        const key = {
          agentInstallationId_clientSessionId: {
            agentInstallationId: agent.installationId,
            clientSessionId,
          },
        };
        const existing = await tx.activitySession.findUnique({ where: key });
        const session = existing
          ? await tx.activitySession.update({
              where: key,
              data: {
                startedAt: existing.startedAt < startedAt ? existing.startedAt : startedAt,
                endedAt:
                  existing.endedAt && existing.endedAt > endedAt ? existing.endedAt : endedAt,
              },
            })
          : await tx.activitySession.create({
              data: {
                agentInstallationId: agent.installationId,
                clientSessionId,
                employeeId: agent.employeeId,
                startedAt,
                endedAt,
              },
            });
        sessionIds.set(clientSessionId, session.id);
      }

      const rows: Prisma.ActivityEventCreateManyInput[] = valid.map((e) => ({
        agentInstallationId: agent.installationId,
        clientEventId: e.id,
        sessionId: sessionIds.get(e.sessionId) ?? null,
        // Xodim tokendan aniqlanadi — so'rov tanasidagi hech narsa uni o'zgartira olmaydi.
        employeeId: agent.employeeId,
        applicationId: appIds.get(e.processName) ?? '',
        // Siyosatda tasdiqlanmagan domen saqlanmaydi.
        domain: e.domain && allowedDomains.has(e.domain) ? e.domain : null,
        startedAt: e.start,
        endedAt: e.end,
        activeSec: e.activeSec,
        idleSec: e.idleSec,
        state: e.state,
        monitoringStatus: e.monitoringStatus,
        confidence,
      }));
      const created = await tx.activityEvent.createManyAndReturn({
        data: rows,
        skipDuplicates: true,
        select: { clientEventId: true },
      });
      const fresh = new Set(created.map((c) => c.clientEventId));

      // Yig'ma jadvallar: faqat yangi qo'shilgan, ekran qulflanmagan hodisalar.
      const perApp = new Map<
        string,
        { date: string; applicationId: string; active: number; idle: number; count: number }
      >();
      const perDay = new Map<string, { active: number; idle: number; first: Date; last: Date }>();
      for (const e of valid) {
        if (!fresh.has(e.id) || e.state === 'LOCKED') continue;
        const applicationId = appIds.get(e.processName) ?? '';
        const slices = splitByLocalDay(e.start, e.end, policy.timezone);
        const weights = slices.map((s) => s.end.getTime() - s.start.getTime());
        const active = apportion(e.activeSec, weights);
        const idle = apportion(e.idleSec, weights);
        slices.forEach((slice, i) => {
          const appKey = `${slice.date}|${applicationId}`;
          const a = perApp.get(appKey) ?? {
            date: slice.date,
            applicationId,
            active: 0,
            idle: 0,
            count: 0,
          };
          a.active += active[i] ?? 0;
          a.idle += idle[i] ?? 0;
          a.count += i === 0 ? 1 : 0;
          perApp.set(appKey, a);

          const d = perDay.get(slice.date) ?? {
            active: 0,
            idle: 0,
            first: slice.start,
            last: slice.end,
          };
          d.active += active[i] ?? 0;
          d.idle += idle[i] ?? 0;
          if (slice.start < d.first) d.first = slice.start;
          if (slice.end > d.last) d.last = slice.end;
          perDay.set(slice.date, d);
        });
      }

      for (const a of perApp.values()) {
        const where = {
          employeeId: agent.employeeId,
          date: dateOnly(a.date),
          applicationId: a.applicationId,
        };
        await tx.dailyActivitySummary.upsert({
          where: { employeeId_date_applicationId: where },
          create: { ...where, activeSec: a.active, idleSec: a.idle, eventCount: a.count },
          update: {
            activeSec: { increment: a.active },
            idleSec: { increment: a.idle },
            eventCount: { increment: a.count },
          },
        });
      }
      for (const [date, d] of perDay) {
        const where = { employeeId: agent.employeeId, date: dateOnly(date) };
        const existing = await tx.dailyWorkSummary.findUnique({
          where: { employeeId_date: where },
        });
        const firstSeenAt =
          existing?.firstSeenAt && existing.firstSeenAt < d.first ? existing.firstSeenAt : d.first;
        const lastSeenAt =
          existing?.lastSeenAt && existing.lastSeenAt > d.last ? existing.lastSeenAt : d.last;
        await tx.dailyWorkSummary.upsert({
          where: { employeeId_date: where },
          create: {
            ...where,
            activeSec: d.active,
            idleSec: d.idle,
            observedSec: d.active + d.idle,
            firstSeenAt,
            lastSeenAt,
          },
          update: {
            activeSec: { increment: d.active },
            idleSec: { increment: d.idle },
            observedSec: { increment: d.active + d.idle },
            firstSeenAt,
            lastSeenAt,
          },
        });
      }

      await tx.agentInstallation.update({
        where: { id: agent.installationId },
        data: { lastSeenAt: new Date(now) },
      });
      return fresh;
    },
    { timeout: 30_000 },
  );

  // Avval yozilgan hodisalar ham "qabul qilingan" — agent ularni navbatdan o'chirishi mumkin.
  return { accepted: valid.map((e) => e.id), duplicates: valid.length - inserted.size, rejected };
}
