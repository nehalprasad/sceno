import { fontsReady } from '@/i18n';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  CormorantGaramond_600SemiBold, CormorantGaramond_600SemiBold_Italic, CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { NotoSerifDevanagari_600SemiBold, NotoSerifDevanagari_700Bold } from '@expo-google-fonts/noto-serif-devanagari';
import {
  NotoSansDevanagari_400Regular, NotoSansDevanagari_500Medium, NotoSansDevanagari_600SemiBold, NotoSansDevanagari_700Bold,
} from '@expo-google-fonts/noto-sans-devanagari';
import { SessionProvider, useSession } from '@/lib/session';
import { usePush } from '@/lib/push';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_600SemiBold, CormorantGaramond_600SemiBold_Italic, CormorantGaramond_700Bold,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    NotoSerifDevanagari_600SemiBold, NotoSerifDevanagari_700Bold,
    NotoSansDevanagari_400Regular, NotoSansDevanagari_500Medium, NotoSansDevanagari_600SemiBold, NotoSansDevanagari_700Bold,
  });
  const [scriptReady, setScriptReady] = useState(false);
  useEffect(() => { fontsReady.then(() => setScriptReady(true)); }, []);
  const { ready, user } = useSession();
  usePush(user?.id);
  useEffect(() => {
    if (fontsLoaded && scriptReady && ready) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, scriptReady, ready]);
  if (!fontsLoaded || !scriptReady || !ready) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }}>
        <Stack.Screen name="photo/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack>
    </>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Root />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
