import { describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, verifyPassword } from '../../src/lib/password';

describe('parol siyosati', () => {
  it('yetarlicha kuchli parolni qabul qiladi', () => {
    expect(passwordProblem('Togri-Parol-2026!', { email: 'aziz@nordic.uz' })).toBeNull();
  });

  it.each([
    ['qisqa', 'Qisqa-1!'],
    ['keng tarqalgan', 'Password1234'],
    ['bir xil belgilar', 'aaaaaaaaaaaaaaaa'],
    ['juda uzun', 'x1'.repeat(70)],
  ])('%s parolni rad etadi', (_name, password) => {
    expect(passwordProblem(password)).toEqual(expect.any(String));
  });

  it('elektron pochta nomini o‘z ichiga olgan parolni rad etadi', () => {
    expect(passwordProblem('azizbek-2026-parol', { email: 'azizbek@nordic.uz' })).toEqual(
      expect.any(String),
    );
  });

  it('Argon2id bilan xeshlaydi va tekshiradi', async () => {
    const hash = await hashPassword('Togri-Parol-2026!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'Togri-Parol-2026!')).toBe(true);
    expect(await verifyPassword(hash, 'Notogri-Parol-2026!')).toBe(false);
    expect(await verifyPassword('buzilgan-xesh', 'Togri-Parol-2026!')).toBe(false);
  });
});
