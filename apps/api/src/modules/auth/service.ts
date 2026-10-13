import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { ChangePasswordInput, LoginInput } from '@nwi/shared';
import { env } from '../../config/env';
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from '../../lib/crypto';
import { AppError, badRequest, conflict, unauthenticated } from '../../lib/errors';
import {
  hashPassword,
  passwordProblem,
  verifyAgainstDummy,
  verifyPassword,
} from '../../lib/password';
import { prisma } from '../../lib/prisma';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../../lib/totp';
import { authFromToken, SESSION_COOKIE } from '../../middleware/auth';
import { recordAudit } from '../audit/service';
import type { AuthContext } from './context';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RECOVERY_CODE_COUNT = 10;
const MFA_ISSUER = 'Nordic Work Intelligence';

const invalidCredentials = () =>
  unauthenticated('INVALID_CREDENTIALS', 'Elektron pochta yoki parol noto‘g‘ri');

export function toMe(auth: AuthContext) {
  return {
    id: auth.userId,
    email: auth.email,
    fullName: auth.fullName,
    roles: auth.roles,
    permissions: [...auth.permissions].sort(),
    employeeId: auth.employeeId,
    departmentId: auth.departmentId,
    mfaEnabled: auth.mfaEnabled,
    mfaPending: auth.mfaPending,
    mfaSetupRequired: auth.mfaSetupRequired,
    mustChangePassword: auth.mustChangePassword,
  };
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict' as const,
    path: '/',
  };
}

/** Xato urinishni hisobga oladi; chegaraga yetganda hisobni vaqtincha bloklaydi. */
async function registerFailedAttempt(userId: string): Promise<boolean> {
  const { failedLoginCount } = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (failedLoginCount < MAX_FAILED_ATTEMPTS) return false;
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
  });
  return true;
}

function assertNotLocked(lockedUntil: Date | null): void {
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    throw new AppError(
      423,
      'ACCOUNT_LOCKED',
      `Ko‘p marta xato urinish sababli hisob vaqtincha bloklandi. ${LOCK_MINUTES} daqiqadan so‘ng qayta urinib ko‘ring`,
    );
  }
}

export async function login(req: Request, res: Response, input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.isActive) {
    await verifyAgainstDummy(input.password);
    await recordAudit(req, {
      action: 'auth.login',
      outcome: 'FAILURE',
      actorUserId: user?.id ?? null,
      diff: { reason: user ? 'inactive' : 'unknown_user' },
    });
    throw invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await recordAudit(req, {
      action: 'auth.login',
      outcome: 'DENIED',
      actorUserId: user.id,
      diff: { reason: 'locked' },
    });
    assertNotLocked(user.lockedUntil);
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    const locked = await registerFailedAttempt(user.id);
    await recordAudit(req, {
      action: 'auth.login',
      outcome: 'FAILURE',
      actorUserId: user.id,
      diff: { reason: 'bad_password', locked },
    });
    throw invalidCredentials();
  }

  const token = randomToken(32);
  const now = new Date();
  const session = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    return tx.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(token),
        ip: req.ip ?? null,
        userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
        expiresAt: new Date(now.getTime() + env.SESSION_ABSOLUTE_HOURS * 3_600_000),
      },
    });
  });

  const auth = await authFromToken(token);
  if (!auth) throw new Error('Yangi yaratilgan sessiya o‘qilmadi');

  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: env.SESSION_ABSOLUTE_HOURS * 3_600_000,
  });
  await recordAudit(req, {
    action: 'auth.login',
    actorUserId: user.id,
    entityType: 'Session',
    entityId: session.id,
  });
  return { csrfToken: auth.csrfToken, user: toMe(auth) };
}

export async function logout(req: Request, res: Response, auth: AuthContext): Promise<void> {
  await prisma.session.update({ where: { id: auth.sessionId }, data: { revokedAt: new Date() } });
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  await recordAudit(req, {
    action: 'auth.logout',
    entityType: 'Session',
    entityId: auth.sessionId,
  });
}

export async function changePassword(
  req: Request,
  auth: AuthContext,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
  assertNotLocked(user.lockedUntil);
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    await registerFailedAttempt(user.id);
    await recordAudit(req, {
      action: 'auth.password.change',
      outcome: 'FAILURE',
      diff: { reason: 'bad_password' },
    });
    throw badRequest('Joriy parol noto‘g‘ri', 'INVALID_CURRENT_PASSWORD');
  }
  if (input.newPassword === input.currentPassword) {
    throw badRequest('Yangi parol joriy paroldan farq qilishi kerak', 'PASSWORD_UNCHANGED');
  }
  const problem = passwordProblem(input.newPassword, user);
  if (problem) throw badRequest(problem, 'WEAK_PASSWORD');

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
      },
    });
    // Parol almashganda boshqa barcha sessiyalar bekor qilinadi.
    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null, id: { not: auth.sessionId } },
      data: { revokedAt: new Date() },
    });
    await recordAudit(
      req,
      { action: 'auth.password.change', entityType: 'User', entityId: user.id },
      tx,
    );
  });
}

export async function beginMfaSetup(req: Request, auth: AuthContext) {
  if (auth.mfaEnabled)
    throw conflict('Ikki bosqichli tasdiqlash allaqachon yoqilgan', 'MFA_ALREADY_ENABLED');
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: auth.userId },
    data: { mfaSecretEnc: encryptSecret(secret) },
  });
  await recordAudit(req, { action: 'auth.mfa.setup', entityType: 'User', entityId: auth.userId });
  return { secret, otpauthUrl: otpauthUrl(secret, auth.email, MFA_ISSUER) };
}

function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const hex = randomBytes(6).toString('hex');
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
  });
}

export async function enableMfa(req: Request, auth: AuthContext, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
  if (user.mfaEnabledAt)
    throw conflict('Ikki bosqichli tasdiqlash allaqachon yoqilgan', 'MFA_ALREADY_ENABLED');
  if (!user.mfaSecretEnc) throw badRequest('Avval sozlashni boshlang', 'MFA_SETUP_NOT_STARTED');

  const step = verifyTotp(decryptSecret(user.mfaSecretEnc), code);
  if (step === null) {
    await recordAudit(req, { action: 'auth.mfa.enable', outcome: 'FAILURE' });
    throw badRequest('Kod noto‘g‘ri', 'INVALID_MFA_CODE');
  }

  const recoveryCodes = newRecoveryCodes();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { mfaEnabledAt: now, mfaLastUsedStep: BigInt(step) },
    });
    await tx.session.update({ where: { id: auth.sessionId }, data: { mfaVerifiedAt: now } });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
    await tx.mfaRecoveryCode.createMany({
      data: recoveryCodes.map((c) => ({ userId: user.id, codeHash: sha256Hex(c) })),
    });
    await recordAudit(
      req,
      { action: 'auth.mfa.enable', entityType: 'User', entityId: user.id },
      tx,
    );
  });
  // Zaxira kodlari faqat shu javobda ko'rsatiladi; bazada xeshi saqlanadi.
  return { recoveryCodes };
}

export async function verifyMfa(req: Request, auth: AuthContext, code: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
  if (!user.mfaEnabledAt || !user.mfaSecretEnc)
    throw badRequest('Ikki bosqichli tasdiqlash yoqilmagan', 'MFA_NOT_ENABLED');
  assertNotLocked(user.lockedUntil);

  const now = new Date();
  const step = verifyTotp(decryptSecret(user.mfaSecretEnc), code);
  // Bir marta ishlatilgan kod (yoki undan oldingisi) qayta qabul qilinmaydi.
  const fresh =
    step !== null && (user.mfaLastUsedStep === null || BigInt(step) > user.mfaLastUsedStep);

  if (fresh) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { mfaLastUsedStep: BigInt(step), failedLoginCount: 0 },
      });
      await tx.session.update({ where: { id: auth.sessionId }, data: { mfaVerifiedAt: now } });
      await recordAudit(req, { action: 'auth.mfa.verify', diff: { method: 'totp' } }, tx);
    });
    return;
  }

  const recovery = await prisma.mfaRecoveryCode.updateMany({
    where: { userId: user.id, codeHash: sha256Hex(code.toLowerCase()), usedAt: null },
    data: { usedAt: now },
  });
  if (recovery.count === 1) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0 } });
      await tx.session.update({ where: { id: auth.sessionId }, data: { mfaVerifiedAt: now } });
      await recordAudit(req, { action: 'auth.mfa.verify', diff: { method: 'recovery_code' } }, tx);
    });
    return;
  }

  const locked = await registerFailedAttempt(user.id);
  await recordAudit(req, { action: 'auth.mfa.verify', outcome: 'FAILURE', diff: { locked } });
  throw unauthenticated('INVALID_MFA_CODE', 'Kod noto‘g‘ri');
}

export async function listOwnSessions(auth: AuthContext) {
  const sessions = await prisma.session.findMany({
    where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: {
      id: true,
      ip: true,
      userAgent: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
    },
  });
  return sessions.map((s) => ({ ...s, current: s.id === auth.sessionId }));
}

export async function revokeOwnSession(
  req: Request,
  auth: AuthContext,
  sessionId: string,
): Promise<void> {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, userId: auth.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw new AppError(404, 'NOT_FOUND', 'Sessiya topilmadi');
  await recordAudit(req, {
    action: 'auth.session.revoke',
    entityType: 'Session',
    entityId: sessionId,
  });
}
