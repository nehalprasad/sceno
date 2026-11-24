import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Href, Redirect, router, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName, Txt } from '@/components/ui';

const ICONS: Record<string, IconName> = { home: 'home', itinerary: 'list', upload: 'upload', album: 'images', profile: 'user' };
import { useLang } from '@/i18n';
import { useSession } from '@/lib/session';
import { startUploadQueue } from '@/lib/uploadQueue';
import { colors } from '@/theme';

/** Text-only tab bar from the design: active label in maroon semibold. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BarProps = { state: { index: number; routes: { key: string; name: string }[] }; navigation: any };
function Bar({ state }: BarProps) {
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]} accessibilityRole="tablist">
      {state.routes.map((r, i) => {
        const on = state.index === i;
        return (
          <Pressable key={r.key} accessibilityRole="tab" accessibilityState={{ selected: on }}
            onPress={() => { if (!on) router.navigate(`/${r.name}` as Href); }} style={styles.tab}>
            <Icon name={ICONS[r.name]} size={22} color={on ? colors.maroon : colors.muted} />
            <Txt font={on ? 'bodySemi' : 'body'} size={12} color={on ? colors.maroon : colors.muted}>{t(`tabs.${r.name}`)}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { user, celebrationId } = useSession();
  useEffect(() => { if (user) startUploadQueue(); }, [user]); // resumes uploads saved before the app closed
  if (!user || !celebrationId) return <Redirect href="/welcome" />;
  return (
    <Tabs tabBar={(p) => <Bar {...(p as unknown as BarProps)} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.ivory } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="itinerary" />
      <Tabs.Screen name="upload" />
      <Tabs.Screen name="album" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper, paddingTop: 8, paddingHorizontal: 8 },
  tab: { flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
});
