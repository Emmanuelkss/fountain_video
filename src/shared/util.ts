/** Small helpers used on both sides of the IPC boundary. */

export function newId(): string {
  // crypto.randomUUID exists in Node >= 19 and in every Chromium renderer.
  return globalThis.crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Accent- and case-insensitive form used for searching, so "Eternel"
 * finds "Éternel" and "jesus" finds "Jésus".
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/** Moves an element inside an array (immutable). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = list.slice();
  if (from < 0 || from >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  const target = clamp(to, 0, copy.length);
  copy.splice(target, 0, item as T);
  return copy;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Error carrying a message that is safe and useful to show to an operator. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

/** File name for display: library copies are stored as "<8 hex>-name.ext". */
export function displayFileName(filePath: string): string {
  return filePath.replace(/^.*[\\/]/, '').replace(/^[0-9a-f]{8}-/, '');
}

/** Decodes a text file: UTF-8 (with or without BOM), UTF-16 LE/BE with BOM, or Windows-1252 as a fallback. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
