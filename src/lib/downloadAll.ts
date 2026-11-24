import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library/legacy';
import { cacheDirectory, deleteAsync, downloadAsync, makeDirectoryAsync } from 'expo-file-system/legacy';
import type { Photo } from '@/services';

export interface DlProgress { done: number; total: number; saved: number; skipped: number; failed: number }
export type DlResult = DlProgress & { status: 'done' | 'cancelled' | 'denied' };

const key = (cid: string) => `sceno.saved.${cid}`;
async function savedIds(cid: string): Promise<Set<string>> {
  try { return new Set(JSON.parse((await AsyncStorage.getItem(key(cid))) ?? '[]')); } catch { return new Set(); }
}

/** Photos that Download all may save: visible, and the uploader allows it (your own always). */
export function downloadable(photos: Photo[], myId?: string) {
  return photos.filter((p) => !p.hidden && (!p.noDownload || p.uploadedBy.id === myId));
}

/**
 * Saves photos into a "Sceno – <event>" album in the phone's gallery, one at a time.
 * Already-saved photo ids are remembered per event, so a cancelled or interrupted run resumes where it stopped.
 */
export async function saveAll(cid: string, albumName: string, photos: Photo[], onProgress: (p: DlProgress) => void, cancelled: () => boolean): Promise<DlResult> {
  const p: DlProgress = { done: 0, total: photos.length, saved: 0, skipped: 0, failed: 0 };
  const perm = await MediaLibrary.requestPermissionsAsync(false);
  if (!perm.granted) return { ...p, status: 'denied' };
  const seen = await savedIds(cid);
  const dir = `${cacheDirectory}sceno-dl/`;
  await makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  let album = await MediaLibrary.getAlbumAsync(albumName).catch(() => null);
  onProgress({ ...p });
  for (const ph of photos) {
    if (cancelled()) return { ...p, status: 'cancelled' };
    if (seen.has(ph.id)) { p.skipped++; p.done++; onProgress({ ...p }); continue; }
    const file = `${dir}${ph.id.replace(/[^\w-]/g, '')}.jpg`;
    try {
      const r = await downloadAsync(ph.uri, file);
      if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
      const asset = await MediaLibrary.createAssetAsync(r.uri);
      if (album) await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      else album = await MediaLibrary.createAlbumAsync(albumName, asset, false);
      seen.add(ph.id); p.saved++;
      await AsyncStorage.setItem(key(cid), JSON.stringify([...seen]));
    } catch { p.failed++; }
    await deleteAsync(file, { idempotent: true }).catch(() => {});
    p.done++; onProgress({ ...p });
  }
  return { ...p, status: 'done' };
}
