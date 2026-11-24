import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { LangSheet, Txt, useAsync } from '@/components/ui';
import { Group, Page, Row, TopBar } from '@/components/kit';
import { langName, useLang } from '@/i18n';
import { useSession } from '@/lib/session';
import { auth, Prefs, settings } from '@/services';
import { colors } from '@/theme';

const SUPPORT_WA = 'https://wa.me/910000000000'; // TODO: real support number
const POLICY_URL = 'https://sceno.app/privacy';

export default function Settings() {
  const { t, lang } = useLang();
  const [langOpen, setLangOpen] = useState(false);
  const { setUser } = useSession();
  const { data: p, reload } = useAsync(() => settings.get(), []);
  const set = async (patch: Partial<Prefs>) => { await settings.set(patch); reload(); };

  return (
    <Page>
      <TopBar />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, gap: 20, paddingBottom: 40 }}>
        <Txt font="display" size={34} color={colors.maroon} accessibilityRole="header" style={{ marginTop: 8 }}>{t('settings.title')}</Txt>
        <Group title={t('settings.app')}>
          <Row label={t('profile.language')} value={langName(lang)} onPress={() => setLangOpen(true)} />
          <LangSheet visible={langOpen} onClose={() => setLangOpen(false)} />
          <Row label={t('settings.fullQuality')} sub={t('settings.fullQualitySub')} toggle={!!p?.fullQuality} onToggle={(v) => set({ fullQuality: v })} />
          <Row label={t('settings.wifiOnly')} toggle={!!p?.wifiOnly} onToggle={(v) => set({ wifiOnly: v })} last />
        </Group>
        <Group title={t('settings.notifications')}>
          <Row label={t('settings.waMessages')} toggle={!!p?.waUpdates} onToggle={(v) => set({ waUpdates: v })} />
          <Row label={t('settings.push')} toggle={!!p?.push} onToggle={(v) => set({ push: v })} />
          <Row label={t('settings.mute')} toggle={!!p?.muteDuringEvents} onToggle={(v) => set({ muteDuringEvents: v })} last />
        </Group>
        <Group title={t('settings.privacy')}>
          <Row label={t('profile.findMe')} sub={t('settings.findMeSub')} toggle={!!p?.findMe} onToggle={(v) => set({ findMe: v })} />
          <Row label={t('settings.othersDownload')} toggle={!!p?.othersDownload} onToggle={(v) => set({ othersDownload: v })} last />
        </Group>
        <Group title={t('settings.help')}>
          <Row label={t('settings.support')} sub={t('settings.supportSub')} onPress={() => Linking.openURL(SUPPORT_WA)} />
          <Row label={t('settings.policy')} onPress={() => Linking.openURL(POLICY_URL)} last />
        </Group>
        <Pressable accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }} onPress={() => Alert.alert(t('profile.deleteAcct'), t('profile.deleteConfirm'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('profile.deleteAcct'), style: 'destructive', onPress: async () => { await auth.deleteAccount(); setUser(null); router.replace('/'); } },
        ])}>
          <Txt font="bodySemi" size={14} color={colors.danger}>{t('profile.deleteAcct')}</Txt>
        </Pressable>
        <Txt size={13} color={colors.muted} style={{ textAlign: 'center' }}>{t('settings.version', { v: Constants.expoConfig?.version ?? '1.0' })}</Txt>
      </ScrollView>
    </Page>
  );
}
