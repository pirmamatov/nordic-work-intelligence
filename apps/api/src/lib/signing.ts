import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { env } from '../config/env';

// 32 baytli Ed25519 urug'ini PKCS#8 konvertiga o'rash uchun doimiy sarlavha (RFC 8410).
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

const privateKey = createPrivateKey({
  key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(env.AGENT_CONFIG_SIGNING_KEY, 'base64')]),
  format: 'der',
  type: 'pkcs8',
});

/** Agentga joylanadigan ochiq kalit: 32 bayt, base64. */
export const agentConfigPublicKey = createPublicKey(privateKey)
  .export({ format: 'der', type: 'spki' })
  .subarray(-32)
  .toString('base64');

export interface SignedPayload {
  /** Imzolangan aniq matn. Agent imzoni shu baytlar ustida tekshiradi, keyin JSON sifatida o'qiydi. */
  payload: string;
  signature: string;
  algorithm: 'Ed25519';
}

export function signPayload(data: unknown): SignedPayload {
  const payload = JSON.stringify(data);
  return {
    payload,
    signature: sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64'),
    algorithm: 'Ed25519',
  };
}
