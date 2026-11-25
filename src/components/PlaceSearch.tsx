import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { Icon, Txt } from '@/components/ui';
import { colors } from '@/theme';

/**
 * Venue field with Google Maps place search (Places API Autocomplete).
 * Picking a suggestion fills the venue text and a Google Maps link to that exact place.
 * Without EXPO_PUBLIC_GOOGLE_MAPS_KEY it is a plain text field.
 */
const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
type Suggestion = { id: string; main: string; secondary: string };

async function search(input: string, session: string, signal: AbortSignal): Promise<Suggestion[]> {
  const q = new URLSearchParams({ input, sessiontoken: session, components: 'country:in', key: KEY! });
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${q}`, { signal });
  if (!r.ok) return [];
  const d = await r.json();
  return (d.predictions ?? []).slice(0, 5).map((p: any) => ({
    id: p.place_id,
    main: p.structured_formatting?.main_text ?? p.description ?? '',
    secondary: p.structured_formatting?.secondary_text ?? '',
  }));
}

export const mapsLinkFor = (s: Suggestion) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.main}, ${s.secondary}`)}&query_place_id=${s.id}`;

export function PlaceSearch({ value, onChange, onPick, placeholder, label, inputStyle }: {
  value: string; onChange: (v: string) => void; onPick: (venue: string, mapLink: string) => void;
  placeholder: string; label: string; inputStyle: StyleProp<TextStyle>;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [typing, setTyping] = useState(false);
  const session = useRef('');
  const active = !!KEY && typing && value.trim().length >= 3;

  useEffect(() => {
    if (!active) return;
    if (!session.current) session.current = `${Date.now()}`;
    const ctl = new AbortController();
    const h = setTimeout(() => { search(value.trim(), session.current, ctl.signal).then(setItems).catch(() => {}); }, 300);
    return () => { clearTimeout(h); ctl.abort(); };
  }, [value, active]);
  const shown = active ? items : [];

  return (
    <View style={{ gap: 6 }}>
      <Txt font="bodySemi" size={14}>{label}</Txt>
      <TextInput value={value} onChangeText={(v) => { setTyping(true); onChange(v); }} placeholder={placeholder} placeholderTextColor={colors.muted}
        accessibilityLabel={label} style={inputStyle} />
      {shown.length ? (
        <View style={styles.list}>
          {shown.map((s, i) => (
            <Pressable key={s.id} accessibilityRole="button" onPress={() => {
              onPick(s.secondary ? `${s.main}, ${s.secondary}` : s.main, mapsLinkFor(s));
              setItems([]); setTyping(false); session.current = '';
            }} style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && { backgroundColor: colors.ivory }]}>
              <Icon name="pin" size={16} color={colors.maroon} />
              <View style={{ flex: 1 }}>
                <Txt font="bodySemi" size={14} numberOfLines={1}>{s.main}</Txt>
                {s.secondary ? <Txt size={12} color={colors.muted} numberOfLines={1}>{s.secondary}</Txt> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderColor: colors.privateLine, borderRadius: 12, backgroundColor: colors.paper, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  sep: { borderTopWidth: 1, borderTopColor: colors.privateLine },
});
