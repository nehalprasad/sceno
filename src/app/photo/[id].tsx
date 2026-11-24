import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton, Button, Center, LangToggle, Txt, useAsync } from '@/components/ui';
import { Toast, useToast } from '@/components/kit';
import { useLang } from '@/i18n';
import { dayMonth, hhmm } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { events, moderation, Photo, photoService } from '@/services';
import { colors } from '@/theme';

const DARK = '#140C09';
const SOFT = '#D8CBBB';

export default function PhotoViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { celebrationId } = useSession();
  const [toast, show] = useToast();
  const { data: first } = useAsync(() => photoService.get(id!), [id]);
  const { data: list, reload } = useAsync(() => (first ? photoService.forSubEvent(first.subEventId) : Promise.resolve([] as Photo[])), [first?.subEventId]);
  const { data: sub } = useAsync(() => (first ? events.subEvent(first.subEventId) : Promise.resolve(undefined)), [first?.subEventId]);
  const { data: c } = useAsync(() => events.get(celebrationId), [celebrationId]);
  const start = useMemo(() => Math.max(0, (list ?? []).findIndex((p) => p.id === id)), [list, id]);
  const [index, setIndex] = useState<number | null>(null);

  if (!first || !list?.length || !sub) return <Center><Txt color={colors.muted}>…</Txt></Center>;
  const i = Math.min(index ?? start, list.length - 1);
  const p = list[i];
  const isAdmin = c?.myRole === 'admin' || c?.myRole === 'coadmin';
  const stageH = height - insets.top - insets.bottom - 280;

  async function download() {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) return show(t('upload.permission'));
    try { await MediaLibrary.saveToLibraryAsync(p.uri); show(t('photo.saved')); } catch { show(t('common.somethingWrong')); }
  }
  async function act(state: 'hidden' | 'deleted') {
    await moderation.remove(celebrationId, [p.id], state);
    show(t(state === 'hidden' ? 'photo.hidden' : 'photo.deleted'));
    if (list!.length <= 1) router.back(); else reload();
  }

  return (
    <View style={{ flex: 1, backgroundColor: DARK, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}>
      <StatusBar style="light" />
      <View style={styles.top}>
        <BackButton icon="close" dark />
        <Txt font="bodySemi" size={14} color={colors.ivory} style={{ fontVariant: ['tabular-nums'] }}>{t('photo.counter', { n: i + 1, total: list.length })}</Txt>
        <LangToggle />
      </View>

      <FlatList
        data={list} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        initialScrollIndex={start} getItemLayout={(_, n) => ({ length: width, offset: width * n, index: n })}
        keyExtractor={(x) => x.id} style={{ flexGrow: 0, marginTop: 12 }}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, height: stageH, paddingHorizontal: 8 }} accessible accessibilityRole="image" accessibilityLabel={t('event.openPhoto', { name: item.uploadedBy.name })}>
            {/* Whole photo, never cropped. */}
            <Image source={{ uri: item.medium ?? item.uri }} placeholder={item.thumb ? { uri: item.thumb } : undefined} placeholderContentFit="contain" style={{ flex: 1 }} contentFit="contain" transition={150} />
          </View>
        )}
      />
      <Txt size={12} color="#B9A99D" style={{ textAlign: 'center', marginTop: 8 }}>{t('photo.swipe')}</Txt>

      <View style={styles.info}>
        <Txt font="display" latin size={28} color={colors.ivory}>{sub.name}</Txt>
        <Txt size={14} color={SOFT}>{t('photo.meta', { date: dayMonth(t, new Date(p.takenAt)), time: hhmm(new Date(p.takenAt)), name: p.uploadedBy.name })}</Txt>
        <View style={styles.actions}>
          <Button label={t('photo.download')} icon="download" variant="soft" height={44} size={14} style={{ flex: 1 }} onPress={download} />
          <Button label={t('photo.shareWa')} icon="share" height={44} size={14} style={{ flex: 1.4 }}
            onPress={() => Share.share({ url: p.uri, message: `${sub.name} · ${p.uploadedBy.name}` })} />
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={async () => { await moderation.report(celebrationId, p.id); show(t('photo.reported')); }} hitSlop={8} style={{ height: 40, justifyContent: 'center' }}>
            <Txt font="bodySemi" size={14} color={SOFT}>{t('photo.report')}</Txt>
          </Pressable>
          {isAdmin ? (
            <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Txt font="bodySemi" size={12} color="#B9A99D">{t('photo.admin')}</Txt>
              <Button label={t('photo.hide')} icon="eye-off" variant="soft" height={40} size={14} onPress={() => act('hidden')} />
              <Button label={t('photo.delete')} icon="trash" variant="soft" height={40} size={14}
                onPress={() => Alert.alert(t('moderate.confirmTitle', { count: 1 }), t('moderate.confirmBody', { name: sub.name }), [
                  { text: t('common.cancel'), style: 'cancel' }, { text: t('photo.delete'), style: 'destructive', onPress: () => act('deleted') },
                ])} />
            </View>
          ) : null}
        </View>
      </View>
      <Toast text={toast} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  info: { paddingHorizontal: 20, paddingTop: 12, gap: 8, marginTop: 'auto' },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
});
