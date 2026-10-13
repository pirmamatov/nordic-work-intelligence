import { Router } from 'express';
import { z } from 'zod';
import { pageQuery } from '../../lib/pagination';
import { parse } from '../../lib/validate';
import { getAuth, requireAuth } from '../../middleware/auth';
import * as service from './service';

export const screenshotsRouter = Router();

const listQuery = pageQuery.extend({
  employeeId: z.uuid(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
const idParams = z.object({ id: z.uuid() });

// Ruxsat servis ichida tekshiriladi: o'ziniki yoki `screenshots.view` + doira.
screenshotsRouter.get('/', requireAuth, async (req, res) => {
  res.json(await service.listScreenshots(getAuth(req), parse(listQuery, req.query)));
});

screenshotsRouter.get('/:id/image', requireAuth, async (req, res) => {
  const { image, contentType } = await service.viewScreenshot(
    req,
    getAuth(req),
    parse(idParams, req.params).id,
  );
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'no-store');
  res.send(image);
});
