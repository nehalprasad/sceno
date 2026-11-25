import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Chip, Icon, PhotoTile, Txt, useAsync } from '@/components/ui';
import { Page, Sheet, TopBar } from '@/components/kit';
import { useLang } from '@/i18n';
import { useSession } from '@/lib/session';
import { events, moderation, photoService } from '@/services';
import { colors, radius } from '@/theme';

export default function Moderate() {
  const { t, pn } = useLang();
  const { width } = useWindowDimensions();
  const { celebrationId } = useSession();
  const { data: subs } = useAsync(() => events.subEvents(celebrationId), [celebrationId]);
  const withPhotos = (subs ?? []).filter((s) => s.photoCount);
  const { data: held, reload: reloadHeld } = useAsync(() => moderation.pending(celebrationId), [celebrationId]);
  const [subId, setSubId] = useState<string>();
  // Photos held for approval come first; '__held' is that tab.
  const showHeld = !!held?.length && (subId === '__held' || !subId);
  const active = showHeld ? undefined : withPhotos.find((s) => s.id === subId) ?? withPhotos[0];
  const { data: partPhotos, reload: reloadPart } = useAsync(() => (active ? photoService.forSubEvent(active.id) : Promise.resolve([])), [active?.id]);
  const photos = showHeld ? held : partPhotos;
  const reload = () => { reloadHeld(); reloadPart(); };
  const accentOf = (sid: string) => subs?.find((s) => s.id === sid)?.accent ?? colors.marigold;
  const [sel, setSel] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const tile = (width - 40 - 8) / 3;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function approve() {
    await moderation.approve(celebrationId, sel);
    setSel([]); reload();
  }
  async function apply(state: 'deleted' | 'hidden') {
    await moderation.remove(celebrationId, sel, state);
    setSel([]); setConfirm(false); reload();
  }

  return (
    <Page>
      <TopBar left={sel.length ? (
        <Pressable onPress={() => setSel([])} accessibilityRole="button" hitSlop={8} style={{ height: 44, justifyContent: 'center' }}>
          <Txt font="bodySemi" size={14}>{t('moderate.cancel')}</Txt>
        </Pressable>) : undefined}
        right={sel.length ? <Txt font="bodySemi" size={14} color={colors.maroon}>{t('moderate.selected', { count: sel.length })}</Txt> : undefined} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }} style={{ flexGrow: 0 }}>
        {held?.length ? <Chip label={t('access.pendingTab', { count: held.length })} active={showHeld} onPress={() => { setSubId('__held'); setSel([]); }} /> : null}
        {withPhotos.map((s) => <Chip key={s.id} label={pn(s.name)} active={!showHeld && active?.id === s.id} onPress={() => { setSubId(s.id); setSel([]); }} />)}
      </ScrollView>
      {showHeld ? <>
        <Txt font="display" size={36} accessibilityRole="header">{t('access.pendingTab', { count: held!.length })}</Txt>
        <Txt size={14} color={colors.muted}>{t('access.waitingNote')} · {t('moderate.tapToSelect')}</Txt>
      </> : active ? <>
        <Txt font="display" latin size={36} accessibilityRole="header">{active.name}</Txt>
        <Txt size={14} color={colors.muted}>{t('moderate.adminView', { count: active.photoCount })} · {t('moderate.tapToSelect')}</Txt>
      </> : null}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
        {(photos ?? []).map((p) => {
          const n = sel.indexOf(p.id);
          return (
            <View key={p.id}>
              <PhotoTile uri={p.thumb ?? p.uri} accent={active?.accent ?? accentOf(p.subEventId)} style={[{ width: tile, height: tile, borderRadius: radius.tile }, n >= 0 && styles.on]}
                onPress={() => toggle(p.id)} label={t('event.openPhoto', { name: p.uploadedBy.name })} />
              {n >= 0 ? <View style={styles.badge} pointerEvents="none"><Txt font="bodyBold" size={12} color={colors.ivory}>{n + 1}</Txt></View> : null}
            </View>
          );
        })}
      </ScrollView>
      {sel.length ? (
        <View style={{ paddingBottom: 16, flexDirection: 'row', gap: 8 }}>
          {showHeld ? <Button label={t('access.approve')} icon="check" style={{ flex: 1 }} onPress={approve} /> : null}
          <Button label={t('moderate.hide')} icon="eye-off" variant="soft" style={{ flex: 1 }} onPress={() => apply('hidden')} />
          <Button label={t('moderate.del', { count: sel.length })} icon="trash" style={{ flex: 1.3 }} onPress={() => setConfirm(true)} />
        </View>
      ) : null}
      <Sheet visible={confirm} onClose={() => setConfirm(false)}>
        <Icon name="trash" size={28} color={colors.maroon} />
        <Txt font="display" size={28}>{t('moderate.confirmTitle', { count: sel.length })}</Txt>
        <Txt size={15} color={colors.inkSoft}>{t('moderate.confirmBody', { name: active?.name ?? '' })}</Txt>
        <Button label={t('moderate.del', { count: sel.length })} icon="trash" onPress={() => apply('deleted')} />
        <Button label={t('moderate.hide')} icon="eye-off" variant="outline" onPress={() => apply('hidden')} />
        <Txt size={13} color={colors.muted} style={{ textAlign: 'center' }}>{t('moderate.hideNote')}</Txt>
      </Sheet>
    </Page>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingVertical: 16 },
  on: { borderWidth: 3, borderColor: colors.maroon, opacity: 0.85 },
  badge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.maroon, alignItems: 'center', justifyContent: 'center' },
});
