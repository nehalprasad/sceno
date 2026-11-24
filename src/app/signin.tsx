import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/ui';
import { SignInForm } from '@/components/SignInForm';
import { BackButton } from '@/components/ui';
import { View } from 'react-native';
import { useLang } from '@/i18n';
import { colors } from '@/theme';

/** Sign in with no invite: hosts creating an event, or people coming back on a new phone. */
export default function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { t } = useLang();
  const creating = next === 'create';
  const insets = useSafeAreaInsets();
  return (
    <SignInForm
      after={creating ? { next: 'create' } : {}}
      pitch={creating ? t('welcome.signInCreate') : t('welcome.signInBack')}
      hero={<>
        <View style={{ position: 'absolute', top: insets.top + 8, left: 20 }}><BackButton dark /></View>
        <Txt font="display" size={48} color={colors.ivory} accessibilityRole="header">Sceno</Txt>
        <Txt font="displayItalic" size={22} color={colors.ivory}>{creating ? t('welcome.createTitle') : t('welcome.signInTitle')}</Txt>
      </>}
    />
  );
}
