import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Center, Icon, Txt, useAsync } from '@/components/ui';
import { SignInForm } from '@/components/SignInForm';
import { useLang } from '@/i18n';
import { dateRange } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { events } from '@/services';
import { colors } from '@/theme';

/** Invite link / QR landing. Signed-out people sign in here; signed-in people join straight away. */
export default function Join() {
  const { code, i: invite } = useLocalSearchParams<{ code: string; i?: string }>();
  const { t, l } = useLang();
  const { user, setCelebrationId } = useSession();
  // Retry once: right after launch the first Firestore read can fail on a cold connection.
  const { data: c, loading } = useAsync(async () => {
    try { return await events.byInvite(code ?? ''); }
    catch { await new Promise((r) => setTimeout(r, 800)); return events.byInvite(code ?? ''); }
  }, [code]);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!user || !c || joining) return;
    setJoining(true);
    events.join(c.id, invite).catch(() => {}).finally(() => { setCelebrationId(c.id); router.replace('/home'); });
  }, [user, c, joining, setCelebrationId, invite]);

  if (loading || (user && c)) return <Center><Txt color={colors.muted}>…</Txt></Center>;
  if (!c) {
    return (
      <Center>
        <Icon name="link" size={28} color={colors.maroon} />
        <Txt font="display" size={28} style={{ textAlign: 'center', marginTop: 12 }}>{t('welcome.badLink')}</Txt>
        <Txt color={colors.muted} style={{ textAlign: 'center', marginVertical: 12 }}>{t('welcome.badLinkSub')}</Txt>
        <Button label={t('welcome.scan')} icon="qr" onPress={() => router.replace('/scan')} />
      </Center>
    );
  }

  return (
    <SignInForm
      after={{ joinId: c.id, invite }}
      pitch={t('join.pitch')}
      hero={<>
        <Txt font="displayItalic" size={24} color={colors.ivory}>{t('join.invitedTo')}</Txt>
        <Txt font="display" size={48} color={colors.ivory} accessibilityRole="header">{l(c.title)}</Txt>
        <Txt size={15} color={colors.ivory}>
          {t('join.meta', { dates: dateRange(t, new Date(c.startsAt), new Date(c.endsAt)), city: l(c.city), count: c.subEventCount ?? 0 })}
        </Txt>
      </>}
    />
  );
}
