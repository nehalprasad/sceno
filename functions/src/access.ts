/**
 * Per-guest invite links and upload approval.
 *   celebrations/{cid}/inviteLinks/{code}  events: string[] (sub-event ids), createdBy, createdAt  (admins write, see firestore.rules)
 *   celebrations/{cid}.holdUploads          true = guests' new photos start as state 'pending'
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { photoAdded } from './push';

const db = () => getFirestore();

/** Parts a new member may see: 'all' for a plain event link, else the invite's chosen sub-events. */
export async function partsForInvite(cid: string, code?: string | null): Promise<'all' | string[]> {
  if (!code) return 'all';
  const s = await db().doc(`celebrations/${cid}/inviteLinks/${code}`).get();
  if (!s.exists) throw new HttpsError('not-found', 'bad_invite');
  const ev = s.get('events');
  return Array.isArray(ev) && ev.length ? ev.filter((x): x is string => typeof x === 'string') : 'all';
}

/**
 * A held photo didn't count when it was created (see onPhotoCreated). On approval, add the
 * per-person counters here; onPhotoUpdated already moves photoCount and stats.photos.
 */
export const onPhotoApproved = onDocumentUpdated('celebrations/{cid}/photos/{pid}', async (e) => {
  const before = e.data?.before.data(); const after = e.data?.after.data();
  if (!before || !after || before.state !== 'pending' || after.state !== 'visible') return;
  const { cid } = e.params;
  const sref = db().doc(`celebrations/${cid}/subEvents/${after.subEventId}`);
  const mref = db().doc(`celebrations/${cid}/members/${after.uploaderId}`);
  const uref = sref.collection('uploaders').doc(after.uploaderId);
  await db().runTransaction(async (tx) => {
    const [s, m, u] = await Promise.all([tx.get(sref), tx.get(mref), tx.get(uref)]);
    const firstUpload = (m.get('uploads') ?? 0) === 0;
    if (s.exists && !u.exists) { tx.update(sref, { guestCount: FieldValue.increment(1) }); tx.set(uref, { at: FieldValue.serverTimestamp() }); }
    if (m.exists) tx.update(mref, { uploads: FieldValue.increment(1) });
    if (firstUpload) tx.update(db().doc(`celebrations/${cid}`), { 'stats.uploaders': FieldValue.increment(1) });
  });
  await photoAdded(cid, after.subEventId, after.uploaderId, Date.now());
});
