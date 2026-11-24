import AsyncStorage from '@react-native-async-storage/async-storage';
import { copyAsync, deleteAsync, documentDirectory } from 'expo-file-system/legacy';
import type { Photo } from '@/services';

/**
 * "Photos of me": everything stays on the phone. The selfie is copied into app storage and never uploaded;
 * the only thing that leaves the phone is the findMe preference.
 */
const SELFIE_KEY = 'sceno.selfie';

export async function getSelfie(): Promise<string | null> {
  return AsyncStorage.getItem(SELFIE_KEY).catch(() => null);
}
export async function setSelfie(uri: string): Promise<string> {
  const target = `${documentDirectory}selfie-${Date.now()}.jpg`;
  await copyAsync({ from: uri, to: target });
  const old = await getSelfie();
  if (old) await deleteAsync(old, { idempotent: true }).catch(() => {});
  await AsyncStorage.setItem(SELFIE_KEY, target);
  return target;
}
export async function clearSelfie() {
  const old = await getSelfie();
  if (old) await deleteAsync(old, { idempotent: true }).catch(() => {});
  await AsyncStorage.removeItem(SELFIE_KEY).catch(() => {});
}

export type MatchResult = { available: true; matches: Photo[] } | { available: false };

/**
 * The one place face matching plugs in. Expo Go ships no face detector or embedding model, so here it reports
 * "not available". The planned free, on-device implementation (development build only):
 *   1. detect faces with ML Kit (@react-native-ml-kit/face-detection, free, offline),
 *   2. crop each face and run a MobileFaceNet .tflite model via react-native-fast-tflite → 128-d embedding,
 *   3. cosine similarity against the selfie's embedding, threshold ≈ 0.6, cache embeddings per photo id.
 */
export async function matchFaces(_selfieUri: string, _photos: Photo[], _onProgress?: (done: number, total: number) => void): Promise<MatchResult> {
  return { available: false };
}
