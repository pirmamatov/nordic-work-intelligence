import { Router } from 'express';
import { z } from 'zod';
import { createDepartmentSchema, updateDepartmentSchema } from '@nwi/shared';
import { parse } from '../../lib/validate';
import { requireAuth, requirePermission } from '../../middleware/auth';
import * as service from './service';

export const departmentsRouter = Router();

const idParams = z.object({ id: z.uuid() });
const canManage = requirePermission('departments.manage');

// Bo'limlar ro'yxati tashkiliy tuzilma — har bir kirgan foydalanuvchiga ko'rinadi.
departmentsRouter.get('/', requireAuth, async (_req, res) => {
  res.json({ items: await service.listDepartments() });
});

departmentsRouter.post('/', canManage, async (req, res) => {
  res
    .status(201)
    .json(await service.createDepartment(req, parse(createDepartmentSchema, req.body)));
});

departmentsRouter.patch('/:id', canManage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  res.json(await service.updateDepartment(req, id, parse(updateDepartmentSchema, req.body)));
});

departmentsRouter.delete('/:id', canManage, async (req, res) => {
  await service.deleteDepartment(req, parse(idParams, req.params).id);
  res.status(204).end();
});
