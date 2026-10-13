import { Router } from 'express';
import { z } from 'zod';
import { assignPolicySchema, createPolicySchema, updatePolicySchema } from '@nwi/shared';
import { parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/auth';
import * as service from './service';

export const policiesRouter = Router();

const idParams = z.object({ id: z.uuid() });
const canManage = requirePermission('policy.manage');

policiesRouter.get('/', requirePermission('policy.manage', 'agents.manage'), async (_req, res) => {
  res.json({ items: await service.listPolicies(), builtin: service.builtinPolicy() });
});

policiesRouter.post('/', canManage, async (req, res) => {
  res.status(201).json(await service.createPolicy(req, parse(createPolicySchema, req.body)));
});

policiesRouter.put('/assignments', canManage, async (req, res) => {
  await service.assignPolicy(req, parse(assignPolicySchema, req.body));
  res.status(204).end();
});

policiesRouter.patch('/:id', canManage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  res.json(await service.updatePolicy(req, id, parse(updatePolicySchema, req.body)));
});

policiesRouter.delete('/:id', canManage, async (req, res) => {
  await service.deletePolicy(req, parse(idParams, req.params).id);
  res.status(204).end();
});
