import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, PhotoTile, Txt, useAsync } from '@/components/ui';
import { Page, Tabs2, TopBar } from '@/components/kit';
import { useLang } from '@/i18n';
import { useSession } from '@/lib/session';
import { events, moderation, now } from '@/services';
import { colors, eventAccents, radius } from '@/theme';
import { ReverifyModal } from '@/components/ReverifyModal';

const KEEP_DAYS = 30;

export default function Deleted() {
  const { celebrationId } = useSession();
  const { t, pn } = useLang();
  const { width } = useWindowDimensions();
  const { data, reload } = useAsync(() => moderation.list(celebrationId), []);
  const { data: subs } = useAsync(() => events.subEvents(celebrationId), [celebrationId]);
  const [tab, setTab] = useState<'deleted' | 'hidden'>('deleted');
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const all = data ?? [];
  const list = all.filter((r) => r.state === tab);
  const tile = (width - 40 - 8) / 3;
  const daysLeft = (at: string) => Math.max(1, KEEP_DAYS - Math.floor((now().getTime() - new Date(at).getTime()) / 86400000));
  const groups = (subs ?? []).map((s) => ({ s, items: list.filter((r) => r.photo.subEventId === s.id) })).filter((g) => g.items.length);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const done = () => { setSel([]); setSelecting(false); reload(); };
  const [reverify, setReverify] = useState(false);
  // Permanent delete needs a fresh code; the server says 'reverify' when the 5-minute window is closed.
  async function purge() {
    try { await moderation.purge(celebrationId, sel); done(); }
    catch (e) { if ((e as Error).message === 'reverify') setReverify(true); else Alert.alert(t('common.somethingWrong')); }
  }

  return (
    <Page>
      <TopBar right={<Button label={selecting ? t('common.cancel') : t('deleted.select')} variant="quiet" height={36} size={13}
        onPress={() => { setSelecting(!selecting); setSel([]); }} />} />
      <Txt font="display" size={34} color={colors.maroon} accessibilityRole="header" style={{ marginVertical: 8 }}>{t('deleted.title')}</Txt>
      <Tabs2 value={tab} onChange={(k) => { setTab(k as typeof tab); setSel([]); }} items={[
        { key: 'deleted', label: t('deleted.tabDeleted', { count: all.filter((r) => r.state === 'deleted').length }) },
        { key: 'hidden', label: t('deleted.tabHidden', { count: all.filter((r) => r.state === 'hidden').length }) },
      ]} />
      <Txt size={13} color={colors.muted} style={{ marginTop: 12 }}>{tab === 'deleted' ? t('deleted.note') : t('deleted.hiddenNote')}</Txt>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, gap: 18, paddingVertical: 16 }}>
        {!groups.length ? <Txt color={colors.muted}>{t('deleted.empty')}</Txt> : null}
        {groups.map(({ s, items }) => (
          <View key={s.id} style={{ gap: 8 }}>
            <View style={styles.head}>
              <Txt font="display" latin size={22}>{pn(s.name)}</Txt>
              <Txt size={13} color={colors.muted}>{t('deleted.count', { count: items.length })}</Txt>
            </View>
            <View style={styles.grid}>
              {items.map((r) => {
                const on = sel.includes(r.photo.id);
                const d = daysLeft(r.at);
                return (
                  <View key={r.photo.id} style={{ width: tile, gap: 4 }}>
                    <PhotoTile uri={r.photo.thumb ?? r.photo.uri} accent={eventAccents[s.id] ?? s.accent} style={[{ width: tile, height: tile, borderRadius: radius.tile, opacity: 0.75 }, on && styles.on]}
                      onPress={selecting ? () => toggle(r.photo.id) : undefined} />
                    {tab === 'deleted' ? <Txt size={11} color={d <= 3 ? colors.danger : colors.muted} font={d <= 3 ? 'bodySemi' : 'body'}>{t('deleted.daysLeft', { count: d })}</Txt> : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      {sel.length ? (
        <View style={styles.bar}>
          <Txt font="bodySemi" size={14} style={{ flex: 1 }}>{t('moderate.selected', { count: sel.length })}</Txt>
          <Button label={t('deleted.restore')} icon="restore" variant="ink" height={44} size={14} onPress={async () => { await moderation.restore(celebrationId, sel); done(); }} />
          {tab === 'deleted' ? (
            <Button label={t('deleted.forever')} icon="trash" variant="quiet" height={44} size={14}
              onPress={() => Alert.alert(t('deleted.forever'), t('deleted.foreverConfirm'), [{ text: t('common.cancel'), style: 'cancel' },
                { text: t('deleted.forever'), style: 'destructive', onPress: purge }])} />
          ) : null}
        </View>
      ) : null}
      <ReverifyModal visible={reverify} onCancel={() => setReverify(false)} onVerified={() => { setReverify(false); purge(); }} />
    </Page>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  on: { borderWidth: 3, borderColor: colors.maroon, opacity: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: colors.line },
});
