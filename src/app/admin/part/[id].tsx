import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Button, Icon, Txt, useAsync } from '@/components/ui';
import { Page, Toast, TopBar, useToast } from '@/components/kit';
import { at, DateField } from '@/components/DateField';
import { PartCover } from '@/components/PartCover';
import { useLang } from '@/i18n';
import { useSession } from '@/lib/session';
import { admin, events, InviteMedia } from '@/services';
import { colors, fonts, fontsFor, radius } from '@/theme';

const ACCENTS = ['#F2C14E', '#A3B57A', '#C9A9E0', '#E8A0B4', '#D9B8BD', '#8FB8DE', '#F4A261'];

/** Add or edit one part of the event (Haldi, Sangeet, Day 1…). `id` is "new" to add. */
export default function EditPart() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { t, lang } = useLang();
  const { celebrationId } = useSession();
  const [toast, show] = useToast();
  const { data: c } = useAsync(() => events.get(celebrationId), [celebrationId]);
  const { data: s } = useAsync(() => (isNew ? Promise.resolve(undefined) : events.subEvent(id!)), [id]);

  const [name, setName] = useState('');
  const [day, setDay] = useState<Date>();
  const [start, setStart] = useState<Date>();
  const [end, setEnd] = useState<Date>();
  const [place, setPlace] = useState('');
  const [dress, setDress] = useState('');
  const [note, setNote] = useState('');
  const [priv, setPriv] = useState(false);
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [mapLink, setMapLink] = useState('');
  const [cover, setCover] = useState<InviteMedia>(); // what's shown: saved cover or a newly picked local file
  const [coverDirty, setCoverDirty] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Fill the form once the part (or, for a new one, the event's date) has loaded.
  const filled = useRef(false);
  useEffect(() => {
    if (filled.current) return;
    if (s) {
      filled.current = true;
      setName(s.name); setDay(new Date(s.startsAt)); setStart(s.timeTbd ? undefined : new Date(s.startsAt)); setEnd(s.endsAt ? new Date(s.endsAt) : undefined);
      setPlace(s.place?.en ?? ''); setDress(s.dress?.en ?? ''); setNote(s.note?.en ?? ''); setPriv(s.private); setAccent(s.accent);
      setMapLink(s.mapLink ?? ''); setCover(s.cover);
    } else if (isNew && c) {
      filled.current = true;
      setDay(new Date(c.startsAt));
    }
  }, [s, c, isNew]);

  async function save() {
    if (!name.trim()) return setErr(t('editEvent.errName'));
    if (!day || !start) return setErr(t('editEvent.errTime'));
    const startsAt = at(day, start);
    const endsAt = end ? at(day, end) : null;
    if (endsAt && endsAt <= startsAt) endsAt.setDate(endsAt.getDate() + 1); // runs past midnight
    setBusy(true);
    try {
      // Text is stored as typed; a Hindi version can be added later per field.
      const sid = await admin.saveSubEvent(celebrationId, {
        name: name.trim(), startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null,
        place: { en: place.trim() }, dress: dress.trim() ? { en: dress.trim() } : null, note: note.trim() ? { en: note.trim() } : null,
        private: priv, accent, mapLink: mapLink.trim() || null,
      }, isNew ? undefined : id);
      if (coverDirty) await admin.setPartCover(celebrationId, sid, cover ? { mediaUri: cover.url, kind: cover.kind } : { clear: true });
      router.back();
    } catch {
      show(t('common.somethingWrong'));
    } finally { setBusy(false); }
  }

  async function pickCover(kind: 'image' | 'video') {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [kind === 'image' ? 'images' : 'videos'], videoMaxDuration: 30, quality: 0.85 });
    if (r.canceled) return;
    setCover({ url: r.assets[0].uri, kind }); setCoverDirty(true);
  }

  function remove() {
    if (s?.photoCount) return Alert.alert(t('editEvent.cantDelete'), t('editEvent.cantDeleteSub', { count: s.photoCount }));
    Alert.alert(t('editEvent.delete'), s?.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('editEvent.delete'), style: 'destructive', onPress: async () => { await admin.deleteSubEvent(celebrationId, id!); router.back(); } },
    ]);
  }

  const input = [styles.input, { fontFamily: fontsFor(lang).body }];
  const field = (label: string, value: string, set: (v: string) => void, ph: string, multiline?: boolean, url?: boolean) => (
    <View style={{ gap: 6 }}>
      <Txt font="bodySemi" size={14}>{label}</Txt>
      <TextInput value={value} onChangeText={(v) => { set(v); setErr(''); }} placeholder={ph} placeholderTextColor={colors.muted}
        accessibilityLabel={label} multiline={multiline} {...(url ? { autoCapitalize: 'none' as const, autoCorrect: false, keyboardType: 'url' as const } : {})} style={[...input, multiline && { height: 84, paddingTop: 14, textAlignVertical: 'top' }]} />
    </View>
  );

  return (
    <Page>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar right={!isNew ? (
          <Pressable onPress={remove} accessibilityRole="button" accessibilityLabel={t('editEvent.delete')} hitSlop={6} style={styles.trash}>
            <Icon name="trash" size={18} color={colors.danger} />
          </Pressable>) : undefined} />
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 16, gap: 18, paddingBottom: 24 }}>
          <Txt font="display" size={34} color={colors.maroon} accessibilityRole="header">{isNew ? t('editEvent.addTitle') : t('editEvent.editTitle')}</Txt>
          {field(t('editEvent.name'), name, setName, 'Haldi')}
          <DateField label={t('editEvent.day')} mode="date" value={day} onChange={(d) => { setDay(d); setErr(''); }} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <DateField label={t('editEvent.start')} mode="time" value={start} onChange={(d) => { setStart(d); setErr(''); }} />
            <DateField label={t('editEvent.end')} mode="time" value={end} onChange={setEnd} optional onClear={() => setEnd(undefined)} />
          </View>
          {field(t('editEvent.place'), place, setPlace, t('editEvent.placePh'))}
          {field(t('partMedia.map'), mapLink, setMapLink, t('partMedia.mapPh'), false, true)}
          {field(t('editEvent.dress'), dress, setDress, t('editEvent.dressPh'))}
          {field(t('editEvent.note'), note, setNote, t('editEvent.notePh'), true)}

          <View style={{ gap: 8 }}>
            <Txt font="bodySemi" size={14}>{t('editEvent.colour')}</Txt>
            <View style={styles.swatches} accessibilityRole="radiogroup">
              {ACCENTS.map((a) => (
                <Pressable key={a} onPress={() => setAccent(a)} accessibilityRole="radio" accessibilityState={{ selected: accent === a }} accessibilityLabel={a}
                  style={[styles.swatch, { backgroundColor: a }, accent === a && styles.swatchOn]}>
                  {accent === a ? <Icon name="check" size={16} color={colors.ink} /> : null}
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Txt font="bodySemi" size={14}>{t('partMedia.cover')}</Txt>
            <Txt size={13} color={colors.muted}>{t('partMedia.coverSub')}</Txt>
            {cover ? <PartCover key={cover.url} cover={cover} accent={accent} style={styles.cover} /> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label={t('partMedia.photo')} icon="images" variant="soft" height={44} size={14} style={{ flex: 1 }} onPress={() => pickCover('image')} />
              <Button label={t('partMedia.video')} icon="camera" variant="soft" height={44} size={14} style={{ flex: 1 }} onPress={() => pickCover('video')} />
              {cover ? <Button label={t('partMedia.remove')} icon="trash" variant="outline" height={44} size={14} style={{ flex: 1 }} onPress={() => { setCover(undefined); setCoverDirty(true); }} /> : null}
            </View>
          </View>

          <View style={styles.toggle}>
            <Icon name="lock" size={20} color={colors.maroon} />
            <View style={{ flex: 1 }}>
              <Txt font="bodySemi" size={15}>{t('common.familyOnly')}</Txt>
              <Txt size={13} color={colors.muted}>{t('editEvent.privateSub')}</Txt>
            </View>
            <Switch value={priv} onValueChange={setPriv} trackColor={{ true: colors.maroon, false: colors.lineStrong }} accessibilityLabel={t('common.familyOnly')} />
          </View>
          {err ? <Txt size={14} color={colors.danger} accessibilityLiveRegion="polite">{err}</Txt> : null}
        </ScrollView>
        <View style={{ paddingBottom: 16 }}><Button label={t('common.save')} icon="check" loading={busy} onPress={save} /></View>
      </KeyboardAvoidingView>
      <Toast text={toast} />
    </Page>
  );
}

const styles = StyleSheet.create({
  input: { height: 52, borderRadius: radius.field, borderWidth: 1, borderColor: colors.field, backgroundColor: colors.paper, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  swatches: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(42,26,20,0.12)' },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.card },
  swatchOn: { borderWidth: 2.5, borderColor: colors.ink },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  trash: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
});
