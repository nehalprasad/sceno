import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Button, Icon, Txt } from '@/components/ui';
import { Sheet } from '@/components/kit';
import { useLang } from '@/i18n';
import { dayMonth, hhmm, weekday } from '@/lib/dates';
import { colors, radius } from '@/theme';

/** A tappable field showing a date or time; opens the native picker (a sheet on iOS, a dialog on Android). */
export function DateField({ label, value, mode, onChange, optional, onClear }: {
  label: string; value?: Date; mode: 'date' | 'time'; onChange: (d: Date) => void; optional?: boolean; onClear?: () => void;
}) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value ?? new Date());
  const shown = value ? (mode === 'date' ? `${weekday(t, value)}, ${dayMonth(t, value)} ${value.getFullYear()}` : hhmm(value)) : t('editEvent.notSet');

  function handle(e: DateTimePickerEvent, d?: Date) {
    if (Platform.OS === 'android') { setOpen(false); if (e.type === 'set' && d) onChange(d); return; }
    if (d) setDraft(d);
  }

  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Txt font="bodySemi" size={14}>{label}</Txt>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${shown}`} onPress={() => { setDraft(value ?? new Date()); setOpen(true); }}
        style={({ pressed }) => [styles.field, pressed && { opacity: 0.8 }]}>
        <Icon name={mode === 'date' ? 'calendar' : 'clock'} size={18} color={colors.maroon} />
        <Txt size={16} color={value ? colors.ink : colors.muted} style={{ flex: 1 }} numberOfLines={1}>{shown}</Txt>
        {optional && value && onClear ? (
          <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('editEvent.clear')}><Icon name="close" size={16} color={colors.muted} /></Pressable>
        ) : null}
      </Pressable>
      {open && Platform.OS === 'android' ? <DateTimePicker value={draft} mode={mode} is24Hour onChange={handle} /> : null}
      {Platform.OS === 'ios' ? (
        <Sheet visible={open} onClose={() => setOpen(false)}>
          <Txt font="display" size={24}>{label}</Txt>
          <DateTimePicker value={draft} mode={mode} display={mode === 'date' ? 'inline' : 'spinner'} onChange={handle}
            locale={lang === 'hi' ? 'hi-IN' : 'en-IN'} accentColor={colors.maroon} themeVariant="light" is24Hour />
          <Button label={t('common.save')} icon="check" onPress={() => { onChange(draft); setOpen(false); }} />
        </Sheet>
      ) : null}
    </View>
  );
}

/** Combine a date and a time-of-day into one Date. */
export function at(date: Date, time: Date) {
  const d = new Date(date); d.setHours(time.getHours(), time.getMinutes(), 0, 0); return d;
}

const styles = StyleSheet.create({
  field: { height: 52, borderRadius: radius.field, borderWidth: 1, borderColor: colors.field, backgroundColor: colors.paper, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
