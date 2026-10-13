import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDateTime,
  formatDay,
  formatDuration,
  shiftDay,
  weekdayShort,
} from '@/lib/format';

describe('formatlash', () => {
  it('davomiylikni o‘zbekcha yozadi', () => {
    expect(formatDuration(0)).toBe('0 daq');
    expect(formatDuration(45)).toBe('45 son');
    expect(formatDuration(60)).toBe('1 daq');
    expect(formatDuration(3599)).toBe('59 daq');
    expect(formatDuration(3600)).toBe('1 soat');
    expect(formatDuration(3 * 3600 + 25 * 60 + 10)).toBe('3 soat 25 daq');
  });

  it('sana va hajm', () => {
    expect(formatDay('2026-10-13')).toBe('13.10.2026');
    expect(weekdayShort('2026-10-13')).toBe('Se');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(formatDateTime(new Date(2026, 9, 3, 7, 5).toISOString())).toBe('03.10.2026 07:05');
    expect(formatDateTime(null)).toBe('—');
    expect(formatBytes(29)).toBe('29 bayt');
    expect(formatBytes(200 * 1024)).toBe('200 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
