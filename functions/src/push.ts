/**
 * Free phone push via the Expo push service (no FCM/APNs keys to manage here, no paid templates).
 * Tokens live on users/{uid}.pushTokens (written by the app). Respects prefs.push and prefs.muteDuringEvents.
 */
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const db = () => getFirestore();

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100; // Expo accepts up to 100 messages per request
const PHOTO_PUSH_WINDOW_MS = 30 * 60 * 1000;
const REMIND_BEFORE_MS = 2 * 60 * 60 * 1000;

export type Localized = { en: string; hi: string };
export type PushMsg = { title: string | Localized; body: string | Localized; link?: string | null };
type ExpoMsg = { to: string; title: string; body: string; sound: 'default'; data: { link: string | null } };
type Ticket = { status: 'ok' | 'error'; details?: { error?: string } };

const pick = (v: string | Localized, lang: string) => (typeof v === 'string' ? v : lang === 'hi' && v.hi ? v.hi : v.en);
const isExpoToken = (t: unknown): t is string => typeof t === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(t);

/** Is anything in one of this person's celebrations happening right now? */
async function inLiveEvent(uid: string, now: number): Promise<boolean> {
  const ms = await db().collectionGroup('members').where('uid', '==', uid).get();
  for (const m of ms.docs) {
    const c = await m.ref.parent.parent!.get();
    const s = c.get('startsAt'), e = c.get('endsAt');
    const start = s instanceof Timestamp ? s.toMillis() : Date.parse(s), end = e instanceof Timestamp ? e.toMillis() : Date.parse(e);
    if (start <= now && now <= (end || start + 86400000)) return true;
  }
  return false;
}

/** Builds the Expo messages for these people, skipping anyone who turned push off. Exported for tests. */
export async function buildMessages(uids: string[], msg: PushMsg, now = Date.now()) {
  const out: { uid: string; m: ExpoMsg }[] = [];
  const unique = [...new Set(uids)];
  for (let i = 0; i < unique.length; i += 100) {
    const refs = unique.slice(i, i + 100).map((u) => db().doc(`users/${u}`));
    const snaps = refs.length ? await db().getAll(...refs) : [];
    for (const s of snaps) {
      const d = s.data(); if (!d) continue;
      const tokens = (d.pushTokens ?? []).filter(isExpoToken) as string[];
      if (!tokens.length || d.prefs?.push === false) continue;
      if (d.prefs?.muteDuringEvents && (await inLiveEvent(s.id, now))) continue;
      const lang = d.lang === 'hi' ? 'hi' : 'en';
      for (const to of tokens) out.push({ uid: s.id, m: { to, title: pick(msg.title, lang), body: pick(msg.body, lang), sound: 'default', data: { link: msg.link ?? null } } });
    }
  }
  return out;
}

/** Sends a push to people's phones. Never throws: push is best-effort on top of the in-app notice. */
export async function sendPush(uids: string[], msg: PushMsg): Promise<{ sent: number; dropped: number }> {
  let sent = 0, dropped = 0;
  try {
    const all = await buildMessages(uids, msg);
    for (let i = 0; i < all.length; i += CHUNK) {
      const part = all.slice(i, i + CHUNK);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { accept: 'application/json', 'accept-encoding': 'gzip, deflate', 'content-type': 'application/json' },
        body: JSON.stringify(part.map((p) => p.m)),
      });
      if (!res.ok) { console.warn('expo push', res.status); continue; }
      const tickets = ((await res.json()) as { data?: Ticket[] }).data ?? [];
      const dead = new Map<string, string[]>();
      tickets.forEach((t, k) => {
        if (t.status === 'ok') sent++;
        else if (t.details?.error === 'DeviceNotRegistered') { const p = part[k]; dead.set(p.uid, [...(dead.get(p.uid) ?? []), p.m.to]); }
      });
      for (const [u, toks] of dead) { dropped += toks.length; await db().doc(`users/${u}`).update({ pushTokens: FieldValue.arrayRemove(...toks) }); }
    }
  } catch (e) { console.warn('sendPush failed', e); }
  return { sent, dropped };
}

/** In-app notice + phone push in one go (same as notify() in index.ts, which can't be imported here). */
export async function noticeAndPush(uids: string[], kind: 'photos' | 'reminder' | 'change' | 'mine', title: Localized, body: Localized, link: string) {
  const text = { en: `${title.en}. ${body.en}`, hi: `${title.hi}। ${body.hi}` };
  for (let i = 0; i < uids.length; i += 400) {
    const b = db().batch();
    uids.slice(i, i + 400).forEach((u) => b.set(db().collection(`users/${u}/notices`).doc(), { kind, text, link, read: false, at: FieldValue.serverTimestamp() }));
    await b.commit();
  }
  return sendPush(uids, { title, body, link });
}

const nameOf = (v: unknown, fallback: Localized): Localized =>
  !v ? fallback : typeof v === 'string' ? { en: v, hi: v } : { en: (v as Localized).en, hi: (v as Localized).hi || (v as Localized).en };

const membersOf = async (cid: string, onlyFamily = false) =>
  (await db().collection(`celebrations/${cid}/members`).get()).docs
    .filter((m) => !onlyFamily || m.get('role') !== 'guest').map((m) => m.id);

/** Every 15 min: remind members ~2 h before each sub-event starts (once per sub-event). */
export const remindSubEvents = onSchedule({ schedule: 'every 15 minutes', timeZone: 'Asia/Kolkata' }, async () => {
  await runSubEventReminders(Date.now());
});

export async function runSubEventReminders(now: number) {
  const from = Timestamp.fromMillis(now + REMIND_BEFORE_MS - 15 * 60 * 1000), to = Timestamp.fromMillis(now + REMIND_BEFORE_MS);
  const subs = await db().collectionGroup('subEvents').where('startsAt', '>', from).where('startsAt', '<=', to).get();
  let n = 0;
  for (const s of subs.docs) {
    if (s.get('pushRemindedAt')) continue;
    const cid = s.ref.parent.parent!.id;
    const name = s.get('name') as string | Localized;
    const en = typeof name === 'string' ? name : name.en, hi = typeof name === 'string' ? name : name.hi || name.en;
    await s.ref.update({ pushRemindedAt: FieldValue.serverTimestamp() });
    await noticeAndPush(await membersOf(cid, !!s.get('private')), 'reminder',
      { en: `${en} starts in 2 hours`, hi: `${hi} 2 घंटे में शुरू` },
      { en: 'Get ready, and add your photos to the album', hi: 'तैयार हो जाइए, और अपनी फ़ोटो एल्बम में जोड़िए' },
      `/event/${s.id}`);
    n++;
  }
  return n;
}

/**
 * New photos: at most one push per sub-event per 30 min. The first upload in a window opens it;
 * uploads during the window are counted and sent together when the next window opens.
 */
export const onPhotoPush = onDocumentCreated('celebrations/{cid}/photos/{pid}', async (e) => {
  const p = e.data?.data(); if (!p?.subEventId || p.state === 'pending') return; // held photos push on approval (access.ts)
  await photoAdded(e.params.cid, p.subEventId, p.uploaderId, Date.now());
});

export async function photoAdded(cid: string, sid: string, uploaderId: string | undefined, now: number) {
  const ref = db().doc(`celebrations/${cid}/pushState/${sid}`);
  const due = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const pending = (s.get('pending') ?? 0) + 1;
    const last = s.get('lastAt') ?? 0;
    if (now - last < PHOTO_PUSH_WINDOW_MS) { tx.set(ref, { pending }, { merge: true }); return 0; }
    tx.set(ref, { pending: 0, lastAt: now }, { merge: true });
    return pending;
  });
  if (!due) return 0;
  const sub = await db().doc(`celebrations/${cid}/subEvents/${sid}`).get();
  const name = sub.get('name') as string | Localized | undefined;
  const en = !name ? 'the album' : typeof name === 'string' ? name : name.en;
  const hi = !name ? 'एल्बम' : typeof name === 'string' ? name : name.hi || name.en;
  const to = (await membersOf(cid, !!sub.get('private'))).filter((u) => u !== uploaderId);
  await noticeAndPush(to, 'photos',
    { en: `${due} new photo${due === 1 ? '' : 's'} in ${en}`, hi: `${hi} में ${due} नई फ़ोटो` },
    { en: 'Tap to see them', hi: 'देखने के लिए टैप करें' },
    `/event/${sid}`);
  return due;
}

const same = (a: unknown, b: unknown) =>
  a instanceof Timestamp && b instanceof Timestamp ? a.isEqual(b) : JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** An admin moved a part (time or place): tell everyone who can see it. */
export const onSubEventChanged = onDocumentUpdated('celebrations/{cid}/subEvents/{sid}', async (e) => {
  const before = e.data?.before.data(), after = e.data?.after.data();
  if (!before || !after) return;
  await subEventChanged(e.params.cid, e.params.sid, before, after);
});

export async function subEventChanged(cid: string, sid: string, before: Record<string, unknown>, after: Record<string, unknown>) {
  const timeMoved = !same(before.startsAt, after.startsAt) || !same(before.endsAt, after.endsAt);
  const placeMoved = !same(before.place, after.place);
  if (!timeMoved && !placeMoved) return false;
  // A new start time needs a new 2-hour reminder.
  if (!same(before.startsAt, after.startsAt) && after.pushRemindedAt) {
    await db().doc(`celebrations/${cid}/subEvents/${sid}`).update({ pushRemindedAt: FieldValue.delete() });
  }
  const n = nameOf(after.name, { en: 'An event', hi: 'एक इवेंट' });
  const what = timeMoved && placeMoved ? { en: 'time and place', hi: 'समय और जगह' } : timeMoved ? { en: 'time', hi: 'समय' } : { en: 'place', hi: 'जगह' };
  await noticeAndPush(await membersOf(cid, !!after.private), 'change',
    { en: `${n.en}: ${what.en} changed`, hi: `${n.hi}: ${what.hi} बदल गया` },
    { en: 'Tap to see the new details', hi: 'नई जानकारी देखने के लिए टैप करें' },
    `/event/${sid}`);
  return true;
}

/** The app calls this when its upload queue finishes: "your N uploads are done". */
export const uploadsDone = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign_in');
  const { celebrationId, count } = (req.data ?? {}) as { celebrationId?: string; count?: number };
  const n = Math.floor(Number(count));
  if (typeof celebrationId !== 'string' || !celebrationId || !(n > 0) || n > 1000) throw new HttpsError('invalid-argument', 'bad_request');
  const m = await db().doc(`celebrations/${celebrationId}/members/${req.auth.uid}`).get();
  if (!m.exists) throw new HttpsError('permission-denied', 'not_allowed');
  await noticeAndPush([req.auth.uid], 'mine',
    { en: `Your ${n} upload${n === 1 ? ' is' : 's are'} done`, hi: `आपकी ${n} फ़ोटो अपलोड हो गईं` },
    { en: 'Thanks for adding to the album', hi: 'एल्बम में जोड़ने के लिए धन्यवाद' },
    '/album');
  return { ok: true };
});
