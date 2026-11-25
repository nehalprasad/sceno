import type { Tfn as TFunction } from '@/i18n';

const pad = (n: number) => String(n).padStart(2, '0');
/** 12-hour time, e.g. "4:00 PM". */
export const hhmm = (d: Date) => {
  const h = d.getHours() % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function dayMonth(t: TFunction, d: Date, short = false) {
  const months = t(short ? 'dates.monthsShort' : 'dates.months', { returnObjects: true }) as string[];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
export function weekday(t: TFunction, d: Date) {
  return (t('dates.weekdays', { returnObjects: true }) as string[])[d.getDay()];
}
export function dateRange(t: TFunction, a: Date, b: Date) {
  if (sameDay(a, b)) return dayMonth(t, a);
  if (a.getMonth() === b.getMonth()) {
    const months = t('dates.months', { returnObjects: true }) as string[];
    return t('dates.range', { from: a.getDate(), to: `${b.getDate()} ${months[b.getMonth()]}` });
  }
  return t('dates.range', { from: dayMonth(t, a), to: dayMonth(t, b) });
}
export function timeRange(t: TFunction, start: Date, end?: Date) {
  return end ? `${hhmm(start)} – ${hhmm(end)}` : t('dates.onwards', { time: hhmm(start) });
}
export function timeRangeWords(t: TFunction, start: Date, end?: Date) {
  return end ? t('dates.range', { from: hhmm(start), to: hhmm(end) }) : t('dates.onwards', { time: hhmm(start) });
}
export function relativeStart(t: TFunction, start: Date, now: Date) {
  const mins = Math.round((start.getTime() - now.getTime()) / 60000);
  if (mins < 60) return t('common.inMinutes', { count: Math.max(mins, 1) });
  if (sameDay(start, now)) return t('common.inHours', { count: Math.round(mins / 60) });
  const days = calendarDaysBetween(now, start);
  if (days === 1) return t('common.tomorrow');
  return t('common.inDays', { count: days });
}
/** Whole calendar days from a to b (midnight to midnight). */
export function calendarDaysBetween(a: Date, b: Date) {
  const da = new Date(a); da.setHours(0, 0, 0, 0);
  const db = new Date(b); db.setHours(0, 0, 0, 0);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}
/** "Today", "Tonight", "Tomorrow" or "Sat, 13 Dec" for when something starts. */
export function dayLabel(t: TFunction, start: Date, now: Date) {
  const days = calendarDaysBetween(now, start);
  if (days === 0) return start.getHours() >= 17 ? t('common.tonight') : t('common.today');
  if (days === 1) return t('common.tomorrow');
  return `${weekday(t, start)}, ${dayMonth(t, start, true)}`;
}

/** Open-ended parts ("19:30 onwards") count as running for 5 hours. */
export const OPEN_ENDED_MS = 5 * 3600000;
export function partStatus(startIso: string, endIso: string | undefined, n: Date, timeTbd?: boolean): 'upcoming' | 'live' | 'done' {
  if (timeTbd) { // only the day is known: count the whole day
    const d = new Date(startIso); d.setHours(0, 0, 0, 0);
    const s = d.getTime(), e = s + 86400000;
    return n.getTime() < s ? 'upcoming' : n.getTime() < e ? 'live' : 'done';
  }
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : start + OPEN_ENDED_MS;
  return n.getTime() < start ? 'upcoming' : n.getTime() < end ? 'live' : 'done';
}
