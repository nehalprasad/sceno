import { useCallback } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button, Icon, IconName, Txt, useAsync } from '@/components/ui';
import { Page, Toast, TopBar, useToast } from '@/components/kit';
import { useLang } from '@/i18n';
import { dayMonth, hhmm, partStatus, sameDay } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { admin, events, now } from '@/services';
import { colors, radius } from '@/theme';

export default function Dashboard() {
  const { t, l, pn } = useLang();
  const { celebrationId } = useSession();
  const [toast, show] = useToast();
  const { data: c, reload } = useAsync(() => events.get(celebrationId), [celebrationId]);
  const { data: subs, reload: reloadSubs } = useAsync(() => events.subEvents(celebrationId), [celebrationId]);
  const { data: s, reload: reloadStats } = useAsync(() => admin.stats(celebrationId), [celebrationId]);
  // Refresh after editing a part or moderating, when this screen comes back into view.
  useFocusEffect(useCallback(() => { reloadSubs(); reloadStats(); reload(); }, []));
  const n = now();

  const nav = (icon: IconName, label: string, href: Parameters<typeof router.push>[0]) => (
    <Pressable onPress={() => router.push(href)} accessibilityRole="link" style={({ pressed }) => [styles.navRow, pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={20} color={colors.maroon} />
      <Txt font="bodySemi" size={15} style={{ flex: 1 }}>{label}</Txt>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>
  );

  return (
    <Page>
      <TopBar />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, gap: 16, paddingBottom: 40 }}>
        <View>
          <Txt font="bodySemi" size={13} color={colors.muted}>{t('dash.youreAdmin')}</Txt>
          <Txt font="display" size={36} color={colors.maroon} accessibilityRole="header">{c ? l(c.title) : ' '}</Txt>
        </View>
        <View style={styles.stats}>
          {([[s?.guests, t('dash.guests', { count: s?.guests ?? 0 })], [s?.photos, t('dash.photos')], [s?.uploaders, t('dash.uploaders')]] as const).map(([v, label]) => (
            <View key={label} style={styles.stat}>
              <Txt font="bodySemi" size={24} style={{ fontVariant: ['tabular-nums'] }}>{v?.toLocaleString('en-IN') ?? '–'}</Txt>
              <Txt size={12} color={colors.muted}>{label}</Txt>
            </View>
          ))}
        </View>

        <Pressable onPress={() => router.push('/admin/moderate')} accessibilityRole="link" style={({ pressed }) => [styles.alert, pressed && { opacity: 0.9 }]}>
          <Icon name="flag" size={22} color={colors.ink} />
          <View style={{ flex: 1 }}>
            <Txt font="bodySemi" size={16}>{t('dash.waiting', { count: s?.waiting ?? 0 })}</Txt>
            <Txt size={13} color={colors.inkSoft}>{t('dash.waitingSub')}</Txt>
          </View>
          <Txt font="bodySemi" size={14}>{t('dash.review')}</Txt>
        </Pressable>
        <View style={styles.holdRow}>
          <View style={{ flex: 1 }}>
            <Txt font="bodySemi" size={15}>{t('access.hold')}</Txt>
            <Txt size={13} color={colors.muted}>{t('access.holdSub')}</Txt>
          </View>
          <Switch value={!!c?.holdUploads} accessibilityLabel={t('access.hold')} trackColor={{ true: colors.maroon }}
            onValueChange={async (v) => { await admin.setHoldUploads(celebrationId, v).catch(() => show(t('common.somethingWrong'))); reload(); }} />
        </View>
        <Pressable onPress={() => router.push('/admin/deleted')} accessibilityRole="link" style={styles.linkRow}>
          <Icon name="trash" size={16} color={colors.maroon} />
          <Txt font="bodySemi" size={14} color={colors.maroon}>{t('dash.deleted', { count: s?.removed ?? 0 })}</Txt>
        </Pressable>

        <View style={styles.rowHead}>
          <Txt font="display" size={24}>{t('dash.events')}</Txt>
          <Button label={t('dash.addEvent')} icon="plus" variant="quiet" height={36} size={13} onPress={() => router.push({ pathname: '/admin/part/[id]', params: { id: 'new' } })} />
        </View>
        <View style={styles.list}>
          {(subs ?? []).map((x, i) => {
            const st = new Date(x.startsAt); const end = x.endsAt ? new Date(x.endsAt) : undefined;
            const ps = partStatus(x.startsAt, x.endsAt, n, x.timeTbd); const live = ps === 'live'; const done = ps === 'done';
            const status = live ? t('common.liveNow') : done ? `${dayMonth(t, st, true)} · ${t('common.done')}` :
              sameDay(st, n) && st.getHours() >= 17 ? t('dash.tonight', { time: hhmm(st) }) : `${dayMonth(t, st, true)} ${hhmm(st)}`;
            return (
              <Pressable key={x.id} onPress={() => router.push({ pathname: '/event/[id]', params: { id: x.id } })} accessibilityRole="link"
                style={[styles.evRow, i < subs!.length - 1 && styles.line]}>
                <View style={[styles.dot, { backgroundColor: x.accent }]} />
                <View style={{ flex: 1 }}>
                  <Txt font="bodySemi" size={15}>{pn(x.name)}{x.private ? ` · ${t('dash.private')}` : ''}</Txt>
                  <Txt size={13} color={live ? colors.maroon : colors.muted} font={live ? 'bodySemi' : 'body'}>{status}</Txt>
                </View>
                {x.photoCount ? <Txt size={13} color={colors.muted}>{t('common.photos', { count: x.photoCount })}</Txt> : null}
                <Pressable onPress={() => router.push({ pathname: '/admin/part/[id]', params: { id: x.id } })} hitSlop={8}
                  accessibilityRole="button" accessibilityLabel={`${t('dash.edit')} ${pn(x.name)}`} style={styles.editBtn}>
                  <Icon name="edit" size={16} color={colors.maroon} />
                </Pressable>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.list}>
          {nav('message', t('dash.invite'), '/admin/invite')}
          {nav('users', t('dash.guestsRoles'), '/admin/guests')}
        </View>

        <View style={styles.publish}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt font="display" size={22}>{t('dash.story')}</Txt>
            <Txt size={13} color={colors.muted}>{t('dash.storySub')}</Txt>
          </View>
          <Button label={c?.published ? t('dash.published') : t('dash.publish')} icon={c?.published ? 'check' : 'sparkle'} height={44} size={14}
            disabled={c?.published} onPress={() => Alert.alert(t('dash.publish'), t('dash.publishConfirm'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('dash.publish'), onPress: async () => { await admin.publish(celebrationId); reload(); show(t('dash.published')); } },
            ])} />
        </View>
      </ScrollView>
      <Toast text={toast} />
    </Page>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 14, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.panel, backgroundColor: colors.marigold },
  holdRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  linkRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  list: { borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  evRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  line: { borderBottomWidth: 1, borderBottomColor: '#EFE6DA' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  editBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: '#EFE6DA' },
  publish: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.panel, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
});
