import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Button, Icon, PhotoTile, Txt, useAsync } from '@/components/ui';
import { Page, Sheet, Toast, TopBar, useToast } from '@/components/kit';
import { useLang } from '@/i18n';
import { useSession } from '@/lib/session';
import { events, sortIntoSubEvent, SubEvent } from '@/services';
import { clearDone, discard, enqueue, retry, useUploadQueue } from '@/lib/uploadQueue';
import { colors, radius } from '@/theme';

type Item = { uri: string; width: number; height: number; takenAt?: string; subId?: string };

/** EXIF DateTimeOriginal looks like "2026:12:13 10:42:05" (camera local time). */
function exifDate(exif?: Record<string, unknown> | null): string | undefined {
  const raw = (exif?.DateTimeOriginal ?? exif?.DateTimeDigitized ?? exif?.DateTime) as string | undefined;
  const m = raw?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)).toISOString() : undefined;
}

export default function Upload() {
  const { t } = useLang();
  const { celebrationId, user } = useSession();
  const { data: subs } = useAsync(() => events.subEvents(celebrationId), [celebrationId]);
  const [items, setItems] = useState<Item[]>([]);
  const [moving, setMoving] = useState<{ from?: string; noTime?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, show] = useToast();
  const q = useUploadQueue();
  const active = q.jobs.length;
  // Once everything in this run has landed, say so and take them to the album.
  useEffect(() => {
    if (!active && q.doneThisRun) {
      const first = q.firstSubEventId;
      clearDone();
      show(t('upload.done'));
      if (first) router.push({ pathname: '/event/[id]', params: { id: first } });
    }
  }, [active, q.doneThisRun, q.firstSubEventId, show, t]);

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return show(t('upload.permission'));
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, exif: true, quality: 1, selectionLimit: 100 });
    if (r.canceled) return;
    setItems(r.assets.map((a) => {
      const takenAt = exifDate(a.exif as Record<string, unknown> | null);
      return { uri: a.uri, width: a.width, height: a.height, takenAt, subId: takenAt ? sortIntoSubEvent(new Date(takenAt), subs ?? [])?.id : undefined };
    }));
  }

  /** Hands the photos to the persistent queue; it keeps going offline, in the background and after restarts. */
  async function go() {
    setSaving(true);
    try {
      await enqueue(celebrationId, { id: user!.id, name: user!.name },
        items.map((it) => ({ uri: it.uri, width: it.width, height: it.height, takenAt: it.takenAt, subEventId: it.subId! })));
      setItems([]);
    } catch { show(t('common.somethingWrong')); }
    finally { setSaving(false); }
  }

  const failed = q.jobs.filter((j) => j.state === 'failed');
  const pending = q.jobs.length - failed.length;
  const cur = q.jobs.find((j) => j.state === 'uploading');
  const queuePanel = active ? (
    <View style={styles.group} accessibilityLiveRegion="polite">
      <View style={styles.groupHead}>
        <Icon name="upload" size={18} color={colors.maroon} />
        <Txt font="bodySemi" size={15} style={{ flex: 1 }}>
          {q.paused === 'offline' ? t('upload.qOffline', { count: pending }) : q.paused === 'wifi' ? t('upload.qWifi', { count: pending })
            : pending ? t('upload.qLeft', { count: pending }) : t('upload.qFailed', { count: failed.length })}
        </Txt>
      </View>
      {cur ? (
        <View style={styles.bar}><View style={[styles.fill, { width: `${Math.round((q.progress[cur.id] ?? 0) * 100)}%` }]} /></View>
      ) : null}
      {failed.length ? (
        <>
          {pending ? <Txt size={13} color={colors.maroon}>{t('upload.qFailed', { count: failed.length })}</Txt> : null}
          <View style={styles.strip}>
            {failed.slice(0, 4).map((j) => (
              <Pressable key={j.id} accessibilityRole="button" accessibilityLabel={t('upload.qRemove')} onLongPress={() => discard(j.id)}>
                <PhotoTile uri={j.file} accent={colors.maroon} style={styles.thumb} />
              </Pressable>
            ))}
          </View>
          <Button label={t('upload.qRetry')} icon="upload" height={40} size={14} onPress={() => retry()} />
        </>
      ) : null}
    </View>
  ) : null;

  function moveTo(target: SubEvent) {
    // Photos with no capture time take the chosen event's start time, so they sort into it.
    setItems((xs) => xs.map((x) => ((moving?.noTime ? !x.subId : x.subId === moving?.from)
      ? { ...x, subId: target.id, takenAt: x.takenAt ?? target.startsAt } : x)));
    setMoving(null);
  }

  const groups = (subs ?? []).map((s) => ({ s, items: items.filter((x) => x.subId === s.id) })).filter((g) => g.items.length);
  const loose = items.filter((x) => !x.subId);

  return (
    <Page>
      {items.length ? (
        <>
          <TopBar left={
            <Pressable accessibilityRole="button" onPress={() => setItems([])} hitSlop={8} style={{ height: 44, justifyContent: 'center' }}>
              <Txt font="bodySemi" size={14}>{t('upload.cancel')}</Txt>
            </Pressable>} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, gap: 14, paddingBottom: 24 }}>
            <Txt font="display" size={34} accessibilityRole="header">{t('upload.selected', { count: items.length })}</Txt>
            <Txt size={15} color={colors.inkSoft}>{t('upload.sorted')}</Txt>
            {groups.map(({ s, items: xs }) => (
              <View key={s.id} style={styles.group}>
                <View style={styles.groupHead}>
                  <View style={[styles.dot, { backgroundColor: s.accent }]} />
                  <Txt font="bodySemi" size={15} style={{ flex: 1 }}>{t('upload.group', { name: s.name, count: xs.length })}</Txt>
                  <Button label={t('upload.change')} icon="edit" variant="quiet" height={36} size={13} onPress={() => setMoving({ from: s.id })} />
                </View>
                <View style={styles.strip}>
                  {xs.slice(0, 4).map((x) => <PhotoTile key={x.uri} uri={x.uri} accent={s.accent} style={styles.thumb} />)}
                  {xs.length > 4 ? <View style={[styles.thumb, styles.more]}><Txt font="bodySemi" size={15}>+{xs.length - 4}</Txt></View> : null}
                </View>
              </View>
            ))}
            {loose.length ? (
              <View style={[styles.group, styles.loose]}>
                <View style={styles.groupHead}>
                  <Icon name="flag" size={18} color={colors.maroon} />
                  <Txt size={14} style={{ flex: 1 }}>{t('upload.noTime', { count: loose.length })}</Txt>
                  <Button label={t('upload.pickEvent')} height={36} size={13} onPress={() => setMoving({ noTime: true })} />
                </View>
              </View>
            ) : null}
            <Txt size={13} color={colors.muted}>{t('upload.background')}</Txt>
            {queuePanel}
          </ScrollView>
          <View style={{ paddingBottom: 12 }}>
            <Button label={t('upload.go', { count: items.length })} icon="upload"
              loading={saving} disabled={loose.length > 0 || saving} onPress={go} />
          </View>
        </>
      ) : (
        <>
          <TopBar left={<View />} />
          <View style={{ flex: 1, justifyContent: 'center', gap: 16, paddingBottom: 80 }}>
            <View style={styles.badge}><Icon name="camera" size={28} color={colors.maroon} /></View>
            <Txt font="display" size={34} accessibilityRole="header">{t('upload.pickTitle')}</Txt>
            <Txt size={15} color={colors.inkSoft}>{t('upload.pickBody')}</Txt>
            <Button label={t('upload.pick')} icon="images" onPress={pick} />
            {queuePanel}
          </View>
        </>
      )}
      <Sheet visible={!!moving} onClose={() => setMoving(null)}>
        <Txt font="display" size={26}>{t('upload.moveTo')}</Txt>
        {(subs ?? []).map((s) => (
          <Pressable key={s.id} accessibilityRole="button" onPress={() => moveTo(s)} style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.7 }]}>
            <View style={[styles.dot, { backgroundColor: s.accent }]} />
            <Txt font="bodySemi" latin size={16} style={{ flex: 1 }}>{s.name}</Txt>
            <Icon name="chevron" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </Sheet>
      <Toast text={toast} />
    </Page>
  );
}

const styles = StyleSheet.create({
  badge: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  group: { padding: 14, borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: 12 },
  loose: { borderStyle: 'dashed', borderColor: colors.maroon },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  strip: { flexDirection: 'row', gap: 6 },
  thumb: { width: 60, height: 60, borderRadius: radius.tile },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.maroon },
  more: { backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, borderBottomWidth: 1, borderBottomColor: colors.line },
});
