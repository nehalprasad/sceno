/**
 * Seeds the local Firebase emulator with the Aarav & Meera demo.
 *   npm run emulators        (terminal 1)
 *   npm run seed             (terminal 2)
 * Sign in on the app with +91 98765 43210 and code 123456 (dev mode); that number is the admin.
 * Refuses to run against a real project: it only talks to emulator hosts.
 */
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9098';
const projectId = process.env.GCLOUD_PROJECT ?? 'demo-sceno';
if (!projectId.startsWith('demo-')) throw new Error('Seed only runs against a demo- emulator project.');

initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();

const at = (d, h, m = 0) => Timestamp.fromDate(new Date(2026, 11, d, h, m));
const CID = 'aarav-meera';

async function user(uid, phone, name) {
  await auth.deleteUser(uid).catch(() => {});
  await auth.createUser({ uid, phoneNumber: phone, displayName: name });
  await db.doc(`users/${uid}`).set({ name, phone, prefs: { waUpdates: true, push: true } });
}

async function main() {
  await db.recursiveDelete(db.collection('celebrations'));
  await db.recursiveDelete(db.collection('invitePreviews'));

  const people = [
    ['nehal', '+919876543210', 'Nehal Prasad', 'admin', 'Friend of the groom'],
    ['meera', '+919811111111', 'Meera Sharma', 'admin', 'Bride'],
    ['kabir', '+919822222222', 'Kabir Mehta', 'coadmin', 'Groom’s brother'],
    ['priya', '+919833333333', 'Priya Nair', 'guest', 'Bride’s friend'],
    ['rohan', '+919844444444', 'Rohan Kapoor', 'guest', 'Groom’s cousin'],
    ['sunita', '+919855555555', 'Sunita Iyer', 'family', 'Bride’s aunt'],
  ];
  for (const [uid, phone, name] of people) await user(uid, phone, name);

  const c = db.doc(`celebrations/${CID}`);
  await c.set({
    kind: 'wedding', title: { en: 'Aarav & Meera', hi: 'आरव और मीरा' }, city: { en: 'Jaipur', hi: 'जयपुर' },
    venue: { en: 'Rambagh Palace, Jaipur', hi: 'रामबाग पैलेस, जयपुर' }, startsAt: at(12, 16), endsAt: at(14, 23),
    coverAccent: '#7A1E2C', ownerId: 'meera', published: false,
    stats: { guests: people.length, photos: 0, uploaders: 0, reported: 0 },
  });
  for (const [uid, phone, name, role, relation] of people) {
    await c.collection('members').doc(uid).set({ uid, name, phone, role, relation, uploads: 0, events: 'all', joinedAt: FieldValue.serverTimestamp() });
  }
  await c.collection('invites').doc().set({ name: 'Anil Verma', phone: '+919866666666', invitedAt: at(10, 12), joined: false });
  await c.collection('invites').doc().set({ name: 'Farah Khan', phone: '+919877777777', invitedAt: at(11, 9), joined: false });

  const subs = [
    ['mehendi', 'Mehendi', at(12, 16), at(12, 21), { en: 'Sheesh Mahal terrace', hi: 'शीश महल टैरेस' }, { en: 'Greens and pastels', hi: 'हरा और हल्के रंग' }, '#A3B57A', false],
    ['haldi', 'Haldi', at(13, 10), at(13, 13), { en: 'Courtyard', hi: 'आंगन' }, { en: 'Yellow; old clothes welcome', hi: 'पीला; पुराने कपड़े चलेंगे' }, '#F2C14E', false],
    ['sangeet', 'Sangeet', at(13, 19, 30), null, { en: 'Palace lawns', hi: 'पैलेस लॉन' }, { en: 'Festive, dance-ready', hi: 'उत्सव वाला, नाचने लायक' }, '#C9A9E0', false],
    ['pheras', 'Pheras', at(14, 9), at(14, 11, 30), { en: 'Temple pavilion', hi: 'मंदिर मंडप' }, { en: 'Traditional', hi: 'पारंपरिक' }, '#E8A0B4', true],
    ['reception', 'Reception', at(14, 20), null, { en: 'Durbar Hall', hi: 'दरबार हॉल' }, { en: 'Black tie or sherwani', hi: 'ब्लैक टाई या शेरवानी' }, '#D9B8BD', false],
  ];
  for (const [id, name, startsAt, endsAt, place, dress, accent, priv] of subs) {
    await c.collection('subEvents').doc(id).set({
      name, startsAt, ...(endsAt ? { endsAt } : {}), place, dress, accent, private: priv, mapsQuery: 'Rambagh Palace Jaipur', photoCount: 0, guestCount: 0,
      ...(priv ? { note: { en: 'Private ceremony. Livestream link in the family group.', hi: 'निजी समारोह। लाइव लिंक परिवार ग्रुप में।' } } : {}),
    });
  }

  // Photos are remote sample images (no Storage upload); the onPhotoCreated trigger fills every counter.
  const shapes = [[800, 1200], [1200, 800], [1000, 1000], [900, 1200], [1200, 900], [800, 1000]];
  const tags = [['rituals'], ['candid'], ['family'], ['candid', 'family'], ['rituals', 'family'], ['candid']];
  const uploaders = people.map(([uid, , name]) => ({ uid, name }));
  async function photos(sid, start, count, stepMin) {
    for (let i = 0; i < count; i++) {
      const [w, h] = shapes[i % shapes.length];
      const u = uploaders[i % uploaders.length];
      await c.collection('photos').doc(`${sid}-${i}`).set({
        subEventId: sid, url: `https://picsum.photos/seed/${sid}${i}/${w}/${h}`, width: w, height: h,
        takenAt: Timestamp.fromMillis(start.toMillis() + i * stepMin * 60000), uploaderId: u.uid, uploaderName: u.name.split(' ')[0],
        tags: tags[i % tags.length], state: 'visible', private: false, createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
  await photos('haldi', at(13, 10), 18, 5);
  await photos('mehendi', at(12, 16), 24, 12);

  // A second, past celebration where Nehal is a guest.
  const d = db.doc('celebrations/dadi-80');
  await d.set({ kind: 'birthday', title: { en: "Dadi's 80th", hi: 'दादी का 80वाँ जन्मदिन' }, city: { en: 'Lucknow', hi: 'लखनऊ' },
    startsAt: Timestamp.fromDate(new Date(2026, 9, 4, 18)), endsAt: Timestamp.fromDate(new Date(2026, 9, 4, 23)),
    coverAccent: '#5F7D45', ownerId: 'sunita', published: true, stats: { guests: 2, photos: 0, uploaders: 0, reported: 0 } });
  await d.collection('members').doc('nehal').set({ uid: 'nehal', name: 'Nehal Prasad', phone: '+919876543210', role: 'guest', relation: 'Grandson', uploads: 0, events: 'all' });
  await d.collection('members').doc('sunita').set({ uid: 'sunita', name: 'Sunita Iyer', phone: '+919855555555', role: 'admin', relation: '', uploads: 0, events: 'all' });

  // Notifications for the demo user.
  await db.recursiveDelete(db.collection('users/nehal/notices'));
  const mins = (m) => Timestamp.fromDate(new Date(2026, 11, 13, 11, 0 - m));
  const notices = [
    ['photos', '42 new photos in Haldi from Rohan, Priya and 6 others', 'Haldi में रोहन, प्रिया और 6 और की 42 नई फ़ोटो', mins(5), false, '/event/haldi'],
    ['you', "You're in 7 new photos from Haldi", 'Haldi की 7 नई फ़ोटो में आप हैं', mins(20), false, '/event/haldi'],
    ['reminder', 'Sangeet starts in 2 hours · Lawns, 19:30. Dress: festive', 'Sangeet 2 घंटे में · लॉन, 19:30। पहनावा: उत्सव वाला', mins(60), false, '/itinerary'],
    ['change', 'Venue changed for Pheras: now the Garden Pavilion', 'Pheras की जगह बदली: अब गार्डन पवेलियन', mins(180), true, '/itinerary'],
    ['album', 'Mehendi album is ready · 486 photos', 'Mehendi एल्बम तैयार है · 486 फ़ोटो', at(12, 22, 10), true, '/event/mehendi'],
  ];
  for (const [kind, en, hi, when, read, link] of notices) {
    await db.collection('users/nehal/notices').add({ kind, text: { en, hi }, at: when, read, link });
  }
  console.log('Seeded demo-sceno. Sign in with +91 98765 43210, code 123456.');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
