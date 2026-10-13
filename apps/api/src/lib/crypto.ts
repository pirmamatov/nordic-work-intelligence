import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../config/env';

const masterKey = Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64');

// Har bir maqsad uchun asosiy kalitdan alohida kalit hosil qilinadi.
function deriveKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), `nwi:${purpose}`, 32));
}

const secretKey = deriveKey('secret-encryption');
const csrfKey = deriveKey('csrf');

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** AES-256-GCM. Format: v1.<iv>.<tag>.<shifrlangan matn>, base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ct.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, ct] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || ct === undefined) {
    throw new Error('Shifrlangan qiymat formati noto‘g‘ri');
  }
  const decipher = createDecipheriv('aes-256-gcm', secretKey, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString(
    'utf8',
  );
}

const blobKek = deriveKey('blob-key-wrapping');

function seal(key: Buffer, data: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

function open(key: Buffer, sealed: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
}

/**
 * Faylni shifrlaydi: har bir fayl uchun alohida tasodifiy kalit, u asosiy kalitdan
 * hosil qilingan kalit bilan o'raladi. Diskka `sealed`, bazaga `wrappedKey` yoziladi.
 */
export function encryptBlob(data: Buffer): { sealed: Buffer; wrappedKey: string } {
  const key = randomBytes(32);
  return { sealed: seal(key, data), wrappedKey: seal(blobKek, key).toString('base64url') };
}

export function decryptBlob(sealed: Buffer, wrappedKey: string): Buffer {
  return open(open(blobKek, Buffer.from(wrappedKey, 'base64url')), sealed);
}

/** Sessiya tokeniga bog'langan CSRF tokeni — bazada saqlanmaydi, har safar qayta hisoblanadi. */
export function csrfTokenFor(sessionToken: string): string {
  return createHmac('sha256', csrfKey).update(sessionToken).digest('base64url');
}
