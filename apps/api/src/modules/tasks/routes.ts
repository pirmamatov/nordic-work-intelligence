import { Router } from 'express';
import { z } from 'zod';
import {
  changeTaskStatusSchema,
  createTaskSchema,
  TASK_STATUSES,
  taskCommentSchema,
  updateTaskSchema,
} from '@nwi/shared';
import { pageQuery } from '../../lib/pagination';
import { parse } from '../../lib/validate';
import { getAuth, requirePermission } from '../../middleware/auth';
import * as service from './service';

export const tasksRouter = Router();

const idParams = z.object({ id: z.uuid() });
const listQuery = pageQuery.extend({
  status: z.enum(TASK_STATUSES).optional(),
  ownerId: z.uuid().optional(),
  criterionId: z.uuid().optional(),
  overdue: z.stringbool().optional(),
  q: z.string().trim().max(100).optional(),
});

// Aniq ruxsat va doira servis ichida tekshiriladi; bu yerda — kamida ko'rish ruxsati.
const canView = requirePermission('tasks.view.all', 'tasks.view.department', 'tasks.view.self');

tasksRouter.get('/', canView, async (req, res) => {
  res.json(await service.listTasks(getAuth(req), parse(listQuery, req.query)));
});

tasksRouter.post(
  '/',
  requirePermission('tasks.manage.all', 'tasks.manage.department'),
  async (req, res) => {
    res
      .status(201)
      .json(await service.createTask(req, getAuth(req), parse(createTaskSchema, req.body)));
  },
);

tasksRouter.get('/:id', canView, async (req, res) => {
  res.json(await service.getTask(getAuth(req), parse(idParams, req.params).id));
});

tasksRouter.patch('/:id', canView, async (req, res) => {
  const { id } = parse(idParams, req.params);
  res.json(await service.updateTask(req, getAuth(req), id, parse(updateTaskSchema, req.body)));
});

tasksRouter.post('/:id/status', canView, async (req, res) => {
  const { id } = parse(idParams, req.params);
  res.json(
    await service.changeStatus(req, getAuth(req), id, parse(changeTaskStatusSchema, req.body)),
  );
});

tasksRouter.post('/:id/comments', canView, async (req, res) => {
  const { id } = parse(idParams, req.params);
  res
    .status(201)
    .json(await service.addComment(req, getAuth(req), id, parse(taskCommentSchema, req.body).body));
});
