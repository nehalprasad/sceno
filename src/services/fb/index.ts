/**
 * Firebase backend. Same shape as ./mock so screens don't care which one runs.
 *
 * Firestore layout
 *   users/{uid}                         name, phone, avatarUrl, prefs
 *   users/{uid}/notices/{nid}           kind, text{en,hi}, at, read, link
 *   celebrations/{cid}                  title, city, venue, startsAt, endsAt, coverAccent, ownerId, published, stats
 *   celebrations/{cid}/members/{uid}    uid, name, phone, relation, role, uploads, events, joinedAt
 *   celebrations/{cid}/invites/{iid}    name, phone, invitedAt, joined
 *   celebrations/{cid}/subEvents/{sid}  name, startsAt, endsAt, place, dress, note, accent, private, photoCount, guestCount
 *   celebrations/{cid}/photos/{pid}     subEventId, url, storagePath, width, height, takenAt, uploaderId, uploaderName,
 *                                       tags, state(visible|hidden|deleted|pending), stateAt, private, reports,
 *                                       thumbUrl (~400px), mediumUrl (~1200px) written by functions/src/thumbs.ts
 * Counters (photoCount, stats, uploads) are kept by Cloud Functions, never by the app.
 */
import {
  collection, collectionGroup, deleteDoc, getCountFromServer, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc,
  Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { onAuthStateChanged, signInWithCustomToken, signOut as fbSignOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fb } from '../firebase';
import type {
  SubEventInput, InviteUpdate, InviteMedia, PartCoverUpdate, AdminStats, Celebration, Guest, NewCelebration, Notice, OtpChannelResult, WaLoginStart, Photo, PickedAsset, Prefs, UploadOpts, Removed, Role, SubEvent, User,
} from '../types';

const iso = (v: unknown): string => (v instanceof Timestamp ? v.toDate().toISOString() : typeof v === 'string' ? v : new Date().toISOString());
const call = <I, O>(name: string) => httpsCallable<I, O>(fb().fns, name);
const uid = () => fb().auth.currentUser?.uid ?? null;

// Which celebration a sub-event / photo id lives in (screens pass bare ids).
const where_ = new Map<string, string>();
let activeCid: string | null = null;
const cidOf = (id: string) => where_.get(id) ?? activeCid;

let me: User | null = null;

async function loadMe(u: { uid: string; phoneNumber?: string | null }): Promise<User> {
  const snap = await getDoc(doc(fb().db, 'users', u.uid));
  const d = snap.data() ?? {};
  me = { id: u.uid, name: d.name ?? '', phone: d.phone ?? u.phoneNumber ?? '', avatar: d.avatarUrl };
  return me;
}

// ---------- Auth ----------
export const auth = {
  async requestOtp(phone: string, channel: 'whatsapp' | 'sms' = 'whatsapp'): Promise<OtpChannelResult> {
    const r = await call<{ phone: string; channel: string }, OtpChannelResult>('sendOtp')({ phone, channel });
    return r.data;
  },
  async verifyOtp(requestId: string, code: string, name: string, phone: string): Promise<User> {
    let r;
    try { r = await call<{ requestId: string; code: string; name: string }, { token: string; uid: string }>('verifyOtp')({ requestId, code, name }); }
    catch (e) { throw new Error((e as Error).message === 'expired' ? 'expired' : 'bad_code'); }
    const cred = await signInWithCustomToken(fb().auth, r.data.token);
    const u = await loadMe(cred.user);
    if (!u.name) { me = { ...u, name, phone }; }
    return me!;
  },
  async startWaLogin(phone: string, name: string): Promise<WaLoginStart> {
    const r = await call<{ phone: string; name: string }, WaLoginStart>('startWaLogin')({ phone, name });
    return r.data;
  },
  /** Null while the guest hasn't sent the WhatsApp message yet; signs in once they have. */
  async checkWaLogin(loginId: string, secret: string, name: string, phone: string): Promise<User | null> {
    const r = await call<{ loginId: string; secret: string; name: string }, { status: string; token?: string }>('checkWaLogin')({ loginId, secret, name });
    if (r.data.status !== 'verified' || !r.data.token) return null;
    const cred = await signInWithCustomToken(fb().auth, r.data.token);
    const u = await loadMe(cred.user);
    if (!u.name) { me = { ...u, name, phone }; }
    return me!;
  },
  /** Admin re-verify before permanent deletes: a fresh WhatsApp code for the signed-in person. */
  async startReverify(): Promise<WaLoginStart> {
    return (await call<object, WaLoginStart>('startReverify')({})).data;
  },
  /** True once the message arrived; the server then allows deletes for 5 minutes. */
  async checkReverify(loginId: string, secret: string): Promise<boolean> {
    return (await call<{ loginId: string; secret: string }, { status: string }>('checkReverify')({ loginId, secret })).data.status === 'verified';
  },
  /** Emulator / dev only: pretends the WhatsApp message arrived. */
  async devVerifyWaLogin(loginId: string, secret: string): Promise<void> {
    await call<{ loginId: string; secret: string }, unknown>('devVerifyWaLogin')({ loginId, secret });
  },
  /** Waits for Firebase to restore the saved session (AsyncStorage), then loads the profile. */
  restore(): Promise<User | null> {
    return new Promise((resolve) => {
      const off = onAuthStateChanged(fb().auth, async (u) => {
        off();
        if (!u) { me = null; return resolve(null); }
        // A saved login whose account no longer exists (database reset, account deleted):
        // wipe everything stored on the phone so the app starts completely fresh.
        const wipe = async () => { me = null; await fbSignOut(fb().auth).catch(() => {}); await AsyncStorage.clear().catch(() => {}); resolve(null); };
        try {
          await u.getIdToken(true); // fails if the account was deleted on the server
          const exists = (await getDoc(doc(fb().db, 'users', u.uid))).exists();
          if (!exists) return wipe();
          resolve(await loadMe(u));
        } catch { await wipe(); }
      });
    });
  },
  async updateProfile(patch: { name?: string; avatarUri?: string }): Promise<User | null> {
    const id = uid(); if (!id || !me) return null;
    const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.name) data.name = patch.name;
    if (patch.avatarUri) {
      const path = `avatars/${id}.jpg`;
      await putFile(path, patch.avatarUri);
      data.avatarUrl = await getDownloadURL(ref(fb().storage, path));
    }
    await setDoc(doc(fb().db, 'users', id), data, { merge: true });
    me = { ...me, ...(patch.name ? { name: patch.name } : {}), ...(data.avatarUrl ? { avatar: data.avatarUrl as string } : {}) };
    return me;
  },
  async deleteAccount() { await call('deleteAccount')({}); await auth.signOut(); },
  async signOut() { me = null; await fbSignOut(fb().auth).catch(() => {}); },
};

// ---------- Celebrations ----------
function toCelebration(id: string, d: Record<string, any>, role: Role): Celebration {
  return {
    id, title: d.title, city: d.city, venue: d.venue ?? d.city, startsAt: iso(d.startsAt), endsAt: iso(d.endsAt),
    coverAccent: d.coverAccent ?? '#7A1E2C', joinCode: d.joinCode ?? undefined, myRole: role, kind: d.kind, published: !!d.published, subEventCount: d.subEventCount, guestCount: d.stats?.guests,
    inviteMedia: d.inviteMedia ?? undefined, holdUploads: d.holdUploads === true, inviteText: d.inviteText ?? undefined, inviteTextI18n: d.inviteTextI18n?.en === d.inviteText ? d.inviteTextI18n : undefined,
  };
}
async function myRole(cid: string): Promise<Role> {
  const id = uid(); if (!id) return 'guest';
  const m = await getDoc(doc(fb().db, 'celebrations', cid, 'members', id));
  return (m.data()?.role as Role) ?? 'guest';
}
function toSub(cid: string, id: string, d: Record<string, any>): SubEvent {
  where_.set(id, cid);
  return {
    id, celebrationId: cid, name: d.name, startsAt: iso(d.startsAt), endsAt: d.endsAt ? iso(d.endsAt) : undefined,
    place: d.place, dress: d.dress ?? undefined, note: d.note ?? undefined, accent: d.accent ?? '#F2C14E', private: !!d.private, mapsQuery: d.mapsQuery, mapLink: d.mapLink ?? undefined, cover: d.cover ?? undefined,
    photoCount: d.photoCount ?? 0, guestCount: d.guestCount ?? 0, timeTbd: !!d.timeTbd,
  };
}

export const events = {
  async listMine(): Promise<Celebration[]> {
    const id = uid(); if (!id) return [];
    const ms = await getDocs(query(collectionGroup(fb().db, 'members'), where('uid', '==', id)));
    const out = await Promise.all(ms.docs.map(async (m) => {
      const cid = m.ref.parent.parent!.id;
      const c = await getDoc(doc(fb().db, 'celebrations', cid));
      return c.exists() ? toCelebration(cid, c.data(), m.data().role) : null;
    }));
    return out.filter((c): c is Celebration => !!c).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  },
  async get(id: string): Promise<Celebration | undefined> {
    activeCid = id;
    const c = await getDoc(doc(fb().db, 'celebrations', id));
    return c.exists() ? toCelebration(id, c.data(), await myRole(id)) : undefined;
  },
  /** Public invite preview, readable before sign-in (see firestore.rules: invitePreview). */
  async byInvite(code: string): Promise<Celebration | undefined> {
    const c = await getDoc(doc(fb().db, 'invitePreviews', code));
    if (c.exists()) return toCelebration(code, c.data(), 'guest');
    // A name-based code ("ishan-pinki") points at the real id.
    const j = await getDoc(doc(fb().db, 'joinCodes', code));
    const cid = j.exists() ? (j.data().cid as string) : undefined;
    if (!cid) return undefined;
    const p = await getDoc(doc(fb().db, 'invitePreviews', cid));
    return p.exists() ? toCelebration(cid, p.data(), 'guest') : undefined;
  },
  /** `invite` is the ?i= code of a link for chosen parts; without it the guest sees every public part. */
  async join(celebrationId: string, invite?: string): Promise<void> {
    await call<{ celebrationId: string; invite?: string }, unknown>('joinCelebration')({ celebrationId, ...(invite ? { invite } : {}) });
  },
  async subEvents(celebrationId: string): Promise<SubEvent[]> {
    activeCid = celebrationId;
    // Rules aren't filters: guests must ask only for non-private parts or the whole query is refused.
    const id = uid();
    const m = id ? (await getDoc(doc(fb().db, 'celebrations', celebrationId, 'members', id))).data() : undefined;
    const role = (m?.role as Role) ?? 'guest';
    const col = collection(fb().db, 'celebrations', celebrationId, 'subEvents');
    // Invited to chosen parts only: rules can't prove `sid in events` for a query, so read each part.
    if (role === 'guest' && Array.isArray(m?.events)) {
      const got = await Promise.all((m!.events as string[]).map((sid) => getDoc(doc(col, sid)).catch(() => null)));
      return got.filter((d) => d?.exists()).map((d) => toSub(celebrationId, d!.id, d!.data()!))
        .filter((x) => !x.private).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    const q = role === 'guest' ? query(col, where('private', '==', false), orderBy('startsAt')) : query(col, orderBy('startsAt'));
    const s = await getDocs(q);
    return s.docs.map((d) => toSub(celebrationId, d.id, d.data()));
  },
  async subEvent(id: string): Promise<SubEvent | undefined> {
    const cid = cidOf(id); if (!cid) return undefined;
    const d = await getDoc(doc(fb().db, 'celebrations', cid, 'subEvents', id));
    return d.exists() ? toSub(cid, id, d.data()) : undefined;
  },
};

// ---------- Photos ----------
function toPhoto(cid: string, id: string, d: Record<string, any>): Photo {
  where_.set(id, cid);
  return {
    id, subEventId: d.subEventId, uri: d.url, width: d.width ?? 1000, height: d.height ?? 1000, takenAt: iso(d.takenAt),
    uploadedBy: { id: d.uploaderId, name: d.uploaderName ?? '' }, tags: d.tags ?? [], hidden: d.state !== 'visible', noDownload: d.noDownload === true,
    thumb: d.thumbUrl ?? undefined, medium: d.mediumUrl ?? undefined,
  };
}
export const photoService = {
  async forSubEvent(subEventId: string): Promise<Photo[]> {
    const cid = cidOf(subEventId); if (!cid) return [];
    // The private filter lets security rules prove guests never read family-only photos.
    const sub = await events.subEvent(subEventId);
    const s = await getDocs(query(collection(fb().db, 'celebrations', cid, 'photos'),
      where('subEventId', '==', subEventId), where('state', '==', 'visible'), where('private', '==', !!sub?.private), orderBy('takenAt'), limit(500)));
    return s.docs.map((d) => toPhoto(cid, d.id, d.data()));
  },
  async get(id: string): Promise<Photo | undefined> {
    const cid = cidOf(id); if (!cid) return undefined;
    const d = await getDoc(doc(fb().db, 'celebrations', cid, 'photos', id));
    return d.exists() ? toPhoto(cid, id, d.data()) : undefined;
  },
};

async function putFile(path: string, uri: string, contentType = 'image/jpeg', onProgress?: (f: number) => void) {
  const blob = await (await fetch(uri)).blob();
  await new Promise<void>((resolve, reject) => {
    uploadBytesResumable(ref(fb().storage, path), blob, { contentType }).on('state_changed',
      (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), reject, () => resolve());
  });
}

export const uploads = {
  /** Storage first, then the Firestore doc; the onPhotoCreated function updates every counter. */
  async put(celebrationId: string, a: PickedAsset, subEventId: string, by: { id: string; name: string }, opts?: UploadOpts): Promise<Photo> {
    const col = collection(fb().db, 'celebrations', celebrationId, 'photos');
    const pref = opts?.id ? doc(col, opts.id) : doc(col);
    // Retries reuse the same id, so a photo that already landed is never written twice.
    if (opts?.id) { const prev = await getDoc(pref); if (prev.exists()) return toPhoto(celebrationId, pref.id, prev.data()); }
    const [sub, cel, role] = await Promise.all([
      getDoc(doc(fb().db, 'celebrations', celebrationId, 'subEvents', subEventId)),
      getDoc(doc(fb().db, 'celebrations', celebrationId)), myRole(celebrationId)]);
    const held = cel.data()?.holdUploads === true && role !== 'admin' && role !== 'coadmin';
    const path = `celebrations/${celebrationId}/${by.id}/${pref.id}.jpg`;
    await putFile(path, a.uri, 'image/jpeg', opts?.onProgress);
    const url = await getDownloadURL(ref(fb().storage, path));
    const data = {
      subEventId, url, storagePath: path, width: a.width, height: a.height,
      takenAt: a.takenAt ? Timestamp.fromDate(new Date(a.takenAt)) : serverTimestamp(),
      uploaderId: by.id, uploaderName: by.name, tags: [], state: held ? 'pending' : 'visible', private: sub.data()?.private === true, createdAt: serverTimestamp(),
    };
    await setDoc(pref, data);
    return toPhoto(celebrationId, pref.id, { ...data, takenAt: a.takenAt ?? new Date().toISOString() });
  },
  async mine(celebrationId: string, userId: string): Promise<Photo[]> {
    const s = await getDocs(query(collection(fb().db, 'celebrations', celebrationId, 'photos'),
      where('uploaderId', '==', userId), where('state', 'in', ['visible', 'pending']), orderBy('takenAt', 'desc'), limit(60)));
    return s.docs.map((d) => toPhoto(celebrationId, d.id, d.data()));
  },
};

// ---------- Guests and roles ----------
export const people = {
  async list(celebrationId: string): Promise<Guest[]> {
    const [ms, inv] = await Promise.all([
      getDocs(collection(fb().db, 'celebrations', celebrationId, 'members')),
      getDocs(query(collection(fb().db, 'celebrations', celebrationId, 'invites'), where('joined', '==', false))),
    ]);
    const joined: Guest[] = ms.docs.map((d) => {
      const m = d.data();
      return { id: d.id, name: m.name ?? '', relation: m.relation ?? '', role: m.role, uploads: m.uploads ?? 0, events: m.events ?? 'all', joined: true, phone: m.phone };
    });
    const pending: Guest[] = inv.docs.map((d) => {
      const m = d.data();
      return { id: d.id, name: m.name ?? m.phone, relation: m.relation ?? '', role: 'guest', uploads: 0, events: 'all', joined: false, invitedAt: iso(m.invitedAt), phone: m.phone };
    });
    return [...joined.sort((a, b) => b.uploads - a.uploads), ...pending];
  },
  async setRole(celebrationId: string, id: string, role: Role) {
    await updateDoc(doc(fb().db, 'celebrations', celebrationId, 'members', id), { role });
  },
  /** 'all' or the sub-event ids this guest may see (enforced in firestore.rules). */
  async setEvents(celebrationId: string, id: string, ev: 'all' | string[]) {
    await updateDoc(doc(fb().db, 'celebrations', celebrationId, 'members', id), { events: ev });
  },
  async remove(celebrationId: string, id: string) {
    await deleteDoc(doc(fb().db, 'celebrations', celebrationId, 'members', id));
  },
  async remind(celebrationId: string, ids: string[]) {
    const r = await call<{ celebrationId: string; inviteIds: string[] }, { sent: number }>('remindInvites')({ celebrationId, inviteIds: ids });
    return r.data.sent;
  },
};

// ---------- Notifications ----------
let unread = 0;
export const inbox = {
  async list(): Promise<Notice[]> {
    const id = uid(); if (!id) return [];
    const s = await getDocs(query(collection(fb().db, 'users', id, 'notices'), orderBy('at', 'desc'), limit(50)));
    const list = s.docs.map((d) => { const n = d.data(); return { id: d.id, kind: n.kind, text: n.text, at: iso(n.at), read: !!n.read, link: n.link } as Notice; });
    unread = list.filter((n) => !n.read).length;
    return list;
  },
  async markAllRead() {
    const id = uid(); if (!id) return;
    const s = await getDocs(query(collection(fb().db, 'users', id, 'notices'), where('read', '==', false)));
    const b = writeBatch(fb().db); s.docs.forEach((d) => b.update(d.ref, { read: true })); await b.commit();
    unread = 0;
  },
  async markRead(nid: string) {
    const id = uid(); if (!id) return;
    await updateDoc(doc(fb().db, 'users', id, 'notices', nid), { read: true });
  },
  unreadCount: () => unread,
};

// ---------- Moderation ----------
export const moderation = {
  async remove(celebrationId: string, ids: string[], state: 'deleted' | 'hidden') {
    const b = writeBatch(fb().db);
    ids.forEach((id) => b.update(doc(fb().db, 'celebrations', celebrationId, 'photos', id), { state, stateAt: serverTimestamp() }));
    await b.commit();
  },
  async list(celebrationId: string): Promise<Removed[]> {
    const s = await getDocs(query(collection(fb().db, 'celebrations', celebrationId, 'photos'), where('state', 'in', ['deleted', 'hidden'])));
    return s.docs.map((d) => ({ photo: toPhoto(celebrationId, d.id, d.data()), state: d.data().state, at: iso(d.data().stateAt) }));
  },
  /** Photos held for approval (event setting holdUploads). */
  async pending(celebrationId: string): Promise<Photo[]> {
    const s = await getDocs(query(collection(fb().db, 'celebrations', celebrationId, 'photos'), where('state', '==', 'pending'), limit(300)));
    return s.docs.map((d) => toPhoto(celebrationId, d.id, d.data())).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  },
  async approve(celebrationId: string, ids: string[]) { await moderation.restore(celebrationId, ids); },
  async restore(celebrationId: string, ids: string[]) {
    const b = writeBatch(fb().db);
    ids.forEach((id) => b.update(doc(fb().db, 'celebrations', celebrationId, 'photos', id), { state: 'visible', stateAt: serverTimestamp() }));
    await b.commit();
  },
  async purge(celebrationId: string, ids: string[]) {
    // Throws Error('reverify') when the admin hasn't confirmed with a code in the last 5 minutes.
    await call<{ celebrationId: string; photoIds: string[] }, unknown>('purgePhotos')({ celebrationId, photoIds: ids });
  },
  async report(celebrationId: string, photoId: string) {
    await call<{ celebrationId: string; photoId: string }, unknown>('reportPhoto')({ celebrationId, photoId });
  },
};

// ---------- Admin ----------
export const admin = {
  /** Owner only; throws Error('reverify') unless confirmed with a code in the last 5 minutes. */
  async deleteEvent(celebrationId: string) {
    await call<{ celebrationId: string }, unknown>('deleteCelebration')({ celebrationId });
  },
  async stats(celebrationId: string): Promise<AdminStats> {
    const [c, removed, inv, held] = await Promise.all([
      getDoc(doc(fb().db, 'celebrations', celebrationId)),
      getDocs(query(collection(fb().db, 'celebrations', celebrationId, 'photos'), where('state', 'in', ['deleted', 'hidden']))),
      getDocs(query(collection(fb().db, 'celebrations', celebrationId, 'invites'), where('joined', '==', false))),
      getCountFromServer(query(collection(fb().db, 'celebrations', celebrationId, 'photos'), where('state', '==', 'pending'))),
    ]);
    const st = c.data()?.stats ?? {};
    return { guests: st.guests ?? 0, photos: st.photos ?? 0, uploaders: st.uploaders ?? 0, waiting: (st.reported ?? 0) + held.data().count, pending: held.data().count, removed: removed.size, notJoined: inv.size };
  },
  async publish(celebrationId: string) {
    await call<{ celebrationId: string }, unknown>('publishStory')({ celebrationId });
  },
  async create(input: NewCelebration): Promise<Celebration> {
    const r = await call<NewCelebration, { id: string }>('createCelebration')(input);
    return (await events.get(r.data.id))!;
  },
  async saveSubEvent(celebrationId: string, input: SubEventInput, id?: string): Promise<string> {
    const data = {
      name: input.name, startsAt: Timestamp.fromDate(new Date(input.startsAt)),
      endsAt: input.endsAt ? Timestamp.fromDate(new Date(input.endsAt)) : null,
      place: input.place, dress: input.dress ?? null, note: input.note ?? null, private: input.private, accent: input.accent,
      ...(input.mapLink !== undefined ? { mapLink: input.mapLink } : {}),
      timeTbd: !!input.timeTbd,
    };
    const col = collection(fb().db, 'celebrations', celebrationId, 'subEvents');
    if (id) { await updateDoc(doc(col, id), data); return id; }
    const ref_ = doc(col);
    await setDoc(ref_, { ...data, photoCount: 0, guestCount: 0 });
    return ref_.id;
  },
  async deleteSubEvent(celebrationId: string, id: string) {
    await deleteDoc(doc(fb().db, 'celebrations', celebrationId, 'subEvents', id));
  },
  inviteLink: (celebrationId: string, invite?: string) => `https://sceno.app/${celebrationId}${invite ? `?i=${invite}` : ''}`,
  /** A link that lets guests see only the chosen parts. Returns the full link. */
  async createPartsInvite(celebrationId: string, subEventIds: string[]): Promise<string> {
    const r = doc(collection(fb().db, 'celebrations', celebrationId, 'inviteLinks'));
    await setDoc(r, { events: subEventIds, createdBy: uid(), createdAt: serverTimestamp() });
    return admin.inviteLink(celebrationId, r.id);
  },
  async setHoldUploads(celebrationId: string, on: boolean) {
    await updateDoc(doc(fb().db, 'celebrations', celebrationId), { holdUploads: on });
  },
  /** Uploads a part's cover photo/teaser to Storage under the event and stores it on the part. */
  async setPartCover(celebrationId: string, subEventId: string, u: PartCoverUpdate): Promise<void> {
    const id = uid(); if (!id) return;
    let cover: InviteMedia | null = null;
    if (!u.clear && u.mediaUri && u.kind) {
      const ext = u.kind === 'video' ? 'mp4' : 'jpg';
      const path = `celebrations/${celebrationId}/${id}/part-${subEventId}-${Date.now()}.${ext}`;
      await putFile(path, u.mediaUri, u.kind === 'video' ? 'video/mp4' : 'image/jpeg');
      cover = { url: await getDownloadURL(ref(fb().storage, path)), kind: u.kind };
    } else if (!u.clear) return;
    await updateDoc(doc(fb().db, 'celebrations', celebrationId, 'subEvents', subEventId), { cover });
  },
  /** Uploads the invite card/video to Storage and stores it (and any edited message) on the event. */
  async setInvite(celebrationId: string, u: InviteUpdate): Promise<Celebration | undefined> {
    const id = uid(); if (!id) return undefined;
    const patch: Record<string, unknown> = {};
    if (u.clearMedia) patch.inviteMedia = null;
    else if (u.mediaUri && u.kind) {
      const ext = u.kind === 'video' ? 'mp4' : 'jpg';
      const path = `celebrations/${celebrationId}/${id}/invite-${Date.now()}.${ext}`;
      await putFile(path, u.mediaUri, u.kind === 'video' ? 'video/mp4' : 'image/jpeg');
      patch.inviteMedia = { url: await getDownloadURL(ref(fb().storage, path)), kind: u.kind };
    }
    if (u.text !== undefined) patch.inviteText = u.text;
    if (Object.keys(patch).length) await updateDoc(doc(fb().db, 'celebrations', celebrationId), patch);
    return events.get(celebrationId);
  },
};

// ---------- Preferences ----------
const DEFAULT_PREFS: Prefs = { waUpdates: true, push: true, findMe: false, fullQuality: false, wifiOnly: false, othersDownload: true, muteDuringEvents: false };
export const settings = {
  async get(): Promise<Prefs> {
    const id = uid(); if (!id) return DEFAULT_PREFS;
    const d = await getDoc(doc(fb().db, 'users', id));
    return { ...DEFAULT_PREFS, ...(d.data()?.prefs ?? {}) };
  },
  async set(patch: Partial<Prefs>): Promise<Prefs> {
    const id = uid(); const next = { ...(await settings.get()), ...patch };
    if (id) await setDoc(doc(fb().db, 'users', id), { prefs: next }, { merge: true });
    return next;
  },
};
