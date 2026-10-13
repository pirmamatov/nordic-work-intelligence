export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const unauthenticated = (
  code = 'UNAUTHENTICATED',
  message = 'Tizimga kirish talab qilinadi',
) => new AppError(401, code, message);

export const forbidden = (code = 'FORBIDDEN', message = 'Bu amal uchun ruxsat yo‘q') =>
  new AppError(403, code, message);

export const notFound = (what = 'Ma’lumot') => new AppError(404, 'NOT_FOUND', `${what} topilmadi`);

export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message);

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: unknown) =>
  new AppError(400, code, message, details);

export const validationFailed = (details: unknown) =>
  new AppError(422, 'VALIDATION_ERROR', 'Kiritilgan ma’lumotlar noto‘g‘ri', details);
