import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Button, Chip, Icon, IconName, Txt, useAsync } from '@/components/ui';
import { Page, Sheet, Toast, TopBar, useToast } from '@/components/kit';
import { inviteMessage, ShareSheet } from '@/components/ShareSheet';
import { shareInvite } from '@/lib/shareInvite';
import { useLang } from '@/i18n';
import { dateRange } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { admin, events, people } from '@/services';
import { colors, fonts, fontsFor, radius } from '@/theme';

type Media = 'card' | 'video' | 'none';
const WA_BG = '#E7DED3';
const WA_BUBBLE = '#D9FDD3';

export default function Invite() {
  const { t, l, lang, pn } = useLang();
  const { celebrationId } = useSession();
  const [toast, show] = useToast();
  const { data: c, reload } = useAsync(() => events.get(celebrationId), [celebrationId]);
  const { data: guests } = useAsync(() => people.list(celebrationId), [celebrationId]);
  const { data: stats } = useAsync(() => admin.stats(celebrationId), [celebrationId]);
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Saved on the event, so every share (admin or guest) sends the same card/video and message.
  const media: Media = c?.inviteMedia ? (c.inviteMedia.kind === 'video' ? 'video' : 'card') : 'none';
  const mediaUri = c?.inviteMedia?.url;
  const [qr, setQr] = useState(false);
  const { data: subs } = useAsync(() => events.subEvents(celebrationId), [celebrationId]);
  const [picking, setPicking] = useState(false);
  const [parts, setParts] = useState<string[]>([]);
  const link = admin.inviteLink(c?.joinCode ?? celebrationId);
  const msg = custom ?? (c?.inviteTextI18n ? l(c.inviteTextI18n) : c?.inviteText) ?? (c ? inviteMessage(t, l, c) : '');
  const pending = (guests ?? []).filter((g) => !g.joined);

  async function choose(m: Media) {
    if (m === 'none') { setSaving(true); await admin.setInvite(celebrationId, { clearMedia: true }).finally(() => setSaving(false)); return reload(); }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [m === 'card' ? 'images' : 'videos'], videoMaxDuration: 30, quality: 0.85 });
    if (r.canceled) return;
    setSaving(true);
    try { await admin.setInvite(celebrationId, { mediaUri: r.assets[0].uri, kind: m === 'card' ? 'image' : 'video' }); reload(); }
    catch { show(t('common.somethingWrong')); }
    finally { setSaving(false); }
  }
  async function saveText() {
    setEditing(false);
    if (custom != null && custom !== c?.inviteText) await admin.setInvite(celebrationId, { text: custom.trim() || null }).catch(() => {});
  }
  async function share() {
    try { if (await shareInvite(`${msg}\n${link}`, c?.inviteMedia)) show(t('invite.captionCopied')); }
    catch { show(t('common.somethingWrong')); }
  }

  async function sharePartsLink() {
    if (!parts.length) return show(t('access.pickOne'));
    try {
      const partsLink = await admin.createPartsInvite(celebrationId, parts);
      setPicking(false); setParts([]);
      if (await shareInvite(`${msg}\n${partsLink}`, c?.inviteMedia)) show(t('invite.captionCopied'));
    } catch { show(t('common.somethingWrong')); }
  }

  const opt = (m: Media, icon: IconName, title: string, sub: string) => (
    <Pressable key={m} onPress={() => choose(m)} accessibilityRole="radio" accessibilityState={{ selected: media === m }}
      style={[styles.opt, media === m && styles.optOn]}>
      <Icon name={icon} size={20} color={media === m ? colors.ivory : colors.maroon} />
      <Txt font="bodySemi" size={14} color={media === m ? colors.ivory : colors.ink}>{title}</Txt>
      <Txt size={12} color={media === m ? '#E9D9CE' : colors.muted}>{sub}</Txt>
    </Pressable>
  );

  return (
    <Page>
      <TopBar />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, gap: 16, paddingBottom: 32 }}>
        <Txt font="display" size={34} color={colors.maroon} accessibilityRole="header" style={{ marginTop: 8 }}>{t('invite.title')}</Txt>
        <Txt font="bodySemi" size={14}>{t('invite.yours')}</Txt>
        <View style={styles.opts} accessibilityRole="radiogroup">
          {opt('card', 'images', t('invite.card'), t('invite.cardSub'))}
          {opt('video', 'camera', t('invite.video'), media === 'video' ? t('invite.videoSub') : t('create.videoSub'))}
          {opt('none', 'sparkle', t('invite.none'), t('invite.noneSub'))}
        </View>

        <Txt font="bodySemi" size={14}>{t('invite.preview')}</Txt>
        <View style={styles.wa}>
          <View style={styles.bubble}>
            {saving ? <View style={[styles.media, styles.center]}><ActivityIndicator color={colors.maroon} /></View> :
              mediaUri && media === 'card' ? <Image source={{ uri: mediaUri }} style={styles.media} contentFit="contain" /> :
              <View style={[styles.media, { backgroundColor: c?.coverAccent ?? colors.maroon, alignItems: 'center', justifyContent: 'center' }]}>
                {media === 'video' ? <View style={styles.play}><Icon name="camera" size={22} color={colors.ivory} /><Txt font="bodySemi" size={12} color={colors.ivory}>{t('invite.video')}</Txt></View> : null}
                <Txt font="display" size={26} color={colors.ivory}>{c ? l(c.title) : ''}</Txt>
              </View>}
            {editing ? (
              <TextInput value={msg} onChangeText={setCustom} multiline autoFocus onBlur={saveText}
                style={{ fontSize: 15, color: colors.ink, fontFamily: fontsFor(lang).body, minHeight: 80 }} />
            ) : <Txt size={15}>{msg}</Txt>}
            <Txt size={14} color="#027EB5">{link}</Txt>
          </View>
        </View>
        <View style={styles.row3}>
          <Button label={t('invite.editMsg')} icon="edit" variant="soft" height={40} size={13} style={{ flex: 1 }} onPress={() => setEditing(true)} />
          <Button label={t('invite.copy')} icon="copy" variant="soft" height={40} size={13} style={{ flex: 1 }} onPress={async () => { await Clipboard.setStringAsync(`${msg}\n${link}`); show(t('invite.copied')); }} />
          <Button label={t('invite.saveQr')} icon="qr" variant="soft" height={40} size={13} style={{ flex: 1 }} onPress={() => setQr(true)} />
        </View>
        <Button label={t('invite.share')} icon="message" disabled={saving} onPress={share} />
        <Txt size={13} color={colors.muted} style={{ textAlign: 'center' }}>{t('invite.shareHint')}</Txt>
        <Button label={t('access.chosen')} icon="users" variant="outline" onPress={() => setPicking(true)} />

        <View style={styles.stats}>
          <View style={styles.stat}><Txt size={13} color={colors.muted}>{t('invite.joined')}</Txt><Txt font="bodySemi" size={22} style={{ fontVariant: ['tabular-nums'] }}>{(stats?.guests ?? 0).toLocaleString('en-IN')}</Txt></View>
          <View style={styles.stat}><Txt size={13} color={colors.muted}>{t('invite.uploaded')}</Txt><Txt font="bodySemi" size={22} style={{ fontVariant: ['tabular-nums'] }}>{(stats?.uploaders ?? 0).toLocaleString('en-IN')}</Txt></View>
        </View>
        <View style={styles.pending}>
          <Txt size={14} style={{ flex: 1 }}>{t('invite.notJoined')}</Txt>
          <Button label={t('invite.remind', { count: pending.length })} icon="message" variant="outline" height={40} size={13}
            disabled={!pending.length} onPress={async () => { const k = await people.remind(celebrationId, pending.map((g) => g.id)); show(t('invite.remind', { count: k })); }} />
        </View>
        <Txt size={13} color={colors.muted}>{t('invite.guestsInvite')}</Txt>
      </ScrollView>
      <Sheet visible={picking} onClose={() => setPicking(false)}>
        <Txt font="display" size={24}>{t('access.chosen')}</Txt>
        <Txt size={14} color={colors.muted}>{t('access.chosenSub')}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(subs ?? []).filter((x) => !x.private).map((x) => (
            <Chip key={x.id} label={pn(x.name)} active={parts.includes(x.id)}
              onPress={() => setParts((p) => (p.includes(x.id) ? p.filter((y) => y !== x.id) : [...p, x.id]))} />
          ))}
        </View>
        <Button label={t('access.shareLink')} icon="message" disabled={!parts.length} onPress={sharePartsLink} />
      </Sheet>
      {c ? <ShareSheet c={c} visible={qr} onClose={() => setQr(false)} onToast={show} /> : null}
      <Toast text={toast} />
    </Page>
  );
}

const styles = StyleSheet.create({
  opts: { flexDirection: 'row', gap: 8 },
  opt: { flex: 1, padding: 12, gap: 4, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  optOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  wa: { backgroundColor: WA_BG, borderRadius: radius.card, padding: 12 },
  bubble: { backgroundColor: WA_BUBBLE, borderRadius: 12, padding: 8, gap: 8, maxWidth: '92%' },
  media: { height: 150, borderRadius: 8, backgroundColor: colors.ivory },
  center: { alignItems: 'center', justifyContent: 'center' },
  play: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  row3: { flexDirection: 'row', gap: 8 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 8 },
  stat: { flex: 1, padding: 14, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
});
