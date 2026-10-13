import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { badRequest, unauthenticated } from '../../lib/errors';
import { pageQuery } from '../../lib/pagination';
import { parse } from '../../lib/validate';
import { getAuth, requirePermission } from '../../middleware/auth';
import { loginLimiter } from '../../middleware/rateLimit';
import type { AgentContext } from '../auth/context';
import { enrollSchema, eventBatchSchema, heartbeatSchema } from './schemas';
import { storeScreenshot } from '../screenshots/service';
import * as service from './service';

/** Agent dasturi murojaat qiladigan yo'llar: cookie emas, Bearer token bilan. */
export const agentApiRouter = Router();
/** Administrator paneli uchun agentlarni boshqarish yo'llari. */
export const agentsAdminRouter = Router();

const requireAgent: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const agent = token ? await service.authenticateAgent(token) : null;
  if (!agent)
    throw unauthenticated('AGENT_UNAUTHORIZED', 'Agent tokeni noto‘g‘ri yoki bekor qilingan');
  req.agent = agent;
  next();
};

function getAgent(req: { agent?: AgentContext }): AgentContext {
  if (!req.agent)
    throw unauthenticated('AGENT_UNAUTHORIZED', 'Agent tokeni noto‘g‘ri yoki bekor qilingan');
  return req.agent;
}

agentApiRouter.post('/enroll', loginLimiter, async (req, res) => {
  res.status(201).json(await service.enroll(req, parse(enrollSchema, req.body)));
});

agentApiRouter.get('/config', requireAgent, async (req, res) => {
  res.json(await service.signedConfig(getAgent(req)));
});

agentApiRouter.post('/heartbeat', requireAgent, async (req, res) => {
  res.json(await service.heartbeat(getAgent(req), parse(heartbeatSchema, req.body)));
});

agentApiRouter.post('/events', requireAgent, async (req, res) => {
  const batch = parse(eventBatchSchema, req.body);
  res.json(await service.ingestEvents(getAgent(req), batch.sentAt, batch.events));
});

const screenshotQuery = z.object({ id: z.uuid(), capturedAt: z.iso.datetime({ offset: true }) });

// Tasvir so'rov tanasida xom baytlar sifatida keladi; metama'lumot so'rov satrida.
agentApiRouter.post(
  '/screenshots',
  requireAgent,
  express.raw({ type: ['image/jpeg', 'image/png'], limit: env.SCREENSHOT_MAX_BYTES }),
  async (req, res) => {
    const q = parse(screenshotQuery, req.query);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw badRequest(
        'Tasvir yuborilmadi (Content-Type: image/jpeg yoki image/png)',
        'INVALID_IMAGE',
      );
    }
    const result = await storeScreenshot(getAgent(req), q.id, new Date(q.capturedAt), req.body);
    res.status(result.duplicate ? 200 : 201).json(result);
  },
);

const idParams = z.object({ id: z.uuid() });
const enrollmentCodeBody = z.object({ employeeId: z.uuid() });

agentsAdminRouter.get(
  '/',
  requirePermission('employees.view.all', 'employees.view.department', 'employees.view.self'),
  async (req, res) => {
    res.json(await service.listAgents(getAuth(req), parse(pageQuery, req.query)));
  },
);

agentsAdminRouter.post(
  '/enrollment-codes',
  requirePermission('agents.manage'),
  async (req, res) => {
    const { employeeId } = parse(enrollmentCodeBody, req.body);
    res.status(201).json(await service.createEnrollmentCode(req, getAuth(req), employeeId));
  },
);

agentsAdminRouter.post('/:id/revoke', requirePermission('agents.manage'), async (req, res) => {
  await service.revokeAgent(req, parse(idParams, req.params).id);
  res.status(204).end();
});
