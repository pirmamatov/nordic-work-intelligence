export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: { field: string; message: string }[] | undefined;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details)
      ? (details as { field: string; message: string }[])
      : undefined;
  }
}

// CSRF tokeni faqat xotirada saqlanadi; sahifa yangilanganda /auth/me dan qayta olinadi.
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

async function toError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (body.error?.code) {
      return new ApiError(
        response.status,
        body.error.code,
        body.error.message ?? 'Xatolik yuz berdi',
        body.error.details,
      );
    }
  } catch {
    // JSON bo'lmagan javob (masalan, proksi xatosi)
  }
  return new ApiError(response.status, 'HTTP_ERROR', 'Server bilan aloqada xatolik yuz berdi');
}

async function send(
  method: string,
  path: string,
  options: { query?: Query; body?: unknown; file?: Blob } = {},
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.file) headers['Content-Type'] = 'application/octet-stream';
  else if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: 'same-origin',
      ...(options.file
        ? { body: options.file }
        : options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Serverga ulanib bo‘lmadi. Internet aloqasini tekshiring',
    );
  }
  if (!response.ok) throw await toError(response);
  return response;
}

async function json<T>(
  method: string,
  path: string,
  options?: { query?: Query; body?: unknown },
): Promise<T> {
  const response = await send(method, path, options);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  get: <T>(path: string, query?: Query) => json<T>('GET', path, query ? { query } : {}),
  post: <T = void>(path: string, body?: unknown) => json<T>('POST', path, { body: body ?? {} }),
  patch: <T = void>(path: string, body: unknown) => json<T>('PATCH', path, { body }),
  put: <T = void>(path: string, body: unknown) => json<T>('PUT', path, { body }),
  delete: <T = void>(path: string) => json<T>('DELETE', path),
  /** Faylni xom baytlar sifatida yuklaydi; nomi va boshqa ma'lumotlar so'rov satrida. */
  upload: async <T>(path: string, file: File, query: Query = {}) =>
    (await (
      await send('POST', path, { query: { fileName: file.name, ...query }, file })
    ).json()) as T,
  /** Faylni yuklab oladi va brauzerning saqlash oynasini ochadi. */
  download: async (path: string, fileName: string) => {
    const url = URL.createObjectURL(await (await send('GET', path)).blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
  /** Ikkilik javob (ekran tasviri) — vaqtinchalik blob manzili sifatida. */
  blobUrl: async (path: string) => URL.createObjectURL(await (await send('GET', path)).blob()),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Kutilmagan xatolik yuz berdi';
}
