import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId: string };
}

function prismaCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const { name, code } = err as { name?: unknown; code?: unknown };
  return name === 'PrismaClientKnownRequestError' && typeof code === 'string' ? code : null;
}

function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;
  switch (prismaCode(err)) {
    case 'P2002':
      return new AppError(409, 'CONFLICT', 'Bunday yozuv allaqachon mavjud');
    case 'P2003':
      return new AppError(409, 'REFERENCE_CONFLICT', 'Yozuv boshqa ma’lumotlar bilan bog‘langan');
    case 'P2025':
      return new AppError(404, 'NOT_FOUND', 'Ma’lumot topilmadi');
    default:
      break;
  }
  const status = (err as { status?: unknown } | null)?.status;
  const type = (err as { type?: unknown } | null)?.type;
  if (status === 400 && type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'So‘rov tanasi yaroqli JSON emas');
  }
  if (status === 413) return new AppError(413, 'PAYLOAD_TOO_LARGE', 'So‘rov hajmi juda katta');
  return null;
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Manzil topilmadi'));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);
  if (!appError) {
    logger.error({ err, requestId: req.requestId, path: req.path }, 'Kutilmagan xatolik');
  }
  const body: ErrorBody = {
    error: {
      code: appError?.code ?? 'INTERNAL_ERROR',
      message: appError?.message ?? 'Ichki xatolik yuz berdi. Keyinroq qayta urinib ko‘ring',
      ...(appError?.details !== undefined ? { details: appError.details } : {}),
      requestId: req.requestId,
    },
  };
  res.status(appError?.status ?? 500).json(body);
};
