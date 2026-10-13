import { describe, expect, it } from 'vitest';
import {
  addDays,
  apportion,
  localDate,
  splitByLocalDay,
  startOfLocalDay,
  tzOffsetMs,
} from '../../src/lib/time';

const TASHKENT = 'Asia/Tashkent';
const iso = (d: Date) => d.toISOString();

describe('vaqt zonasi yordamchilari', () => {
  it('Toshkent UTC dan 5 soat oldinda', () => {
    expect(tzOffsetMs(new Date('2026-10-13T00:00:00Z'), TASHKENT)).toBe(5 * 3_600_000);
  });

  it('kalendar kuni tashkilot vaqt zonasida aniqlanadi', () => {
    // UTC bo'yicha hali 13-oktabr, Toshkentda allaqachon 14-oktabr.
    expect(localDate(new Date('2026-10-13T18:59:59Z'), TASHKENT)).toBe('2026-10-13');
    expect(localDate(new Date('2026-10-13T19:00:00Z'), TASHKENT)).toBe('2026-10-14');
    expect(iso(startOfLocalDay('2026-10-14', TASHKENT))).toBe('2026-10-13T19:00:00.000Z');
  });

  it('yozgi vaqtga o‘tadigan zonada kun boshlanishini to‘g‘ri topadi', () => {
    // Berlin: 2026-03-29 da soat oldinga suriladi (kun 23 soat davom etadi).
    expect(iso(startOfLocalDay('2026-03-29', 'Europe/Berlin'))).toBe('2026-03-28T23:00:00.000Z');
    expect(iso(startOfLocalDay('2026-03-30', 'Europe/Berlin'))).toBe('2026-03-29T22:00:00.000Z');
  });

  it('oy va yil chegarasidan o‘tadi', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('bir kun ichidagi oraliq bo‘linmaydi', () => {
    const slices = splitByLocalDay(
      new Date('2026-10-13T05:00:00Z'),
      new Date('2026-10-13T06:00:00Z'),
      TASHKENT,
    );
    expect(slices).toHaveLength(1);
    expect(slices[0]?.date).toBe('2026-10-13');
  });

  it('yarim tundan o‘tgan oraliq ikki kunga bo‘linadi', () => {
    // Toshkent vaqti bilan 23:50 – 00:20.
    const slices = splitByLocalDay(
      new Date('2026-10-13T18:50:00Z'),
      new Date('2026-10-13T19:20:00Z'),
      TASHKENT,
    );
    expect(slices.map((s) => [s.date, iso(s.start), iso(s.end)])).toEqual([
      ['2026-10-13', '2026-10-13T18:50:00.000Z', '2026-10-13T19:00:00.000Z'],
      ['2026-10-14', '2026-10-13T19:00:00.000Z', '2026-10-13T19:20:00.000Z'],
    ]);
  });

  it('aynan yarim tunda tugagan oraliq keyingi kunga o‘tmaydi', () => {
    const slices = splitByLocalDay(
      new Date('2026-10-13T18:00:00Z'),
      new Date('2026-10-13T19:00:00Z'),
      TASHKENT,
    );
    expect(slices.map((s) => s.date)).toEqual(['2026-10-13']);
  });

  it('mutanosib taqsimlashda yig‘indi saqlanadi', () => {
    expect(apportion(100, [600, 1200])).toEqual([33, 67]);
    expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(apportion(0, [5, 5])).toEqual([0, 0]);
    expect(apportion(7, [0, 0])).toEqual([0, 0]);
    for (const total of [1, 59, 3601, 86399]) {
      expect(apportion(total, [17, 4283, 900]).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});
