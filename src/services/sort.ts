import type { SubEvent } from './types';

/** Pick which sub-event a photo belongs to from its EXIF capture time. */
export function sortIntoSubEvent(takenAt: Date, list: SubEvent[]): SubEvent | undefined {
  const t = takenAt.getTime();
  const hour = 3600000;
  // Inside a window (open-ended events last 5h, 30 min grace either side)…
  const inside = list.find((s) => {
    const start = new Date(s.startsAt).getTime();
    const end = s.endsAt ? new Date(s.endsAt).getTime() : start + 5 * hour;
    return t >= start - 30 * 60000 && t <= end + 30 * 60000;
  });
  if (inside) return inside;
  // …otherwise the nearest event starting within 2 h.
  let best: SubEvent | undefined;
  let bestGap = 2 * hour;
  for (const s of list) {
    const gap = Math.abs(new Date(s.startsAt).getTime() - t);
    if (gap < bestGap) { best = s; bestGap = gap; }
  }
  return best;
}
