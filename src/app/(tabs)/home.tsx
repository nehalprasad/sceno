import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, LangToggle, PhotoTile, RoundButton, Txt, useAsync } from '@/components/ui';
import { useLang } from '@/i18n';
import { addToCalendar, openDirections } from '@/lib/actions';
import { partStatus, dateRange, hhmm, relativeStart, sameDay, timeRangeWords } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { Toast, useToast } from '@/components/kit';
import { ShareSheet } from '@/components/ShareSheet';
import { events, now, photoService, SubEvent, inbox } from '@/services';
import { colors, radius } from '@/theme';


function Carousel({ sub }: { sub: SubEvent }) {
  const { t } = useLang();
  const { data } = useAsync(() => photoService.forSubEvent(sub.id), [sub.id]);
  const n = now();
  const isYesterday = sameDay(new Date(new Date(sub.startsAt).getTime() + 86400000), n);
  return (
    <View>
      <View style={styles.rowHead}>
        <Txt font="display" size={24} accessibilityRole="header" latin>{sub.name}</Txt>
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
  const { t, l } = useLang();
  const insets = useSafeAreaInsets();
  const { user, celebrationId } = useSession();
  const { data: c } = useAsync(() => events.get(celebrationId), [celebrationId]);
  const { data: subs } = useAsync(() => events.subEvents(celebrationId), [celebrationId]);
  const { data: notices } = useAsync(() => inbox.list(), [user?.id]);
  const UNREAD = (notices ?? []).filter((x) => !x.read).length;
  const n = now();
  const live = subs?.find((s) => partStatus(s.startsAt, s.endsAt, n, s.timeTbd) === 'live');
  const past = (subs ?? []).filter((s) => s.photoCount > 0 && s !== live && new Date(s.startsAt) < n).reverse();
  const next = subs?.find((s) => new Date(s.startsAt) > n);

  return (
    <>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 28 }}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          {c ? <Txt font="bodyMedium" size={12} color={colors.muted} style={styles.caps}>{dateRange(t, new Date(c.startsAt), new Date(c.endsAt))}</Txt> : null}
          <Link href="/my-events" asChild>
            <Pressable accessibilityRole="link" accessibilityHint={t('home.switchEvent')}>
              <Txt font="display" size={28} color={colors.maroon} numberOfLines={1}>{c ? l(c.title) : ' '}</Txt>
              <Txt font="bodySemi" size={13} color={colors.muted}>{t('home.switchEvent')}</Txt>
            </Pressable>
          </Link>
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

      {c && (c.myRole === 'admin' || c.myRole === 'coadmin') ? (
        <Pressable onPress={() => router.push('/admin')} accessibilityRole="link" style={({ pressed }) => [styles.adminRow, pressed && { opacity: 0.85 }]}>
          <Icon name="settings" size={18} color={colors.maroon} />
          <Txt font="bodySemi" size={14} color={colors.maroon} style={{ flex: 1 }}>{t('dash.youreAdmin')}</Txt>
          <Icon name="chevron" size={18} color={colors.maroon} />
        </Pressable>
      ) : null}

      {live ? (
        <View style={[styles.live, { backgroundColor: live.accent }]}>
          <View style={styles.livePill}><Txt font="bodySemi" size={12} color={colors.ivory}>{t('common.liveNow')}</Txt></View>
          <Pressable onPress={() => router.push({ pathname: '/event/[id]', params: { id: live.id } })} accessibilityRole="link">
            <Txt font="display" size={38} accessibilityRole="header" latin>{live.name}</Txt>
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
              <Txt font="bodySemi" latin size={15}>{next.name}</Txt>
              <Txt size={13} color={colors.muted}>
                {sameDay(new Date(next.startsAt), n) && new Date(next.startsAt).getHours() >= 17 ? t('common.tonight') : t('common.today')} {hhmm(new Date(next.startsAt))} · {l(next.place)}
              </Txt>
            </View>
            <Icon name="calendar" size={18} color={colors.maroon} />
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
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  caps: { textTransform: 'uppercase', letterSpacing: 0.9 },
  badge: { position: 'absolute', top: 1, right: 1, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.maroon, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  live: { marginHorizontal: 20, marginTop: 4, borderRadius: radius.hero, padding: 20, gap: 10 },
  livePill: { alignSelf: 'flex-start', backgroundColor: colors.ink, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  rowHead: { paddingHorizontal: 20, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  tile: { width: 132, height: 168, borderRadius: radius.card },
  adminRow: { marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.privateLine, backgroundColor: colors.paper },
  empty: { marginHorizontal: 20, marginTop: 24, padding: 24, gap: 14, alignItems: 'center', borderRadius: radius.panel, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong },
  next: { marginHorizontal: 20, padding: 16, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
