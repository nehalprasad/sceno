/**
 * End-to-end backend checks against the local emulator, signing in as real seeded people
 * through the same client SDK the app uses. Run after `npm run emulators` and `npm run seed`:
 *   npm run test:backend
 */
import { createRequire } from 'node:module';
const requireFn = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = { app: requireFn('firebase-admin/app'), auth: requireFn('firebase-admin/auth'), fs: requireFn('firebase-admin/firestore') };
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithCustomToken } from 'firebase/auth';
import { setLogLevel, collectionGroup, collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, query, setDoc, serverTimestamp, updateDoc, where, Timestamp } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectStorageEmulator, getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9098';
const projectId = 'demo-sceno';
admin.app.initializeApp({ projectId });
const adb = admin.fs.getFirestore();
const CID = 'aarav-meera';

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log(`  ✓ ${name}`); };
const bad = (name, e) => { fail++; console.log(`  ✗ ${name}${e ? `: ${e.message ?? e}` : ''}`); };
async function expectOk(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e); } }
async function expectDenied(name, fn) {
  try { await fn(); bad(name, new Error('was allowed')); } catch (e) {
    const code = String(e.code ?? e.message);
    /permission|unauthorized/.test(code) ? ok(name) : bad(name, e);
  }
}

let n = 0;
async function as(uid) {
  const app = initializeApp({ apiKey: 'demo-key', projectId, storageBucket: 'demo-sceno.appspot.com' }, `t${n++}`);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8085);
  const fns = getFunctions(app, 'asia-south1'); connectFunctionsEmulator(fns, '127.0.0.1', 5011);
  const st = getStorage(app); connectStorageEmulator(st, '127.0.0.1', 9198);
  if (uid) await signInWithCustomToken(auth, await admin.auth.getAuth().createCustomToken(uid));
  return { app, db, fns, st, call: (name, data) => httpsCallable(fns, name)(data) };
}

async function main() {
  setLogLevel('silent'); // expected denials would otherwise print as errors
  // A private (family-only) photo in Pheras, written with admin rights.
  await adb.doc(`celebrations/${CID}/photos/pheras-0`).set({
    subEventId: 'pheras', url: 'https://picsum.photos/seed/pheras0/800/1200', width: 800, height: 1200,
    takenAt: admin.fs.Timestamp.now(), uploaderId: 'sunita', uploaderName: 'Sunita', tags: [], state: 'visible', private: true,
  });
  await new Promise((r) => setTimeout(r, 1500));

  console.log('\nGuest privacy (Priya, guest)');
  const priya = await as('priya');
  await expectOk('reads visible Haldi photos', async () => {
    const s = await getDocs(query(collection(priya.db, `celebrations/${CID}/photos`), where('subEventId', '==', 'haldi'), where('state', '==', 'visible'), where('private', '==', false)));
    if (!s.size) throw new Error('no photos');
  });
  await expectOk('lists the itinerary without family-only parts (as the app does)', async () => {
    const s = await getDocs(query(collection(priya.db, `celebrations/${CID}/subEvents`), where('private', '==', false)));
    const names = s.docs.map((d) => d.get('name'));
    if (names.includes('Pheras') || !names.includes('Haldi')) throw new Error(names.join(','));
  });
  await expectDenied('cannot list every part including family-only ones', () => getDocs(collection(priya.db, `celebrations/${CID}/subEvents`)));
  await expectDenied('cannot read the family-only Pheras sub-event', () => getDoc(doc(priya.db, `celebrations/${CID}/subEvents/pheras`)));
  await expectDenied('cannot query family-only photos', () => getDocs(query(collection(priya.db, `celebrations/${CID}/photos`), where('subEventId', '==', 'pheras'), where('state', '==', 'visible'), where('private', '==', true))));
  await expectDenied('cannot read a family-only photo directly', () => getDoc(doc(priya.db, `celebrations/${CID}/photos/pheras-0`)));
  await expectDenied('cannot hide a photo (admins only)', () => updateDoc(doc(priya.db, `celebrations/${CID}/photos/haldi-1`), { state: 'hidden' }));
  await expectDenied('cannot make herself co-admin', () => updateDoc(doc(priya.db, `celebrations/${CID}/members/priya`), { role: 'coadmin' }));
  await expectDenied('cannot read the invite list', () => getDocs(collection(priya.db, `celebrations/${CID}/invites`)));
  await expectDenied('cannot upload a photo as someone else', () => setDoc(doc(collection(priya.db, `celebrations/${CID}/photos`)), {
    subEventId: 'haldi', url: 'x', uploaderId: 'rohan', state: 'visible', private: false, takenAt: Timestamp.now() }));
  await expectDenied('cannot mark a Pheras upload as public', () => setDoc(doc(collection(priya.db, `celebrations/${CID}/photos`)), {
    subEventId: 'pheras', url: 'x', uploaderId: 'priya', state: 'visible', private: false, takenAt: Timestamp.now() }));
  await expectDenied('cannot publish the album', () => priya.call('publishStory', { celebrationId: CID }));

  console.log('\nFamily (Sunita)');
  const sunita = await as('sunita');
  await expectOk('reads the family-only Pheras sub-event', () => getDoc(doc(sunita.db, `celebrations/${CID}/subEvents/pheras`)));
  await expectOk('reads family-only photos', async () => {
    const s = await getDocs(query(collection(sunita.db, `celebrations/${CID}/photos`), where('subEventId', '==', 'pheras'), where('state', '==', 'visible'), where('private', '==', true)));
    if (s.size !== 1) throw new Error(`got ${s.size}`);
  });

  console.log('\nOutsider (signed in, not invited)');
  await admin.auth.getAuth().createUser({ uid: 'stranger', phoneNumber: '+919899999999' }).catch(() => {});
  const stranger = await as('stranger');
  await expectDenied('cannot read the event', () => getDoc(doc(stranger.db, `celebrations/${CID}`)));
  await expectDenied('cannot read photos', () => getDoc(doc(stranger.db, `celebrations/${CID}/photos/haldi-1`)));
  await expectOk('can read the public invite preview', () => getDoc(doc(stranger.db, `invitePreviews/${CID}`)));
  await expectOk('joins with the invite link', async () => {
    await stranger.call('joinCelebration', { celebrationId: CID });
    const m = await adb.doc(`celebrations/${CID}/members/stranger`).get();
    if (m.get('role') !== 'guest') throw new Error(`role ${m.get('role')}`);
  });
  await expectOk('can read photos after joining', () => getDoc(doc(stranger.db, `celebrations/${CID}/photos/haldi-1`)));

  console.log('\nUpload (Rohan, guest)');
  const rohan = await as('rohan');
  // Wait for the seed's photo triggers to finish so the counter is settled before measuring.
  const visibleHaldi = async () => (await adb.collection(`celebrations/${CID}/photos`).where('subEventId', '==', 'haldi').where('state', '==', 'visible').get()).size;
  for (let i = 0; i < 40; i++) {
    if ((await adb.doc(`celebrations/${CID}/subEvents/haldi`).get()).get('photoCount') === await visibleHaldi()) break;
    await new Promise((res) => setTimeout(res, 500));
  }
  const before = (await adb.doc(`celebrations/${CID}/subEvents/haldi`).get()).get('photoCount');
  await expectOk('uploads a photo to Storage + Firestore, counters update', async () => {
    const pref = doc(collection(rohan.db, `celebrations/${CID}/photos`));
    const path = `celebrations/${CID}/rohan/${pref.id}.jpg`;
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]); // tiny JPEG markers
    await uploadBytes(ref(rohan.st, path), bytes, { contentType: 'image/jpeg' });
    const url = await getDownloadURL(ref(rohan.st, path));
    await setDoc(pref, { subEventId: 'haldi', url, storagePath: path, width: 1, height: 1, takenAt: Timestamp.now(), uploaderId: 'rohan', uploaderName: 'Rohan', tags: [], state: 'visible', private: false, createdAt: serverTimestamp() });
    await new Promise((r) => setTimeout(r, 2500));
    const after = (await adb.doc(`celebrations/${CID}/subEvents/haldi`).get()).get('photoCount');
    if (after !== before + 1) throw new Error(`photoCount ${before} -> ${after}`);
  });
  await expectDenied('cannot upload into someone else\'s Storage folder', () => uploadBytes(ref(rohan.st, `celebrations/${CID}/priya/x.jpg`), new Uint8Array([1]), { contentType: 'image/jpeg' }));
  await expectOk('reports a photo; admin "waiting" count rises', async () => {
    await rohan.call('reportPhoto', { celebrationId: CID, photoId: 'haldi-3' });
    const r = (await adb.doc(`celebrations/${CID}`).get()).get('stats.reported');
    if (r !== 1) throw new Error(`reported ${r}`);
  });

  console.log('\nAdmin (Nehal)');
  const nehal = await as('nehal');
  let newId;
  await expectOk('creates a wedding with only the ticked parts, on the chosen day, time not set, unique ids', async () => {
    const day = new Date(2026, 11, 3, 16).toISOString();
    const r = await nehal.call('createCelebration', { kind: 'wedding', name: 'Riya & Dev', city: 'Goa', private: true, startsAt: day, parts: ['Haldi', 'Pheras'] });
    newId = r.data.id;
    const subs = await adb.collection(`celebrations/${newId}/subEvents`).get();
    const me = await adb.doc(`celebrations/${newId}/members/nehal`).get();
    if (subs.size !== 2 || me.get('role') !== 'admin') throw new Error(`subs ${subs.size}, role ${me.get('role')}`);
    if (subs.docs.some((d) => !d.get('timeTbd') || d.get('startsAt').toDate().toISOString() !== day)) throw new Error('dates or timeTbd wrong');
    if (!subs.docs.find((d) => d.get('name') === 'Pheras')?.get('private')) throw new Error('Pheras not private');
    if (subs.docs.some((d) => ['haldi', 'pheras'].includes(d.id))) throw new Error('part ids must be unique, not names');
  });
  await expectOk('a wedding with nothing ticked gets one "Wedding day" part', async () => {
    const r = await nehal.call('createCelebration', { kind: 'wedding', name: 'Solo test', city: 'Goa', private: false, startsAt: new Date(2026, 11, 3).toISOString(), parts: [] });
    const subs = await adb.collection(`celebrations/${r.data.id}/subEvents`).get();
    if (subs.size !== 1 || subs.docs[0].get('name') !== 'Wedding day') throw new Error(subs.docs.map((d) => d.get('name')).join(','));
  });
  await expectOk('new event shows up in "My events" (collection-group query, as the app does)', async () => {
    const s = await getDocs(query(collectionGroup(nehal.db, 'members'), where('uid', '==', 'nehal')));
    const ids = s.docs.map((d) => d.ref.parent.parent.id);
    if (!ids.includes(newId) || !ids.includes(CID)) throw new Error(`got ${ids}`);
  });
  await expectDenied('cannot list someone else\'s events', () => getDocs(query(collectionGroup(priya.db, 'members'), where('uid', '==', 'nehal'))));
  await expectOk('invite preview appears for the new event', async () => {
    await new Promise((r) => setTimeout(r, 1500));
    if (!(await adb.doc(`invitePreviews/${newId}`).get()).exists) throw new Error('missing');
  });
  await expectOk('makes Priya co-admin', () => updateDoc(doc(nehal.db, `celebrations/${CID}/members/priya`), { role: 'coadmin' }));
  await expectDenied('cannot demote the bride (admin)', () => updateDoc(doc(nehal.db, `celebrations/${CID}/members/meera`), { role: 'guest' }));
  await expectOk('deletes then restores a photo; counters follow', async () => {
    const c0 = (await adb.doc(`celebrations/${CID}/subEvents/haldi`).get()).get('photoCount');
    await updateDoc(doc(nehal.db, `celebrations/${CID}/photos/haldi-4`), { state: 'deleted', stateAt: serverTimestamp() });
    await new Promise((r) => setTimeout(r, 1500));
    const c1 = (await adb.doc(`celebrations/${CID}/subEvents/haldi`).get()).get('photoCount');
    await updateDoc(doc(nehal.db, `celebrations/${CID}/photos/haldi-4`), { state: 'visible', stateAt: serverTimestamp() });
    await new Promise((r) => setTimeout(r, 1500));
    const c2 = (await adb.doc(`celebrations/${CID}/subEvents/haldi`).get()).get('photoCount');
    if (c1 !== c0 - 1 || c2 !== c0) throw new Error(`${c0} -> ${c1} -> ${c2}`);
  });
  await expectOk('permanently deletes a removed photo (purge)', async () => {
    await updateDoc(doc(nehal.db, `celebrations/${CID}/photos/haldi-5`), { state: 'deleted', stateAt: serverTimestamp() });
    await adb.doc('reverify/nehal').delete();
    await adb.doc('loginLimits/+919876543210').delete();
    const refused = await nehal.call('purgePhotos', { celebrationId: CID, photoIds: ['haldi-5'] }).then(() => 'allowed', (e) => String(e.message).split(' ')[0]);
    if (refused !== 'reverify') throw new Error(`purge without re-verify: ${refused}`);
    const rv = (await nehal.call('startReverify', {})).data;
    await nehal.call('devVerifyWaLogin', { loginId: rv.loginId, secret: rv.secret });
    if ((await nehal.call('checkReverify', { loginId: rv.loginId, secret: rv.secret })).data.status !== 'verified') throw new Error('re-verify failed');
    await nehal.call('purgePhotos', { celebrationId: CID, photoIds: ['haldi-5'] });
    if ((await adb.doc(`celebrations/${CID}/photos/haldi-5`).get()).exists) throw new Error('still there');
  });
  await expectOk('publishes the album; every member gets a notification', async () => {
    const r = await nehal.call('publishStory', { celebrationId: CID });
    const notes = await adb.collection('users/priya/notices').where('kind', '==', 'album').get();
    if (!r.data.notified || !notes.size) throw new Error('no notice');
    if (!(await adb.doc(`celebrations/${CID}`).get()).get('published')) throw new Error('not published');
  });
  await expectOk('reminds people who have not joined', async () => {
    const inv = await adb.collection(`celebrations/${CID}/invites`).where('joined', '==', false).get();
    const r = await nehal.call('remindInvites', { celebrationId: CID, inviteIds: inv.docs.map((d) => d.id) });
    if (r.data.sent !== inv.size) throw new Error(`sent ${r.data.sent}/${inv.size}`);
  });

  console.log('\nDownload permission (Rohan)');
  await expectOk('turning off "others can download" marks his photos noDownload, and back', async () => {
    await setDoc(doc(rohan.db, 'users/rohan'), { prefs: { othersDownload: false } }, { merge: true });
    await new Promise((r) => setTimeout(r, 2500));
    const s1 = await adb.collection(`celebrations/${CID}/photos`).where('uploaderId', '==', 'rohan').get();
    if (!s1.size || s1.docs.some((d) => d.get('noDownload') !== true)) throw new Error('not marked');
    await setDoc(doc(rohan.db, 'users/rohan'), { prefs: { othersDownload: true } }, { merge: true });
    await new Promise((r) => setTimeout(r, 2500));
    const s2 = await adb.collection(`celebrations/${CID}/photos`).where('uploaderId', '==', 'rohan').get();
    if (s2.docs.some((d) => d.get('noDownload') !== false)) throw new Error('not cleared');
  });

  console.log('\nAccount deletion (stranger)');
  await expectOk('removes the person, their membership and auth user', async () => {
    await stranger.call('deleteAccount', {});
    const m = await adb.doc(`celebrations/${CID}/members/stranger`).get();
    const u = await admin.auth.getAuth().getUser('stranger').catch(() => null);
    if (m.exists || u) throw new Error('left behind');
  });

  console.log('\nFree WhatsApp login (webhook)');
  {
    const { createHmac } = await import('node:crypto');
    const { readFileSync } = await import('node:fs');
    const secrets = Object.fromEntries(readFileSync(new URL('../functions/.secret.local', import.meta.url), 'utf8')
      .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
    const hook = `http://127.0.0.1:5011/${projectId}/asia-south1/waWebhook`;
    const phone = '+919812345670';
    const send = (from, text, secret = secrets.META_APP_SECRET) => {
      const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from, type: 'text', text: { body: text } }] } }] }] });
      const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
      return fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body });
    };
    await adb.doc(`loginLimits/${phone}`).delete();
    const guest = await as(null);
    const start = (await guest.call('startWaLogin', { phone, name: 'WA Guest' })).data;
    const check = () => guest.call('checkWaLogin', { loginId: start.loginId, secret: start.secret, name: 'WA Guest' }).then((r) => r.data);
    await expectOk('answers Meta\'s verify handshake, refuses a wrong token', async () => {
      const good = await fetch(`${hook}?hub.mode=subscribe&hub.verify_token=${secrets.META_VERIFY_TOKEN}&hub.challenge=42`);
      const badTok = await fetch(`${hook}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42`);
      if (good.status !== 200 || (await good.text()) !== '42' || badTok.status !== 403) throw new Error(`${good.status}/${badTok.status}`);
    });
    await expectOk('refuses a message with a bad signature', async () => {
      const r = await send(phone.slice(1), `Sceno code ${start.code}`, 'wrong-secret');
      if (r.status !== 401 || (await check()).status !== 'pending') throw new Error(`status ${r.status}`);
    });
    await expectOk('ignores the code sent from a different number', async () => {
      const r = await send('919000000001', `Sceno code ${start.code}`);
      const j = await r.json();
      if (j.results[0] !== 'wrong_number' || (await check()).status !== 'pending') throw new Error(JSON.stringify(j));
    });
    await expectOk('signs in when the right number sends the code (once)', async () => {
      const j = await (await send(phone.slice(1), `Sceno code ${start.code}`)).json();
      if (j.results[0] !== 'verified') throw new Error(JSON.stringify(j));
      const c = await check();
      if (c.status !== 'verified' || !c.token) throw new Error('no token');
      const cred = await signInWithCustomToken(getAuth(guest.app), c.token);
      if ((await adb.doc(`users/${cred.user.uid}`).get()).get('phone') !== phone) throw new Error('no profile');
      const again = await check().then(() => 'ok', () => 'gone');
      if (again !== 'gone') throw new Error('token reusable');
    });
    await expectOk('allows 5 codes per phone per hour, then refuses with a wait time', async () => {
      const p2 = '+919812345671';
      await adb.doc(`loginLimits/${p2}`).delete();
      for (let i = 0; i < 4; i++) await guest.call('startWaLogin', { phone: p2, name: 'x' });
      await guest.call('sendOtp', { phone: p2, channel: 'whatsapp' }); // the typed-code fallback shares the limit
      const sixth = await guest.call('startWaLogin', { phone: p2, name: 'x' }).then(() => null, (e) => e);
      if (String(sixth?.message ?? '').split(' ')[0] !== 'hourly_limit' || !(sixth.details?.retryAfterSec > 0)) throw new Error(String(sixth?.message ?? 'allowed'));
      await adb.doc(`loginLimits/${p2}`).delete();
    });
    await deleteApp(guest.app);
  }

  for (const x of [priya, sunita, stranger, rohan, nehal]) await deleteApp(x.app);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
