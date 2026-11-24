// Design tokens from the Event Album design canvas.
export const colors = {
  ivory: '#FBF6EE', // ground
  paper: '#FFFDF8', // raised surfaces
  ink: '#2A1A14',
  inkSoft: '#4A3A32', // body copy on ivory
  muted: '#6B5A50',
  maroon: '#7A1E2C',
  maroonDeep: '#5A1520',
  marigold: '#F2C14E',
  line: '#E4D8C8', // card borders
  lineStrong: '#D8CBBB', // chip borders
  field: '#8C7B70', // input borders
  privateLine: '#D9B8BD',
  danger: '#A12A2A',
} as const;

// Accent per sub-event; also used for placeholder tiles while photos load.
export const eventAccents: Record<string, string> = {
  haldi: '#F2C14E',
  mehendi: '#A3B57A',
  sangeet: '#C9A9E0',
  pheras: '#E8A0B4',
  reception: '#D9B8BD',
};

export const radius = { tile: 6, field: 12, card: 16, panel: 18, hero: 20, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const fonts = {
  latin: {
    display: 'CormorantGaramond_700Bold',
    displaySemi: 'CormorantGaramond_600SemiBold',
    displayItalic: 'CormorantGaramond_600SemiBold_Italic',
    body: 'Inter_400Regular',
    bodyMedium: 'Inter_500Medium',
    bodySemi: 'Inter_600SemiBold',
    bodyBold: 'Inter_700Bold',
  },
  devanagari: {
    display: 'NotoSerifDevanagari_700Bold',
    displaySemi: 'NotoSerifDevanagari_600SemiBold',
    displayItalic: 'NotoSerifDevanagari_600SemiBold',
    body: 'NotoSansDevanagari_400Regular',
    bodyMedium: 'NotoSansDevanagari_500Medium',
    bodySemi: 'NotoSansDevanagari_600SemiBold',
    bodyBold: 'NotoSansDevanagari_700Bold',
  },
} as const;

export type FontRole = keyof typeof fonts.latin;

export type Script = Exclude<keyof typeof fonts, never>;
/** Which Noto face family a UI language renders in. */
export const scriptOf = (lang: string): Script =>
  (({ hi: 'devanagari' }) as Record<string, Script>)[lang] ?? 'latin';
/** Font faces for a language; `fontsFor(lang).body` for TextInputs. */
export const fontsFor = (lang: string) => fonts[scriptOf(lang)];
