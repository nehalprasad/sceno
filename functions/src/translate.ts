/**
 * Auto-translation of what admins write.
 *
 *   celebrations/{cid}                    title, city, venue (Localized), inviteText (string) -> inviteTextI18n
 *   celebrations/{cid}/subEvents/{sid}    place, dress, note (Localized)
 *
 * Each field ends up as { en, hi, mr, ta, te, bn, gu, pa, _src }. `en` is what the admin typed (any language;
 * Google detects it). `_src` remembers the text the other languages were made from, so a translation runs only
 * when the admin's text changes, and our own write never triggers another round. Event names (Haldi…) are not
 * touched: sub-event `name` is not in the list.
 *
 * Engine: Google Cloud Translation API (Basic, v2), called with the function's own service account, no key.
 *   Free: first 500,000 characters a month. Past that: US$20 per million characters (billed per character sent,
 *   ×7 here since each text goes to 7 languages). A typical event (~2,000 characters of admin text) costs ~14,000.
 *   One-time setup: enable "Cloud Translation API" in the Google Cloud console for this project.
 * Emulator: no call is made; each language gets "[xx] text" so the flow is testable offline.
 *   Set TRANSLATE_LIVE=true in functions/.env.local to call the real API from the emulator.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

export const TARGETS = ['hi'] as const; // English + Hindi only for now
type Loc = { en?: string; _src?: string } & Partial<Record<(typeof TARGETS)[number], string>>;

const mock = () => process.env.FUNCTIONS_EMULATOR === 'true' && process.env.TRANSLATE_LIVE !== 'true';

async function accessToken(): Promise<string> {
  const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } });
  if (!r.ok) throw new Error(`metadata token ${r.status}`);
  return ((await r.json()) as { access_token: string }).access_token;
}

/** Translates many strings into one language in a single request. */
async function translateMany(texts: string[], target: string): Promise<string[]> {
  if (mock()) return texts; // emulator: keep the admin's words, never fake placeholder text
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? '';
  const r = await fetch('https://translation.googleapis.com/language/translate/v2', {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json', 'x-goog-user-project': project },
    body: JSON.stringify({ q: texts, target, format: 'text' }),
  });
  if (!r.ok) throw new Error(`translate ${target} ${r.status} ${await r.text()}`);
  const d = (await r.json()) as { data: { translations: { translatedText: string; detectedSourceLanguage?: string }[] } };
  // If the admin already wrote in this language, keep their words.
  return d.data.translations.map((t, i) => (t.detectedSourceLanguage === target ? texts[i] : t.translatedText));
}

/** Builds the update for every field whose source text changed. Exported for tests. */
export async function translatePatch(data: Record<string, unknown>, fields: string[], plain: Record<string, string> = {}) {
  const jobs: { key: string; text: string; base: Loc }[] = [];
  for (const f of fields) {
    const v = data[f] as Loc | null | undefined;
    const text = v?.en?.trim();
    if (text && v!._src !== text) jobs.push({ key: f, text, base: v! });
  }
  for (const [f, out] of Object.entries(plain)) {
    const text = typeof data[f] === 'string' ? (data[f] as string).trim() : '';
    const cur = data[out] as Loc | undefined;
    if (text && cur?._src !== text) jobs.push({ key: out, text, base: { en: text } });
    if (!text && cur) jobs.push({ key: out, text: '', base: {} }); // admin cleared the message
  }
  if (!jobs.length) return null;
  const todo = jobs.filter((j) => j.text);
  const results = await Promise.all(TARGETS.map((lang) => (todo.length ? translateMany(todo.map((j) => j.text), lang) : Promise.resolve([]))));
  const patch: Record<string, unknown> = {};
  for (const j of jobs) {
    if (!j.text) { patch[j.key] = null; continue; }
    const i = todo.indexOf(j);
    const out: Loc = { en: j.text, _src: j.text };
    TARGETS.forEach((lang, li) => { out[lang] = results[li][i]; });
    patch[j.key] = out;
  }
  return patch;
}

export const translateCelebration = onDocumentWritten('celebrations/{cid}', async (e) => {
  const d = e.data?.after.data(); if (!d) return;
  const patch = await translatePatch(d, ['city', 'venue'], // title holds people's names: never machine-translated
    { inviteText: 'inviteTextI18n' });
  if (patch) await getFirestore().doc(e.data!.after.ref.path).update(patch);
});

export const translateSubEvent = onDocumentWritten('celebrations/{cid}/subEvents/{sid}', async (e) => {
  const d = e.data?.after.data(); if (!d) return;
  const patch = await translatePatch(d, ['place', 'dress', 'note']);
  if (patch) await getFirestore().doc(e.data!.after.ref.path).update(patch);
});
