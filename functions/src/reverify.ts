/**
 * Admin re-verify: before permanent deletes (purge photos, delete event) the admin sends a fresh
 * WhatsApp code (same free flow as login). Success unlocks a 5-minute window.
 *   startReverify   callable {}                  -> same shape as startWaLogin (dev: confirm via devVerifyWaLogin)
 *   checkReverify   callable {loginId, secret}   -> {status:'pending'} | {status:'verified', until}
 *   deleteCelebration callable {celebrationId}   owner only, needs the window
 * Firestore: reverify/{uid} until (functions only)
 */
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import { createWaLogin, WA_SECRETS } from './waLogin';

const WINDOW_MS = 5 * 60 * 1000;
const db = () => getFirestore();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const me = (uid?: string) => { if (!uid) throw new HttpsError('unauthenticated', 'sign_in'); return uid; };

/** Throws failed-precondition 'reverify' unless the person confirmed with a code in the last 5 minutes. */
export async function requireFreshVerify(uid: string) {
  const until = (await db().doc(`reverify/${uid}`).get()).get('until') as Timestamp | undefined;
  if (!until || until.toMillis() < Date.now()) throw new HttpsError('failed-precondition', 'reverify');
}

export const startReverify = onCall({ secrets: WA_SECRETS }, async (req) => {
  const uid = me(req.auth?.uid);
  const phone = (await db().doc(`users/${uid}`).get()).get('phone') ?? (await getAuth().getUser(uid)).phoneNumber;
  if (!phone) throw new HttpsError('failed-precondition', 'no_phone');
  return createWaLogin(phone, { purpose: 'reverify', uid });
});

export const checkReverify = onCall(async (req) => {
  const uid = me(req.auth?.uid);
  const { loginId, secret } = req.data as { loginId: unknown; secret: unknown };
  if (typeof loginId !== 'string' || typeof secret !== 'string' || !loginId) throw new HttpsError('invalid-argument', 'bad_request');
  const ref = db().collection('waLogins').doc(loginId);
  return db().runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d || d.secretHash !== hash(secret) || d.purpose !== 'reverify' || d.uid !== uid) throw new HttpsError('not-found', 'unknown');
    if (d.status !== 'verified') {
      if ((d.expiresAt as Timestamp).toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'expired');
      return { status: 'pending' };
    }
    const until = Timestamp.fromMillis(Date.now() + WINDOW_MS);
    tx.delete(ref);
    tx.set(db().doc(`reverify/${uid}`), { until });
    return { status: 'verified', until: until.toMillis() };
  });
});

export const deleteCelebration = onCall(async (req) => {
  const uid = me(req.auth?.uid);
  const { celebrationId } = req.data as { celebrationId: unknown };
  if (typeof celebrationId !== 'string' || !celebrationId) throw new HttpsError('invalid-argument', 'bad_request');
  const ref = db().doc(`celebrations/${celebrationId}`);
  const c = await ref.get();
  if (!c.exists) throw new HttpsError('not-found', 'unknown');
  if (c.get('ownerId') !== uid) throw new HttpsError('permission-denied', 'not_allowed');
  await requireFreshVerify(uid);
  await getStorage().bucket().deleteFiles({ prefix: `celebrations/${celebrationId}/` }).catch(() => {});
  await db().recursiveDelete(ref);
  await db().doc(`invitePreviews/${celebrationId}`).delete().catch(() => {});
  return { ok: true };
});
