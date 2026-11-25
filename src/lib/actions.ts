import { useSyncExternalStore } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Tfn as TFunction } from '@/i18n';
import * as Calendar from 'expo-calendar/legacy';
import { OPEN_ENDED_MS } from '@/lib/dates';
import { partName } from '@/i18n';
import type { SubEvent } from '@/services';

export function openDirections(s: SubEvent) {
  const link = s.mapLink?.trim();
  // A pasted Google/Apple Maps link opens as is; anything else is treated as search text.
  if (link && /^https?:\/\//i.test(link)) { Linking.openURL(link).catch(() => {}); return; }
  const q = encodeURIComponent(link || s.mapsQuery || s.place.en);
  const url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`));
}

// Parts this phone has already put in its calendar (kept across launches).
const CAL_KEY = 'sceno.calendarAdded';
let added = new Set<string>();
const subs = new Set<() => void>();
AsyncStorage.getItem(CAL_KEY).then((v) => { if (v) { added = new Set(JSON.parse(v)); subs.forEach((f) => f()); } }).catch(() => {});
function markAdded(id: string) {
  added = new Set(added).add(id);
  subs.forEach((f) => f());
  AsyncStorage.setItem(CAL_KEY, JSON.stringify([...added])).catch(() => {});
}
/** True once this part was saved to the phone's calendar. */
export function useInCalendar(id?: string) {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => !!id && added.has(id));
}

/**
 * Opens the phone's own "new event" form (iOS Calendar / Android calendar app), pre-filled.
 * Times are absolute, so the calendar shows them in the phone's time zone.
 * A part with no time yet (timeTbd) goes in as an all-day event.
 * Once saved, tapping again only says it's already there.
 */
export async function addToCalendar(t: TFunction, s: SubEvent) {
  if (added.has(s.id)) { Alert.alert(t('itinerary.calendarAlready'), partName(t, s.name)); return; }
  const start = new Date(s.startsAt);
  let end = s.endsAt ? new Date(s.endsAt) : new Date(start.getTime() + OPEN_ENDED_MS);
  const allDay = !!s.timeTbd;
  if (allDay) { start.setHours(0, 0, 0, 0); end = new Date(start); end.setDate(end.getDate() + 1); }
  const notes = [s.dress?.en ? t('common.wear', { dress: s.dress.en }) : '', s.note?.en ?? '', s.mapLink ?? ''].filter(Boolean).join('\n');
  try {
    const r = await Calendar.createEventInCalendarAsync({
      title: partName(t, s.name), startDate: start, endDate: end, allDay,
      location: s.place.en || undefined, notes: notes || undefined,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    // iOS reports saved/canceled; Android always says "done", so count that as added.
    if (r.action === 'saved' || r.action === 'done') markAdded(s.id);
  } catch {
    Alert.alert(t('common.somethingWrong'));
  }
}
