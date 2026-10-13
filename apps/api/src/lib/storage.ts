import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';

const root = path.resolve(env.STORAGE_DIR);

// Kalitlar faqat server tomonida hosil qilinadi; baribir papkadan tashqariga chiqish tekshiriladi.
function resolveKey(key: string): string {
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Saqlash kaliti noto‘g‘ri');
  return full;
}

export async function putObject(key: string, data: Buffer): Promise<void> {
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data, { mode: 0o600 });
}

export function getObject(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

export async function removeObject(key: string): Promise<void> {
  await rm(resolveKey(key), { force: true });
}
