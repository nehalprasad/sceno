import { useEffect, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Path, Rect } from 'react-native-svg';
import { useLang } from '@/i18n';
import type { InviteMedia } from '@/services';
import { colors } from '@/theme';

/** A part's cover photo or teaser, shown whole (never cropped) on the part's accent colour. Video plays muted. */
export function PartCover({ cover, accent, style }: { cover: InviteMedia; accent: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.box, { backgroundColor: accent }, style]}>
      {cover.kind === 'video'
        ? <Teaser url={cover.url} />
        : <Image source={{ uri: cover.url }} contentFit="contain" style={StyleSheet.absoluteFill} transition={150} accessibilityIgnoresInvertColors />}
    </View>
  );
}

function Teaser({ url }: { url: string }) {
  const { t } = useLang();
  const player = useVideoPlayer(url, (p) => { p.muted = true; p.loop = true; });
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const sub = player.addListener('playingChange', (e) => setPlaying(e.isPlaying));
    return () => sub.remove();
  }, [player]);
  return (
    <>
      <VideoView player={player} contentFit="contain" nativeControls={false} style={StyleSheet.absoluteFill} />
      <Pressable onPress={() => (playing ? player.pause() : player.play())} accessibilityRole="button"
        accessibilityLabel={playing ? t('partMedia.pause') : t('partMedia.play')} hitSlop={8}
        style={[styles.play, playing && styles.playOn]}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          {playing
            ? <><Rect x={6} y={5} width={4} height={14} rx={1} fill={colors.ivory} /><Rect x={14} y={5} width={4} height={14} rx={1} fill={colors.ivory} /></>
            : <Path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill={colors.ivory} />}
        </Svg>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  play: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(42,26,20,0.6)', alignItems: 'center', justifyContent: 'center' },
  playOn: { position: 'absolute', right: 10, bottom: 10, width: 40, height: 40, borderRadius: 20 },
});
