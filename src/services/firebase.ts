/**
 * Firebase client. Turns on when EXPO_PUBLIC_FIREBASE_* values are set (see .env.example).
 * EXPO_PUBLIC_USE_EMULATOR=1 points everything at the local Emulator Suite instead of the cloud.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { Auth, connectAuthEmulator, getAuth, initializeAuth } from 'firebase/auth';
import { connectFirestoreEmulator, Firestore, initializeFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, Functions, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, FirebaseStorage, getStorage } from 'firebase/storage';

const env = process.env;
const config = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseEnabled = !!(config.apiKey && config.projectId);
const useEmulator = env.EXPO_PUBLIC_USE_EMULATOR === '1';
/** On a real phone set EXPO_PUBLIC_EMULATOR_HOST to the Mac's LAN IP. */
const emuHost = env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
export const REGION = 'asia-south1';

let cache: { app: FirebaseApp; auth: Auth; db: Firestore; storage: FirebaseStorage; fns: Functions } | null = null;

export function fb() {
  if (cache) return cache;
  const fresh = !getApps().length;
  const app = fresh ? initializeApp(config) : getApp();
  let auth: Auth;
  try {
    // React Native build exports getReactNativePersistence; keeps people signed in across restarts.
    const rnPersistence = (FirebaseAuth as unknown as { getReactNativePersistence: (s: typeof AsyncStorage) => FirebaseAuth.Persistence }).getReactNativePersistence;
    auth = initializeAuth(app, { persistence: rnPersistence(AsyncStorage) });
  } catch {
    auth = getAuth(app);
  }
  const db = initializeFirestore(app, { experimentalForceLongPolling: true, ignoreUndefinedProperties: true });
  const storage = getStorage(app);
  const fns = getFunctions(app, REGION);
  if (useEmulator && fresh) {
    connectAuthEmulator(auth, `http://${emuHost}:9098`, { disableWarnings: true });
    connectFirestoreEmulator(db, emuHost, 8085);
    connectStorageEmulator(storage, emuHost, 9198);
    connectFunctionsEmulator(fns, emuHost, 5011);
  }
  cache = { app, auth, db, storage, fns };
  return cache;
}
