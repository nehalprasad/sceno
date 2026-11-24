import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton, Button, LangToggle, Txt } from '@/components/ui';
import { useLang } from '@/i18n';
import { auth, User } from '@/services';
import { limitText } from '@/lib/authErrors';
import type { WaLoginStart } from '@/services/types';
import { colors, fonts, radius } from '@/theme';

const POLL_MS = 2000;
const pretty = (e164: string) => e164.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2');

/** Free login: the guest sends "Sceno code 482913" to our WhatsApp number; we poll until the webhook sees it. */
export function WaLoginWait({ pending, wa, onSignedIn, onUseCode }: {
  pending: { name: string; phone: string };
  wa: WaLoginStart;
  onSignedIn: (u: User) => Promise<unknown>;
  onUseCode: () => Promise<void>;
}) {
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const done = useRef(false);
  const text = `Sceno code ${wa.code}`;

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop || done.current) return;
      try {
        const u = await auth.checkWaLogin(wa.loginId, wa.secret, pending.name, pending.phone);
        if (u && !done.current) { done.current = true; await onSignedIn(u); return; }
      } catch (e) {
        if (/expired|deadline|not-found/.test(String((e as { code?: string }).code ?? e))) { setErr(t('login.waExpired')); return; }
      }
      if (!stop) timer = setTimeout(tick, POLL_MS);
    };
    let timer = setTimeout(tick, POLL_MS);
    return () => { stop = true; clearTimeout(timer); };
  }, [wa.loginId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function open() {
    const url = `https://wa.me/${wa.waNumber}?text=${encodeURIComponent(text)}`;
    try { await Linking.openURL(url); } catch { setErr(t('login.waNoApp', { code: wa.code, number: wa.waNumber })); }
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}><BackButton /><LangToggle /></View>
      <Txt font="display" size={30}>{t('login.waTitle')}</Txt>
      <Txt size={15} color={colors.inkSoft}>
        {t('login.waBody')} {t('login.waFrom', { phone: pretty(pending.phone) })}{' '}
        <Txt font="bodySemi" size={15} color={colors.maroon} onPress={() => router.back()} accessibilityRole="link">{t('login.changeNumber')}</Txt>
      </Txt>
      <View style={styles.card} accessible accessibilityLabel={text}>
        <Txt size={13} color={colors.muted} style={{ fontFamily: fonts.latin.body }}>{`+${wa.waNumber}`}</Txt>
        <Txt font="bodySemi" size={22} style={{ fontFamily: fonts.latin.bodySemi, letterSpacing: 1 }}>{text}</Txt>
      </View>
      <View style={styles.wait} accessibilityLiveRegion="polite">
        {err ? <Txt size={14} color={colors.danger}>{err}</Txt> : <><ActivityIndicator color={colors.maroon} /><Txt size={14} color={colors.inkSoft}>{t('login.waWaiting')}</Txt></>}
      </View>
      <View style={{ flex: 1 }} />
      <Button icon="message" label={t('login.waOpen')} onPress={open} />
      {wa.dev ? <Button icon="check" variant="quiet" label={t('login.waDev')} onPress={() => auth.devVerifyWaLogin(wa.loginId, wa.secret).catch(() => setErr(t('common.somethingWrong')))} /> : null}
      <Button variant="quiet" label={t('login.waUseCode')} loading={busy} onPress={async () => { setBusy(true); try { await onUseCode(); } catch (x) { setErr(limitText(x, t) ?? t('common.somethingWrong')); } finally { setBusy(false); } }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, gap: 16, backgroundColor: colors.ivory },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { padding: 18, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: 4 },
  wait: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 },
});
