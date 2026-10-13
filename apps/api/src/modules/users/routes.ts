import { Router } from 'express';
import { z } from 'zod';
import {
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
} from '@nwi/shared';
import { pageQuery } from '../../lib/pagination';
import { parse } from '../../lib/validate';
import { getAuth, requirePermission } from '../../middleware/auth';
import { PERMISSIONS, type PermissionCode } from '../rbac/catalog';
import * as service from './service';

export const usersRouter = Router();
export const rolesRouter = Router();

const idParams = z.object({ id: z.uuid() });
const listQuery = listUsersQuerySchema.extend(pageQuery.shape);
const permissionCodes = Object.keys(PERMISSIONS) as [PermissionCode, ...PermissionCode[]];
const permissionsBody = z.object({
  permissions: z.array(z.enum(permissionCodes)).max(permissionCodes.length),
});

const canView = requirePermission(
  'employees.view.all',
  'employees.view.department',
  'employees.view.self',
);

usersRouter.get('/', canView, async (req, res) => {
  res.json(await service.listUsers(getAuth(req), parse(listQuery, req.query)));
});

usersRouter.post('/', requirePermission('users.manage'), async (req, res) => {
  res
    .status(201)
    .json(await service.createUser(req, getAuth(req), parse(createUserSchema, req.body)));
});

usersRouter.get('/:id', canView, async (req, res) => {
  res.json(await service.getUser(getAuth(req), parse(idParams, req.params).id));
});

usersRouter.patch('/:id', requirePermission('users.manage'), async (req, res) => {
  const { id } = parse(idParams, req.params);
  res.json(await service.updateUser(req, getAuth(req), id, parse(updateUserSchema, req.body)));
});

usersRouter.post('/:id/reset-password', requirePermission('users.manage'), async (req, res) => {
  const { id } = parse(idParams, req.params);
  await service.resetPassword(req, id, parse(resetPasswordSchema, req.body).newPassword);
  res.status(204).end();
});

usersRouter.post('/:id/mfa/reset', requirePermission('roles.manage'), async (req, res) => {
  await service.resetMfa(req, parse(idParams, req.params).id);
  res.status(204).end();
});

usersRouter.post('/:id/sessions/revoke', requirePermission('users.manage'), async (req, res) => {
  res.json({ revoked: await service.revokeSessions(req, parse(idParams, req.params).id) });
});

usersRouter.put('/:id/permissions', requirePermission('roles.manage'), async (req, res) => {
  const { id } = parse(idParams, req.params);
  await service.setExtraPermissions(
    req,
    getAuth(req),
    id,
    parse(permissionsBody, req.body).permissions,
  );
  res.status(204).end();
});

rolesRouter.get('/', requirePermission('users.manage', 'roles.manage'), async (_req, res) => {
  res.json(await service.listRoles());
});
