/** Services for guests, notifications, moderation, uploads and admin. Mock-backed; Firebase swaps in via ./firebase. */
import { celebrations, MOCK_NOW, photos, subEvents } from './data';
import type { SubEventInput, InviteUpdate, PartCoverUpdate, AdminStats, Celebration, Guest, NewCelebration, Notice, Photo, PickedAsset, Prefs, UploadOpts, Removed, Role, SubEvent } from '../types';

const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));



const guests: Guest[] = [];

let notices: Notice[] = [];

const removed: Removed[] = [];

let prefs: Prefs = { waUpdates: true, push: true, findMe: false, fullQuality: false, wifiOnly: false, othersDownload: true, muteDuringEvents: false };

export const people = {
  async list(celebrationId: string): Promise<Guest[]> { await wait(); void celebrationId; return [...guests].sort((a, b) => b.uploads - a.uploads); },
  async setRole(celebrationId: string, id: string, role: Role) { void celebrationId; await wait(); const g = guests.find((x) => x.id === id); if (g) g.role = role; },
  async remove(celebrationId: string, id: string) { void celebrationId; await wait(); const i = guests.findIndex((x) => x.id === id); if (i >= 0) guests.splice(i, 1); },
  async remind(celebrationId: string, ids: string[]) { void celebrationId; await wait(400); return ids.length; },
  async setEvents(celebrationId: string, id: string, ev: 'all' | string[]) { void celebrationId; await wait(); const g = guests.find((x) => x.id === id); if (g) g.events = ev; },
};

export const inbox = {
  async list(): Promise<Notice[]> { await wait(); return notices; },
  async markAllRead() { notices = notices.map((n) => ({ ...n, read: true })); },
  async markRead(id: string) { notices = notices.map((n) => (n.id === id ? { ...n, read: true } : n)); },
  unreadCount: () => notices.filter((n) => !n.read).length,
};

export const moderation = {
  async remove(celebrationId: string, ids: string[], state: 'deleted' | 'hidden') { void celebrationId;
    await wait(300);
    for (const id of ids) {
      const p = photos.find((x) => x.id === id);
      if (p) { p.hidden = true; removed.unshift({ photo: p, state, at: MOCK_NOW.toISOString() }); }
    }
  },
  async list(celebrationId: string): Promise<Removed[]> { void celebrationId; await wait(); return removed; },
  async restore(celebrationId: string, ids: string[]) { void celebrationId;
    await wait(300);
    for (const id of ids) {
      const i = removed.findIndex((r) => r.photo.id === id);
      if (i >= 0) { removed[i].photo.hidden = false; removed.splice(i, 1); }
    }
  },
  async purge(celebrationId: string, ids: string[]) { void celebrationId; await wait(300); for (const id of ids) { const i = removed.findIndex((r) => r.photo.id === id); if (i >= 0) removed.splice(i, 1); } },
  async report(celebrationId: string, photoId: string) { void celebrationId; await wait(); void photoId; },
  async pending(celebrationId: string): Promise<Photo[]> { void celebrationId; await wait(); return []; },
  async approve(celebrationId: string, ids: string[]) { void celebrationId; void ids; await wait(); },
};

export const uploads = {
  /** Uploads one asset into a sub-event. Firebase: Storage put + Firestore doc; Cloud Function makes thumbnails. */
  async put(celebrationId: string, a: PickedAsset, subEventId: string, by: { id: string; name: string }, opts?: UploadOpts): Promise<Photo> { void celebrationId;
    opts?.onProgress?.(0.5); await wait(350); opts?.onProgress?.(1);
    const s = subEvents.find((x) => x.id === subEventId);
    const p: Photo = { id: opts?.id ?? `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, subEventId, uri: a.uri, width: a.width, height: a.height,
      takenAt: a.takenAt ?? MOCK_NOW.toISOString(), uploadedBy: by, tags: ['candid'], hidden: false };
    photos.push(p);
    if (s) s.photoCount += 1;
    return p;
  },
  mine: async (celebrationId: string, userId: string): Promise<Photo[]> => { void celebrationId; return photos.filter((p) => p.uploadedBy.id === userId && !p.hidden); },
};

export const admin = {
  async createPartsInvite(celebrationId: string, subEventIds: string[]): Promise<string> { await wait(); return `https://sceno.app/${celebrationId}?i=${subEventIds.length}demo`; },
  async setHoldUploads(celebrationId: string, on: boolean) { await wait(); const c = celebrations.find((x) => x.id === celebrationId); if (c) c.holdUploads = on; },
  async deleteEvent(celebrationId: string) { await wait(300); void celebrationId; },
  async stats(celebrationId: string): Promise<AdminStats> {
    await wait(); void celebrationId;
    return { guests: 0, photos: photos.filter((p) => !p.hidden).length, uploaders: new Set(photos.map((p) => p.uploadedBy.id)).size, waiting: 0, pending: 0, removed: removed.length, notJoined: guests.filter((g) => !g.joined).length };
  },
  async publish(celebrationId: string) { await wait(500); const c = celebrations.find((x) => x.id === celebrationId); if (c) c.published = true; },
  async create(input: NewCelebration): Promise<Celebration> {
    await wait(500);
    const id = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `event-${Date.now()}`;
    const start = input.startsAt ? new Date(input.startsAt) : new Date(MOCK_NOW.getTime() + 30 * 86400000);
    const c: Celebration = { id, title: { en: input.name }, city: { en: input.city }, venue: { en: input.city }, startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 2 * 86400000).toISOString(), coverAccent: '#7A1E2C', myRole: 'admin', published: false };
    celebrations.unshift(c);
    if (input.kind === 'wedding') {
      const presets: [string, string][] = [['Mehendi', '#A3B57A'], ['Haldi', '#F2C14E'], ['Sangeet', '#C9A9E0'], ['Pheras', '#E8A0B4'], ['Reception', '#D9B8BD']];
      const picked = presets.filter(([n]) => input.parts?.includes(n));
      for (const [name, accent] of picked.length ? picked : [['Wedding day', '#E8A0B4'] as [string, string]]) {
        subEvents.push({ id: `${id}-${name.toLowerCase().replace(/\s+/g, '-')}`, celebrationId: id, name, startsAt: start.toISOString(), place: { en: input.city },
          accent, private: name === 'Pheras' && input.private, photoCount: 0, guestCount: 0, timeTbd: true });
      }
    }
    return c;
  },
  async saveSubEvent(celebrationId: string, input: SubEventInput, id?: string): Promise<string> {
    await wait(300);
    const existing = id ? subEvents.find((s) => s.id === id) : undefined;
    const data = { ...input, timeTbd: false, endsAt: input.endsAt ?? undefined, dress: input.dress ?? undefined, note: input.note ?? undefined, mapLink: input.mapLink ?? undefined };
    if (existing) { Object.assign(existing, data); return existing.id; }
    const nid = `${celebrationId}-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now() % 10000}`;
    subEvents.push({ id: nid, celebrationId, photoCount: 0, guestCount: 0, ...data });
    return nid;
  },
  async deleteSubEvent(celebrationId: string, id: string) { void celebrationId; await wait(200); const i = subEvents.findIndex((s) => s.id === id); if (i >= 0) subEvents.splice(i, 1); },
  inviteLink: (celebrationId: string) => `https://sceno.app/${celebrationId}`,
  async setPartCover(celebrationId: string, subEventId: string, u: PartCoverUpdate): Promise<void> {
    void celebrationId; await wait(300);
    const s = subEvents.find((x) => x.id === subEventId); if (!s) return;
    if (u.clear) s.cover = undefined; else if (u.mediaUri && u.kind) s.cover = { url: u.mediaUri, kind: u.kind };
  },
  async setInvite(celebrationId: string, u: InviteUpdate): Promise<Celebration | undefined> {
    await wait(300);
    const c = celebrations.find((x) => x.id === celebrationId); if (!c) return undefined;
    if (u.clearMedia) c.inviteMedia = undefined;
    else if (u.mediaUri && u.kind) c.inviteMedia = { url: u.mediaUri, kind: u.kind };
    if (u.text !== undefined) c.inviteText = u.text ?? undefined;
    return c;
  },
};

export const settings = {
  get: async () => prefs,
  set: async (patch: Partial<Prefs>) => { prefs = { ...prefs, ...patch }; return prefs; },
};
