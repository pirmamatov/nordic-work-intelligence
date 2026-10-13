import express, { Router } from 'express';
import { z } from 'zod';
import { reviewDocumentSchema } from '@nwi/shared';
import { env } from '../../config/env';
import { badRequest } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { getAuth, requirePermission } from '../../middleware/auth';
import * as service from './service';

/** `/api/tasks/:taskId/documents` va `/api/documents/...` yo'llari. */
export const taskDocumentsRouter = Router({ mergeParams: true });
export const documentsRouter = Router();

const canView = requirePermission('tasks.view.all', 'tasks.view.department', 'tasks.view.self');
// Fayl so'rov tanasida xom baytlar sifatida keladi; nomi va boshqa ma'lumotlar so'rov satrida.
const rawFile = express.raw({ type: 'application/octet-stream', limit: env.DOCUMENT_MAX_BYTES });

const uploadQuery = z.object({
  fileName: z.string().trim().min(1, 'Fayl nomi kerak').max(300),
  title: z.string().trim().max(300).optional(),
  note: z.string().trim().max(1000).optional(),
  aiAssisted: z.enum(['YES', 'NO', 'UNKNOWN']).optional(),
});

function fileBody(body: unknown): Buffer {
  if (!Buffer.isBuffer(body))
    throw badRequest('Fayl yuborilmadi (Content-Type: application/octet-stream)', 'FILE_REQUIRED');
  return body;
}

taskDocumentsRouter.post('/', canView, rawFile, async (req, res) => {
  const { taskId } = parse(z.object({ taskId: z.uuid() }), req.params);
  const result = await service.createDocument(
    req,
    getAuth(req),
    taskId,
    parse(uploadQuery, req.query),
    fileBody(req.body),
  );
  res.status(201).json(result);
});

const idParams = z.object({ id: z.uuid() });

documentsRouter.post('/:id/versions', canView, rawFile, async (req, res) => {
  const { id } = parse(idParams, req.params);
  const result = await service.addVersion(
    req,
    getAuth(req),
    id,
    parse(uploadQuery, req.query),
    fileBody(req.body),
  );
  res.status(result.duplicate ? 200 : 201).json(result);
});

documentsRouter.post('/:id/submit', canView, async (req, res) => {
  await service.submitDocument(req, getAuth(req), parse(idParams, req.params).id);
  res.status(204).end();
});

documentsRouter.post('/:id/review', canView, async (req, res) => {
  const { id } = parse(idParams, req.params);
  await service.reviewDocument(req, getAuth(req), id, parse(reviewDocumentSchema, req.body));
  res.status(204).end();
});

documentsRouter.get('/:id/versions/:versionId/download', canView, async (req, res) => {
  const { id, versionId } = parse(z.object({ id: z.uuid(), versionId: z.uuid() }), req.params);
  const file = await service.downloadVersion(req, getAuth(req), id, versionId);
  res.setHeader('Content-Type', file.mimeType);
  // Har doim yuklab olish sifatida: fayl brauzerda panel manzili ostida ochilmasligi kerak.
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.data);
});
