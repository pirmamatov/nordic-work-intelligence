import { describe, expect, it } from 'vitest';
import {
  csrfTokenFor,
  decryptSecret,
  encryptSecret,
  randomToken,
  safeEqual,
  sha256Hex,
} from '../../src/lib/crypto';

describe('shifrlash yordamchilari', () => {
  it('shifrlangan qiymat ochiq matnni o‘z ichiga olmaydi va qayta ochiladi', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(encrypted)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('har safar boshqa IV ishlatadi', () => {
    expect(encryptSecret('bir xil')).not.toBe(encryptSecret('bir xil'));
  });

  it('o‘zgartirilgan shifrmatnni rad etadi', () => {
    const parts = encryptSecret('maxfiy').split('.');
    const ct = Buffer.from(parts[3] ?? '', 'base64url');
    ct[0] = (ct[0] ?? 0) ^ 0xff;
    parts[3] = ct.toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
    expect(() => decryptSecret('v2.a.b.c')).toThrow();
  });

  it('CSRF tokeni sessiyaga bog‘langan va takrorlanuvchan', () => {
    const a = randomToken();
    const b = randomToken();
    expect(csrfTokenFor(a)).toBe(csrfTokenFor(a));
    expect(csrfTokenFor(a)).not.toBe(csrfTokenFor(b));
  });

  it('safeEqual va sha256Hex', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
