import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton, Button, Center, Chip, LangToggle, PhotoTile, Txt, useAsync } from '@/components/ui';
import { useLang } from '@/i18n';
import { dayMonth, hhmm, timeRangeWords } from '@/lib/dates';
import { events, Photo, photoService, PhotoTag } from '@/services';
import { colors, radius } from '@/theme';
import { PartCover } from '@/components/PartCover';

const FILTERS: ('all' | PhotoTag)[] = ['all', 'rituals', 'candid', 'family'];
const SLOT = 30 * 60000;

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, l, pn } = useLang();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const { data: s } = useAsync(() => events.subEvent(id!), [id]);
  const { data: photos } = useAsync(() => photoService.forSubEvent(id!), [id]);

  // Group into half-hour slots by capture time.
  const groups = useMemo(() => {
    const out: { start: number; items: Photo[] }[] = [];
    for (const p of photos ?? []) {
      if (filter !== 'all' && !p.tags.includes(filter)) continue;
      const slot = Math.floor(new Date(p.takenAt).getTime() / SLOT) * SLOT;
      const g = out.find((x) => x.start === slot);
      g ? g.items.push(p) : out.push({ start: slot, items: [p] });
    }
    return out;
  }, [photos, filter]);

  if (!s) return <Center><Txt color={colors.muted}>…</Txt></Center>;
  const tile = (width - 40 - 8) / 3;

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.head, { backgroundColor: s.accent, paddingTop: insets.top + 8 }]}>
        <View style={styles.top}>
          <BackButton tint="rgba(255,253,248,0.55)" />
          <LangToggle onDark />
        </View>
        {s.cover ? <PartCover cover={s.cover} accent={s.accent} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.tile, marginVertical: 6 }} /> : null}
        <Txt font="display" size={44} accessibilityRole="header" latin>{pn(s.name)}</Txt>
        <Txt size={14}>{dayMonth(t, new Date(s.startsAt))} · {s.timeTbd ? t('editEvent.timeTbd') : timeRangeWords(t, new Date(s.startsAt), s.endsAt ? new Date(s.endsAt) : undefined)} · {l(s.place)}</Txt>
        <Txt font="bodySemi" size={14}>{t('event.fromGuests', { photos: s.photoCount, guests: s.guestCount })}</Txt>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((f) => <Chip key={f} label={t(`event.filters.${f}`)} active={filter === f} onPress={() => setFilter(f)} />)}
        </ScrollView>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => String(g.start)}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListEmptyComponent={<Txt size={15} color={colors.muted} style={{ paddingHorizontal: 20, paddingTop: 12 }}>{t('event.empty', { name: s.name })}</Txt>}
        renderItem={({ item: g }) => (
          <View style={{ paddingBottom: 16 }}>
            <Txt font="bodySemi" size={12} color={colors.muted} style={styles.slot}>
              {t('dates.range', { from: hhmm(new Date(g.start)), to: hhmm(new Date(g.start + SLOT)) })}
            </Txt>
            <View style={styles.grid}>
              {g.items.map((p) => (
                <PhotoTile key={p.id} uri={p.thumb ?? p.uri} accent={s.accent} style={{ width: tile, height: tile, borderRadius: radius.tile }}
                  label={t('event.openPhoto', { name: p.uploadedBy.name })}
                  onPress={() => router.push({ pathname: '/photo/[id]', params: { id: p.id } })} />
              ))}
            </View>
          </View>
        )}
      />
      <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <Button label={t('event.addYours', { name: s.name })} icon="upload" variant="ink" onPress={() => router.push('/upload')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 20, paddingBottom: 22, gap: 6 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filters: { gap: 8, paddingHorizontal: 20, paddingVertical: 14 },
  slot: { paddingHorizontal: 20, paddingBottom: 8, letterSpacing: 0.7, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 20 },
  cta: { position: 'absolute', left: 20, right: 20, bottom: 0 },
});
