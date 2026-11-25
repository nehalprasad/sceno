import { ReactNode, useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator, Modal, Pressable, PressableProps, StyleProp, StyleSheet, Text, TextProps, TextStyle, View, ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { colors, FontRole, fonts, radius, scriptOf } from '@/theme';
import { LANGS, useLang } from '@/i18n';

// ---------- Text ----------
type TxtProps = TextProps & { font?: FontRole; latin?: boolean; size?: number; color?: string; style?: StyleProp<TextStyle> };
export function Txt({ font: role = 'body', latin, size = 15, color = colors.ink, style, ...rest }: TxtProps) {
  const { lang } = useLang();
  // `latin` pins host-entered names (Haldi, Sangeet) to the Latin faces in every language.
  const script = latin ? 'latin' : scriptOf(lang);
  const hiFace = script !== 'latin'; // every Indic script needs the taller line height
  const family = fonts[script][role];
  const display = role.startsWith('display');
  // Devanagari needs more line height for matras; Cormorant sits tight.
  const lh = hiFace ? size * (display ? 1.45 : 1.6) : size * (display ? 1.08 : 1.45);
  return <Text {...rest} style={[{ fontFamily: family, fontSize: size, lineHeight: lh, color }, style]} />;
}

// ---------- Icons (lucide geometry, one 2px stroke) ----------
export type IconName = 'back' | 'bell' | 'pin' | 'calendar' | 'lock' | 'upload' | 'close' | 'check' | 'camera' | 'share' | 'download' | 'trash' | 'eye-off' | 'chevron' | 'home' | 'list' | 'images' | 'user' | 'settings' | 'plus' | 'search' | 'more' | 'users' | 'qr' | 'link' | 'copy' | 'flag' | 'restore' | 'globe' | 'message' | 'sparkle' | 'logout' | 'edit' | 'clock';
export function Icon({ name, size = 20, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  const p = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const body: Record<IconName, ReactNode> = {
    back: <Path d="m15 18-6-6 6-6" {...p} />,
    chevron: <Path d="m9 18 6-6-6-6" {...p} />,
    bell: <><Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" {...p} /><Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" {...p} /></>,
    pin: <><Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" {...p} /><Circle cx={12} cy={10} r={3} {...p} /></>,
    calendar: <><Rect x={3} y={4} width={18} height={18} rx={2} {...p} /><Path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" {...p} /></>,
    lock: <><Rect x={4} y={11} width={16} height={10} rx={2} {...p} /><Path d="M8 11V7a4 4 0 0 1 8 0v4" {...p} /></>,
    upload: <><Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...p} /><Path d="m17 8-5-5-5 5M12 3v12" {...p} /></>,
    download: <><Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...p} /><Path d="m7 10 5 5 5-5M12 15V3" {...p} /></>,
    close: <Path d="M18 6 6 18M6 6l12 12" {...p} />,
    check: <Path d="M20 6 9 17l-5-5" {...p} />,
    camera: <><Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" {...p} /><Circle cx={12} cy={13} r={3} {...p} /></>,
    share: <><Circle cx={18} cy={5} r={3} {...p} /><Circle cx={6} cy={12} r={3} {...p} /><Circle cx={18} cy={19} r={3} {...p} /><Path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" {...p} /></>,
    trash: <><Path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" {...p} /></>,
    home: <><Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" {...p} /></>,
    list: <><Rect x={3} y={4} width={18} height={18} rx={2} {...p} /><Path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" {...p} /></>,
    images: <><Rect x={3} y={3} width={18} height={18} rx={2} {...p} /><Circle cx={9} cy={9} r={2} {...p} /><Path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" {...p} /></>,
    user: <><Circle cx={12} cy={8} r={4} {...p} /><Path d="M4 21a8 8 0 0 1 16 0" {...p} /></>,
    settings: <><Circle cx={12} cy={12} r={3} {...p} /><Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" {...p} /></>,
    plus: <Path d="M12 5v14M5 12h14" {...p} />,
    search: <><Circle cx={11} cy={11} r={7} {...p} /><Path d="m21 21-4.3-4.3" {...p} /></>,
    more: <><Circle cx={5} cy={12} r={1} {...p} /><Circle cx={12} cy={12} r={1} {...p} /><Circle cx={19} cy={12} r={1} {...p} /></>,
    users: <><Circle cx={9} cy={7} r={4} {...p} /><Path d="M2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-4-6.3" {...p} /></>,
    qr: <><Rect x={3} y={3} width={7} height={7} rx={1} {...p} /><Rect x={14} y={3} width={7} height={7} rx={1} {...p} /><Rect x={3} y={14} width={7} height={7} rx={1} {...p} /><Path d="M14 14h3v3h-3zM21 14v.01M17 21h4v-4M14 21v-.01" {...p} /></>,
    link: <><Path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" {...p} /><Path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" {...p} /></>,
    copy: <><Rect x={8} y={8} width={14} height={14} rx={2} {...p} /><Path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" {...p} /></>,
    flag: <><Path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a6 6 0 0 0 4-1.5V15a6 6 0 0 1-4 1.5c-3 0-5-2-8-2a6 6 0 0 0-4 1.5" {...p} /></>,
    restore: <><Path d="M3 12a9 9 0 1 0 3-6.7L3 8" {...p} /><Path d="M3 3v5h5" {...p} /></>,
    globe: <><Circle cx={12} cy={12} r={10} {...p} /><Path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" {...p} /></>,
    message: <Path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" {...p} />,
    sparkle: <Path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z" {...p} />,
    logout: <><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" {...p} /></>,
    clock: <><Circle cx={12} cy={12} r={10} {...p} /><Path d="M12 6v6l4 2" {...p} /></>,
    edit: <><Path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" {...p} /></>,
    'eye-off': <><Path d="M9.9 4.2A10 10 0 0 1 22 12a13 13 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6" {...p} /><Path d="m2 2 20 20" {...p} /></>,
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24">{body[name]}</Svg>;
}

// ---------- Buttons ----------
type BtnVariant = 'primary' | 'ink' | 'outline' | 'soft' | 'quiet';
type BtnProps = Omit<PressableProps, 'style'> & {
  label: string; variant?: BtnVariant; height?: number; icon?: IconName; loading?: boolean; style?: StyleProp<ViewStyle>; size?: number;
};
export function Button({ label, variant = 'primary', height = 54, icon, loading, style, disabled, size = 16, ...rest }: BtnProps) {
  const v = {
    primary: { bg: colors.maroon, fg: colors.ivory, border: 'transparent', bw: 0 },
    ink: { bg: colors.ink, fg: colors.ivory, border: 'transparent', bw: 0 },
    outline: { bg: 'transparent', fg: colors.ink, border: colors.ink, bw: 1.5 },
    soft: { bg: colors.paper, fg: colors.ink, border: colors.lineStrong, bw: 1 },
    quiet: { bg: 'transparent', fg: colors.ink, border: colors.lineStrong, bw: 1 },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || loading, busy: loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { height, backgroundColor: v.bg, borderColor: v.border, borderWidth: v.bw, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon ? <Icon name={icon} size={16} color={v.fg} /> : null}
      <Txt font="bodySemi" size={size} color={v.fg} numberOfLines={1}>{label}</Txt>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, lang }: { label: string; active?: boolean; onPress?: () => void; lang?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLanguage={lang}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active ? styles.chipOn : styles.chipOff, pressed && { opacity: 0.8 }]}
    >
      <Txt font={active ? 'bodySemi' : 'bodyMedium'} size={14} color={active ? colors.ivory : colors.ink}>{label}</Txt>
    </Pressable>
  );
}

export function RoundButton({ icon, label, onPress, children, tint = colors.paper }: { icon?: IconName; label: string; onPress?: () => void; children?: ReactNode; tint?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
      style={({ pressed }) => [styles.round, { backgroundColor: tint }, pressed && { opacity: 0.75 }]}>
      {icon ? <Icon name={icon} /> : children}
    </Pressable>
  );
}

/** Round chevron back button; label stays for screen readers. */
export function BackButton({ onPress, icon = 'back', dark, tint }: { onPress?: () => void; icon?: IconName; dark?: boolean; tint?: string }) {
  const { t } = useLang();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={icon === 'close' ? t('photo.close') : t('common.back')} hitSlop={6}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/home')))}
      style={({ pressed }) => [styles.round, { backgroundColor: tint ?? (dark ? 'rgba(255,253,248,0.12)' : colors.paper), borderColor: dark ? 'rgba(255,253,248,0.25)' : colors.line }, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} color={dark ? colors.ivory : colors.ink} />
    </Pressable>
  );
}

/** Short language picker: a sheet listing all UI languages in their own scripts. */
export function LangSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, lang, setLang } = useLang();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBack} onPress={onClose} accessibilityLabel={t('common.cancel')}>
        <View style={styles.sheet} accessibilityRole="radiogroup" accessibilityLabel={t('join.language')}>
          {LANGS.map((x) => (
            <Pressable key={x.code} accessibilityRole="radio" accessibilityState={{ checked: lang === x.code }} accessibilityLanguage={x.code}
              onPress={async () => { onClose(); await setLang(x.code); }}
              style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.7 }]}>
              <LangName code={x.code} name={x.name} active={lang === x.code} />
              {lang === x.code ? <Icon name="check" size={18} color={colors.maroon} /> : null}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
/** A language's own name in its own script. System font, since that script's Noto faces load only once it is picked. */
function LangName({ name, active }: { code: string; name: string; active?: boolean }) {
  return <Text style={{ fontSize: 17, lineHeight: 26, fontWeight: active ? '600' : '400', color: colors.ink }}>{name}</Text>;
}

export function LangToggle({ onDark }: { onDark?: boolean }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.langSwitchLabel')} onPress={() => setOpen(true)} hitSlop={6}
        style={({ pressed }) => [styles.lang, onDark && { backgroundColor: 'transparent', borderColor: colors.ink }, pressed && { opacity: 0.75 }]}>
        <Txt font="bodySemi" size={13}>{t('common.langShort')}</Txt>
      </Pressable>
      <LangSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Photos are shown whole: `contain` on a tinted mat, never cropped. */
export function PhotoTile({ uri, accent, style, label, onPress }: { uri: string; accent: string; style?: StyleProp<ViewStyle>; label?: string; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole={onPress ? 'imagebutton' : 'image'} accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [{ backgroundColor: tintOf(accent), overflow: 'hidden' }, style, pressed && { opacity: 0.85 }]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={180} recyclingKey={uri} />
    </Pressable>
  );
}
/** A pale version of an accent for photo mats so letterboxing reads as intentional. */
export function tintOf(hex: string, amt = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number, base: number) => Math.round(c + (base - c) * amt);
  const r = mix((n >> 16) & 255, 0xfb), g = mix((n >> 8) & 255, 0xf6), b = mix(n & 255, 0xee);
  return `rgb(${r},${g},${b})`;
}

export function Center({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.ivory }}>{children}</View>;
}

// ---------- Data hook ----------
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, set] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    set((s) => ({ ...s, loading: true }));
    fn().then((data) => alive && set({ data, loading: false }), (error) => alive && set({ error, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  // Stable across renders, so screens can safely put it in effect/focus dependencies.
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { ...state, reload };
}

const styles = StyleSheet.create({
  btn: { borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 18 },
  chip: { height: 40, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink },
  chipOff: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.lineStrong },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  sheetBack: { flex: 1, backgroundColor: 'rgba(28,20,18,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  lang: { minWidth: 44, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
});
