import { Router } from 'express';
import { z } from 'zod';
import { changePasswordSchema, loginSchema, mfaCodeSchema } from '@nwi/shared';
import { unauthenticated } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { getAuth, requireAuth, requireSession } from '../../middleware/auth';
import { loginLimiter } from '../../middleware/rateLimit';
import * as service from './service';

export const authRouter = Router();

const idParams = z.object({ id: z.uuid() });

authRouter.post('/login', loginLimiter, async (req, res) => {
  res.json(await service.login(req, res, parse(loginSchema, req.body)));
});

authRouter.post('/logout', requireSession, async (req, res) => {
  await service.logout(req, res, getAuth(req));
  res.status(204).end();
});

authRouter.get('/me', requireSession, (req, res) => {
  const auth = getAuth(req);
  res.json({ csrfToken: auth.csrfToken, user: service.toMe(auth) });
});

// MFA yoqilgan bo'lsa, parolni almashtirishdan oldin kod tasdiqlangan bo'lishi kerak.
authRouter.post('/change-password', requireSession, async (req, res) => {
  const auth = getAuth(req);
  if (auth.mfaPending)
    throw unauthenticated('MFA_REQUIRED', 'Ikki bosqichli tasdiqlash kodi talab qilinadi');
  await service.changePassword(req, auth, parse(changePasswordSchema, req.body));
  res.status(204).end();
});

authRouter.post('/mfa/setup', requireSession, async (req, res) => {
  res.json(await service.beginMfaSetup(req, getAuth(req)));
});

authRouter.post('/mfa/enable', requireSession, loginLimiter, async (req, res) => {
  res.json(await service.enableMfa(req, getAuth(req), parse(mfaCodeSchema, req.body).code));
});

authRouter.post('/mfa/verify', requireSession, loginLimiter, async (req, res) => {
  await service.verifyMfa(req, getAuth(req), parse(mfaCodeSchema, req.body).code);
  res.status(204).end();
});

authRouter.get('/sessions', requireAuth, async (req, res) => {
  res.json({ items: await service.listOwnSessions(getAuth(req)) });
});

authRouter.delete('/sessions/:id', requireAuth, async (req, res) => {
  await service.revokeOwnSession(req, getAuth(req), parse(idParams, req.params).id);
  res.status(204).end();
});
