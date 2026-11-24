import { Alert, Linking, Platform } from 'react-native';
import type { Tfn as TFunction } from '@/i18n';
import type { SubEvent } from '@/services';

export function openDirections(s: SubEvent) {
  const link = s.mapLink?.trim();
  // A pasted Google/Apple Maps link opens as is; anything else is treated as search text.
  if (link && /^https?:\/\//i.test(link)) { Linking.openURL(link).catch(() => {}); return; }
  const q = encodeURIComponent(link || s.mapsQuery || s.place.en);
  const url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`));
}

// TODO: write a real event with expo-calendar once the permission copy is agreed.
export function addToCalendar(t: TFunction, s: SubEvent) {
  Alert.alert(t('itinerary.calendarAdded'), s.name);
}
