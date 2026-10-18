import type { Theme, ThemeBackground } from './types';

const EPOCH = '2026-01-01T00:00:00.000Z';

function bg(partial: Partial<ThemeBackground>): ThemeBackground {
  return { type: 'color', color: '#000000', color2: '#000000', angle: 180, mediaPath: null, dim: 0, ...partial };
}

const BASE: Omit<Theme, 'id' | 'name' | 'background'> = {
  builtin: true,
  fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
  fontSize: 84,
  fontWeight: 600,
  italic: false,
  uppercase: false,
  color: '#ffffff',
  align: 'center',
  vAlign: 'middle',
  lineHeight: 1.25,
  marginX: 7,
  marginTop: 8,
  marginBottom: 12,
  shadow: true,
  shadowColor: 'rgba(0,0,0,0.85)',
  shadowBlur: 10,
  outline: false,
  outlineColor: '#000000',
  outlineWidth: 2,
  showFooter: true,
  footerSize: 30,
  footerColor: 'rgba(255,255,255,0.75)',
  titleSize: 110,
  titleColor: '#ffffff',
  updatedAt: EPOCH,
};

/** Built-in presets designed for projection in a church (high contrast, large type). */
export const BUILTIN_THEMES: Theme[] = [
  {
    ...BASE,
    id: 'builtin-midnight',
    name: 'Midnight',
    background: bg({ type: 'gradient', color: '#0b1730', color2: '#020409', angle: 160 }),
  },
  {
    ...BASE,
    id: 'builtin-black',
    name: 'Classic Black',
    shadow: false,
    background: bg({ type: 'color', color: '#000000' }),
  },
  {
    ...BASE,
    id: 'builtin-royal',
    name: 'Royal Serif',
    fontFamily: 'Georgia, Cambria, "Times New Roman", serif',
    fontWeight: 500,
    color: '#fbf6ea',
    titleColor: '#f2d48a',
    background: bg({ type: 'gradient', color: '#2a1440', color2: '#0c0614', angle: 150 }),
  },
  {
    ...BASE,
    id: 'builtin-sunrise',
    name: 'Warm Sunrise',
    background: bg({ type: 'gradient', color: '#5a2310', color2: '#1a0b14', angle: 200 }),
    titleColor: '#ffd9a0',
  },
  {
    ...BASE,
    id: 'builtin-forest',
    name: 'Forest',
    background: bg({ type: 'gradient', color: '#0f3326', color2: '#04110c', angle: 170 }),
  },
  {
    ...BASE,
    id: 'builtin-scripture',
    name: 'Scripture',
    fontFamily: 'Georgia, Cambria, "Times New Roman", serif',
    fontSize: 72,
    fontWeight: 400,
    align: 'left',
    lineHeight: 1.35,
    marginX: 8,
    color: '#f4efe4',
    footerColor: '#d8b878',
    footerSize: 34,
    background: bg({ type: 'gradient', color: '#1c1a17', color2: '#080706', angle: 180 }),
  },
  {
    ...BASE,
    id: 'builtin-lower-third',
    name: 'Lower Third',
    fontSize: 64,
    vAlign: 'bottom',
    marginBottom: 6,
    outline: true,
    shadow: true,
    showFooter: false,
    background: bg({ type: 'color', color: '#000000' }),
  },
  {
    ...BASE,
    id: 'builtin-paper',
    name: 'Light Paper',
    color: '#1d1b18',
    shadow: false,
    footerColor: 'rgba(29,27,24,0.65)',
    titleColor: '#3b2a12',
    background: bg({ type: 'gradient', color: '#f7f2e7', color2: '#e6dcc7', angle: 180 }),
  },
];

export const DEFAULT_THEME_ID = 'builtin-midnight';
export const DEFAULT_BIBLE_THEME_ID = 'builtin-scripture';

export function fallbackTheme(): Theme {
  return BUILTIN_THEMES[0]!;
}

export function makeTheme(name: string, base: Theme = fallbackTheme()): Theme {
  return {
    ...structuredClone(base),
    id: globalThis.crypto.randomUUID(),
    name,
    builtin: false,
    updatedAt: new Date().toISOString(),
  };
}

/** Repairs a theme loaded from disk so missing/invalid fields never break rendering. */
export function normalizeTheme(input: Partial<Theme> & { id: string; name: string }): Theme {
  const base = fallbackTheme();
  const merged: Theme = {
    ...base,
    ...input,
    builtin: Boolean(input.builtin),
    background: { ...base.background, ...(input.background ?? {}) },
  };
  merged.fontSize = clampNum(merged.fontSize, 16, 300, base.fontSize);
  merged.footerSize = clampNum(merged.footerSize, 8, 120, base.footerSize);
  merged.titleSize = clampNum(merged.titleSize, 16, 300, base.titleSize);
  merged.lineHeight = clampNum(merged.lineHeight, 0.8, 3, base.lineHeight);
  merged.marginX = clampNum(merged.marginX, 0, 40, base.marginX);
  merged.marginTop = clampNum(merged.marginTop, 0, 45, base.marginTop);
  merged.marginBottom = clampNum(merged.marginBottom, 0, 45, base.marginBottom);
  merged.background.dim = clampNum(merged.background.dim, 0, 1, 0);
  return merged;
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}
