import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { shareInvite } from '@/lib/shareInvite';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Button, Txt } from '@/components/ui';
import { Sheet } from '@/components/kit';
import { useLang } from '@/i18n';
import { dateRange } from '@/lib/dates';
import { admin, Celebration } from '@/services';
import { colors, radius } from '@/theme';

/** The invite message every share uses, so admins and guests send the same text. */
export function inviteMessage(t: ReturnType<typeof useLang>['t'], l: ReturnType<typeof useLang>['l'], c: Celebration) {
  const kind = ['wedding', 'birthday', 'party', 'corporate', 'trip'].includes(c.kind ?? '') ? c.kind : 'other';
  // Names are shown exactly as the host typed them (no translation).
  return t(`inviteMsg.${kind}`, { name: c.title.en, dates: dateRange(t, new Date(c.startsAt), new Date(c.endsAt)), city: l(c.city) });
}

/** A printable QR card: title, dates, QR. Captured to an image for Save QR. */
export function QrCard({ c, cardRef }: { c: Celebration; cardRef?: React.RefObject<React.ComponentRef<typeof View> | null> }) {
  const { t, l } = useLang();
  return (
    <View ref={cardRef} collapsable={false} style={styles.card}>
      <Txt font="displayItalic" size={18} color={colors.maroon}>{t('join.invitedTo')}</Txt>
      <Txt font="display" size={30} style={{ textAlign: 'center' }}>{l(c.title)}</Txt>
      <Txt size={13} color={colors.muted}>{dateRange(t, new Date(c.startsAt), new Date(c.endsAt))} · {l(c.city)}</Txt>
      <View style={styles.qr}>
        <QRCode value={admin.inviteLink(c.id)} size={200} color={colors.ink} backgroundColor={colors.paper} />
      </View>
      <Txt font="bodySemi" size={13} color={colors.muted}>{t('invite.qrScan')}</Txt>
      <Txt font="bodySemi" size={12} color={colors.maroon}>sceno.app/{c.id}</Txt>
    </View>
  );
}

/** Bottom sheet with the QR card plus Share and Save. Used by admins (Invite) and guests (Home). */
export function ShareSheet({ c, visible, onClose, onToast }: { c: Celebration; visible: boolean; onClose: () => void; onToast: (s: string) => void }) {
  const { t, l } = useLang();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const link = admin.inviteLink(c.id);

  async function save() {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) return onToast(t('upload.permission'));
    try {
      const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
      await MediaLibrary.saveToLibraryAsync(uri);
      onClose();
      onToast(t('invite.qrSaved'));
    } catch (e) {
      console.warn('save QR failed', e);
      onClose();
      onToast(t('common.somethingWrong'));
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <QrCard c={c} cardRef={ref} />
      {c.inviteMedia?.kind === 'image' ? <Image source={{ uri: c.inviteMedia.url }} style={styles.card2} contentFit="contain" /> : null}
      <Button label={t('invite.share')} icon="message" onPress={async () => {
        try {
          const copied = await shareInvite(`${c.inviteText ?? inviteMessage(t, l, c)}\n${link}`, c.inviteMedia);
          if (copied) { onClose(); onToast(t('invite.captionCopied')); }
        } catch { onToast(t('common.somethingWrong')); }
      }} />
      <Button label={t('invite.saveQr')} icon="download" variant="outline" onPress={save} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 6, padding: 20, borderRadius: radius.panel, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  card2: { height: 120, borderRadius: radius.card, backgroundColor: colors.paper },
  qr: { marginVertical: 10, padding: 12, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
});
