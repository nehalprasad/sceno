import { useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Button, Icon, LangSheet, PhotoTile, RoundButton, Txt, useAsync } from '@/components/ui';
import { Group, Page, Row, TopBar } from '@/components/kit';
import { langName, useLang } from '@/i18n';
import { initials, useSession } from '@/lib/session';
import { auth, events, settings, uploads } from '@/services';
import { colors, eventAccents, radius } from '@/theme';

export default function Profile() {
  const { t, lang } = useLang();
  const [langOpen, setLangOpen] = useState(false);
  const { user, setUser, celebrationId } = useSession();
  const { data: mine } = useAsync(() => uploads.mine(celebrationId, user?.id ?? ''), [user?.id]);
  const { data: evs } = useAsync(() => events.listMine(), []);
  const { data: prefs, reload } = useAsync(() => settings.get(), []);
  if (!user) return null;
  const set = async (k: 'waUpdates' | 'findMe', v: boolean) => { await settings.set({ [k]: v }); reload(); };

  function editName() {
    Alert.prompt(t('profile.namePrompt'), undefined, async (v) => { if (v?.trim()) { setUser({ ...user!, name: v.trim() }); const u = await auth.updateProfile({ name: v.trim() }); if (u) setUser(u); } }, 'plain-text', user!.name);
  }
  async function pickAvatar() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (r.canceled) return;
    setUser({ ...user!, avatar: r.assets[0].uri }); // show at once, then swap in the Storage URL
    const u = await auth.updateProfile({ avatarUri: r.assets[0].uri }).catch(() => null);
    if (u) setUser(u);
  }
  async function signOut() {
    await auth.signOut(); setUser(null); router.replace('/');
  }
  function del() {
    Alert.alert(t('profile.deleteAcct'), t('profile.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.deleteAcct'), style: 'destructive', onPress: async () => { await auth.deleteAccount(); setUser(null); router.replace('/'); } },
    ]);
  }

  return (
    <Page>
      <TopBar left={<Txt font="display" size={30} color={colors.maroon} accessibilityRole="header">{t('tabs.profile')}</Txt>} right={<RoundButton icon="settings" label={t('profile.settings')} onPress={() => router.push('/settings')} />} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, gap: 20, paddingBottom: 40 }}>
        <View style={styles.who}>
          <Pressable onPress={pickAvatar} accessibilityRole="button" accessibilityLabel={t('profile.changePhoto')} style={({ pressed }) => pressed && { opacity: 0.85 }}>
            <View style={styles.avatar}>
              {user.avatar ? <Image source={{ uri: user.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" /> :
                <Txt font="display" size={30} color={colors.ivory}>{initials(user.name)}</Txt>}
            </View>
            <View style={styles.camBadge}><Icon name="camera" size={14} color={colors.ink} /></View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Pressable onPress={editName} accessibilityRole="button" accessibilityLabel={t('profile.editName')} hitSlop={6} style={styles.nameRow}>
              <Txt font="display" size={28} numberOfLines={2} style={{ flexShrink: 1 }}>{user.name}</Txt>
              <Icon name="edit" size={16} color={colors.muted} />
            </Pressable>
            <Txt size={14} color={colors.muted}>{user.phone.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2')}</Txt>
          </View>
        </View>

        <View style={styles.stats}>
          {[[mine?.length ?? 0, t('profile.uploads')], [evs?.length ?? 0, t('profile.events')]].map(([n, label]) => (
            <View key={String(label)} style={styles.stat}>
              <Txt font="bodySemi" size={24} style={{ fontVariant: ['tabular-nums'] }}>{String(n)}</Txt>
              <Txt size={12} color={colors.muted}>{label}</Txt>
            </View>
          ))}
        </View>

        <View style={{ gap: 10 }}>
          <View style={styles.rowHead}>
            <Txt font="display" size={22}>{t('profile.myUploads')}</Txt>
            <Pressable onPress={() => router.push('/album')} accessibilityRole="link"><Txt font="bodySemi" size={14} color={colors.maroon}>{t('profile.seeAll')}</Txt></Pressable>
          </View>
          {mine?.length ? (
            <FlatList horizontal data={mine} keyExtractor={(p) => p.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => <PhotoTile uri={item.thumb ?? item.uri} accent={eventAccents[item.subEventId] ?? colors.marigold} style={styles.thumb}
                onPress={() => router.push({ pathname: '/photo/[id]', params: { id: item.id } })} />} />
          ) : (
            <Pressable onPress={() => router.push('/upload')} style={styles.emptyUp} accessibilityRole="button">
              <Icon name="upload" size={18} color={colors.maroon} /><Txt font="bodySemi" size={14} color={colors.maroon}>{t('common.uploadPhotos')}</Txt>
            </Pressable>
          )}
        </View>

        <Group>
          <Row label={t('profile.language')} value={langName(lang)} onPress={() => setLangOpen(true)} />
          <LangSheet visible={langOpen} onClose={() => setLangOpen(false)} />
          <Row label={t('profile.waUpdates')} sub={t('profile.waSub')} toggle={!!prefs?.waUpdates} onToggle={(v) => set('waUpdates', v)} />
          <Row label={t('profile.findMe')} sub={t('profile.findMeSub')} toggle={!!prefs?.findMe} onToggle={(v) => set('findMe', v)} />
          <Row label={t('profile.myEvents')} value={String(evs?.length ?? '')} onPress={() => router.push('/my-events')} last />
        </Group>

        <Button label={t('profile.signOut')} icon="logout" variant="soft" onPress={signOut} />
        <Pressable onPress={del} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
          <Txt font="bodySemi" size={14} color={colors.danger}>{t('profile.deleteAcct')}</Txt>
        </Pressable>
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  camBadge: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  avatar: { overflow: 'hidden', width: 64, height: 64, borderRadius: 32, backgroundColor: colors.maroon, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 2, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  thumb: { width: 96, height: 120, borderRadius: radius.field },
  emptyUp: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 72, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.maroon },
});
