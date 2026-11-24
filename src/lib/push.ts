/**
 * Phone push via Expo's free push service. After sign-in we ask once, store the Expo push token
 * on users/{uid}.pushTokens, and open a notification's `link` when it is tapped.
 * Real delivery needs a development build on a real device (not Expo Go, not a simulator).
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import i18n from '@/i18n';
import { fb } from '@/services/firebase';
import { firebaseEnabled } from '@/services';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registerForPush(uid: string): Promise<string | null> {
  try {
    if (!Device.isDevice || Platform.OS === 'web') return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: i18n.t('push.channel'), importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) { console.warn('push: no EAS projectId in app config; run `eas init`'); return null; }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (firebaseEnabled) {
      await setDoc(doc(fb().db, 'users', uid), { pushTokens: arrayUnion(token), lang: i18n.language === 'hi' ? 'hi' : 'en' }, { merge: true });
    }
    return token;
  } catch (e) {
    console.warn('push register failed', e);
    return null;
  }
}

function open(r: Notifications.NotificationResponse | null) {
  const link = r?.notification.request.content.data?.link;
  if (typeof link === 'string' && link.startsWith('/')) router.push(link as never);
}

/** Mount once in the root layout. Registers when someone is signed in; routes taps. */
export function usePush(uid: string | null | undefined) {
  useEffect(() => { if (uid) registerForPush(uid); }, [uid]);
  useEffect(() => {
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

/** After an upload batch: server writes the "your N uploads are done" notice and push. Best-effort. */
export async function reportUploadsDone(celebrationId: string, count: number) {
  if (!firebaseEnabled || !count) return;
  await httpsCallable(fb().fns, 'uploadsDone')({ celebrationId, count }).catch(() => {});
}
