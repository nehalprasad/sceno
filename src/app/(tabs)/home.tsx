import { useState, useCallback } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, LangToggle, PhotoTile, RoundButton, Txt, useAsync } from '@/components/ui';
import { useLang } from '@/i18n';
import { addToCalendar, openDirections, useInCalendar } from '@/lib/actions';
import { partStatus, dateRange, dayLabel, hhmm, relativeStart, sameDay, timeRangeWords } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { Toast, useToast } from '@/components/kit';
import { ShareSheet } from '@/components/ShareSheet';
import { events, now, photoService, SubEvent, inbox } from '@/services';
import { isAdminRole } from '@/services';
import { colors, radius } from '@/theme';


function Carousel({ sub }: { sub: SubEvent }) {
  const { t, pn } = useLang();
  const { data } = useAsync(() => photoService.forSubEvent(sub.id), [sub.id]);
  const n = now();
  const isYesterday = sameDay(new Date(new Date(sub.startsAt).getTime() + 86400000), n);
  return (
    <View>
      <View style={styles.rowHead}>
        <Txt font="display" size={24} accessibilityRole="header" latin>{pn(sub.name)}</Txt>
        <Link href={{ pathname: '/event/[id]', params: { id: sub.id } }} asChild>
          <Pressable hitSlop={8} accessibilityRole="link">
            <Txt font="bodySemi" size={14} color={colors.maroon}>
              {isYesterday ? `${t('common.yesterday')} · ` : ''}{t('common.photos', { count: sub.photoCount })}
            </Txt>
          </Pressable>
        </Link>
      </View>
      <FlatList
        horizontal showsHorizontalScrollIndicator={false}
        data={(data ?? []).slice(0, 8)}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
        renderItem={({ item }) => (
          <PhotoTile uri={item.thumb ?? item.uri} accent={sub.accent} style={styles.tile}
            label={t('event.openPhoto', { name: item.uploadedBy.name })}
            onPress={() => router.push({ pathname: '/photo/[id]', params: { id: item.id } })} />
        )}
        ListEmptyComponent={<View style={[styles.tile, { backgroundColor: colors.line }]} />}
      />
    </View>
  );
}

export default function Home() {
  const [sharing, setSharing] = useState(false);
  const [toast, show] = useToast();
  const { t, l, pn } = useLang();
  const insets = useSafeAreaInsets();
  const { user, celebrationId } = useSession();
  const { data: c, reload: reloadC } = useAsync(() => events.get(celebrationId), [celebrationId]);
  const { data: subs, reload: reloadSubs } = useAsync(() => events.subEvents(celebrationId), [celebrationId]);
  // Refresh when coming back from an edit screen, so a changed venue or time shows at once.
  useFocusEffect(useCallback(() => { reloadC(); reloadSubs(); }, [reloadC, reloadSubs]));
  const { data: notices } = useAsync(() => inbox.list(), [user?.id]);
  const UNREAD = (notices ?? []).filter((x) => !x.read).length;
  const n = now();
  const live = subs?.find((s) => partStatus(s.startsAt, s.endsAt, n, s.timeTbd) === 'live');
  const past = (subs ?? []).filter((s) => s.photoCount > 0 && s !== live && new Date(s.startsAt) < n).reverse();
  const next = subs?.find((s) => new Date(s.startsAt) > n);
  const nextInCal = useInCalendar(next?.id);

  return (
    <>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt font="bodyMedium" size={12} color={colors.muted} style={[styles.caps, { flexShrink: 1 }]} numberOfLines={1}>
              {c ? dateRange(t, new Date(c.startsAt), new Date(c.endsAt)) : ' '}
            </Txt>
            {c && isAdminRole(c.myRole) ? (
              <Pressable onPress={() => router.push('/admin')} accessibilityRole="link" accessibilityLabel={t('dash.youreAdmin')} hitSlop={8}
                style={({ pressed }) => [styles.adminPill, pressed && { opacity: 0.8 }]}>
                <Icon name="settings" size={12} color={colors.ivory} />
                <Txt font="bodySemi" size={11} color={colors.ivory} style={{ lineHeight: 14 }}>{t('myEvents.role.admin')}</Txt>
              </Pressable>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <LangToggle />
            <RoundButton icon="share" label={t('invite.shareEvent')} onPress={() => setSharing(true)} />
            <RoundButton label={t('home.notifications', { count: UNREAD })} onPress={() => router.push('/notifications')}>
              <Icon name="bell" />
              {UNREAD ? <View style={styles.badge}><Txt font="bodyBold" size={11} color={colors.ivory} style={{ lineHeight: 14 }}>{UNREAD}</Txt></View> : null}
            </RoundButton>
          </View>
        </View>
        <Link href="/my-events" asChild>
          <Pressable accessibilityRole="link" accessibilityHint={t('home.switchEvent')} style={({ pressed }) => [{ gap: 4 }, pressed && { opacity: 0.7 }]}>
            <Txt font="display" size={30} color={colors.maroon} numberOfLines={2}>{c ? l(c.title) : ' '}</Txt>
            <View style={styles.switchRow}>
              <Txt font="bodySemi" size={13} color={colors.muted}>{t('home.switchEvent')}</Txt>
              <Icon name="chevron" size={14} color={colors.muted} />
            </View>
          </Pressable>
        </Link>
      </View>

    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 4, paddingBottom: 28 }}>

      {live ? (
        <View style={[styles.live, { backgroundColor: live.accent }]}>
          <View style={styles.livePill}><Txt font="bodySemi" size={12} color={colors.ivory}>{t('common.liveNow')}</Txt></View>
          <Pressable onPress={() => router.push({ pathname: '/event/[id]', params: { id: live.id } })} accessibilityRole="link">
            <Txt font="display" size={38} accessibilityRole="header" latin>{pn(live.name)}</Txt>
          </Pressable>
          <Txt size={14} color={colors.ink}>
            {live.timeTbd ? t('editEvent.timeTbd') : timeRangeWords(t, new Date(live.startsAt), live.endsAt ? new Date(live.endsAt) : undefined)} · {l(live.place)}
            {live.dress ? `\n${t('common.wear', { dress: l(live.dress) })}` : ''}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Button label={t('common.uploadPhotos')} icon="upload" variant="ink" height={48} size={15} style={{ flex: 1 }} onPress={() => router.push('/upload')} />
            <Button label={t('common.directions')} icon="pin" variant="outline" height={48} size={15} onPress={() => openDirections(live)} />
          </View>
        </View>
      ) : null}

      {[live, ...past].filter((s): s is SubEvent => !!s && s.photoCount > 0).map((s) => (
        <View key={s.id} style={{ marginTop: 22 }}><Carousel sub={s} /></View>
      ))}

      {subs && !live && !next && !past.length ? (
        <View style={styles.empty}>
          <Icon name="images" size={28} color={colors.maroon} />
          <Txt size={15} color={colors.inkSoft} style={{ textAlign: 'center' }}>{t('home.noPhotosYet')}</Txt>
          <Button label={t('common.uploadPhotos')} icon="upload" height={48} size={15} onPress={() => router.push('/upload')} />
        </View>
      ) : null}

      {next ? (
        <>
          <View style={[styles.rowHead, { marginTop: 22 }]}><Txt font="display" size={24} accessibilityRole="header">{t('home.upNext')}</Txt></View>
          <Pressable onPress={() => addToCalendar(t, next)} style={({ pressed }) => [styles.next, pressed && { opacity: 0.85 }]} accessibilityRole="button">
            <View style={{ gap: 2, flex: 1 }}>
              <Txt font="bodySemi" latin size={15}>{pn(next.name)}</Txt>
              <Txt size={13} color={colors.muted}>
                {dayLabel(t, new Date(next.startsAt), n)} {hhmm(new Date(next.startsAt))} · {l(next.place)}
              </Txt>
            </View>
            <Icon name={nextInCal ? 'check' : 'calendar'} size={18} color={colors.maroon} />
            <Txt font="bodySemi" size={13} color={colors.maroon}>{relativeStart(t, new Date(next.startsAt), n)}</Txt>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
    {c ? <ShareSheet c={c} visible={sharing} onClose={() => setSharing(false)} onToast={show} /> : null}
    <Toast text={toast} />
    </>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  caps: { textTransform: 'uppercase', letterSpacing: 0.9 },
  badge: { position: 'absolute', top: 1, right: 1, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.maroon, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  live: { marginHorizontal: 20, marginTop: 4, borderRadius: radius.hero, padding: 20, gap: 10 },
  livePill: { alignSelf: 'flex-start', backgroundColor: colors.ink, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  rowHead: { paddingHorizontal: 20, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  tile: { width: 132, height: 168, borderRadius: radius.card },
  adminPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: colors.maroon },
  adminRow: { marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.privateLine, backgroundColor: colors.paper },
  empty: { marginHorizontal: 20, marginTop: 24, padding: 24, gap: 14, alignItems: 'center', borderRadius: radius.panel, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong },
  next: { marginHorizontal: 20, padding: 16, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
