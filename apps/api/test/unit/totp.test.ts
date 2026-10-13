import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  totpAt,
  totpStep,
  verifyTotp,
} from '../../src/lib/totp';

// RFC 6238, B ilova: SHA-1 uchun sinov kaliti — ASCII "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('RFC sinov vektori: T=%i → %s', (seconds, expected) => {
    expect(totpAt(RFC_SECRET, totpStep(seconds * 1000), 8)).toBe(expected);
  });

  it('6 raqamli kod 8 raqamli kodning oxirgi 6 raqamiga teng', () => {
    expect(totpAt(RFC_SECRET, totpStep(59_000))).toBe('287082');
  });

  it('base32 kodlash va dekodlash bir-biriga teskari', () => {
    expect(base32Encode(Buffer.from('12345678901234567890', 'ascii'))).toBe(
      'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    );
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it('joriy va qo‘shni qadamdagi kodni qabul qiladi, uzoqdagisini rad etadi', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(secret, totpAt(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, step - 2), now)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step + 5), now)).toBeNull();
  });

  it('noto‘g‘ri formatdagi kodni rad etadi', () => {
    const secret = generateTotpSecret();
    for (const code of ['', '12345', '1234567', 'abcdef', '12 456']) {
      expect(verifyTotp(secret, code)).toBeNull();
    }
  });
});
