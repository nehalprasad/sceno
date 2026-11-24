import { createContext, ReactNode, useCallback, useEffect, useState } from 'react';
import { useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, events, settings, User } from '@/services';
import i18n, { onLanguageChange } from '@/i18n';
import type { WaLoginStart } from '@/services/types';

const EVENT_KEY = 'celebration.v1';

/** Where sign-in should lead: join an invited event, or start creating one. */
export type AfterSignIn = { joinId?: string; invite?: string; next?: 'create' };

type Session = {
  ready: boolean;
  user: User | null;
  /** Current event; '' when the person has none yet (a brand-new host). */
  celebrationId: string;
  setUser: (u: User | null) => void;
  setCelebrationId: (id: string) => void;
  /** Picks the remembered event, else the newest one the person belongs to. */
  chooseEvent: () => Promise<string>;
  /** Filled by the sign-in form so the code screen knows where to send the code and where to go after. */
  pending: ({ name: string; phone: string; requestId: string; channel: 'whatsapp' | 'sms'; wa?: WaLoginStart } & AfterSignIn) | null;
  setPending: (p: Session['pending']) => void;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [celebrationId, setCid] = useState('');
  const [pending, setPending] = useState<Session['pending']>(null);

  const setCelebrationId = useCallback((id: string) => {
    setCid(id);
    AsyncStorage.setItem(EVENT_KEY, id).catch(() => {});
  }, []);

  const chooseEvent = useCallback(async () => {
    const mine = await events.listMine().catch(() => []);
    const saved = await AsyncStorage.getItem(EVENT_KEY).catch(() => null);
    const id = mine.find((c) => c.id === saved)?.id ?? mine[0]?.id ?? '';
    setCelebrationId(id);
    return id;
  }, [setCelebrationId]);

  useEffect(() => {
    (async () => {
      const u = await auth.restore();
      setUser(u);
      if (u) await chooseEvent();
      setReady(true);
    })();
  }, [chooseEvent]);

  // Keep the person's UI language on their profile so invites and notices can go out in it.
  const uid = user?.id;
  useEffect(() => {
    if (!uid) return;
    settings.set({ lang: i18n.language }).catch(() => {});
    return onLanguageChange((lang) => { settings.set({ lang }).catch(() => {}); });
  }, [uid]);

  const signOutAware = useCallback((u: User | null) => {
    setUser(u);
    if (!u) {
      // Signing out leaves nothing behind on the phone except the chosen language.
      setCid('');
      AsyncStorage.getAllKeys().then((keys) => AsyncStorage.multiRemove(keys.filter((k) => k !== 'lang.v1'))).catch(() => {});
    }
  }, []);

  return (
    <Ctx.Provider value={{ ready, user, setUser: signOutAware, celebrationId, setCelebrationId, chooseEvent, pending, setPending }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
