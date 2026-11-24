import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Page, TopBar } from '@/components/kit';
import { BackButton, Button, PhotoTile, Txt } from '@/components/ui';
import { useLang } from '@/i18n';
import { clearSelfie, getSelfie, matchFaces, MatchResult, setSelfie } from '@/lib/faces';
import { useSession } from '@/lib/session';
import { events, now, photoService, settings, SubEvent } from '@/services';
import { colors, radius } from '@/theme';

export default function PhotosOfMe() {
  const { t } = useLang();
  const { celebrationId } = useSession();
  const [on, setOn] = useState<boolean | null>(null);
  const [selfie, setSelfieUri] = useState<string | null>(null);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [res, setRes] = useState<MatchResult | null>(null);
  const [subs, setSubs] = useState<SubEvent[]>([]);

  useEffect(() => {
    (async () => {
      const p = await settings.get();
      setOn(p.findMe);
      if (!p.findMe) { await clearSelfie(); return; } // turned off in Profile → the selfie goes too
      setSelfieUri(await getSelfie());
    })();
    events.subEvents(celebrationId).then(setSubs).catch(() => {});
  }, [celebrationId]);

  const run = useCallback(async (uri: string) => {
    setRes(null);
    const [c, list] = await Promise.all([events.get(celebrationId), events.subEvents(celebrationId)]);
    const shown = list.filter((s) => c?.published || new Date(s.startsAt) <= now());
    const photos = (await Promise.all(shown.map((s) => photoService.forSubEvent(s.id)))).flat();
    setProg({ done: 0, total: photos.length });
    setRes(await matchFaces(uri, photos, (done, total) => setProg({ done, total })));
    setProg(null);
  }, [celebrationId]);
  useEffect(() => { if (selfie) run(selfie); }, [selfie, run]);

  const choose = async (camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, cameraType: ImagePicker.CameraType.front };
    let r: ImagePicker.ImagePickerResult;
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      r = await ImagePicker.launchCameraAsync(opts).catch(() => ImagePicker.launchImageLibraryAsync(opts)); // simulators have no camera
    } else r = await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled || !r.assets[0]) return;
    if (!on) { await settings.set({ findMe: true }); setOn(true); }
    setSelfieUri(await setSelfie(r.assets[0].uri));
  };
  const off = async () => { await settings.set({ findMe: false }); await clearSelfie(); setOn(false); setSelfieUri(null); setRes(null); };
  const accent = (id: string) => subs.find((s) => s.id === id)?.accent ?? colors.line;

  return (
    <Page>
      <TopBar left={<BackButton onPress={() => router.back()} />} />
      <ScrollView contentContainerStyle={{ gap: 16, paddingTop: 8, paddingBottom: 32 }}>
        <Txt font="display" size={40} color={colors.maroon} accessibilityRole="header">{t('story.meTitle')}</Txt>
        <Txt size={14} color={colors.muted}>{t('story.meIntro')}</Txt>
        {selfie ? (
          <View style={styles.selfie}><Image source={{ uri: selfie }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={t('story.meTitle')} /></View>
        ) : null}
        {on === null ? null : (
          <View style={{ gap: 8 }}>
            <Button label={selfie ? t('story.meChange') : on ? t('story.meTake') : t('story.meTurnOn')} icon="user" variant="ink" height={48} onPress={() => choose(true)} />
            <Button label={t('story.mePick')} variant="outline" height={48} onPress={() => choose(false)} />
            {on ? <Button label={t('story.meRemove')} variant="quiet" height={44} size={14} onPress={off} /> : null}
          </View>
        )}
        {prog ? <Txt size={14} accessibilityLiveRegion="polite">{t('story.meSearching', prog)}</Txt> : null}
        {res && !res.available ? <View style={styles.note}><Txt size={14}>{t('story.meNotReady')}</Txt></View> : null}
        {res?.available ? (
          <>
            <Txt font="bodySemi" size={15}>{res.matches.length ? t('story.meFound', { n: res.matches.length }) : t('story.meNone')}</Txt>
            <View style={styles.grid}>
              {res.matches.map((p) => (
                <PhotoTile key={p.id} uri={p.thumb ?? p.uri} accent={accent(p.subEventId)} style={styles.cell}
                  onPress={() => router.push({ pathname: '/photo/[id]', params: { id: p.id } })} label={t('event.openPhoto', { name: p.uploadedBy.name })} />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  selfie: { width: 160, height: 200, borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.line },
  note: { padding: 14, borderRadius: radius.card, backgroundColor: colors.line },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: '32%', aspectRatio: 1, borderRadius: radius.tile },
});
