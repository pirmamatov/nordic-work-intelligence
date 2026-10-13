import { pino } from 'pino';
import { env } from '../config/env';

// Maxfiy qiymatlar hech qachon logga tushmasligi kerak.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.passwordHash',
  '*.token',
  '*.code',
  '*.secret',
  '*.mfaSecretEnc',
];

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[yashirilgan]' },
  base: { service: 'nwi-api' },
});
