import { ReactNode, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Button, Chip, Txt } from '@/components/ui';
import { LANGS, useLang } from '@/i18n';
import { AfterSignIn, useSession } from '@/lib/session';
import { auth } from '@/services';
import { isLimit, limitText } from '@/lib/authErrors';
import { colors, fonts, fontsFor, radius } from '@/theme';

/**
 * Maroon hero + name/phone form. Used by Join (invited guests) and Sign in (hosts, returning people).
 * `after` says what happens once the code is verified.
 */
export function SignInForm({ hero, pitch, after }: { hero: ReactNode; pitch: string; after: AfterSignIn }) {
  const { t, lang, setLang } = useLang();
  const insets = useSafeAreaInsets();
  const { setPending } = useSession();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<{ name?: string; phone?: string; send?: string }>({});
  const [busy, setBusy] = useState(false);
  const phoneRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  async function submit() {
    const e: typeof err = {};
    if (!name.trim()) e.name = t('join.errName');
    if (!/^[6-9]\d{9}$/.test(digits)) e.phone = t('join.errPhone');
    setErr(e);
    if (e.name || e.phone) return;
    setBusy(true);
    try {
      const e164 = `+91${digits}`;
      // Free path first: the guest sends us the code on WhatsApp. Typed code (paid send) is the fallback.
      const wa = await auth.startWaLogin(e164, name.trim()).catch((x) => { if (isLimit(x)) throw x; return null; });
      if (wa) setPending({ name: name.trim(), phone: e164, requestId: '', channel: 'whatsapp', wa, ...after });
      else {
        const r = await auth.requestOtp(e164, 'whatsapp');
        setPending({ name: name.trim(), phone: e164, requestId: r.requestId, channel: r.channel, ...after });
      }
      router.push('/login');
    } catch (x) {
      setErr({ send: limitText(x, t) ?? t('common.somethingWrong') });
    } finally {
      setBusy(false);
    }
  }
  const field = (bad?: string) => [styles.input, { fontFamily: fontsFor(lang).body }, bad && { borderColor: colors.danger, borderWidth: 1.5 }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ivory }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        <View style={[styles.hero, { paddingTop: insets.top + 96 }]}>{hero}</View>
        <View style={styles.form}>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('join.language')} style={styles.langs}>
            {LANGS.map((x) => <Chip key={x.code} label={x.name} active={lang === x.code} onPress={() => setLang(x.code)} lang={x.code} />)}
          </View>
          <Txt size={15} color={colors.inkSoft}>{pitch}</Txt>
          <View style={styles.label}>
            <Txt font="bodySemi" size={14} nativeID="nameLabel">{t('join.name')}</Txt>
            <TextInput accessibilityLabelledBy="nameLabel" value={name} onChangeText={setName} placeholder={t('join.namePlaceholder')}
              placeholderTextColor={colors.muted} autoComplete="name" textContentType="name" returnKeyType="next" submitBehavior="submit"
              onSubmitEditing={() => phoneRef.current?.focus()} style={field(err.name)} />
            {err.name ? <Txt size={13} color={colors.danger}>{err.name}</Txt> : null}
          </View>
          <View style={styles.label}>
            <Txt font="bodySemi" size={14} nativeID="phoneLabel">{t('join.phone')}</Txt>
            <View style={[styles.phoneRow, ...field(err.phone)]}>
              <Txt size={16} color={colors.muted}>+91</Txt>
              <TextInput ref={phoneRef} accessibilityLabelledBy="phoneLabel" returnKeyType="send" value={phone} onChangeText={setPhone} placeholder={t('join.phonePh')}
                placeholderTextColor={colors.muted} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber"
                style={{ flex: 1, height: '100%', fontSize: 16, color: colors.ink, fontFamily: fonts.latin.body }} onSubmitEditing={submit} />
            </View>
            {err.phone ? <Txt size={13} color={colors.danger}>{err.phone}</Txt> : null}
          </View>
          {err.send ? <Txt size={13} color={colors.danger}>{err.send}</Txt> : null}
          <Button icon="message" label={busy ? t('join.sending') : t('join.send')} loading={busy} onPress={submit} />
          <Txt size={13} color={colors.muted} style={{ textAlign: 'center' }}>{t('join.privacy')}</Txt>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.maroon, paddingHorizontal: 24, paddingBottom: 28, gap: 6 },
  form: { paddingHorizontal: 24, paddingTop: 20, gap: 16 },
  langs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  label: { gap: 6 },
  input: { height: 52, borderRadius: radius.field, borderWidth: 1, borderColor: colors.field, backgroundColor: colors.paper, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
