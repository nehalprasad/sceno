// Noto faces for each Indic script, loaded only when that language is first used (keeps start-up light).
import * as Font from 'expo-font';
import { scriptOf, Script } from '@/theme';

const FILES: Partial<Record<Script, Record<string, number>>> = {
  devanagari: {
    NotoSerifDevanagari_600SemiBold: require('@expo-google-fonts/noto-serif-devanagari/600SemiBold/NotoSerifDevanagari_600SemiBold.ttf'),
    NotoSerifDevanagari_700Bold: require('@expo-google-fonts/noto-serif-devanagari/700Bold/NotoSerifDevanagari_700Bold.ttf'),
    NotoSansDevanagari_400Regular: require('@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf'),
    NotoSansDevanagari_500Medium: require('@expo-google-fonts/noto-sans-devanagari/500Medium/NotoSansDevanagari_500Medium.ttf'),
    NotoSansDevanagari_600SemiBold: require('@expo-google-fonts/noto-sans-devanagari/600SemiBold/NotoSansDevanagari_600SemiBold.ttf'),
    NotoSansDevanagari_700Bold: require('@expo-google-fonts/noto-sans-devanagari/700Bold/NotoSansDevanagari_700Bold.ttf'),
  },
};

const loaded = new Map<Script, Promise<void>>();
/** Resolves once the faces for `lang`'s script are usable. Latin is loaded at start-up by the root layout. */
export function loadScriptFonts(lang: string): Promise<void> {
  const s = scriptOf(lang);
  const files = FILES[s];
  if (!files) return Promise.resolve();
  if (!loaded.has(s)) loaded.set(s, Font.loadAsync(files).catch((e) => { loaded.delete(s); console.warn('font load', s, e); }));
  return loaded.get(s)!;
}
