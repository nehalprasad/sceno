import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './en';
import hi from './hi';
import { screensEn, screensHi, partMediaEn, partMediaHi, accessEn, accessHi } from './screens';
import { loadScriptFonts } from './fonts';

/** UI languages, in picker order. `name` is how speakers write it. */
export const LANGS = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिन्दी' },
] as const;
export type Lang = (typeof LANGS)[number]['code'];
export const LANG_CODES = LANGS.map((x) => x.code) as Lang[];
export const isLang = (x: unknown): x is Lang => LANG_CODES.includes(x as Lang);
export const langName = (code: Lang) => LANGS.find((x) => x.code === code)!.name;

/** Loosely typed translate fn so returnObjects keys and plain keys share one signature. */
export type Tfn = (key: string, opts?: Record<string, unknown>) => any;
/** Admin-written text. `en` holds what the admin typed; the rest are filled by the translate function. */
export type Localized = { en: string } & { [K in Exclude<Lang, 'en'>]?: string };

/** First device language we support, else English. */
const deviceLang: Lang = (getLocales().map((x) => x.languageCode).find(isLang) as Lang | undefined) ?? 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, ...screensEn, partMedia: partMediaEn, access: accessEn } },
    hi: { translation: { ...hi, ...screensHi, partMedia: partMediaHi, access: accessHi } },
  },
  lng: deviceLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

const LANG_KEY = 'lang.v1';
/** The root layout waits on this: a language picked earlier wins over the device's, and its fonts are in before the first frame. */
export const fontsReady = (async () => {
  const saved = await AsyncStorage.getItem(LANG_KEY).catch(() => null);
  const lang = isLang(saved) ? saved : deviceLang;
  await loadScriptFonts(lang);
  if (lang !== i18n.language) await i18n.changeLanguage(lang);
})();

/** Switch language once its fonts are in, so no frame renders in a missing face. */
export async function setLanguage(next: Lang) {
  console.log('DBGLANG start', next);
  await loadScriptFonts(next);
  console.log('DBGLANG fonts', next);
  await i18n.changeLanguage(next);
  console.log('DBGLANG changed', i18n.language);
  AsyncStorage.setItem(LANG_KEY, next).catch(() => {});
  langListeners.forEach((f) => f(next));
}
const langListeners = new Set<(l: Lang) => void>();
/** e.g. the session saves the choice on the user doc so invites and notices can use it. */
export const onLanguageChange = (f: (l: Lang) => void) => { langListeners.add(f); return () => { langListeners.delete(f); }; };

export function useLang() {
  const { t, i18n: inst } = useTranslation();
  const lang: Lang = isLang(inst.language) ? inst.language : 'en';
  return {
    t: t as unknown as Tfn,
    lang,
    /** Pick the viewer's language from a data field; falls back to English. */
    l: (v: Localized | null | undefined) => (v ? (v[lang] || v.en) : ''),
    /** Cycles to the next language (kept for old callers; prefer the picker). */
    toggle: () => setLanguage(LANG_CODES[(LANG_CODES.indexOf(lang) + 1) % LANG_CODES.length]),
    setLang: (next: Lang) => setLanguage(next),
  };
}

export default i18n;
