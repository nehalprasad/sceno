/**
 * Persistent upload queue.
 *
 * - Every picked photo is copied into the app's document folder and recorded in AsyncStorage before anything
 *   is sent, so it survives app restarts, being offline and the OS clearing the picker's cache.
 * - One photo at a time: shrink to ~2,000 px on the long side (unless "Upload in full quality"), then upload
 *   with a fixed photo id so a retry after a crash never creates a duplicate.
 * - Fails retry with exponential backoff; after MAX_AUTO tries the job stays as "failed" with a Retry button.
 *   A job is only removed once the server has the photo. Nothing is ever dropped silently.
 * - "Upload on Wi-Fi only" pauses the queue on mobile data.
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Network from 'expo-network';
import { settings, uploads } from '@/services';
import { reportUploadsDone } from '@/lib/push';

const KEY = 'sceno.uploadQueue.v1';
const LONG_SIDE = 2000;
const MAX_AUTO = 6;
const backoffMs = (attempt: number) => Math.min(5 * 60_000, 2_000 * 2 ** (attempt - 1));

export type JobState = 'queued' | 'uploading' | 'failed';
export interface Job {
  id: string; // also the Firestore photo id
  celebrationId: string; subEventId: string; by: { id: string; name: string };
  file: string; // local copy in the document folder
  width: number; height: number; takenAt?: string; // EXIF capture time, used for sorting into events
  state: JobState; attempts: number; nextAt: number; error?: string;
}
export type Paused = null | 'offline' | 'wifi';
export interface QueueSnapshot { jobs: Job[]; progress: Record<string, number>; paused: Paused; doneThisRun: number; firstSubEventId?: string }

let jobs: Job[] = [];
let progress: Record<string, number> = {};
let paused: Paused = null;
let doneThisRun = 0;
let firstSubEventId: string | undefined;
let unreported: Record<string, number> = {}; // per celebration, for the "your uploads are done" notice
let snap: QueueSnapshot = { jobs, progress, paused, doneThisRun };
const listeners = new Set<() => void>();
function emit() {
  snap = { jobs, progress, paused, doneThisRun, firstSubEventId };
  listeners.forEach((l) => l());
}

const dir = () => { const d = new Directory(Paths.document, 'upload-queue'); if (!d.exists) d.create({ intermediates: true }); return d; };
const newId = () => Array.from({ length: 20 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');

async function save() {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(jobs)); } catch { /* next save retries */ }
}
function update(id: string, patch: Partial<Job>) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  emit(); void save();
}

let loaded: Promise<void> | null = null;
function load() {
  loaded ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved: Job[] = raw ? JSON.parse(raw) : [];
      // A job that was mid-upload when the app died goes back in line, immediately.
      jobs = [...saved.map((j) => (j.state === 'uploading' ? { ...j, state: 'queued' as const, nextAt: 0 } : j)), ...jobs];
    } catch { /* corrupt store: keep whatever is in memory */ }
    emit();
  })();
  return loaded;
}

export interface NewPhoto { uri: string; width: number; height: number; takenAt?: string; subEventId: string }

/** Adds photos to the queue (copied to safe storage first) and starts uploading. */
export async function enqueue(celebrationId: string, by: { id: string; name: string }, photos: NewPhoto[]) {
  await load();
  const d = dir();
  const added: Job[] = [];
  for (const p of photos) {
    const id = newId();
    const ext = (p.uri.split('?')[0].match(/\.(\w{2,5})$/)?.[1] ?? 'jpg').toLowerCase();
    const dest = new File(d, `${id}.${ext}`);
    new File(p.uri).copy(dest);
    added.push({ id, celebrationId, subEventId: p.subEventId, by, file: dest.uri, width: p.width, height: p.height, takenAt: p.takenAt,
      state: 'queued', attempts: 0, nextAt: 0 });
  }
  jobs = [...jobs, ...added];
  if (!firstSubEventId) firstSubEventId = added[0]?.subEventId;
  emit(); await save();
  kick();
}

export function retry(id?: string) {
  jobs = jobs.map((j) => (j.state === 'failed' && (!id || j.id === id) ? { ...j, state: 'queued', attempts: 0, nextAt: 0, error: undefined } : j));
  emit(); void save(); kick();
}

/** Clears the "N uploaded" summary once the user has seen it. */
export function clearDone() { doneThisRun = 0; firstSubEventId = undefined; emit(); }

/** Shrinks to ~2,000 px on the long side as JPEG. The output is drawn upright, so orientation is kept. */
async function prepare(j: Job, fullQuality: boolean): Promise<{ uri: string; width: number; height: number; temp?: string }> {
  if (fullQuality) return { uri: j.file, width: j.width, height: j.height };
  const ctx = ImageManipulator.manipulate(j.file);
  const long = Math.max(j.width, j.height);
  if (long > LONG_SIDE) ctx.resize(j.width >= j.height ? { width: LONG_SIDE } : { height: LONG_SIDE });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height, temp: out.uri };
}

async function canRun(wifiOnly: boolean): Promise<Paused> {
  try {
    const n = await Network.getNetworkStateAsync();
    if (n.isConnected === false || n.isInternetReachable === false) return 'offline';
    if (wifiOnly && n.type === Network.NetworkStateType.CELLULAR) return 'wifi';
  } catch { /* unknown: try anyway */ }
  return null;
}

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Starts the worker if it isn't running. Safe to call any time. */
export function kick() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!running) void run();
}

async function run() {
  running = true;
  try {
    await load();
    for (;;) {
      const now = Date.now();
      const next = jobs.find((j) => j.state === 'queued' && j.nextAt <= now);
      if (!next) {
        const waiting = jobs.filter((j) => j.state === 'queued').map((j) => j.nextAt);
        if (waiting.length) timer = setTimeout(kick, Math.max(500, Math.min(...waiting) - now));
        if (paused) { paused = null; emit(); }
        if (!jobs.length) { const r = unreported; unreported = {}; Object.entries(r).forEach(([cid, n]) => void reportUploadsDone(cid, n)); }
        return;
      }
      const prefs = await settings.get().catch(() => ({ fullQuality: false, wifiOnly: false }));
      const block = await canRun(prefs.wifiOnly);
      if (block !== paused) { paused = block; emit(); }
      if (block) { timer = setTimeout(kick, 15_000); return; } // the network listener usually kicks sooner
      await uploadOne(next, prefs.fullQuality);
    }
  } finally { running = false; }
}

async function uploadOne(j: Job, fullQuality: boolean) {
  update(j.id, { state: 'uploading', attempts: j.attempts + 1 });
  progress = { ...progress, [j.id]: 0 }; emit();
  let temp: string | undefined;
  try {
    if (!new File(j.file).exists) throw new Error('file_missing');
    const p = await prepare(j, fullQuality);
    temp = p.temp;
    await uploads.put(j.celebrationId, { uri: p.uri, width: p.width, height: p.height, takenAt: j.takenAt }, j.subEventId, j.by, {
      id: j.id,
      onProgress: (f) => { progress = { ...progress, [j.id]: f }; emit(); },
    });
    try { new File(j.file).delete(); } catch { /* leftover file is harmless */ }
    jobs = jobs.filter((x) => x.id !== j.id);
    doneThisRun += 1;
    unreported[j.celebrationId] = (unreported[j.celebrationId] ?? 0) + 1;
    void save();
  } catch (e) {
    const attempts = j.attempts + 1;
    const msg = e instanceof Error ? e.message : String(e);
    // A missing local file can never succeed; surface it instead of looping.
    const give = attempts >= MAX_AUTO || msg === 'file_missing';
    update(j.id, { state: give ? 'failed' : 'queued', nextAt: Date.now() + backoffMs(attempts), error: msg, attempts });
    if (__DEV__) console.warn('[uploadQueue]', j.id, msg);
  } finally {
    if (temp) { try { new File(temp).delete(); } catch { /* cache */ } }
    const { [j.id]: _, ...rest } = progress; void _;
    progress = rest; emit();
  }
}

/** Removes a failed photo from the queue on the user's request. */
export function discard(id: string) {
  const j = jobs.find((x) => x.id === id);
  if (!j || j.state === 'uploading') return;
  try { new File(j.file).delete(); } catch { /* ignore */ }
  jobs = jobs.filter((x) => x.id !== id); emit(); void save();
}

let started = false;
/** Call once after sign-in: resumes saved jobs and re-kicks on network changes and app foreground. */
export function startUploadQueue() {
  if (started) return;
  started = true;
  Network.addNetworkStateListener(() => kick());
  AppState.addEventListener('change', (s) => { if (s === 'active') kick(); });
  kick();
}

export function useUploadQueue(): QueueSnapshot {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snap);
}
