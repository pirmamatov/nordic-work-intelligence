import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { csrfProtection, loadSession } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { apiLimiter } from './middleware/rateLimit';
import { dashboardRouter } from './modules/activity/dashboard';
import { accreditationRouter } from './modules/accreditation/routes';
import { activityRouter } from './modules/activity/routes';
import { agentApiRouter, agentsAdminRouter } from './modules/agent/routes';
import { applicationsRouter } from './modules/applications/routes';
import { auditRouter } from './modules/audit/routes';
import { authRouter } from './modules/auth/routes';
import { departmentsRouter } from './modules/departments/routes';
import { documentsRouter, taskDocumentsRouter } from './modules/documents/routes';
import { notificationsRouter } from './modules/notifications/routes';
import { policiesRouter } from './modules/policies/routes';
import { screenshotsRouter } from './modules/screenshots/routes';
import { tasksRouter } from './modules/tasks/routes';
import { rolesRouter, usersRouter } from './modules/users/routes';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId,
      // So'rov tanasi va so'rov satri loglanmaydi — ularda shaxsiy ma'lumot bo'lishi mumkin.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  // API javoblari brauzer yoki proksi keshida qolmasligi kerak.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });

  // Agent yo'llari cookie ishlatmaydi: sessiya va CSRF qatlamidan oldin ulanadi.
  app.use('/api/agent/v1', apiLimiter, agentApiRouter);

  app.use('/api', apiLimiter, loadSession, csrfProtection);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api/departments', departmentsRouter);
  app.use('/api/audit-logs', auditRouter);
  app.use('/api/agents', agentsAdminRouter);
  app.use('/api/policies', policiesRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/screenshots', screenshotsRouter);
  app.use('/api/tasks/:taskId/documents', taskDocumentsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/accreditation', accreditationRouter);
  app.use('/api/notifications', notificationsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
