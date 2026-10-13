/** Soniyalarni "3 soat 25 daq" ko'rinishida yozadi. */
export function formatDuration(totalSec: number): string {
  if (totalSec < 60) return totalSec > 0 ? `${totalSec} son` : '0 daq';
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours === 0) return `${minutes} daq`;
  return minutes === 0 ? `${hours} soat` : `${hours} soat ${minutes} daq`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Brauzer vaqt zonasida `DD.MM.YYYY HH:mm`. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** `YYYY-MM-DD` → `DD.MM.YYYY` */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}.${m}.${y}`;
}

const WEEKDAYS = ['Ya', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha'];
export function weekdayShort(day: string): string {
  return WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? '';
}

/** Brauzer vaqt zonasidagi bugungi sana, `YYYY-MM-DD`. */
export function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bayt`;
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
