import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { Button, Icon, Txt } from '@/components/ui';
import { Page, TopBar } from '@/components/kit';
import { useLang } from '@/i18n';
import { colors, fonts, fontsFor, radius } from '@/theme';
import { inviteCode } from '@/lib/invite';

export default function Scan() {
  const { t, lang } = useLang();
  const [perm, requestPerm] = useCameraPermissions();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const handled = useRef(false);

  function open(raw: string) {
    const code = inviteCode(raw);
    if (!code) return setErr(t('welcome.badCode'));
    handled.current = true;
    router.replace({ pathname: '/join/[code]', params: { code } });
  }

  return (
    <Page>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar />
        <View style={{ paddingTop: 16, gap: 16, flex: 1 }}>
          <Txt font="display" size={34} color={colors.maroon} accessibilityRole="header">{t('welcome.invite')}</Txt>

          <View style={styles.camera}>
            {perm?.granted ? (
              <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => { if (!handled.current) open(data); }} />
            ) : (
              <View style={styles.camEmpty}>
                <Icon name="qr" size={36} color={colors.maroon} />
                <Txt size={15} color={colors.inkSoft} style={{ textAlign: 'center' }}>{t('welcome.cameraWhy')}</Txt>
                <Button label={t('welcome.allowCamera')} icon="camera" height={44} size={14} onPress={requestPerm} />
              </View>
            )}
            {perm?.granted ? <View style={styles.frame} pointerEvents="none" /> : null}
          </View>
          <Txt size={14} color={colors.muted} style={{ textAlign: 'center' }}>{t('welcome.scanHint')}</Txt>

          <View style={{ gap: 6 }}>
            <Txt font="bodySemi" size={14}>{t('welcome.pasteLabel')}</Txt>
            <View style={styles.pasteRow}>
              <TextInput value={text} onChangeText={(v) => { setText(v); setErr(''); }} placeholder="sceno.app/aarav-meera" placeholderTextColor={colors.muted}
                autoCapitalize="none" autoCorrect={false} returnKeyType="go" onSubmitEditing={() => open(text)} accessibilityLabel={t('welcome.pasteLabel')}
                style={[styles.input, { fontFamily: fontsFor(lang).body }, !!err && { borderColor: colors.danger }]} />
              <Button label={t('welcome.paste')} icon="copy" variant="soft" height={52} size={14}
                onPress={async () => { const v = await Clipboard.getStringAsync(); setText(v); if (inviteCode(v)) open(v); }} />
            </View>
            {err ? <Txt size={13} color={colors.danger}>{err}</Txt> : null}
          </View>
          <View style={{ flex: 1 }} />
          <Button label={t('welcome.openInvite')} icon="chevron" disabled={!text.trim()} onPress={() => open(text)} />
        </View>
      </KeyboardAvoidingView>
    </Page>
  );
}

const styles = StyleSheet.create({
  camera: { height: 260, borderRadius: radius.panel, overflow: 'hidden', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  camEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  frame: { position: 'absolute', top: 40, left: '20%', right: '20%', bottom: 40, borderRadius: 20, borderWidth: 3, borderColor: colors.marigold },
  pasteRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, height: 52, borderRadius: radius.field, borderWidth: 1, borderColor: colors.field, backgroundColor: colors.paper, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
});
