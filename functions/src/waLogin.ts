/**
 * Free WhatsApp login ("guest sends the code").
 *
 *   startWaLogin   callable  {phone, name}            -> {loginId, secret, code, waNumber, expiresInSec}
 *   checkWaLogin   callable  {loginId, secret, name}  -> {status:'pending'} | {status:'verified', uid, token}
 *   devVerifyWaLogin callable (dev only)              -> marks the login verified without Meta
 *   waWebhook      HTTPS     Meta Cloud API webhook: GET verify handshake, POST signed messages
 *
 * The guest opens wa.me/<SCENO_WA_NUMBER>?text=Sceno code 482913. Messages a user starts are free;
 * our "You're in" reply falls inside the 24 h service window, so it is free too.
 * Firestore: waLogins/{id}  phone, code, secretHash, status(pending|verified), expiresAt, createdAt
 */
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const META_WA_TOKEN = defineSecret('META_WA_TOKEN');
const META_APP_SECRET = defineSecret('META_APP_SECRET');
const META_WA_PHONE_ID = defineSecret('META_WA_PHONE_ID');
const META_VERIFY_TOKEN = defineSecret('META_VERIFY_TOKEN');
const SCENO_WA_NUMBER = defineSecret('SCENO_WA_NUMBER');

const TTL_MS = 10 * 60 * 1000;
const db = () => getFirestore();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const validPhone = (p: unknown): p is string => typeof p === 'string' && /^\+91[6-9]\d{9}$/.test(p);
const isDev = () => process.env.FUNCTIONS_EMULATOR === 'true' || META_WA_TOKEN.value() === 'dev';
const DEV_NUMBER = '15551234567'; // placeholder shown in dev when no number is set
const CODES_PER_HOUR = 5;

/**
 * At most 5 codes per phone per rolling hour, shared by the WhatsApp flow, the typed-code
 * fallback (sendOtp) and admin re-verify. Throws resource-exhausted 'hourly_limit' with retryAfterSec.
 */
export async function takeLoginSlot(phone: string) {
  const ref = db().collection('loginLimits').doc(phone);
  await db().runTransaction(async (tx) => {
    const now = Date.now();
    const recent = (((await tx.get(ref)).get('at') as number[] | undefined) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= CODES_PER_HOUR) {
      const retryAfterSec = Math.ceil((recent[0] + 3_600_000 - now) / 1000);
      throw new HttpsError('resource-exhausted', 'hourly_limit', { retryAfterSec });
    }
    tx.set(ref, { at: [...recent, now], updatedAt: Timestamp.now() });
  });
}

/** Creates a pending WhatsApp code for `phone`. `extra` marks re-verify logins (purpose, uid). */
export async function createWaLogin(phone: string, extra: Record<string, unknown> = {}) {
  await takeLoginSlot(phone);
  // A code unique among live logins, so the webhook can find it by code alone.
  let code = '';
  for (let i = 0; i < 5 && !code; i++) {
    const c = String(randomInt(100000, 1_000_000));
    const clash = await db().collection('waLogins').where('code', '==', c).where('status', '==', 'pending').limit(1).get();
    if (clash.empty) code = c;
  }
  if (!code) throw new HttpsError('unavailable', 'try_again');
  const secret = randomBytes(24).toString('hex');
  const ref = await db().collection('waLogins').add({
    phone, code, secretHash: hash(secret), status: 'pending', ...extra,
    expiresAt: Timestamp.fromMillis(Date.now() + TTL_MS), createdAt: Timestamp.now(),
  });
  const waNumber = (SCENO_WA_NUMBER.value() || (isDev() ? DEV_NUMBER : '')).replace(/\D/g, '');
  if (!waNumber) throw new HttpsError('failed-precondition', 'not_configured');
  return { loginId: ref.id, secret, code, waNumber, expiresInSec: TTL_MS / 1000, dev: isDev() };
}
export const WA_SECRETS = [META_WA_TOKEN, SCENO_WA_NUMBER];

export const startWaLogin = onCall({ secrets: [META_WA_TOKEN, SCENO_WA_NUMBER] }, async (req) => {
  const { phone } = req.data as { phone: unknown };
  if (!validPhone(phone)) throw new HttpsError('invalid-argument', 'bad_phone');
  return createWaLogin(phone);
});

export const checkWaLogin = onCall(async (req) => {
  const { loginId, secret, name } = req.data as { loginId: unknown; secret: unknown; name: unknown };
  if (typeof loginId !== 'string' || typeof secret !== 'string' || !loginId) throw new HttpsError('invalid-argument', 'bad_request');
  const ref = db().collection('waLogins').doc(loginId);
  const phone = await db().runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d || d.secretHash !== hash(secret) || d.purpose) throw new HttpsError('not-found', 'unknown'); // re-verify codes never mint tokens
    if (d.status !== 'verified') {
      if ((d.expiresAt as Timestamp).toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'expired');
      return null;
    }
    tx.delete(ref); // one token per verified login
    return d.phone as string;
  });
  if (!phone) return { status: 'pending' };
  const cleanName = String(name || '').trim().slice(0, 60);
  const auth = getAuth();
  const user = await auth.getUserByPhoneNumber(phone).catch(() => auth.createUser({ phoneNumber: phone, displayName: cleanName || undefined }));
  const uref = db().doc(`users/${user.uid}`);
  const existing = await uref.get();
  await uref.set({ phone, ...(existing.get('name') ? {} : { name: cleanName }), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { status: 'verified', uid: user.uid, token: await auth.createCustomToken(user.uid) };
});

/** Dev only (emulator, or META_WA_TOKEN = "dev"): stands in for the guest's WhatsApp message. */
export const devVerifyWaLogin = onCall({ secrets: [META_WA_TOKEN] }, async (req) => {
  if (!isDev()) throw new HttpsError('permission-denied', 'not_dev');
  const { loginId, secret } = req.data as { loginId: string; secret: string };
  const ref = db().collection('waLogins').doc(String(loginId));
  const d = (await ref.get()).data();
  if (!d || d.secretHash !== hash(String(secret))) throw new HttpsError('not-found', 'unknown');
  await ref.update({ status: 'verified', verifiedAt: Timestamp.now() });
  return { ok: true };
});

function signatureOk(raw: Buffer, header: unknown, appSecret: string): boolean {
  if (!appSecret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const want = Buffer.from(createHmac('sha256', appSecret).update(raw).digest('hex'));
  const got = Buffer.from(header.slice(7));
  return got.length === want.length && timingSafeEqual(got, want);
}

async function reply(to: string, text: string) {
  if (isDev()) { console.log(`[dev] WhatsApp reply to +${to}: ${text}`); return; }
  const res = await fetch(`https://graph.facebook.com/v21.0/${META_WA_PHONE_ID.value()}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${META_WA_TOKEN.value()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  if (!res.ok) console.warn(`whatsapp reply ${res.status}`);
}

type WaMessage = { from?: string; type?: string; text?: { body?: string } };
type WaPayload = { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] };

/** Returns what happened, for logs and tests. */
async function handleMessage(m: WaMessage): Promise<string> {
  const from = String(m.from ?? '').replace(/\D/g, '');
  const code = m.type === 'text' ? m.text?.body?.match(/\b(\d{6})\b/)?.[1] : undefined;
  if (!from || !code) return 'ignored';
  const snap = await db().collection('waLogins').where('code', '==', code).where('status', '==', 'pending').limit(1).get();
  const doc = snap.docs[0];
  if (!doc || (doc.get('expiresAt') as Timestamp).toMillis() < Date.now()) {
    await reply(from, 'That Sceno code has expired. Open the app and try again. / यह कोड पुराना हो गया है, ऐप में फिर से कोशिश करें।');
    return 'expired';
  }
  if (`+${from}` !== doc.get('phone')) {
    await reply(from, 'Please send this from the number you typed in Sceno. / कृपया Sceno में डाले गए नंबर से ही भेजें।');
    return 'wrong_number';
  }
  await doc.ref.update({ status: 'verified', verifiedAt: Timestamp.now() });
  await reply(from, "You're in ✅ Go back to Sceno. / आप जुड़ गए ✅ Sceno पर लौटें।");
  return 'verified';
}

export const waWebhook = onRequest({ secrets: [META_WA_TOKEN, META_APP_SECRET, META_WA_PHONE_ID, META_VERIFY_TOKEN] }, async (req, res) => {
  if (req.method === 'GET') {
    const q = req.query;
    const token = META_VERIFY_TOKEN.value();
    if (q['hub.mode'] === 'subscribe' && token && q['hub.verify_token'] === token) { res.status(200).send(String(q['hub.challenge'] ?? '')); return; }
    res.sendStatus(403); return;
  }
  if (req.method !== 'POST') { res.sendStatus(405); return; }
  if (!signatureOk(req.rawBody, req.get('x-hub-signature-256'), META_APP_SECRET.value())) { res.sendStatus(401); return; }
  const body = req.body as WaPayload;
  const results: string[] = [];
  for (const e of body.entry ?? []) for (const c of e.changes ?? []) for (const m of c.value?.messages ?? []) {
    try { results.push(await handleMessage(m)); } catch (err) { console.error('waWebhook', err); results.push('error'); }
  }
  res.status(200).json({ results }); // Meta only needs a 200
});
