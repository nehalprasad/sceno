import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, LangToggle, Txt, useAsync } from '@/components/ui';
import { useLang } from '@/i18n';
import { addToCalendar, openDirections, useInCalendar } from '@/lib/actions';
import { PartCover } from '@/components/PartCover';
import { partStatus, dayMonth, relativeStart, sameDay, timeRange, weekday } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { events, now, SubEvent } from '@/services';
import { colors, radius } from '@/theme';

function Card({ s }: { s: SubEvent }) {
  const { t, l, pn } = useLang();
  const inCal = useInCalendar(s.id);
  const n = now();
  const start = new Date(s.startsAt);
  const end = s.endsAt ? new Date(s.endsAt) : undefined;
  const status = partStatus(s.startsAt, s.endsAt, n, s.timeTbd);
  const done = status === 'done';
  const live = status === 'live';
  const soon = !live && !done && sameDay(start, n);
  const open = () => router.push({ pathname: '/event/[id]', params: { id: s.id } });

  return (
    <Pressable onPress={open} accessibilityRole="link"
      style={({ pressed }) => [styles.card, live ? { backgroundColor: s.accent, borderWidth: 0, paddingVertical: 18 } : null, done && { opacity: 0.72 }, pressed && { opacity: 0.85 }]}>
      <View style={styles.meta}>
        <Txt font="bodySemi" size={14} style={{ fontVariant: ['tabular-nums'] }}>{s.timeTbd ? t('editEvent.timeTbd') : timeRange(t, start, end)}</Txt>
        {live ? (
          <View style={styles.livePill}><Txt font="bodySemi" size={12} color={colors.ivory}>{t('common.liveNow')}</Txt></View>
        ) : done ? (
          <Txt font="bodySemi" size={13} color={colors.muted}>{t('common.doneWithPhotos', { count: s.photoCount })}</Txt>
        ) : s.private ? (
          <View style={styles.privPill}><Icon name="lock" size={13} color={colors.maroon} /><Txt font="bodySemi" size={12} color={colors.maroon}>{t('common.familyOnly')}</Txt></View>
        ) : soon ? (
          <Txt font="bodySemi" size={13} color={colors.maroon}>{relativeStart(t, start, n)}</Txt>
        ) : null}
      </View>
      {/* inCal: this phone already saved the part */}
      {s.cover ? <PartCover cover={s.cover} accent={s.accent} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.tile, marginVertical: 4 }} /> : null}
      <Txt font="display" size={live ? 32 : 24} accessibilityRole="header" latin>{pn(s.name)}</Txt>
      <Txt size={14} color={live ? colors.inkSoft : colors.muted}>
        {l(s.place)}{s.dress ? `\n${t('common.wear', { dress: l(s.dress) })}` : ''}
      </Txt>
      {s.note ? <Txt size={13} color={colors.muted}>{l(s.note)}</Txt> : null}
      {!done ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Button label={t('common.directions')} icon="pin" height={44} size={14} variant={live ? 'ink' : 'soft'} style={{ flex: 1, paddingHorizontal: 8 }} onPress={() => openDirections(s)} />
          <Button label={inCal ? t('itinerary.inCalendar') : t('common.addToCalendar')} icon={inCal ? 'check' : 'calendar'} height={44} size={14} variant={live ? 'outline' : 'soft'} style={{ flex: 1, paddingHorizontal: 8 }} onPress={() => addToCalendar(t, s)} />
        </View>
      ) : null}
    </Pressable>
  );
}

export default function Itinerary() {
  const { t, l } = useLang();
  const insets = useSafeAreaInsets();
  const { celebrationId } = useSession();
  const { data: c, reload: reloadC } = useAsync(() => events.get(celebrationId), [celebrationId]);
  const { data: subs, reload: reloadSubs } = useAsync(() => events.subEvents(celebrationId), [celebrationId]);
  // Refresh when coming back from an edit screen, so a changed venue or time shows at once.
  useFocusEffect(useCallback(() => { reloadC(); reloadSubs(); }, [reloadC, reloadSubs]));

  const days: { key: string; date: Date; items: SubEvent[] }[] = [];
  for (const s of subs ?? []) {
    const d = new Date(s.startsAt);
    const key = d.toDateString();
    const g = days.find((x) => x.key === key);
    g ? g.items.push(s) : days.push({ key, date: d, items: [s] });
  }

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt font="display" size={34} color={colors.maroon} accessibilityRole="header">{t('itinerary.title')}</Txt>
          {c ? <Txt size={14} color={colors.muted} numberOfLines={1}>{l(c.title)} · {l(c.venue)}</Txt> : null}
        </View>
        <LangToggle />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {days.map((d) => (
          <View key={d.key} style={styles.day}>
            <Txt font="display" size={22} accessibilityRole="header">
              {dayMonth(t, d.date, true)}  <Txt font="bodyMedium" size={13} color={colors.muted}>{weekday(t, d.date)}</Txt>
            </Txt>
            {d.items.map((s) => <Card key={s.id} s={s} />)}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  day: { paddingHorizontal: 20, paddingTop: 28, gap: 12 },
  card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.panel, paddingHorizontal: 18, paddingVertical: 16, gap: 8 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  livePill: { backgroundColor: colors.ink, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  privPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.privateLine, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
});
