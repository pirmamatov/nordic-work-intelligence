import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

const tooMany = () =>
  new AppError(429, 'RATE_LIMITED', 'Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring');

/** Kirish va MFA urinishlari: bir IP uchun 15 daqiqada cheklangan son. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.LOGIN_RATE_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(tooMany()),
});

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.NODE_ENV === 'test' ? 100_000 : 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(tooMany()),
});
