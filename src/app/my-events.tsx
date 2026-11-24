import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Icon, Txt, useAsync } from '@/components/ui';
import { Page, TopBar } from '@/components/kit';
import { useLang } from '@/i18n';
import { dateRange } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { Celebration, events, now } from '@/services';
import { colors, radius } from '@/theme';

export default function MyEvents() {
  const { t, l } = useLang();
  const { celebrationId, setCelebrationId } = useSession();
  const { data } = useAsync(() => events.listMine(), []);
  const n = now();
  const live = (data ?? []).filter((c) => new Date(c.startsAt) <= n && new Date(c.endsAt) >= n);
  const soon = (data ?? []).filter((c) => new Date(c.startsAt) > n);
  const past = (data ?? []).filter((c) => new Date(c.endsAt) < n);

  const open = (c: Celebration) => { setCelebrationId(c.id); router.replace('/home'); };
  const card = (c: Celebration, big?: boolean) => (
    <Pressable key={c.id} onPress={() => open(c)} accessibilityRole="button"
      style={({ pressed }) => [styles.card, big && { backgroundColor: c.coverAccent, borderWidth: 0 }, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <Txt font="display" size={big ? 28 : 22} color={big ? colors.ivory : colors.ink}>{l(c.title)}</Txt>
        <Txt size={13} color={big ? '#F3E3D6' : colors.muted}>
          {t(`myEvents.role.${c.myRole}`)} · {dateRange(t, new Date(c.startsAt), new Date(c.endsAt))} · {l(c.city)}
        </Txt>
      </View>
      {c.id === celebrationId ? <Icon name="check" size={20} color={big ? colors.ivory : colors.maroon} /> : <Icon name="chevron" size={20} color={big ? colors.ivory : colors.muted} />}
    </Pressable>
  );

  return (
    <Page>
      <TopBar right={<Button label={t('myEvents.newEvent')} icon="plus" variant="soft" height={36} size={13} onPress={() => router.push('/admin/create')} />} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, gap: 12, paddingBottom: 32 }}>
        <Txt font="display" size={34} color={colors.maroon} accessibilityRole="header" style={{ marginTop: 8 }}>{t('myEvents.title')}</Txt>
        {live.length ? <Txt font="bodySemi" size={13} color={colors.muted} style={styles.h}>{t('myEvents.now')} · {live.length}</Txt> : null}
        {live.map((c) => card(c, true))}
        {soon.length ? <Txt font="bodySemi" size={13} color={colors.muted} style={styles.h}>{t('myEvents.comingUp')}</Txt> : null}
        {soon.map((c) => card(c))}
        {past.length ? <Txt font="bodySemi" size={13} color={colors.muted} style={styles.h}>{t('myEvents.albums')}</Txt> : null}
        {past.map((c) => card(c))}
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  h: { marginTop: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderRadius: radius.panel, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
});
