import { ReactNode, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton, LangToggle, Txt } from '@/components/ui';
import { useLang } from '@/i18n';
import { colors, radius } from '@/theme';

/** Back link left, language right, as on every inner screen of the canvas. */
export function TopBar({ left, right, onBack }: { left?: ReactNode; right?: ReactNode; onBack?: () => void }) {
  const { t } = useLang();
  return (
    <View style={styles.top}>
      {left ?? <BackButton onPress={onBack} />}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>{right}<LangToggle /></View>
    </View>
  );
}

export function Page({ children, pad = true }: { children: ReactNode; pad?: boolean }) {
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: colors.ivory, paddingTop: insets.top + 8, paddingHorizontal: pad ? 20 : 0 }}>{children}</View>;
}

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      {title ? <Txt font="bodySemi" size={13} color={colors.muted} style={{ paddingHorizontal: 4 }}>{title}</Txt> : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

export function Row({ label, sub, value, onPress, toggle, onToggle, last, danger }: {
  label: string; sub?: string; value?: string; onPress?: () => void; toggle?: boolean; onToggle?: (v: boolean) => void; last?: boolean; danger?: boolean;
}) {
  const body = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={15} color={danger ? colors.danger : colors.ink}>{label}</Txt>
        {sub ? <Txt size={13} color={colors.muted}>{sub}</Txt> : null}
      </View>
      {value ? <Txt size={14} color={colors.muted}>{value}</Txt> : null}
      {toggle !== undefined ? (
        <Switch value={toggle} onValueChange={onToggle} trackColor={{ true: colors.maroon, false: colors.lineStrong }} accessibilityLabel={label} />
      ) : null}
    </>
  );
  const style = [styles.row, !last && styles.rowLine];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...style, pressed && { backgroundColor: colors.ivory }]}>{body}</Pressable>
  ) : <View style={style}>{body}</View>;
}

/** Bottom sheet for confirmations and pickers. */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>{children}</View>
    </Modal>
  );
}

export function Toast({ text }: { text: string }) {
  if (!text) return null;
  return <View style={styles.toast} accessibilityLiveRegion="polite"><Txt font="bodySemi" size={14} color={colors.ivory}>{text}</Txt></View>;
}

export function Tabs2({ items, value, onChange }: { items: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {items.map((i) => (
        <Pressable key={i.key} accessibilityRole="tab" accessibilityState={{ selected: value === i.key }} onPress={() => onChange(i.key)}
          style={[styles.segItem, value === i.key && styles.segOn]}>
          <Txt font={value === i.key ? 'bodySemi' : 'bodyMedium'} size={14} color={value === i.key ? colors.ivory : colors.ink}>{i.label}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, marginHorizontal: -20, paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.ivory, zIndex: 1 },
  group: { borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: '#EFE6DA' },
  scrim: { flex: 1, backgroundColor: 'rgba(42,26,20,0.45)' },
  sheet: { backgroundColor: colors.ivory, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14 },
  toast: { position: 'absolute', bottom: 110, alignSelf: 'center', backgroundColor: colors.ink, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill },
  seg: { flexDirection: 'row', gap: 8 },
  segItem: { height: 40, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper, justifyContent: 'center' },
  segOn: { backgroundColor: colors.ink, borderColor: colors.ink },
});

export function useToast() {
  const [text, setText] = useState('');
  const tm = useRef<ReturnType<typeof setTimeout> | null>(null);
  return [text, (s: string) => { setText(s); if (tm.current) clearTimeout(tm.current); tm.current = setTimeout(() => setText(''), 2200); }] as const;
}
