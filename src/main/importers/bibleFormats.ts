/**
 * Bible import formats (see docs/FORMATS.md). The church must hold the right
 * to use the translation it imports; public-domain texts (KJV, Louis Segond
 * 1910, World English Bible...) are widely available in these formats.
 *
 *  - Zefania XML  <XMLBIBLE><BIBLEBOOK bnumber bname><CHAPTER cnumber><VERS vnumber>
 *  - OSIS XML     <verse osisID="John.3.16">...</verse> (container or milestone style)
 *  - JSON         [{book, chapter, verse, text}] or {books:[{name, chapters:[[...verses]]}]}
 *                 or [{abbrev|name, chapters:[["v1","v2"],...]}]
 *  - CSV / TSV    book,chapter,verse,text (book = number or name), header row optional
 */
import type { BibleVerse } from '../../shared/types';
import { CANON, findBook, osisToNumber } from '../../shared/bibleBooks';
import { streamXml } from './xml';

export interface ParsedBible {
  books: Array<{ number: number; name: string }>;
  verses: BibleVerse[];
  /** Name/abbreviation found inside the file, if any. */
  title?: string;
  abbreviation?: string;
  language?: string;
}

export const BIBLE_IMPORT_EXTENSIONS = ['xml', 'osis', 'json', 'csv', 'tsv', 'txt'];

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function parseBibleFile(fileName: string, content: string): ParsedBible {
  const text = content.replace(/^﻿/, '');
  const ext = (/\.([^.]+)$/.exec(fileName)?.[1] ?? '').toLowerCase();
  const head = text.slice(0, 4000);
  let result: ParsedBible;
  if (ext === 'json' || /^\s*[[{]/.test(head)) result = parseBibleJson(text);
  else if (/<XMLBIBLE/i.test(head)) result = parseZefania(text);
  else if (/<osis/i.test(head) || /osisID=/.test(head)) result = parseOsis(text);
  else if (/^\s*</.test(head)) throw new Error('Unknown XML Bible format. Supported: Zefania XML and OSIS.');
  else result = parseBibleDelimited(text);
  result.verses = result.verses.filter((v) => v.text !== '' && v.book > 0 && v.chapter > 0 && v.verse > 0);
  if (result.verses.length === 0) throw new Error('No verses were found in this file.');
  return result;
}

export function parseZefania(xml: string): ParsedBible {
  const books: ParsedBible['books'] = [];
  const verses: BibleVerse[] = [];
  let book = 0;
  let chapter = 0;
  let verse = 0;
  let depth = 0; // > 0 while inside a VERS element
  let buffer = '';
  let skip = 0; // inside notes/cross-references
  let title: string | undefined;
  let inTitle = false;
  let titleBuf = '';
  let language: string | undefined;
  streamXml(xml, {
    open(name, attrs) {
      const n = name.toUpperCase();
      if (n === 'XMLBIBLE') title = attrs.biblename || attrs.BIBLENAME;
      else if (n === 'TITLE' && !title) {
        inTitle = true;
        titleBuf = '';
      } else if (n === 'LANGUAGE') inTitle = false;
      else if (n === 'BIBLEBOOK') {
        book = Number(attrs.bnumber ?? attrs.BNUMBER ?? 0);
        const name = attrs.bname ?? attrs.BNAME ?? attrs.bsname ?? CANON[book - 1]?.en ?? `Book ${book}`;
        books.push({ number: book, name });
      } else if (n === 'CHAPTER') chapter = Number(attrs.cnumber ?? attrs.CNUMBER ?? 0);
      else if (n === 'VERS') {
        verse = Number(attrs.vnumber ?? attrs.VNUMBER ?? 0);
        depth = 1;
        buffer = '';
      } else if (depth > 0 && (n === 'NOTE' || n === 'XREF' || n === 'DIV' || n === 'REMARK')) skip += 1;
    },
    close(name) {
      const n = name.toUpperCase();
      if (n === 'VERS' && depth > 0) {
        verses.push({ book, chapter, verse, text: clean(buffer) });
        depth = 0;
      } else if ((n === 'NOTE' || n === 'XREF' || n === 'DIV' || n === 'REMARK') && skip > 0) skip -= 1;
      else if (n === 'TITLE' && inTitle) {
        inTitle = false;
        title = title ?? (clean(titleBuf) || undefined);
      }
    },
    text(t) {
      if (inTitle) titleBuf += t;
      if (depth > 0 && skip === 0) buffer += t;
    },
  });
  return { books, verses, title, language };
}

export function parseOsis(xml: string): ParsedBible {
  const verses: BibleVerse[] = [];
  const books = new Map<number, string>();
  let current: { book: number; chapter: number; verse: number } | null = null;
  let buffer = '';
  let skip = 0;
  let title: string | undefined;
  let abbreviation: string | undefined;
  let inWorkTitle = false;
  let titleBuf = '';
  let containerOpen = false;
  const flush = () => {
    if (current) verses.push({ ...current, text: clean(buffer) });
    current = null;
    buffer = '';
  };
  const parseId = (id: string) => {
    const first = id.split(/\s+/)[0] ?? '';
    const [b, c, v] = first.split('.');
    const book = osisToNumber(b ?? '');
    if (!book || !c || !v) return null;
    return { book, chapter: Number(c), verse: Number(v) };
  };
  streamXml(xml, {
    open(name, attrs) {
      if (name === 'osisText' && attrs.osisIDWork) abbreviation = attrs.osisIDWork;
      if (name === 'title' && !title && !current) {
        inWorkTitle = true;
        titleBuf = '';
      }
      if (name === 'div' && attrs.type === 'book' && attrs.osisID) {
        const n = osisToNumber(attrs.osisID);
        if (n) books.set(n, CANON[n - 1]?.en ?? attrs.osisID);
      }
      if (name === 'verse') {
        if (attrs.eID) {
          flush();
          return;
        }
        const id = attrs.osisID ?? attrs.sID;
        if (id) {
          flush();
          current = parseId(id);
          // Milestone verses (<verse sID=.../>) are closed by a matching eID, not by </verse>.
          containerOpen = !attrs.sID;
        }
        return;
      }
      if (current && (name === 'note' || name === 'title' || name === 'reference')) skip += 1;
    },
    close(name) {
      if (name === 'verse') {
        // Container style: </verse> closes; milestone style is closed by its eID.
        if (containerOpen && current) flush();
        containerOpen = false;
        return;
      }
      if (name === 'title' && inWorkTitle) {
        inWorkTitle = false;
        title = clean(titleBuf) || undefined;
        return;
      }
      if ((name === 'note' || name === 'title' || name === 'reference') && skip > 0) skip -= 1;
      if (name === 'chapter' || name === 'div') flush();
    },
    text(t) {
      if (inWorkTitle) titleBuf += t;
      if (current && skip === 0) buffer += t;
    },
  });
  flush();
  for (const v of verses) if (!books.has(v.book)) books.set(v.book, CANON[v.book - 1]?.en ?? `Book ${v.book}`);
  return { books: [...books.entries()].map(([number, name]) => ({ number, name })), verses, title, abbreviation };
}

type JsonBook = { name?: string; abbrev?: string; book?: string; chapters?: unknown[] };

export function parseBibleJson(text: string): ParsedBible {
  const data = JSON.parse(text) as unknown;
  const verses: BibleVerse[] = [];
  const books = new Map<number, string>();
  const meta = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(meta.books)
      ? (meta.books as unknown[])
      : Array.isArray(meta.verses)
        ? (meta.verses as unknown[])
        : [];
  if (list.length === 0) throw new Error('This JSON file does not look like a Bible.');
  const first = list[0] as Record<string, unknown>;
  if (first && 'chapter' in first && 'verse' in first && 'text' in first) {
    // Flat verse list
    for (const raw of list as Array<Record<string, unknown>>) {
      const book = resolveBook(raw.book ?? raw.book_id ?? raw.bookNumber, books);
      if (!book) continue;
      verses.push({ book, chapter: Number(raw.chapter), verse: Number(raw.verse), text: clean(String(raw.text ?? '')) });
    }
  } else {
    // Nested: [{name|abbrev, chapters: [[verse text...]] }]
    (list as JsonBook[]).forEach((b, index) => {
      const label = b.name ?? b.book ?? b.abbrev ?? '';
      const number = (label && findBook(label)) || (list.length === 66 ? index + 1 : null);
      if (!number) return;
      books.set(number, b.name ?? b.book ?? CANON[number - 1]?.en ?? label);
      (b.chapters ?? []).forEach((chapter, ci) => {
        const items = Array.isArray(chapter) ? chapter : [];
        items.forEach((v, vi) => {
          const textValue = typeof v === 'string' ? v : String((v as { text?: string }).text ?? '');
          const verseNo = typeof v === 'object' && v && 'verse' in v ? Number((v as { verse: number }).verse) : vi + 1;
          verses.push({ book: number, chapter: ci + 1, verse: verseNo, text: clean(textValue) });
        });
      });
    });
  }
  for (const v of verses) if (!books.has(v.book)) books.set(v.book, CANON[v.book - 1]?.en ?? `Book ${v.book}`);
  return {
    books: [...books.entries()].map(([number, name]) => ({ number, name })),
    verses,
    title: typeof meta.name === 'string' ? meta.name : typeof meta.title === 'string' ? meta.title : undefined,
    abbreviation: typeof meta.abbreviation === 'string' ? meta.abbreviation : undefined,
    language: typeof meta.language === 'string' ? meta.language : undefined,
  };
}

function resolveBook(value: unknown, names: Map<number, string>): number | null {
  if (typeof value === 'number' && value >= 1 && value <= 90) return value;
  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) return Number(value);
    const n = osisToNumber(value) ?? findBook(value);
    if (n && !names.has(n)) names.set(n, value);
    return n;
  }
  return null;
}

/** Parses one CSV line, honouring double-quoted fields. */
export function splitDelimited(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

export function parseBibleDelimited(text: string): ParsedBible {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  const sample = lines.slice(0, 5).join('\n');
  const delimiter = (sample.match(/\t/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? '\t' : sample.includes(';') && !sample.includes(',') ? ';' : ',';
  const books = new Map<number, string>();
  const verses: BibleVerse[] = [];
  for (const line of lines) {
    const cols = splitDelimited(line, delimiter);
    if (cols.length < 4) continue;
    const [b, c, v, ...rest] = cols;
    if (!/^\d+$/.test((c ?? '').trim()) || !/^\d+$/.test((v ?? '').trim())) continue; // header row
    const book = resolveBook((b ?? '').trim(), books);
    if (!book) continue;
    verses.push({ book, chapter: Number(c), verse: Number(v), text: clean(rest.join(delimiter)) });
  }
  for (const v of verses) if (!books.has(v.book)) books.set(v.book, CANON[v.book - 1]?.en ?? `Book ${v.book}`);
  return { books: [...books.entries()].map(([number, name]) => ({ number, name })), verses };
}
