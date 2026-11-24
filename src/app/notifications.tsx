import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Href, router } from 'expo-router';
import { Button, Icon, IconName, Txt, useAsync } from '@/components/ui';
import { Page, Tabs2, TopBar } from '@/components/kit';
import { useLang } from '@/i18n';
import { hhmm, sameDay } from '@/lib/dates';
import { inbox, Notice, now } from '@/services';
import { colors, radius } from '@/theme';

const KIND_ICON: Record<Notice['kind'], IconName> = { photos: 'images', you: 'user', reminder: 'calendar', change: 'pin', album: 'sparkle', mine: 'upload' };

export default function Notifications() {
  const { t, l } = useLang();
  const [tab, setTab] = useState('all');
  const { data, reload } = useAsync(() => inbox.list(), []);
  const n = now();
  const list = (data ?? []).filter((x) => tab === 'all' || !x.read);
  const unread = (data ?? []).filter((x) => !x.read).length;
  const when = (iso: string) => {
    const mins = Math.round((n.getTime() - new Date(iso).getTime()) / 60000);
    return mins < 60 ? t('notif.minAgo', { count: mins }) : sameDay(new Date(iso), n) ? t('notif.hAgo', { count: Math.round(mins / 60) }) : hhmm(new Date(iso));
  };
  const today = list.filter((x) => sameDay(new Date(x.at), n));
  const earlier = list.filter((x) => !sameDay(new Date(x.at), n));

  const row = (x: Notice) => (
    <Pressable key={x.id} accessibilityRole="link" style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
      onPress={async () => { await inbox.markRead(x.id); reload(); if (x.link) router.push(x.link as Href); }}>
      <View style={[styles.icon, !x.read && { backgroundColor: '#F6E6D2' }]}><Icon name={KIND_ICON[x.kind]} size={18} color={colors.maroon} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={15} font={x.read ? 'body' : 'bodySemi'}>{l(x.text)}</Txt>
        <Txt size={13} color={colors.muted}>{when(x.at)}</Txt>
      </View>
      {!x.read ? <View style={styles.unreadDot} accessibilityLabel="unread" /> : null}
    </Pressable>
  );

  return (
    <Page>
      <TopBar />
      <View style={styles.head}>
        <Txt font="display" size={34} color={colors.maroon} accessibilityRole="header">{t('notif.title')}</Txt>
        <Button label={t('notif.markAll')} icon="check" variant="quiet" height={36} size={13} disabled={!unread} onPress={async () => { await inbox.markAllRead(); reload(); }} />
      </View>
      <Tabs2 value={tab} onChange={setTab} items={[{ key: 'all', label: t('notif.all') }, { key: 'unread', label: t('notif.unread', { count: unread }) }]} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, gap: 8, paddingVertical: 16 }}>
        {!list.length ? <Txt color={colors.muted}>{t('notif.empty')}</Txt> : null}
        {today.length ? <Txt font="bodySemi" size={13} color={colors.muted}>{t('notif.today')}</Txt> : null}
        {today.map(row)}
        {earlier.length ? <Txt font="bodySemi" size={13} color={colors.muted} style={{ marginTop: 10 }}>{t('notif.yesterday')}</Txt> : null}
        {earlier.map(row)}
        <Pressable onPress={() => router.push('/settings')} accessibilityRole="link" style={styles.footer}>
          <Icon name="message" size={16} color={colors.maroon} />
          <Txt size={13} color={colors.maroon} font="bodySemi">{t('notif.footer')}</Txt>
        </Pressable>
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ivory, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.maroon },
  footer: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 12 },
});
