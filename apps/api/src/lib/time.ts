// Tashkilot vaqt zonasidagi kalendar kunlari bilan ishlash. Bazada barcha vaqtlar UTC.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

function localParts(instant: Date, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

/** Berilgan lahzada vaqt zonasining UTC dan farqi (ms). Toshkent uchun +5 soat. */
export function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Lahzaning vaqt zonasidagi kalendar kuni, `YYYY-MM-DD`. */
export function localDate(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Vaqt zonasidagi kun boshlanishiga (00:00) mos UTC lahza. */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const midnightAsUtc = Date.UTC(y, m - 1, d);
  // Farq lahzaga bog'liq (yozgi vaqt), shuning uchun bir marta aniqlashtiriladi.
  const guess = midnightAsUtc - tzOffsetMs(new Date(midnightAsUtc), timeZone);
  return new Date(midnightAsUtc - tzOffsetMs(new Date(guess), timeZone));
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** `@db.Date` ustuni uchun: kalendar kunini UTC yarim tun sifatida ifodalaydi. */
export function dateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export interface DaySlice {
  date: string;
  start: Date;
  end: Date;
}

/** [start, end) oralig'ini vaqt zonasidagi kun chegaralari bo'yicha bo'laklarga ajratadi. */
export function splitByLocalDay(start: Date, end: Date, timeZone: string): DaySlice[] {
  const slices: DaySlice[] = [];
  let cursor = start;
  while (cursor.getTime() < end.getTime()) {
    const date = localDate(cursor, timeZone);
    const nextMidnight = startOfLocalDay(addDays(date, 1), timeZone);
    const sliceEnd = nextMidnight.getTime() < end.getTime() ? nextMidnight : end;
    slices.push({ date, start: cursor, end: sliceEnd });
    cursor = sliceEnd;
  }
  return slices;
}

/**
 * Butun sonni og'irliklarga mutanosib taqsimlaydi; bo'laklar yig'indisi aynan `total` ga teng
 * (yaxlitlash qoldig'i eng katta kasr qismli bo'laklarga beriladi).
 */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const result = exact.map(Math.floor);
  let remainder = total - result.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] = (result[index] ?? 0) + 1;
    remainder -= 1;
  }
  return result;
}
