import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../config/env';
import { csrfTokenFor, safeEqual, sha256Hex } from '../lib/crypto';
import { forbidden, unauthenticated } from '../lib/errors';
import { prisma } from '../lib/prisma';
import type { AuthContext } from '../modules/auth/context';
import type { PermissionCode } from '../modules/rbac/catalog';

export const SESSION_COOKIE = 'nwi_sid';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LAST_SEEN_THROTTLE_MS = 60_000;

/** Sessiya tokeni bo'yicha autentifikatsiya kontekstini quradi; sessiya yaroqsiz bo'lsa null. */
export async function authFromToken(token: string): Promise<AuthContext | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: {
      user: {
        include: {
          employee: { select: { id: true, departmentId: true } },
          roles: {
            include: { role: { include: { permissions: { include: { permission: true } } } } },
          },
          permissions: { include: { permission: true } },
        },
      },
    },
  });
  if (!session) return null;

  const now = Date.now();
  const idleLimitMs = env.SESSION_IDLE_MINUTES * 60_000;
  const valid =
    session.revokedAt === null &&
    session.expiresAt.getTime() > now &&
    now - session.lastSeenAt.getTime() < idleLimitMs &&
    session.user.isActive;
  if (!valid) return null;

  const { user } = session;
  const permissions = new Set<string>();
  let mfaRequiredByAccess = false;
  for (const { role } of user.roles) {
    mfaRequiredByAccess ||= role.requiresMfa;
    for (const { permission } of role.permissions) {
      permissions.add(permission.code);
      mfaRequiredByAccess ||= permission.requiresMfa;
    }
  }
  for (const { permission } of user.permissions) {
    permissions.add(permission.code);
    mfaRequiredByAccess ||= permission.requiresMfa;
  }

  if (now - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }

  const mfaEnabled = user.mfaEnabledAt !== null;
  return {
    userId: user.id,
    sessionId: session.id,
    email: user.email,
    fullName: user.fullName,
    employeeId: user.employee?.id ?? null,
    departmentId: user.employee?.departmentId ?? null,
    roles: user.roles.map((r) => r.role.code),
    permissions,
    mfaEnabled,
    mfaPending: mfaEnabled && session.mfaVerifiedAt === null,
    mfaSetupRequired: env.MFA_ENFORCED && !mfaEnabled && mfaRequiredByAccess,
    mustChangePassword: user.mustChangePassword,
    csrfToken: csrfTokenFor(token),
  };
}

/** Cookie'dagi sessiyani tekshiradi va `req.auth` ni to'ldiradi. Sessiya bo'lmasa jim o'tadi. */
export async function loadSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token: unknown = (req.cookies as Record<string, unknown>)[SESSION_COOKIE];
  if (typeof token === 'string' && token.length > 0) {
    req.auth = (await authFromToken(token)) ?? undefined;
  }
  next();
}

function isSameOrigin(origin: string, req: Request): boolean {
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

/**
 * Holatni o'zgartiruvchi so'rovlar uchun: Origin ruxsat etilgan ro'yxatda bo'lishi va
 * sessiya mavjud bo'lsa X-CSRF-Token sarlavhasi sessiyaga mos kelishi kerak.
 * Agent yo'llari cookie ishlatmaydi, shuning uchun ularga qo'llanmaydi.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // Ruxsat etilgan manbalar: ro'yxatdagilar va panelning o'zi (Origin so'rov kelgan xost bilan bir xil).
  const origin = req.get('origin');
  if (origin && !env.ALLOWED_ORIGINS.includes(origin) && !isSameOrigin(origin, req)) {
    throw forbidden('ORIGIN_NOT_ALLOWED', 'So‘rov manbasi ruxsat etilmagan');
  }
  if (req.auth) {
    const header = req.get('x-csrf-token') ?? '';
    if (!safeEqual(header, req.auth.csrfToken)) {
      throw forbidden(
        'CSRF_TOKEN_INVALID',
        'Xavfsizlik tokeni noto‘g‘ri. Sahifani yangilab, qayta urinib ko‘ring',
      );
    }
  }
  next();
}

/** Faqat sessiya talab qiladi (MFA tasdiqlash, parol almashtirish kabi oraliq qadamlar uchun). */
export const requireSession: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw unauthenticated();
  next();
};

function assertFullyAuthenticated(req: Request): AuthContext {
  const auth = req.auth;
  if (!auth) throw unauthenticated();
  if (auth.mfaPending)
    throw unauthenticated('MFA_REQUIRED', 'Ikki bosqichli tasdiqlash kodi talab qilinadi');
  if (auth.mustChangePassword) {
    throw forbidden('PASSWORD_CHANGE_REQUIRED', 'Davom etish uchun parolni almashtiring');
  }
  if (auth.mfaSetupRequired) {
    throw forbidden('MFA_SETUP_REQUIRED', 'Davom etish uchun ikki bosqichli tasdiqlashni yoqing');
  }
  return auth;
}

/** To'liq autentifikatsiya: sessiya, MFA va majburiy parol almashtirish bajarilgan. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  assertFullyAuthenticated(req);
  next();
};

/** To'liq autentifikatsiya va sanab o'tilgan ruxsatlardan kamida bittasi. */
export function requirePermission(...codes: PermissionCode[]): RequestHandler {
  return (req, _res, next) => {
    const auth = assertFullyAuthenticated(req);
    if (!codes.some((code) => auth.permissions.has(code))) throw forbidden();
    next();
  };
}

export function getAuth(req: Request) {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}
