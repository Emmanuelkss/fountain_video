import type { BibleReference } from './types';
import { canonBook, findBook } from './bibleBooks';

export type ParseResult = { ok: true; ref: BibleReference } | { ok: false; error: string };

/**
 * Parses references such as:
 *   "John 3:16", "Jn 3:16-18", "Jean 3.16", "1 Co 13", "Ps 23:1-6",
 *   "Romans 8:28-9:2", "Psalm 23", "ii tim 3 16".
 */
export function parseReference(input: string, extraNames: Array<{ number: number; name: string }> = []): ParseResult {
  const text = input.trim().replace(/[–—]/g, '-');
  if (!text) return { ok: false, error: 'Type a reference, e.g. John 3:16' };
  const match = /^((?:[1-3]|i{1,3})?\s*\.?\s*[\p{L}][\p{L}\s.'’]*?)\s*(\d+)(?:\s*[:.,]\s*(\d+)|\s+(\d+))?(?:\s*-\s*(\d+)(?:\s*[:.]\s*(\d+))?)?\s*$/iu.exec(text);
  if (!match) {
    const bookOnly = findBook(text, extraNames);
    if (bookOnly) return { ok: true, ref: { book: bookOnly, chapter: 1, verseStart: null, verseEnd: null } };
    return { ok: false, error: `Could not read "${input}". Try e.g. John 3:16-18` };
  }
  const [, bookText, chapterText, verseA, verseB, endA, endB] = match;
  const book = findBook(bookText ?? '', extraNames);
  if (!book) return { ok: false, error: `Unknown book "${(bookText ?? '').trim()}"` };
  const chapter = Number(chapterText);
  const verseStartText = verseA ?? verseB;
  const verseStart = verseStartText ? Number(verseStartText) : null;
  let verseEnd: number | null = verseStart;
  let chapterEnd: number | undefined;
  if (endA && endB) {
    // Cross-chapter range "3:16-4:2"
    chapterEnd = Number(endA);
    verseEnd = Number(endB);
  } else if (endA) {
    if (verseStart === null) {
      // "Psalm 23-24" = chapter range, keep only whole first chapter range end
      chapterEnd = Number(endA);
      verseEnd = null;
    } else {
      verseEnd = Number(endA);
    }
  }
  const canon = canonBook(book);
  if (canon && (chapter < 1 || chapter > canon.chapters)) {
    return { ok: false, error: `${canon.en} has ${canon.chapters} chapter${canon.chapters > 1 ? 's' : ''}` };
  }
  if (chapter < 1) return { ok: false, error: 'Chapter must be 1 or more' };
  if (verseStart !== null && verseStart < 1) return { ok: false, error: 'Verse must be 1 or more' };
  if (chapterEnd !== undefined && chapterEnd < chapter) return { ok: false, error: 'The range ends before it starts' };
  if (chapterEnd === undefined && verseStart !== null && verseEnd !== null && verseEnd < verseStart) {
    return { ok: false, error: 'The range ends before it starts' };
  }
  const ref: BibleReference = { book, chapter, verseStart, verseEnd };
  if (chapterEnd !== undefined && chapterEnd !== chapter) ref.chapterEnd = chapterEnd;
  return { ok: true, ref };
}

export function formatReference(ref: BibleReference, bookName: string): string {
  const head = `${bookName} ${ref.chapter}`;
  if (ref.chapterEnd !== undefined && ref.chapterEnd !== ref.chapter) {
    if (ref.verseStart === null) return `${head}-${ref.chapterEnd}`;
    return `${head}:${ref.verseStart}-${ref.chapterEnd}:${ref.verseEnd ?? ''}`;
  }
  if (ref.verseStart === null) return head;
  if (ref.verseEnd === null || ref.verseEnd === ref.verseStart) return `${head}:${ref.verseStart}`;
  return `${head}:${ref.verseStart}-${ref.verseEnd}`;
}

/** Formats the reference of a sub-range of verses (used for slide footers). */
export function formatVerseSpan(bookName: string, verses: Array<{ chapter: number; verse: number }>): string {
  if (verses.length === 0) return bookName;
  const first = verses[0]!;
  const last = verses[verses.length - 1]!;
  if (first.chapter === last.chapter) {
    return first.verse === last.verse
      ? `${bookName} ${first.chapter}:${first.verse}`
      : `${bookName} ${first.chapter}:${first.verse}-${last.verse}`;
  }
  return `${bookName} ${first.chapter}:${first.verse}-${last.chapter}:${last.verse}`;
}
