import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton, Button, LangToggle, Txt } from '@/components/ui';
import { useLang } from '@/i18n';
import { useSession } from '@/lib/session';
import { auth, events, firebaseEnabled } from '@/services';
import { colors, fonts, radius } from '@/theme';
import { WaLoginWait } from '@/components/WaLoginWait';
import { limitText } from '@/lib/authErrors';
import type { User } from '@/services';

const LEN = 6;
// Mocks accept any code; the emulator's dev mode always sends 123456; production shows no hint.
const DEMO_HINT = !firebaseEnabled ? 'login.hint' : process.env.EXPO_PUBLIC_USE_EMULATOR === '1' ? 'login.hintDev' : '';
const pretty = (e164: string) => e164.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2');

export default function Login() {
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const { pending, setPending, setUser, setCelebrationId, chooseEvent } = useSession();
  const [code, setCode] = useState('');
  const [secs, setSecs] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    const id = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  if (!pending) return <Redirect href="/" />;

  async function verify(c = code) {
    if (c.length !== LEN) return;
    setBusy(true); setErr('');
    try {
      await finish(await auth.verifyOtp(pending!.requestId, c, pending!.name, pending!.phone));
    } catch (x) {
      setErr((x as Error).message === 'expired' ? t('login.expiredCode') : t('login.errCode'));
    } finally {
      setBusy(false);
    }
  }
  async function finish(u: User) {
    const p = pending!;
    setUser(u); setPending(null);
    if (p.joinId) {
      await events.join(p.joinId, p.invite).catch(() => {}); // become a member of the invited event
      setCelebrationId(p.joinId);
      return router.replace('/home');
    }
    const cid = await chooseEvent();
    if (p.next === 'create') return router.replace('/admin/create');
    router.replace(cid ? '/home' : '/welcome');
  }
  async function resend(channel: 'whatsapp' | 'sms') {
    let r;
    try { r = await auth.requestOtp(pending!.phone, channel); } catch (x) { setErr(limitText(x, t) ?? t('common.somethingWrong')); return; }
    setPending({ ...pending!, requestId: r.requestId, channel: r.channel });
    setSecs(r.resendAfterSec); setCode(''); setErr('');
    input.current?.focus();
  }
  const time = `0:${String(secs).padStart(2, '0')}`;

  if (pending.wa) {
    return <WaLoginWait pending={pending} wa={pending.wa} onSignedIn={finish}
      onUseCode={async () => { const r = await auth.requestOtp(pending.phone, 'whatsapp'); setPending({ ...pending, wa: undefined, requestId: r.requestId, channel: r.channel }); setSecs(r.resendAfterSec); }} />;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ivory }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.wrap, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.top}>
          <BackButton />
          <LangToggle />
        </View>
        <Txt font="display" size={38} accessibilityRole="header" style={{ marginTop: 16 }}>{t('login.title')}</Txt>
        <Txt size={15} color={colors.inkSoft}>
          {t(pending.channel === 'sms' ? 'login.sentToSms' : 'login.sentTo', { phone: pretty(pending.phone) })}{' '}
          <Txt font="bodySemi" size={15} color={colors.maroon} onPress={() => router.back()} accessibilityRole="link">{t('login.changeNumber')}</Txt>
        </Txt>

        {/* One real input (for OS one-time-code autofill) drawn as six boxes. */}
        <Pressable onPress={() => input.current?.focus()} style={styles.boxes} accessible={false}>
          {Array.from({ length: LEN }, (_, i) => {
            const filled = i < code.length;
            const active = i === Math.min(code.length, LEN - 1) && code.length < LEN;
            return (
              <View key={i} style={[styles.box, filled && styles.boxFilled, active && styles.boxActive, !!err && styles.boxErr]}>
                <Txt font="bodySemi" size={24} style={{ fontFamily: fonts.latin.bodySemi }}>{code[i] ?? ''}</Txt>
              </View>
            );
          })}
          <TextInput
            ref={input} value={code} autoFocus maxLength={LEN} keyboardType="number-pad"
            textContentType="oneTimeCode" autoComplete="sms-otp" accessibilityLabel={t('login.title')}
            onChangeText={(v) => { const c = v.replace(/\D/g, '').slice(0, LEN); setCode(c); setErr(''); if (c.length === LEN) verify(c); }}
            style={styles.hidden} caretHidden
          />
        </Pressable>
        <Txt size={14} color={err ? colors.danger : colors.muted} accessibilityLiveRegion="polite">{err || (DEMO_HINT ? `${t('login.autofill')} ${t(DEMO_HINT)}` : t('login.autofill'))}</Txt>

        <View style={styles.resend}>
          <Txt size={14} color={colors.inkSoft}>{secs > 0 ? t('login.resendIn', { time }) : t('login.resendReady')}</Txt>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button label={t('login.resendWhatsApp')} icon="message" variant="quiet" height={40} size={14} disabled={secs > 0} onPress={() => resend('whatsapp')} />
            <Button label={t('login.sendSms')} icon="restore" variant="quiet" height={40} size={14} disabled={secs > 0} onPress={() => resend('sms')} />
          </View>
        </View>

        <View style={{ flex: 1 }} />
        <Button icon="check" label={busy ? t('login.verifying') : t(pending.next === 'create' ? 'login.verifyCreate' : 'login.verify')} loading={busy} disabled={code.length !== LEN} onPress={() => verify()} />
        <Txt size={13} color={colors.muted} style={{ textAlign: 'center' }}>{t('login.stay')}</Txt>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, gap: 16 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  boxes: { flexDirection: 'row', gap: 8, marginTop: 8 },
  box: { flex: 1, height: 60, borderRadius: radius.field, borderWidth: 1, borderColor: colors.field, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  boxFilled: { borderWidth: 1.5, borderColor: colors.ink },
  boxActive: { borderWidth: 2, borderColor: colors.maroon, shadowColor: colors.maroon, shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  boxErr: { borderColor: colors.danger },
  hidden: { position: 'absolute', opacity: 0.011, width: '100%', height: '100%', color: 'transparent' },
  resend: { padding: 16, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: 10 },
});
