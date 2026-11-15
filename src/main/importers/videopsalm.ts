/**
 * VideoPsalm songbook import (.json / .vpc files, usually found in
 * C:\Users\Public\Documents\VideoPsalm\SongBooks).
 *
 * VideoPsalm writes a JavaScript-like format that is NOT valid JSON:
 * object keys are unquoted, strings may contain raw line breaks, and
 * files usually start with a UTF-8 byte order mark. Example:
 *
 *   {Abbreviation:"JEM",Text:"J'aime l'Éternel",Songs:[{ID:12,Text:"Titre",
 *    Author:"…",Copyright:"…",CCLI:"…",Theme:"Louange\nAdoration",
 *    Verses:[{Text:"Ligne 1\nLigne 2"},{Text:"…"}]}]}
 *
 * Fields used (same as OpenLP's VideoPsalm importer, plus the song number):
 *   songbook: Text (name), Abbreviation (fallback name)
 *   song:     Text (title), ID (number in the songbook), Author, Composer,
 *             Copyright, CCLI, Theme (one category per line), Memo1-3 (notes),
 *             Alias (alternative titles, kept in notes), Verses[].Text
 *
 * Verses have no type in the file, so FountainVideo infers it: a first line
 * such as "Refrain", "Chorus", "Chœur", "Pont", "Bridge" marks the section
 * (and is removed), and a verse whose text repeats an earlier one is treated
 * as a repeated chorus. The original order is kept as the default
 * arrangement, so the song projects exactly like it did in VideoPsalm.
 */
import type { Song, SongArrangement, SongSection } from '../../shared/types';
import { assignLabels, classifyHeader } from '../../shared/lyrics';
import { newId, nowIso } from '../../shared/util';

export interface VideoPsalmBook {
  name: string;
  songs: Song[];
}

/** Turns VideoPsalm's relaxed syntax into strict JSON. */
export function relaxedJsonToJson(input: string): string {
  const src = input.replace(/^\uFEFF/, '');
  let out = '';
  let i = 0;
  const n = src.length;
  const isIdentStart = (c: string) => /[\p{L}_$]/u.test(c);
  const isIdentPart = (c: string) => /[\p{L}\p{N}_$]/u.test(c);
  while (i < n) {
    const c = src[i]!;
    if (c === '"' || c === "'") {
      // String literal: copy, escaping raw control characters and normalising quotes.
      const quote = c;
      let str = '';
      i += 1;
      while (i < n && src[i] !== quote) {
        let ch = src[i]!;
        if (ch === '\\' && i + 1 < n) {
          const next = src[i + 1]!;
          // \' is not valid in JSON; everything else is passed through.
          str += next === "'" ? "'" : `\\${next}`;
          i += 2;
          continue;
        }
        if (ch === '"' && quote === "'") ch = '\\"';
        else if (ch === '\n') ch = '\\n';
        else if (ch === '\r') ch = src[i + 1] === '\n' ? '' : '\\n';
        else if (ch === '\t') ch = '\\t';
        else if (ch < ' ') ch = ' ';
        str += ch;
        i += 1;
      }
      i += 1; // closing quote
      out += `"${str}"`;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (isIdentStart(c)) {
      let word = '';
      while (i < n && isIdentPart(src[i]!)) word += src[i++];
      if (word === 'true' || word === 'false' || word === 'null') out += word;
      else out += JSON.stringify(word);
      continue;
    }
    if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) {
      let num = '';
      while (i < n && /[0-9eE+\-.xXa-fA-F]/.test(src[i]!)) num += src[i++];
      // A bare key that starts with a digit (rare) is quoted when followed by ':'.
      let j = i;
      while (j < n && /\s/.test(src[j]!)) j += 1;
      if (src[j] === ':') out += JSON.stringify(num.replace(/^\+/, ''));
      else {
        const value = Number(num);
        out += Number.isFinite(value) ? String(value) : JSON.stringify(num);
      }
      continue;
    }
    if (c === ',') {
      // Drop trailing commas before } or ].
      let j = i + 1;
      while (j < n && /\s/.test(src[j]!)) j += 1;
      if (src[j] === '}' || src[j] === ']') {
        i += 1;
        continue;
      }
    }
    out += c < ' ' && c !== '\n' && c !== '\r' && c !== '\t' ? ' ' : c;
    i += 1;
  }
  return out;
}

/** True when a file looks like a VideoPsalm songbook (strict or relaxed JSON with a Songs array). */
export function looksLikeVideoPsalm(content: string): boolean {
  const head = content.replace(/^\uFEFF/, '').slice(0, 20000);
  return /^\s*\{/.test(head) && /["']?Songs["']?\s*:\s*\[/.test(head);
}

function str(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

/** Removes chords ("[G]"), VideoPsalm/HTML formatting tags and stray whitespace. */
export function cleanVerseText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\[[^\]\n]{1,12}\]/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const MARKER = /^\s*[[(]?\s*(refrain|chorus|ch(?:oe|œ)ur|pont|bridge|pr[ée]-?refrain|pre-?chorus|tag|coda|fin|ending|intro)\s*(\d+)?\s*[\])]?\s*[:.]?\s*$/i;

interface RawVerse {
  text: string;
  marker: string | null;
}

function readVerse(raw: unknown): RawVerse | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  const text = cleanVerseText(str(v.Text));
  if (!text) return null;
  const lines = text.split('\n');
  const m = MARKER.exec(lines[0] ?? '');
  if (m && lines.length > 1) {
    return { text: lines.slice(1).join('\n').trim(), marker: `${m[1]}${m[2] ? ` ${m[2]}` : ''}` };
  }
  return { text, marker: null };
}

/** Builds sections + default arrangement from VideoPsalm's ordered verse list. */
export function versesToSections(rawVerses: unknown[]): { sections: SongSection[]; arrangement: SongArrangement | null } {
  const verses = rawVerses.map(readVerse).filter((v): v is RawVerse => v !== null);
  type Block = { name: string; text: string };
  const blocks: Block[] = [];
  const order: number[] = [];
  const byText = new Map<string, number>();
  let verseNo = 0;
  for (const v of verses) {
    const key = v.text.toLowerCase().replace(/\s+/g, ' ');
    const seen = byText.get(key);
    if (seen !== undefined) {
      // Same text again: a repeated chorus. Reuse the section; if it was a plain verse, it becomes the chorus.
      const block = blocks[seen]!;
      if (!v.marker && classifyHeader(block.name).type === 'verse' && !blocks.some((b) => classifyHeader(b.name).type === 'chorus')) {
        block.name = 'Chorus';
      }
      order.push(seen);
      continue;
    }
    let name: string;
    if (v.marker) name = v.marker.charAt(0).toUpperCase() + v.marker.slice(1).toLowerCase();
    else name = `Verse ${++verseNo}`;
    byText.set(key, blocks.length);
    order.push(blocks.length);
    blocks.push({ name, text: v.text });
  }
  // Renumber verses after some were turned into a chorus.
  let vn = 0;
  for (const b of blocks) if (classifyHeader(b.name).type === 'verse') b.name = `Verse ${++vn}`;
  const classified = blocks.map((b) => ({ ...classifyHeader(b.name), name: b.name }));
  const labels = assignLabels(classified);
  const sections: SongSection[] = blocks.map((b, i) => ({
    id: newId(),
    label: labels[i]!,
    name: b.name,
    type: classified[i]!.type,
    text: b.text,
  }));
  const repeated = order.length !== blocks.length;
  const arrangement = repeated ? { id: newId(), name: 'VideoPsalm order', order: order.map((i) => labels[i]!) } : null;
  return { sections, arrangement };
}

export function parseVideoPsalm(content: string, fallbackName: string): VideoPsalmBook {
  let data: unknown;
  try {
    data = JSON.parse(content.replace(/^\uFEFF/, ''));
  } catch {
    data = JSON.parse(relaxedJsonToJson(content));
  }
  const book = (data ?? {}) as Record<string, unknown>;
  if (!Array.isArray(book.Songs)) throw new Error('This is not a VideoPsalm songbook (no Songs list).');
  const name = str(book.Text) || str(book.Abbreviation) || fallbackName;
  const now = nowIso();
  const songs: Song[] = [];
  for (const raw of book.Songs as unknown[]) {
    const s = (raw ?? {}) as Record<string, unknown>;
    const { sections, arrangement } = versesToSections(Array.isArray(s.Verses) ? s.Verses : []);
    const author = str(s.Author);
    const composer = str(s.Composer);
    const authors = [author, composer && composer.toLowerCase() !== author.toLowerCase() ? composer : ''].filter(Boolean).join(', ');
    const aliases = Array.isArray(s.Alias) ? s.Alias.map(str).filter(Boolean) : str(s.Alias) ? [str(s.Alias)] : [];
    const notes = [
      ...[s.Memo1, s.Memo2, s.Memo3].map(str).filter(Boolean),
      aliases.length ? `Also known as: ${aliases.join(' / ')}` : '',
      str(s.Reference) ? `Reference: ${str(s.Reference)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const number = s.ID === undefined || s.ID === null ? '' : str(s.ID);
    songs.push({
      id: newId(),
      title: str(s.Text) || (number ? `${name} ${number}` : sections[0]?.text.split('\n')[0] ?? 'Untitled song'),
      author: authors,
      copyright: str(s.Copyright).replace(/\s*\n\s*/g, ' '),
      ccli: str(s.CCLI),
      key: str(s.Key),
      notes,
      categories: str(s.Theme)
        .split(/\n|;|,/)
        .map((t) => t.trim())
        .filter(Boolean),
      songbook: name,
      songbookNumber: number === '0' ? '' : number,
      sections,
      arrangements: arrangement ? [arrangement] : [],
      defaultArrangementId: arrangement?.id ?? null,
      themeId: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { name, songs };
}

/** Exports songs to a VideoPsalm-compatible songbook (strict JSON, which VideoPsalm also reads). */
export function exportVideoPsalm(name: string, songs: Song[]): string {
  const book = {
    Abbreviation: name.slice(0, 10),
    Text: name,
    Guid: newId(),
    Songs: songs.map((song) => {
      const arrangement = song.arrangements.find((a) => a.id === song.defaultArrangementId);
      const byLabel = new Map(song.sections.map((s) => [s.label.toUpperCase(), s]));
      const ordered = arrangement ? arrangement.order.map((l) => byLabel.get(l.toUpperCase())).filter((s): s is SongSection => Boolean(s)) : song.sections;
      const entry: Record<string, unknown> = {
        Text: song.title,
        Author: song.author,
        Copyright: song.copyright,
        CCLI: song.ccli,
        Theme: song.categories.join('\n'),
        Memo1: song.notes,
        Verses: ordered.map((s) => ({ Text: s.text })),
      };
      const number = Number(song.songbookNumber);
      if (song.songbookNumber && Number.isInteger(number)) entry.ID = number;
      return entry;
    }),
  };
  return JSON.stringify(book, null, 1);
}
