import { useState } from 'react';
import { DateField } from '@/components/DateField';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Button, Chip, Icon, Txt } from '@/components/ui';
import { Page, Toast, TopBar, useToast } from '@/components/kit';
import { useLang } from '@/i18n';
import { useSession } from '@/lib/session';
import { admin } from '@/services';
import { colors, fonts, fontsFor, radius } from '@/theme';

const WEDDING_PARTS = ['Mehendi', 'Haldi', 'Sangeet', 'Pheras', 'Reception'];
const KINDS = ['wedding', 'birthday', 'party', 'corporate', 'trip', 'other'] as const;

export default function Create() {
  const { t, lang } = useLang();
  const { setCelebrationId } = useSession();
  const [toast, show] = useToast();
  const [kind, setKind] = useState<(typeof KINDS)[number]>('wedding');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [cover, setCover] = useState<'photo' | 'video'>('photo');
  const [coverUri, setCoverUri] = useState<string>();
  const [priv, setPriv] = useState(false);
  const [parts, setParts] = useState<string[]>([]);
  const togglePart = (p: string) => setParts((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));
  const [date, setDate] = useState<Date>();
  const [dateErr, setDateErr] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const font = { fontFamily: fontsFor(lang).body };

  async function pickCover(kind: 'photo' | 'video') {
    setCover(kind);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [kind === 'photo' ? 'images' : 'videos'], videoMaxDuration: 30 });
    if (!r.canceled) setCoverUri(r.assets[0].uri);
  }
  async function create() {
    if (!name.trim()) return setErr(t('create.errName'));
    if (!date) return setDateErr(t('create.errDate'));
    setBusy(true);
    try {
      const endOfDay = (d: Date) => { const e = new Date(d); e.setHours(23, 59, 0, 0); return e; };
      const start = new Date(date); start.setHours(kind === 'wedding' ? 16 : 18, 0, 0, 0);
      const c = await admin.create({ kind, name: name.trim(), city: city.trim(), private: priv, startsAt: start.toISOString(), endsAt: endOfDay(start).toISOString(), parts: kind === 'wedding' ? parts : undefined });
      // The card/video picked here becomes the invite everyone shares.
      if (coverUri) {
        await admin.setInvite(c.id, { mediaUri: coverUri, kind: cover === 'video' ? 'video' : 'image' })
          .catch(() => Alert.alert(t('create.coverFailed'), t('create.coverFailedSub')));
      }
      setCelebrationId(c.id); show(t('create.created'));
      router.replace('/admin'); // next: set each part's time and place, then invite
    } finally { setBusy(false); }
  }

  return (
    <Page>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, gap: 18, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <Txt font="display" size={34} color={colors.maroon} accessibilityRole="header" style={{ marginTop: 8 }}>{t('create.title')}</Txt>
          <View style={{ gap: 8 }}>
            <Txt font="bodySemi" size={14}>{t('create.kind')}</Txt>
            <View style={styles.wrap}>{KINDS.map((k) => <Chip key={k} label={t(`create.kinds.${k}`)} active={kind === k} onPress={() => setKind(k)} />)}</View>
            {kind === 'wedding' ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                <Txt font="bodySemi" size={14}>{t('create.parts')}</Txt>
                <View style={styles.wrap}>
                  {WEDDING_PARTS.map((p) => <Chip key={p} label={(parts.includes(p) ? '✓ ' : '') + p} active={parts.includes(p)} onPress={() => togglePart(p)} />)}
                </View>
              </View>
            ) : null}
            <Txt size={13} color={colors.muted}>{kind === 'wedding' ? t('create.weddingHint') : t('create.otherHint')}</Txt>
          </View>
          <View style={{ gap: 6 }}>
            <Txt font="bodySemi" size={14}>{t('create.name')}</Txt>
            <TextInput value={name} onChangeText={(v) => { setName(v); setErr(''); }} placeholder={t('create.namePh')} placeholderTextColor={colors.muted}
              style={[styles.input, font, !!err && { borderColor: colors.danger }]} accessibilityLabel={t('create.name')} />
            {err ? <Txt size={13} color={colors.danger}>{err}</Txt> : null}
          </View>
          <View style={{ gap: 6 }}>
            <DateField label={t('create.date')} mode="date" value={date} onChange={(d) => { setDate(d); setDateErr(''); }} />
            {dateErr ? <Txt size={13} color={colors.danger}>{dateErr}</Txt> : null}
          </View>
          <View style={{ gap: 6 }}>
            <Txt font="bodySemi" size={14}>{t('create.city')}</Txt>
            <TextInput value={city} onChangeText={setCity} placeholder="Jaipur" placeholderTextColor={colors.muted} style={[styles.input, font]} accessibilityLabel={t('create.city')} />
          </View>
          <View style={{ gap: 8 }}>
            <Txt font="bodySemi" size={14}>{t('create.cover')}</Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label={t('create.photoCard')} icon="images" variant={cover === 'photo' ? 'ink' : 'soft'} height={48} size={14} style={{ flex: 1 }} onPress={() => pickCover('photo')} />
              <Button label={`${t('create.video')} · ${t('create.videoSub')}`} icon="camera" variant={cover === 'video' ? 'ink' : 'soft'} height={48} size={13} style={{ flex: 1.3 }} onPress={() => pickCover('video')} />
            </View>
            {coverUri ? <View style={styles.picked}><Icon name="check" size={16} color={colors.maroon} /><Txt size={13} color={colors.maroon}>{cover === 'photo' ? t('create.photoCard') : t('create.video')}</Txt></View> : null}
          </View>
          <View style={styles.toggle}>
            <Icon name="lock" size={20} color={colors.maroon} />
            <View style={{ flex: 1 }}>
              <Txt font="bodySemi" size={15}>{t('create.private')}</Txt>
              <Txt size={13} color={colors.muted}>{t('create.privateSub')}</Txt>
            </View>
            <Switch value={priv} onValueChange={setPriv} trackColor={{ true: colors.maroon, false: colors.lineStrong }} accessibilityLabel={t('create.private')} />
          </View>
        </ScrollView>
        <View style={{ paddingBottom: 16 }}><Button label={t('create.create')} icon="qr" loading={busy} onPress={create} /></View>
      </KeyboardAvoidingView>
      <Toast text={toast} />
    </Page>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { height: 52, borderRadius: radius.field, borderWidth: 1, borderColor: colors.field, backgroundColor: colors.paper, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  picked: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
});
