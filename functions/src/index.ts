/**
 * Sceno Cloud Functions (asia-south1).
 *
 * Auth        sendOtp, verifyOtp           WhatsApp code via MSG91 (SMS fallback) -> Firebase custom token
 * Events      createCelebration, joinCelebration, publishStory, remindInvites
 * Photos      onPhotoCreated, onPhotoUpdated (all counters), reportPhoto, purgePhotos, purgeDeleted (daily)
 * Account     deleteAccount
 * Public      onCelebrationWritten -> invitePreviews/{cid} (what the join screen shows before sign-in)
 *
 * Secrets for production (set once, never commit):
 *   firebase functions:secrets:set MSG91_AUTH_KEY
 *   firebase functions:secrets:set MSG91_WA_TEMPLATE      approved WhatsApp authentication template name
 *   firebase functions:secrets:set MSG91_WA_NUMBER        WhatsApp sender number
 *   firebase functions:secrets:set MSG91_SMS_TEMPLATE_ID  DLT-approved SMS template id
 * Dev mode: in the emulator, or when MSG91_AUTH_KEY is "dev", no message is sent and the code is always 123456.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createHash, randomInt } from 'node:crypto';
import { sendPush } from './push';
import { partsForInvite } from './access';

initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });
const db = getFirestore();

const MSG91_AUTH_KEY = defineSecret('MSG91_AUTH_KEY');
const MSG91_WA_TEMPLATE = defineSecret('MSG91_WA_TEMPLATE');
const MSG91_WA_NUMBER = defineSecret('MSG91_WA_NUMBER');
const MSG91_SMS_TEMPLATE_ID = defineSecret('MSG91_SMS_TEMPLATE_ID');
const MSG_SECRETS = [MSG91_AUTH_KEY, MSG91_WA_TEMPLATE, MSG91_WA_NUMBER, MSG91_SMS_TEMPLATE_ID];

const isDev = () => process.env.FUNCTIONS_EMULATOR === 'true' || MSG91_AUTH_KEY.value() === 'dev';
const DEV_CODE = '123456';
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_SEC = 30;
const MAX_ATTEMPTS = 5;
const KEEP_DELETED_DAYS = 30;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const validPhone = (p: unknown): p is string => typeof p === 'string' && /^\+91[6-9]\d{9}$/.test(p);

// ---------- helpers ----------
function signedIn(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign_in');
  return req.auth.uid;
}
async function requireRole(cid: string, uid: string, roles: string[]) {
  const m = await db.doc(`celebrations/${cid}/members/${uid}`).get();
  if (!m.exists || !roles.includes(m.get('role'))) throw new HttpsError('permission-denied', 'not_allowed');
  return m;
}
const ADMINS = ['admin', 'coadmin'];
async function notify(uids: string[], kind: string, text: { en: string; hi: string }, link?: string) {
  for (let i = 0; i < uids.length; i += 400) {
    const b = db.batch();
    uids.slice(i, i + 400).forEach((u) => b.set(db.collection(`users/${u}/notices`).doc(), { kind, text, link: link ?? null, read: false, at: FieldValue.serverTimestamp() }));
    await b.commit();
  }
  await sendPush(uids, { title: 'Sceno', body: text, link }); // every in-app notice also goes to phones
}

// ---------- WhatsApp / SMS ----------
async function sendWhatsApp(phone: string, code: string) {
  const res = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
    method: 'POST',
    headers: { authkey: MSG91_AUTH_KEY.value(), 'content-type': 'application/json' },
    body: JSON.stringify({
      integrated_number: MSG91_WA_NUMBER.value(), content_type: 'template',
      payload: {
        messaging_product: 'whatsapp', type: 'template',
        template: {
          name: MSG91_WA_TEMPLATE.value(), language: { code: 'en', policy: 'deterministic' }, namespace: null,
          to_and_components: [{ to: [phone.replace('+', '')], components: { body_1: { type: 'text', value: code }, button_1: { subtype: 'url', type: 'text', value: code } } }],
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`whatsapp ${res.status}`);
}
async function sendSms(phone: string, code: string) {
  const res = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: { authkey: MSG91_AUTH_KEY.value(), 'content-type': 'application/json' },
    body: JSON.stringify({ template_id: MSG91_SMS_TEMPLATE_ID.value(), recipients: [{ mobiles: phone.replace('+', ''), otp: code }] }),
  });
  if (!res.ok) throw new Error(`sms ${res.status}`);
}

// ---------- Auth ----------
export const sendOtp = onCall({ secrets: MSG_SECRETS }, async (req) => {
  const { phone, channel } = req.data as { phone: unknown; channel: unknown };
  if (!validPhone(phone)) throw new HttpsError('invalid-argument', 'bad_phone');
  const last = await db.collection('otp').where('phone', '==', phone).orderBy('createdAt', 'desc').limit(1).get();
  const prev = last.docs[0]?.get('createdAt') as Timestamp | undefined;
  if (prev && Date.now() - prev.toMillis() < RESEND_AFTER_SEC * 1000) throw new HttpsError('resource-exhausted', 'too_soon');
  await takeLoginSlot(phone); // 5 codes per phone per hour, shared with the WhatsApp flow

  const dev = isDev();
  const code = dev ? DEV_CODE : String(randomInt(0, 1_000_000)).padStart(6, '0');
  let used: 'whatsapp' | 'sms' = channel === 'sms' ? 'sms' : 'whatsapp';
  if (dev) {
    console.log(`[dev] OTP for ${phone}: ${code}`);
  } else {
    try {
      if (used === 'whatsapp') await sendWhatsApp(phone, code); else await sendSms(phone, code);
    } catch {
      if (used === 'sms') throw new HttpsError('unavailable', 'send_failed');
      used = 'sms'; // not on WhatsApp or template issue: fall back to SMS
      await sendSms(phone, code);
    }
  }
  const ref = await db.collection('otp').add({ phone, codeHash: hash(code), attempts: 0, channel: used, createdAt: Timestamp.now() });
  return { requestId: ref.id, resendAfterSec: RESEND_AFTER_SEC, channel: used };
});

export const verifyOtp = onCall(async (req) => {
  const { requestId, code, name } = req.data as { requestId: string; code: string; name: string };
  if (typeof requestId !== 'string' || !/^\d{6}$/.test(String(code))) throw new HttpsError('invalid-argument', 'bad_code');
  const ref = db.collection('otp').doc(requestId);
  const phone = await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d) throw new HttpsError('not-found', 'bad_code');
    if (Date.now() - (d.createdAt as Timestamp).toMillis() > CODE_TTL_MS) throw new HttpsError('deadline-exceeded', 'expired');
    if (d.attempts >= MAX_ATTEMPTS) throw new HttpsError('resource-exhausted', 'too_many');
    if (d.codeHash !== hash(String(code))) { tx.update(ref, { attempts: d.attempts + 1 }); throw new HttpsError('permission-denied', 'bad_code'); }
    tx.delete(ref);
    return d.phone as string;
  });
  const cleanName = String(name || '').trim().slice(0, 60);
  const auth = getAuth();
  const user = await auth.getUserByPhoneNumber(phone).catch(() => auth.createUser({ phoneNumber: phone, displayName: cleanName || undefined }));
  const uref = db.doc(`users/${user.uid}`);
  const existing = await uref.get();
  await uref.set({ phone, ...(existing.get('name') ? {} : { name: cleanName }), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { uid: user.uid, token: await auth.createCustomToken(user.uid) };
});

export const deleteAccount = onCall(async (req) => {
  const uid = signedIn(req);
  // Remove the person's uploads everywhere, their memberships, notices and profile, then the auth user.
  const photos = await db.collectionGroup('photos').where('uploaderId', '==', uid).get();
  const bucket = getStorage().bucket();
  for (const p of photos.docs) {
    const path = p.get('storagePath') as string | undefined;
    if (path) await bucket.file(path).delete({ ignoreNotFound: true });
    await p.ref.delete();
  }
  const ms = await db.collectionGroup('members').where('uid', '==', uid).get();
  await Promise.all(ms.docs.map((m) => m.ref.delete()));
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await bucket.file(`avatars/${uid}.jpg`).delete({ ignoreNotFound: true });
  await getAuth().deleteUser(uid);
  return { ok: true };
});

// ---------- Celebrations ----------
const WEDDING = [
  { name: 'Mehendi', accent: '#A3B57A', offsetH: 0, hours: 5 },
  { name: 'Haldi', accent: '#F2C14E', offsetH: 18, hours: 3 },
  { name: 'Sangeet', accent: '#C9A9E0', offsetH: 27.5, hours: 0 },
  { name: 'Pheras', accent: '#E8A0B4', offsetH: 41, hours: 2.5 },
  { name: 'Reception', accent: '#D9B8BD', offsetH: 52, hours: 0 },
];

/** Reserves joinCodes/{code} for this event: "ishan-pinki", then "ishan-pinki-2", "-3"... */
async function claimJoinCode(slug: string, cid: string): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const code = n === 1 ? slug : `${slug}-${n}`;
    const ok = await db.runTransaction(async (tx) => {
      const r = db.doc(`joinCodes/${code}`);
      if ((await tx.get(r)).exists) return false;
      tx.set(r, { cid, at: FieldValue.serverTimestamp() });
      return true;
    });
    if (ok) return code;
  }
  return cid;
}

export const createCelebration = onCall(async (req) => {
  const uid = signedIn(req);
  const { kind, name, city, private: priv, startsAt, endsAt, parts } = req.data as { kind: string; name: string; city: string; private: boolean; startsAt?: string; endsAt?: string; parts?: string[] };
  const title = String(name || '').trim().slice(0, 80);
  if (!title) throw new HttpsError('invalid-argument', 'name');
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event';
  // Random id underneath; the link uses a readable code from the name ("ishan-pinki"), numbered if taken.
  const cref = db.collection('celebrations').doc();
  const joinCode = await claimJoinCode(slug, cref.id);
  const parsed = startsAt ? new Date(startsAt) : null;
  const start = parsed && !isNaN(parsed.getTime()) ? parsed : new Date(Date.now() + 30 * 86400000);
  // The app sends 11:59 PM on the chosen day (the phone's time zone), so a one-day event stays one day.
  const sentEnd = endsAt ? new Date(endsAt).getTime() : NaN;
  const endsMs = sentEnd > start.getTime() && sentEnd - start.getTime() <= 86400000 ? sentEnd : start.getTime() + 5 * 3600000;
  const me = (await db.doc(`users/${uid}`).get()).data() ?? {};
  const b = db.batch();
  b.set(cref, {
    kind, title: { en: title }, city: { en: String(city || '').trim() }, venue: { en: String(city || '').trim() },
    startsAt: Timestamp.fromDate(start), endsAt: Timestamp.fromMillis(endsMs),
    coverAccent: '#7A1E2C', ownerId: uid, joinCode, published: false, private: !!priv,
    stats: { guests: 1, photos: 0, uploaders: 0, reported: 0 }, createdAt: FieldValue.serverTimestamp(),
  });
  b.set(cref.collection('members').doc(uid), { uid, name: me.name ?? '', phone: me.phone ?? '', relation: '', role: 'admin', uploads: 0, events: 'all', joinedAt: FieldValue.serverTimestamp() });
  if (kind === 'wedding') {
    // Only the parts the host ticked, all on the chosen day with the time left for them to set.
    // Nothing ticked = one "Wedding day" part. No invented dates or times.
    const picked = WEDDING.filter((s) => Array.isArray(parts) && parts.includes(s.name));
    const list = picked.length ? picked : [{ name: 'Wedding day', accent: '#E8A0B4' }];
    for (const s of list) {
      b.set(cref.collection('subEvents').doc(), {
        name: s.name, accent: s.accent, startsAt: Timestamp.fromDate(start), timeTbd: true,
        place: { en: String(city || '') }, private: s.name === 'Pheras' && !!priv, photoCount: 0, guestCount: 0,
      });
    }
  } else {
    // Other kinds start with one part the host can rename; photos need somewhere to land.
    const first = ({ birthday: 'Birthday party', party: 'Party', corporate: 'Main event', trip: 'Day 1' } as Record<string, string>)[kind] ?? 'Main event';
    b.set(cref.collection('subEvents').doc(), {
      name: first, accent: '#F2C14E', startsAt: Timestamp.fromDate(start), endsAt: Timestamp.fromMillis(endsMs),
      place: { en: String(city || '') }, private: false, photoCount: 0, guestCount: 0,
    });
  }
  await b.commit();
  return { id: cref.id };
});

/** Anyone signed in with the invite link joins as a guest; an existing role is never downgraded. */
export const joinCelebration = onCall(async (req) => {
  const uid = signedIn(req);
  const { celebrationId, invite } = req.data as { celebrationId: string; invite?: string };
  const cref = db.doc(`celebrations/${celebrationId}`);
  if (!(await cref.get()).exists) throw new HttpsError('not-found', 'no_event');
  const parts = await partsForInvite(celebrationId, invite);
  const mref = cref.collection('members').doc(uid);
  const me = (await db.doc(`users/${uid}`).get()).data() ?? {};
  const joined = await db.runTransaction(async (tx) => {
    if ((await tx.get(mref)).exists) return false;
    tx.set(mref, { uid, name: me.name ?? '', phone: me.phone ?? '', relation: '', role: 'guest', uploads: 0, events: parts, joinedAt: FieldValue.serverTimestamp() });
    tx.update(cref, { 'stats.guests': FieldValue.increment(1) });
    return true;
  });
  if (joined && me.phone) {
    const inv = await cref.collection('invites').where('phone', '==', me.phone).get();
    await Promise.all(inv.docs.map((d) => d.ref.update({ joined: true })));
  }
  return { joined };
});

/** Keeps the public join-screen preview in sync (no guest list, no photos). */
export const onCelebrationWritten = onDocumentWritten('celebrations/{cid}', async (e) => {
  const ref = db.doc(`invitePreviews/${e.params.cid}`);
  const d = e.data?.after.data();
  if (!d) return void (await ref.delete());
  const subs = await db.collection(`celebrations/${e.params.cid}/subEvents`).count().get();
  await ref.set({ joinCode: d.joinCode ?? null, title: d.title, city: d.city, venue: d.venue ?? d.city, startsAt: d.startsAt, endsAt: d.endsAt, coverAccent: d.coverAccent ?? '#7A1E2C', subEventCount: subs.data().count, inviteMedia: d.inviteMedia ?? null });
});

export const publishStory = onCall(async (req) => {
  const uid = signedIn(req);
  const { celebrationId } = req.data as { celebrationId: string };
  await requireRole(celebrationId, uid, ADMINS);
  const cref = db.doc(`celebrations/${celebrationId}`);
  await cref.update({ published: true, publishedAt: FieldValue.serverTimestamp() });
  const c = (await cref.get()).data()!;
  const ms = await cref.collection('members').get();
  const title = c.title?.en ?? '';
  await notify(ms.docs.map((m) => m.id), 'album', { en: `${title}: the full album is ready`, hi: `${c.title?.hi ?? title}: पूरा एल्बम तैयार है` }, '/album');
  // TODO: also send a WhatsApp template message to members who opted in (users/{uid}.prefs.waUpdates).
  return { notified: ms.size };
});

export const remindInvites = onCall({ secrets: MSG_SECRETS }, async (req) => {
  const uid = signedIn(req);
  const { celebrationId, inviteIds } = req.data as { celebrationId: string; inviteIds: string[] };
  await requireRole(celebrationId, uid, ADMINS);
  const refs = (inviteIds ?? []).slice(0, 500).map((id) => db.doc(`celebrations/${celebrationId}/invites/${id}`));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  let sent = 0;
  for (const s of snaps) {
    if (!s.exists || s.get('joined')) continue;
    if (isDev()) console.log(`[dev] reminder to ${s.get('phone')} for ${celebrationId}`);
    // TODO: MSG91 WhatsApp "invite reminder" template with the join link, once the template is approved.
    await s.ref.update({ remindedAt: FieldValue.serverTimestamp() });
    sent++;
  }
  return { sent };
});

// ---------- Photos ----------
/** Copy privacy from the sub-event and bump every counter. */
export const onPhotoCreated = onDocumentCreated('celebrations/{cid}/photos/{pid}', async (e) => {
  const p = e.data?.data(); if (!p) return;
  const { cid } = e.params;
  const sref = db.doc(`celebrations/${cid}/subEvents/${p.subEventId}`);
  const mref = db.doc(`celebrations/${cid}/members/${p.uploaderId}`);
  const uref = sref.collection('uploaders').doc(p.uploaderId); // marks "this person has photos here"
  await db.runTransaction(async (tx) => {
    const [s, m, u] = await Promise.all([tx.get(sref), tx.get(mref), tx.get(uref)]);
    const firstUpload = (m.get('uploads') ?? 0) === 0;
    const up = await tx.get(db.doc(`users/${p.uploaderId}`));
    tx.update(e.data!.ref, { private: !!s.get('private'), noDownload: up.get('prefs.othersDownload') === false });
    if (p.state === 'pending') return; // held for approval: counted by onPhotoUpdated + onPhotoApproved (access.ts)
    if (s.exists) tx.update(sref, { photoCount: FieldValue.increment(1), ...(u.exists ? {} : { guestCount: FieldValue.increment(1) }) });
    if (s.exists && !u.exists) tx.set(uref, { at: FieldValue.serverTimestamp() });
    if (m.exists) tx.update(mref, { uploads: FieldValue.increment(1) });
    tx.update(db.doc(`celebrations/${cid}`), { 'stats.photos': FieldValue.increment(1), ...(firstUpload ? { 'stats.uploaders': FieldValue.increment(1) } : {}) });
  });
});

/** Hide/delete/restore moves the counters; deleted photos stay restorable for 30 days. */
export const onPhotoUpdated = onDocumentUpdated('celebrations/{cid}/photos/{pid}', async (e) => {
  const before = e.data?.before.data(); const after = e.data?.after.data();
  if (!before || !after || before.state === after.state) return;
  const delta = before.state === 'visible' ? -1 : after.state === 'visible' ? 1 : 0;
  if (!delta) return;
  const { cid } = e.params;
  const b = db.batch();
  b.update(db.doc(`celebrations/${cid}/subEvents/${after.subEventId}`), { photoCount: FieldValue.increment(delta) });
  b.update(db.doc(`celebrations/${cid}`), { 'stats.photos': FieldValue.increment(delta) });
  await b.commit();
});

export const reportPhoto = onCall(async (req) => {
  const uid = signedIn(req);
  const { celebrationId, photoId } = req.data as { celebrationId: string; photoId: string };
  await requireRole(celebrationId, uid, ['guest', 'family', ...ADMINS]);
  const pref = db.doc(`celebrations/${celebrationId}/photos/${photoId}`);
  const first = await db.runTransaction(async (tx) => {
    const p = await tx.get(pref);
    if (!p.exists) throw new HttpsError('not-found', 'no_photo');
    const already = (p.get('reports') ?? 0) > 0;
    tx.update(pref, { reports: FieldValue.increment(1), reportedBy: FieldValue.arrayUnion(uid) });
    if (!already) tx.update(db.doc(`celebrations/${celebrationId}`), { 'stats.reported': FieldValue.increment(1) });
    return !already;
  });
  return { first };
});

async function purge(cid: string, docs: FirebaseFirestore.QueryDocumentSnapshot[] | FirebaseFirestore.DocumentSnapshot[]) {
  const bucket = getStorage().bucket();
  for (const d of docs) {
    if (!d.exists) continue;
    const path = d.get('storagePath') as string | undefined;
    if (path) await bucket.file(path).delete({ ignoreNotFound: true });
    await d.ref.delete();
  }
  void cid;
}

export const purgePhotos = onCall(async (req) => {
  const uid = signedIn(req);
  const { celebrationId, photoIds } = req.data as { celebrationId: string; photoIds: string[] };
  await requireRole(celebrationId, uid, ADMINS);
  await requireFreshVerify(uid); // admin confirmed with a code in the last 5 minutes
  const refs = (photoIds ?? []).slice(0, 200).map((id) => db.doc(`celebrations/${celebrationId}/photos/${id}`));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  await purge(celebrationId, snaps.filter((s) => s.get('state') !== 'visible'));
  return { ok: true };
});

export const purgeDeleted = onSchedule({ schedule: 'every day 03:00', timeZone: 'Asia/Kolkata' }, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - KEEP_DELETED_DAYS * 86400000);
  const old = await db.collectionGroup('photos').where('state', '==', 'deleted').where('stateAt', '<', cutoff).limit(500).get();
  await purge('*', old.docs);
});

export * from './push';

/** "Others can download my photos" off → mark every photo this person uploaded as noDownload (Download all skips them). */
export const onUserPrefsWritten = onDocumentWritten('users/{uid}', async (e) => {
  const was = e.data?.before.get('prefs.othersDownload') === false;
  const now = e.data?.after.get('prefs.othersDownload') === false;
  if (was === now || !e.data?.after.exists) return;
  const { uid } = e.params;
  const ms = await db.collectionGroup('members').where('uid', '==', uid).get();
  for (const m of ms.docs) {
    const ps = await m.ref.parent.parent!.collection('photos').where('uploaderId', '==', uid).get();
    for (let i = 0; i < ps.size; i += 400) {
      const b = db.batch();
      ps.docs.slice(i, i + 400).forEach((d) => b.update(d.ref, { noDownload: now }));
      await b.commit();
    }
  }
});
import { takeLoginSlot } from './waLogin';
import { requireFreshVerify } from './reverify';
export { startReverify, checkReverify, deleteCelebration } from './reverify';
export { startWaLogin, checkWaLogin, devVerifyWaLogin, waWebhook } from './waLogin';
export { makeThumbs, onPhotoCreatedThumbs, deleteThumbs } from './thumbs';
export { translateCelebration, translateSubEvent } from './translate';
export { onPhotoApproved } from './access';
