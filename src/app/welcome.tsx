import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Icon, IconName, LangToggle, Txt } from '@/components/ui';
import { useLang } from '@/i18n';
import { useSession } from '@/lib/session';
import { auth } from '@/services';
import { colors, radius } from '@/theme';

/** First screen when the app is opened without an invite link (or by a signed-in person with no events). */
export default function Welcome() {
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const { user, setUser } = useSession();

  const choice = (icon: IconName, title: string, sub: string, onPress: () => void, primary?: boolean) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => [styles.choice, primary && styles.primary, pressed && { opacity: 0.88 }]}>
      <View style={[styles.icon, primary && { backgroundColor: 'rgba(251,246,238,0.14)' }]}>
        <Icon name={icon} size={22} color={primary ? colors.ivory : colors.maroon} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt font="bodySemi" size={17} color={primary ? colors.ivory : colors.ink}>{title}</Txt>
        <Txt size={14} color={primary ? '#EAD7CC' : colors.muted}>{sub}</Txt>
      </View>
      <Icon name="chevron" size={20} color={primary ? colors.ivory : colors.muted} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ivory }}>
      <StatusBar style="light" />
      <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
        <View style={{ alignSelf: 'flex-end' }}><LangToggle /></View>
        <View style={{ flex: 1, justifyContent: 'flex-end', gap: 8 }}>
          <Txt font="display" size={64} color={colors.ivory} accessibilityRole="header">Sceno</Txt>
          <Txt font="displayItalic" size={24} color={colors.ivory}>{t('welcome.tagline')}</Txt>
          <Txt size={15} color="#EAD7CC">{t('welcome.pitch')}</Txt>
        </View>
      </View>
      <View style={[styles.body, { paddingBottom: insets.bottom + 20 }]}>
        {choice('plus', t('welcome.create'), t('welcome.createSub'), () => router.push(user ? '/admin/create' : { pathname: '/signin', params: { next: 'create' } }), true)}
        {choice('qr', t('welcome.invite'), t('welcome.inviteSub'), () => router.push('/scan'))}
        {!user ? (
          <Pressable onPress={() => router.push('/signin')} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', padding: 8 }}>
            <Txt size={14} color={colors.muted}>{t('welcome.haveAccount')} <Txt font="bodySemi" size={14} color={colors.maroon}>{t('welcome.signIn')}</Txt></Txt>
          </Pressable>
        ) : (
          <Pressable onPress={async () => { await auth.signOut(); setUser(null); }} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', padding: 8 }}>
            <Txt size={14} color={colors.muted}>{t('welcome.signedInAs', { name: user.name || user.phone })} <Txt font="bodySemi" size={14} color={colors.maroon}>{t('profile.signOut')}</Txt></Txt>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, backgroundColor: colors.maroon, paddingHorizontal: 24, paddingBottom: 32 },
  body: { paddingHorizontal: 20, paddingTop: 24, gap: 12 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.panel, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  primary: { backgroundColor: colors.ink, borderColor: colors.ink },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F6E6D2', alignItems: 'center', justifyContent: 'center' },
});
