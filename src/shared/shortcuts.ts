import type { ShortcutAction, ShortcutMap } from './types';

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  nextSlide: 'Next slide',
  prevSlide: 'Previous slide',
  nextSection: 'Next section',
  prevSection: 'Previous section',
  nextItem: 'Next service item',
  prevItem: 'Previous service item',
  black: 'Black screen',
  clear: 'Clear text (keep background)',
  toggleOutput: 'Projector on / off',
  exitOutput: 'Exit presentation (close projector)',
  mediaToggle: 'Play / pause video',
  searchSong: 'Search songs',
  goLive: 'Send selected item live',
};

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  nextSlide: ['ArrowRight', 'ArrowDown', 'PageDown', 'Space'],
  prevSlide: ['ArrowLeft', 'ArrowUp', 'PageUp'],
  nextSection: ['Ctrl+ArrowRight'],
  prevSection: ['Ctrl+ArrowLeft'],
  nextItem: ['Ctrl+ArrowDown'],
  prevItem: ['Ctrl+ArrowUp'],
  black: ['.', 'F7'],
  clear: ['/', 'F8'],
  toggleOutput: ['F5'],
  exitOutput: ['Shift+Escape'],
  mediaToggle: ['Ctrl+Space'],
  searchSong: ['Ctrl+F'],
  goLive: ['Enter'],
};

/** Actions that stay active while typing in a text field. */
export const GLOBAL_ACTIONS: ShortcutAction[] = ['searchSong', 'toggleOutput', 'exitOutput', 'black'];

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

/** Converts a keyboard event into a canonical combo such as "Ctrl+Shift+ArrowDown". */
export function comboFromEvent(event: KeyLike): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  let key = event.key;
  if (key === ' ' || key === 'Spacebar') key = 'Space';
  if (key === 'Esc') key = 'Escape';
  if (key.length === 1) key = key.toUpperCase();
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  // Shift is meaningful only for non-printable keys; "?" already implies Shift.
  if (event.shiftKey && (key.length > 1 || /[A-Z]/.test(key))) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

export function normalizeCombo(combo: string): string {
  const parts = combo
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  const key = parts.pop()!;
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const result: string[] = [];
  if (mods.has('ctrl') || mods.has('control') || mods.has('cmd') || mods.has('meta')) result.push('Ctrl');
  if (mods.has('alt')) result.push('Alt');
  if (mods.has('shift')) result.push('Shift');
  result.push(key.length === 1 ? key.toUpperCase() : key);
  return result.join('+');
}

export function actionForCombo(combo: string, map: ShortcutMap): ShortcutAction | null {
  const wanted = normalizeCombo(combo);
  for (const action of Object.keys(map) as ShortcutAction[]) {
    if (map[action].some((c) => normalizeCombo(c) === wanted)) return action;
  }
  return null;
}

/** Returns combos assigned to more than one action. */
export function findConflicts(map: ShortcutMap): Array<{ combo: string; actions: ShortcutAction[] }> {
  const owners = new Map<string, ShortcutAction[]>();
  for (const action of Object.keys(map) as ShortcutAction[]) {
    for (const combo of map[action]) {
      const key = normalizeCombo(combo);
      if (!key) continue;
      owners.set(key, [...(owners.get(key) ?? []), action]);
    }
  }
  return [...owners.entries()].filter(([, a]) => a.length > 1).map(([combo, actions]) => ({ combo, actions }));
}

/** Fills missing actions with defaults (used when loading saved settings). */
export function mergeShortcuts(saved: Partial<ShortcutMap> | undefined): ShortcutMap {
  const result = { ...DEFAULT_SHORTCUTS };
  if (!saved) return result;
  for (const action of Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]) {
    const value = saved[action];
    if (Array.isArray(value)) result[action] = value.filter((v) => typeof v === 'string').map(normalizeCombo).filter(Boolean);
  }
  return result;
}

const PRETTY: Record<string, string> = {
  ArrowRight: '→',
  ArrowLeft: '←',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageDown: 'PgDn',
  PageUp: 'PgUp',
  Escape: 'Esc',
};

export function prettyCombo(combo: string): string {
  return combo
    .split('+')
    .map((p) => PRETTY[p] ?? p)
    .join('+');
}

/**
 * Song section shortcuts while presenting: digits jump to verse N, letters
 * jump to the section with that label (C = chorus, B = bridge, P = pre-chorus,
 * T = tag, I = intro, E = ending). Returns the label to look for.
 */
export function sectionLabelForKey(event: KeyLike): string | null {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  if (/^[1-9]$/.test(event.key)) return `V${event.key}`;
  const letter = event.key.toUpperCase();
  if (/^[CBPTIE]$/.test(letter)) return letter;
  return null;
}
