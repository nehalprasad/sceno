import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, View } from 'react-native';
import { Button, Txt } from '@/components/ui';
import { useLang } from '@/i18n';
import { limitText } from '@/lib/authErrors';
import { auth } from '@/services';
import type { WaLoginStart } from '@/services/types';
import { colors, fonts, radius } from '@/theme';

/**
 * "Confirm it is you" before permanent deletes: the admin sends a fresh WhatsApp code.
 * On success the server allows deletes for 5 minutes and `onVerified` runs (retry the delete there).
 */
export function ReverifyModal({ visible, onVerified, onCancel }: { visible: boolean; onVerified: () => void; onCancel: () => void }) {
  const { t } = useLang();
  const [wa, setWa] = useState<WaLoginStart | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!visible) { setWa(null); setErr(''); return; }
    auth.startReverify().then(setWa, (e) => setErr(limitText(e, t) ?? t('common.somethingWrong')));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!wa) return;
    let stop = false;
    const tick = async () => {
      try { if (await auth.checkReverify(wa.loginId, wa.secret)) { if (!stop) onVerified(); return; } }
      catch (e) { setErr(limitText(e, t) ?? t('login.waExpired')); return; }
      if (!stop) timer = setTimeout(tick, 2000);
    };
    let timer = setTimeout(tick, 2000);
    return () => { stop = true; clearTimeout(timer); };
  }, [wa]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = wa ? `Sceno code ${wa.code}` : '';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Txt font="display" size={26} accessibilityRole="header">{t('reverify.title')}</Txt>
          <Txt size={15} color={colors.inkSoft}>{t('reverify.body')}</Txt>
          {wa ? (
            <View style={styles.card} accessible accessibilityLabel={text}>
              <Txt size={13} color={colors.muted} style={{ fontFamily: fonts.latin.body }}>{`+${wa.waNumber}`}</Txt>
              <Txt font="bodySemi" size={20} style={{ fontFamily: fonts.latin.bodySemi, letterSpacing: 1 }}>{text}</Txt>
            </View>
          ) : null}
          <View style={styles.wait} accessibilityLiveRegion="polite">
            {err ? <Txt size={14} color={colors.danger}>{err}</Txt> : <><ActivityIndicator color={colors.maroon} /><Txt size={14} color={colors.inkSoft}>{t('reverify.waiting')}</Txt></>}
          </View>
          {wa ? <Button icon="message" label={t('login.waOpen')} onPress={() => Linking.openURL(`https://wa.me/${wa.waNumber}?text=${encodeURIComponent(text)}`).catch(() => setErr(t('login.waNoApp', { code: wa.code, number: wa.waNumber })))} /> : null}
          {wa?.dev ? <Button icon="check" variant="quiet" label={t('login.waDev')} onPress={() => auth.devVerifyWaLogin(wa.loginId, wa.secret).catch(() => setErr(t('common.somethingWrong')))} /> : null}
          <Button variant="quiet" label={t('reverify.cancel')} onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.ivory, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: 24, paddingBottom: 40, gap: 14 },
  card: { padding: 16, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: 4 },
  wait: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 },
});
