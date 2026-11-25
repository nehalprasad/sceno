import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Sheet } from '@/components/kit';
import { Button, Chip, Txt } from '@/components/ui';
import { useLang } from '@/i18n';
import { downloadable, DlProgress, DlResult, saveAll } from '@/lib/downloadAll';
import { Photo, photoService, SubEvent } from '@/services';
import { colors, radius } from '@/theme';

/** Download all: pick everything or one part, then a progress bar with Stop. */
export function DownloadSheet({ visible, onClose, cid, eventName, subs, myId }: {
  visible: boolean; onClose: () => void; cid: string; eventName: string; subs: SubEvent[]; myId?: string;
}) {
  const { t, pn } = useLang();
  const album = `Sceno – ${eventName}`;
  const [part, setPart] = useState('all');
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [held, setHeld] = useState(0);
  const [prog, setProg] = useState<DlProgress | null>(null);
  const [result, setResult] = useState<DlResult | null>(null);
  const stop = useRef(false);
  const running = !!prog && !result;

  const subKey = subs.map((s) => s.id).join(',');
  useEffect(() => {
    if (!visible) return;
    let live = true; setPhotos(null); setResult(null); setProg(null);
    const list = part === 'all' ? subs : subs.filter((s) => s.id === part);
    Promise.all(list.map((s) => photoService.forSubEvent(s.id))).then((all) => {
      if (!live) return;
      const flat = all.flat(); const ok = downloadable(flat, myId);
      setHeld(flat.filter((p) => !p.hidden).length - ok.length); setPhotos(ok);
    }).catch(() => live && setPhotos([]));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, part, subKey, myId]);

  const start = async () => {
    if (!photos?.length) return;
    stop.current = false; setResult(null);
    try { setResult(await saveAll(cid, album, photos, setProg, () => stop.current)); }
    catch { setResult({ done: 0, total: photos.length, saved: 0, skipped: 0, failed: photos.length, status: 'done' }); }
  };
  const close = () => { stop.current = true; setProg(null); setResult(null); onClose(); };
  const pct = prog && prog.total ? prog.done / prog.total : 0;

  return (
    <Sheet visible={visible} onClose={running ? () => {} : close}>
      <View style={{ gap: 14 }}>
        <Txt font="display" size={28} color={colors.maroon} accessibilityRole="header">{t('story.dlTitle')}</Txt>
        <Txt size={14} color={colors.muted}>{t('story.dlSub', { album })}</Txt>
        {!prog ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label={t('story.dlAll')} active={part === 'all'} onPress={() => setPart('all')} />
            {subs.map((s) => <Chip key={s.id} label={pn(s.name)} active={part === s.id} onPress={() => setPart(s.id)} />)}
          </ScrollView>
        ) : (
          <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
            <View style={{ height: 8, borderRadius: radius.tile, backgroundColor: colors.line, overflow: 'hidden' }}>
              <View style={{ height: 8, width: `${Math.round(pct * 100)}%`, backgroundColor: colors.maroon }} />
            </View>
            <Txt font="bodySemi" size={14}>{t('story.dlSaving', { done: prog.done, total: prog.total })}</Txt>
          </View>
        )}
        {held > 0 && !prog ? <Txt size={13} color={colors.muted}>{t('story.dlHeld', { n: held })}</Txt> : null}
        {result?.status === 'done' ? <Txt size={14} font="bodySemi">{t('story.dlDone', { saved: result.saved, skipped: result.skipped })}</Txt> : null}
        {result?.status === 'done' && result.failed ? <Txt size={14} color={colors.maroon}>{t('story.dlFailed', { n: result.failed })}</Txt> : null}
        {result?.status === 'cancelled' ? <Txt size={14}>{t('story.dlStopped')}</Txt> : null}
        {result?.status === 'denied' ? <Txt size={14} color={colors.maroon}>{t('story.dlDenied')}</Txt> : null}
        {photos && !photos.length && !prog ? <Txt size={14} color={colors.muted}>{t('story.dlNone')}</Txt> : null}
        {running ? <Button label={t('story.dlCancel')} variant="outline" height={48} onPress={() => { stop.current = true; }} />
          : result ? <Button label={t('story.dlClose')} variant="ink" height={48} onPress={close} />
          : <Button label={t('story.dlStart', { n: photos?.length ?? 0 })} icon="download" variant="ink" height={48} loading={!photos} disabled={!photos?.length} onPress={start} />}
      </View>
    </Sheet>
  );
}
