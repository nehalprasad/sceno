import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button, Chip, Icon, Txt, useAsync } from '@/components/ui';
import { Page, Sheet, Tabs2, Toast, TopBar, useToast } from '@/components/kit';
import { useLang } from '@/i18n';
import { useSession } from '@/lib/session';
import { events, Guest, isAdminRole, people } from '@/services';
import { colors, fonts, fontsFor, radius } from '@/theme';

export default function Guests() {
  const { t, lang, pn } = useLang();
  const { celebrationId, user } = useSession();
  const [toast, show] = useToast();
  const { data, reload } = useAsync(() => people.list(celebrationId), [celebrationId]);
  const [tab, setTab] = useState('joined');
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<Guest | null>(null);
  const { data: subs } = useAsync(() => events.subEvents(celebrationId), [celebrationId]);
  const partName = (id: string) => subs?.find((s) => s.id === id)?.name ?? id;
  const [parts, setParts] = useState<'all' | string[]>('all');
  const openMenu = (g: Guest) => { setParts(g.events); setMenu(g); };
  const togglePart = (id: string) => setParts((p) => {
    const cur = p === 'all' ? (subs ?? []).filter((s) => !s.private).map((s) => s.id) : p;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    return next.length ? next : cur;
  });
  const all = data ?? [];
  const joined = all.filter((g) => g.joined);
  const notJoined = all.filter((g) => !g.joined);
  const list = (tab === 'joined' ? joined : notJoined).filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase()));
  const roleLabel = (g: Guest) => t(`myEvents.role.${isAdminRole(g.role) ? 'admin' : g.role}`);

  return (
    <Page>
      <TopBar />
      <Txt font="display" size={34} color={colors.maroon} accessibilityRole="header" style={{ marginVertical: 8 }}>{t('guests.title')}</Txt>
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder={t('guests.search')} placeholderTextColor={colors.muted} accessibilityLabel={t('guests.search')}
          style={{ flex: 1, fontSize: 15, color: colors.ink, fontFamily: fontsFor(lang).body }} />
      </View>
      <View style={{ marginTop: 12 }}>
        <Tabs2 value={tab} onChange={setTab} items={[{ key: 'joined', label: t('guests.joined', { count: joined.length }) }, { key: 'not', label: t('guests.notJoined', { count: notJoined.length }) }]} />
      </View>
      {tab === 'joined' ? (
        <Txt size={13} color={colors.muted} style={{ marginTop: 12 }}>
          {t('guests.sort')} · {t('guests.admins', { count: joined.filter((g) => isAdminRole(g.role)).length })}
        </Txt>
      ) : null}
      <FlatList showsVerticalScrollIndicator={false} data={list} keyExtractor={(g) => g.id} contentContainerStyle={{ paddingVertical: 12, gap: 8 }}
        renderItem={({ item: g }) => (
          <View style={styles.row}>
            <View style={styles.avatar}><Txt font="bodySemi" size={16} color={colors.maroon}>{g.name[0]}</Txt></View>
            <View style={{ flex: 1 }}>
              <Txt font="bodySemi" size={15}>{g.name} · <Txt size={14} color={colors.muted}>{g.relation}</Txt></Txt>
              <Txt size={13} color={colors.muted}>
                {g.joined ? `${t('guests.uploads', { count: g.uploads })} · ${g.events === 'all' ? t('guests.allEvents') : g.events.map(partName).join(', ')}` : t('guests.invited', { when: new Date(g.invitedAt!).toLocaleDateString('en-IN') })}
              </Txt>
            </View>
            <View style={[styles.role, isAdminRole(g.role) && { backgroundColor: colors.maroon, borderColor: colors.maroon }]}>
              <Txt font="bodySemi" size={11} color={isAdminRole(g.role) ? colors.ivory : colors.ink}>{roleLabel(g)}</Txt>
            </View>
            {g.id !== user?.id ? (
              <Pressable onPress={() => openMenu(g)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('guests.more', { name: g.name })} style={styles.more}>
                <Icon name="more" size={20} />
              </Pressable>
            ) : <View style={{ width: 36 }} />}
          </View>
        )}
        ListFooterComponent={notJoined.length && tab === 'joined' ? (
          <View style={styles.pending}>
            <Txt font="bodySemi" size={15}>{t('guests.pendingTitle', { count: notJoined.length })}</Txt>
            <Txt size={13} color={colors.muted}>{t('guests.pendingSub')}</Txt>
            <Button label={t('guests.remind')} icon="message" variant="outline" height={44} size={14} style={{ marginTop: 6 }}
              onPress={async () => { await people.remind(celebrationId, notJoined.map((g) => g.id)); show(t('invite.remind', { count: notJoined.length })); }} />
          </View>
        ) : undefined}
      />
      <Sheet visible={!!menu} onClose={() => setMenu(null)}>
        {menu ? <>
          <Txt font="display" size={24}>{menu.name}</Txt>
          {menu.joined && menu.role === 'guest' ? <>
            <Txt font="bodySemi" size={14}>{t('access.parts')}</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label={t('access.all')} active={parts === 'all'} onPress={() => setParts('all')} />
              {(subs ?? []).filter((s) => !s.private).map((s) => (
                <Chip key={s.id} label={pn(s.name)} active={parts !== 'all' && parts.includes(s.id)} onPress={() => togglePart(s.id)} />
              ))}
            </View>
            <Button label={t('access.save')} icon="check" variant="soft"
              onPress={async () => { await people.setEvents(celebrationId, menu.id, parts); setMenu(null); reload(); }} />
          </> : null}
          <Button label={isAdminRole(menu.role) ? t('guests.makeGuest') : t('guests.makeCo')} icon="users" variant="soft"
            onPress={async () => { await people.setRole(celebrationId, menu.id, isAdminRole(menu.role) ? 'guest' : 'admin'); setMenu(null); reload(); }} />
          <Button label={t('guests.remove')} icon="trash" variant="quiet"
            onPress={() => Alert.alert(t('guests.remove'), menu.name, [{ text: t('common.cancel'), style: 'cancel' },
              { text: t('guests.remove'), style: 'destructive', onPress: async () => { await people.remove(celebrationId, menu.id); setMenu(null); reload(); } }])} />
        </> : null}
      </Sheet>
      <Toast text={toast} />
    </Page>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, borderRadius: radius.field, borderWidth: 1, borderColor: colors.field, backgroundColor: colors.paper, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F6E6D2', alignItems: 'center', justifyContent: 'center' },
  role: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong },
  more: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pending: { marginTop: 8, padding: 16, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.maroon, gap: 2 },
});
