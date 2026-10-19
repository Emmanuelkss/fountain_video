/** Pure display-selection logic (unit tested; used by the Electron output manager). */
import type { DisplayInfo } from '../shared/types';

export interface OutputPlacement {
  /** Display to use full-screen, or null for windowed/test mode. */
  display: DisplayInfo | null;
  windowed: boolean;
  message: string;
}

export function describeDisplay(d: DisplayInfo, index: number): string {
  return `Display ${index + 1}${d.primary ? ' (main)' : ''} — ${d.bounds.width}×${d.bounds.height}`;
}

/**
 * Picks where the audience window goes:
 *  1. the display chosen in Settings, if it is connected;
 *  2. otherwise the first non-primary display (a projector/TV is never the primary screen);
 *  3. otherwise a window on the operator screen ("test mode").
 */
export function chooseOutputDisplay(displays: DisplayInfo[], preferredId: number | null, forceWindowed: boolean): OutputPlacement {
  if (forceWindowed) return { display: null, windowed: true, message: 'Test mode: the audience view opens in a window.' };
  const preferred = preferredId !== null ? displays.find((d) => d.id === preferredId) : undefined;
  if (preferred) {
    if (displays.length === 1) {
      return { display: null, windowed: true, message: 'Only one screen is connected: the audience view opens in a window.' };
    }
    return { display: preferred, windowed: false, message: '' };
  }
  const external = displays.find((d) => !d.primary);
  if (external) {
    const note = preferredId !== null ? 'The screen chosen in Settings is not connected; using the other screen.' : '';
    return { display: external, windowed: false, message: note };
  }
  return { display: null, windowed: true, message: 'No second screen detected: the audience view opens in a window (test mode).' };
}
