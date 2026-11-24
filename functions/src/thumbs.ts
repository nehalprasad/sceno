/**
 * Server thumbnails.
 *
 * When a photo lands at celebrations/{cid}/{uid}/{pid}.jpg we make two upright JPEGs, never cropped:
 *   celebrations/{cid}/{uid}/thumbs/{pid}_400.jpg   grids and carousels  -> photo.thumbUrl
 *   celebrations/{cid}/{uid}/thumbs/{pid}_1200.jpg  the full-screen viewer -> photo.mediumUrl
 *
 * The app writes the photo doc right after the upload, so the two can arrive in either order:
 * makeThumbs writes the files first, then fills the doc if it exists; onPhotoCreatedThumbs fills the doc
 * if the files already exist. Deleting the original deletes its thumbnails.
 */
import { randomUUID } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onObjectDeleted, onObjectFinalized } from 'firebase-functions/v2/storage';
import sharp from 'sharp';

const SIZES = [{ px: 400, field: 'thumbUrl' }, { px: 1200, field: 'mediumUrl' }] as const;
const ORIGINAL = /^celebrations\/([^/]+)\/([^/]+)\/([^/]+)\.(jpe?g|png|heic|heif|webp)$/i;
const thumbPath = (cid: string, uid: string, pid: string, px: number) => `celebrations/${cid}/${uid}/thumbs/${pid}_${px}.jpg`;

/** Token download URL (what the client SDK's getDownloadURL returns). Admin getDownloadURL can't read the emulator. */
function tokenUrl(bucket: string, path: string, token: string) {
  const emu = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const host = emu ? `http://${emu}` : 'https://firebasestorage.googleapis.com';
  return `${host}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function urlsIfReady(cid: string, uid: string, pid: string): Promise<Record<string, string> | null> {
  const bucket = getStorage().bucket();
  const out: Record<string, string> = {};
  for (const s of SIZES) {
    const f = bucket.file(thumbPath(cid, uid, pid, s.px));
    const [exists] = await f.exists();
    if (!exists) return null;
    const [meta] = await f.getMetadata();
    const token = String(meta.metadata?.firebaseStorageDownloadTokens ?? '').split(',')[0];
    if (!token) return null;
    out[s.field] = tokenUrl(bucket.name, f.name, token);
  }
  return out;
}

async function fillDoc(cid: string, pid: string, urls: Record<string, string>) {
  const ref = getFirestore().doc(`celebrations/${cid}/photos/${pid}`);
  await getFirestore().runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (d.exists && !d.get('thumbUrl')) tx.update(ref, urls);
  });
}

export const makeThumbs = onObjectFinalized({ memory: '1GiB', timeoutSeconds: 120 }, async (e) => {
  const m = e.data.name?.match(ORIGINAL);
  if (!m || !e.data.contentType?.startsWith('image/')) return;
  const [, cid, uid, pid] = m;
  const bucket = getStorage().bucket(e.data.bucket);
  const [buf] = await bucket.file(e.data.name).download();
  for (const s of SIZES) {
    const out = await sharp(buf, { failOn: 'none' })
      .rotate() // apply EXIF orientation so the thumbnail is upright
      .resize({ width: s.px, height: s.px, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: s.px <= 400 ? 72 : 80, mozjpeg: true })
      .toBuffer();
    await bucket.file(thumbPath(cid, uid, pid, s.px)).save(out, {
      contentType: 'image/jpeg', resumable: false,
      metadata: { cacheControl: 'public, max-age=31536000, immutable', metadata: { firebaseStorageDownloadTokens: randomUUID() } },
    });
  }
  const urls = await urlsIfReady(cid, uid, pid);
  if (urls) await fillDoc(cid, pid, urls);
});

export const onPhotoCreatedThumbs = onDocumentCreated('celebrations/{cid}/photos/{pid}', async (e) => {
  const d = e.data?.data();
  const m = (d?.storagePath as string | undefined)?.match(ORIGINAL);
  if (!m || d?.thumbUrl) return;
  const urls = await urlsIfReady(m[1], m[2], m[3]);
  if (urls) await fillDoc(e.params.cid, e.params.pid, urls);
});

export const deleteThumbs = onObjectDeleted(async (e) => {
  const m = e.data.name?.match(ORIGINAL);
  if (!m) return;
  const bucket = getStorage().bucket(e.data.bucket);
  await Promise.all(SIZES.map((s) => bucket.file(thumbPath(m[1], m[2], m[3], s.px)).delete({ ignoreNotFound: true })));
});
