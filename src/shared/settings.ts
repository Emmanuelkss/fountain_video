import type { AppSettings } from './types';
import { DEFAULT_BIBLE_THEME_ID, DEFAULT_THEME_ID } from './themes';
import { DEFAULT_SHORTCUTS, mergeShortcuts } from './shortcuts';

export function defaultSettings(): AppSettings {
  return {
    outputDisplayId: null,
    windowedOutput: false,
    defaultThemeId: DEFAULT_THEME_ID,
    bibleThemeId: DEFAULT_BIBLE_THEME_ID,
    defaultTranslationId: null,
    defaultVersesPerSlide: 1,
    maxLinesPerSlide: 4,
    operatorTheme: 'dark',
    shortcuts: structuredClone(DEFAULT_SHORTCUTS),
    lastServiceId: null,
    autoBackupKeep: 10,
    previewAspect: '16:9',
    advanceAcrossItems: false,
  };
}

/** Validates settings coming from disk or from the UI; invalid values fall back to defaults. */
export function normalizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const d = defaultSettings();
  const r = raw ?? {};
  const intIn = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
  const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback);
  return {
    outputDisplayId: typeof r.outputDisplayId === 'number' ? r.outputDisplayId : null,
    windowedOutput: typeof r.windowedOutput === 'boolean' ? r.windowedOutput : d.windowedOutput,
    defaultThemeId: str(r.defaultThemeId, d.defaultThemeId),
    bibleThemeId: str(r.bibleThemeId, d.bibleThemeId),
    defaultTranslationId: typeof r.defaultTranslationId === 'string' ? r.defaultTranslationId : null,
    defaultVersesPerSlide: intIn(r.defaultVersesPerSlide, 0, 10, d.defaultVersesPerSlide),
    maxLinesPerSlide: intIn(r.maxLinesPerSlide, 0, 20, d.maxLinesPerSlide),
    operatorTheme: r.operatorTheme === 'light' ? 'light' : 'dark',
    shortcuts: mergeShortcuts(r.shortcuts),
    lastServiceId: typeof r.lastServiceId === 'string' ? r.lastServiceId : null,
    autoBackupKeep: intIn(r.autoBackupKeep, 1, 100, d.autoBackupKeep),
    previewAspect: r.previewAspect === '4:3' || r.previewAspect === '16:10' ? r.previewAspect : '16:9',
    advanceAcrossItems: typeof r.advanceAcrossItems === 'boolean' ? r.advanceAcrossItems : d.advanceAcrossItems,
  };
}
