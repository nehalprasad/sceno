import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, PhotoTile, Txt, useAsync } from '@/components/ui';
import { Page, Toast, TopBar, useToast } from '@/components/kit';
import { DownloadSheet } from '@/components/DownloadSheet';
import { downloadable } from '@/lib/downloadAll';
import { zipAndShare } from '@/lib/zipPart';
import { useLang } from '@/i18n';
import { dayMonth } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { events, now, photoService, SubEvent, uploads } from '@/services';
import { colors, radius } from '@/theme';


/** Sticky header for a part: day and date on top, part name, and "ZIP" to save that part as one file. */
function ChapterHead({ s, day, myId, toast }: { s: SubEvent; day: number; myId?: string; toast: (m: string) => void }) {
  const { t } = useLang();
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const stop = useRef(false);
  const zip = async () => {
    if (prog) { stop.current = true; return; }
    stop.current = false; setProg({ done: 0, total: 0 });
    try {
      const photos = downloadable(await photoService.forSubEvent(s.id), myId);
      const r = await zipAndShare(s.name, photos, (done, total) => setProg({ done, total }), () => stop.current);
      if (r === 'empty') toast(t('story.zipEmpty'));
    } catch { toast(t('common.somethingWrong')); }
    setProg(null);
  };
  return (
    <View style={styles.sticky}>
      <Pressable onPress={() => router.push({ pathname: '/event/[id]', params: { id: s.id } })} accessibilityRole="link" style={{ flex: 1 }}>
        <Txt font="bodySemi" size={12} color={colors.muted}>{t('story.day', { n: day })} · {dayMonth(t, new Date(s.startsAt), true)} · {s.photoCount}</Txt>
        <Txt font="display" latin size={30}>{s.name}</Txt>
      </Pressable>
      <Button label={prog ? t('story.zipping', { done: prog.done, total: prog.total || '…' }) : t('story.zip')} icon={prog ? undefined : 'download'}
        variant="outline" height={36} size={13} onPress={zip} accessibilityLabel={t('story.zipLabel', { name: s.name })} />
    </View>
  );
}

function Chapter({ s, missed }: { s: SubEvent; missed: boolean }) {
  const { t } = useLang();
  const { data } = useAsync(() => photoService.forSubEvent(s.id), [s.id]);
  const shots = (data ?? []).slice(0, 5);
  const open = (id: string) => router.push({ pathname: '/photo/[id]', params: { id } });
  return (
    <View style={{ gap: 10, marginBottom: 26 }}>
      {missed && shots.length ? <Txt size={14} color={colors.maroon} font="bodySemi">{t('story.missed')}</Txt> : null}
      {shots.length ? (
        <View style={styles.mosaic}>
          <PhotoTile uri={shots[0].medium ?? shots[0].uri} accent={s.accent} style={styles.big} onPress={() => open(shots[0].id)} label={t('event.openPhoto', { name: shots[0].uploadedBy.name })} />
          <View style={styles.side}>
            {shots.slice(1, 5).map((p) => (
              <PhotoTile key={p.id} uri={p.thumb ?? p.uri} accent={s.accent} style={styles.small} onPress={() => open(p.id)} label={t('event.openPhoto', { name: p.uploadedBy.name })} />
            ))}
          </View>
        </View>
      ) : <Txt size={14} color={colors.muted}>{t('event.empty', { name: s.name })}</Txt>}
    </View>
  );
}

export default function Story() {
  const { t, l } = useLang();
  const { celebrationId, user } = useSession();
  const { data: mine } = useAsync(() => uploads.mine(celebrationId, user?.id ?? ''), [celebrationId, user?.id]);
  const [toast, show] = useToast();
  const [dl, setDl] = useState(false);
  const { data: c } = useAsync(() => events.get(celebrationId), [celebrationId]);
  const { data: subs } = useAsync(() => events.subEvents(celebrationId), [celebrationId]);
  const shown = (subs ?? []).filter((s) => c?.published || new Date(s.startsAt) <= now());
  const total = (subs ?? []).reduce((a, s) => a + s.photoCount, 0);
  const days = [...new Set(shown.map((s) => new Date(s.startsAt).toDateString()))];
  // Children: [intro, head1, body1, head2, body2, …]; every head sticks while its part scrolls.
  const sticky = shown.map((_, i) => 1 + i * 2);

  return (
    <Page>
      <TopBar left={<Txt font="bodySemi" size={13} color={colors.muted}>{t('story.kicker')}</Txt>} />
      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={sticky} contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}>
        <View style={{ gap: 6, marginBottom: 18 }}>
          <Txt font="display" size={44} color={colors.maroon} accessibilityRole="header">{c ? l(c.title) : ' '}</Txt>
          <Txt size={14} color={colors.muted}>{t('story.meta', { photos: total.toLocaleString('en-IN'), guests: c?.guestCount ?? 0, events: subs?.length ?? 0 })}</Txt>
          {c && !c.published ? <Txt size={14} color={colors.inkSoft}>{t('story.notPublished')}</Txt> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Button label={t('story.downloadAll')} icon="download" variant="ink" height={44} size={14} style={{ flex: 1 }} onPress={() => setDl(true)} disabled={!shown.length} />
            <Button label={t('story.photosOfMe')} icon="user" variant="outline" height={44} size={14} style={{ flex: 1 }} onPress={() => router.push('/photos-of-me')} />
          </View>
        </View>
        {shown.flatMap((s) => [
          <ChapterHead key={`h-${s.id}`} s={s} day={days.indexOf(new Date(s.startsAt).toDateString()) + 1} myId={user?.id} toast={show} />,
          <Chapter key={s.id} s={s} missed={!!mine && !mine.some((p) => p.subEventId === s.id)} />,
        ])}
      </ScrollView>
      <Toast text={toast} />
      <DownloadSheet visible={dl} onClose={() => setDl(false)} cid={celebrationId} eventName={c ? c.title.en : ''} subs={shown} myId={user?.id} />
    </Page>
  );
}

const styles = StyleSheet.create({
  sticky: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: 6, backgroundColor: colors.ivory, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  mosaic: { flexDirection: 'row', gap: 6, height: 240 },
  big: { flex: 1.3, borderRadius: radius.card },
  side: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  small: { width: '47%', height: 117, borderRadius: radius.tile },
});
