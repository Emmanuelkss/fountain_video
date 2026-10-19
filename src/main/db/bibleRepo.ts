import type { Database } from './database';
import type { BibleBook, BibleFavorite, BibleTranslation, BibleVerse } from '../../shared/types';
import { CANON, canonBook } from '../../shared/bibleBooks';
import { formatReference, parseReference } from '../../shared/bibleRef';
import { newId, normalizeForSearch, nowIso, UserError } from '../../shared/util';

import type { ParsedBible } from '../importers/bibleFormats';

export class BibleRepo {
  private searchCache = new Map<string, Array<BibleVerse & { norm: string }>>();

  constructor(private db: Database) {}

  translations(): BibleTranslation[] {
    return this.db
      .all(
        `SELECT t.*, (SELECT COUNT(*) FROM bible_verses v WHERE v.translation_id = t.id) AS verse_count
         FROM bible_translations t ORDER BY t.name`,
      )
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        abbreviation: String(row.abbreviation),
        language: String(row.language ?? ''),
        license: String(row.license ?? ''),
        verseCount: Number(row.verse_count ?? 0),
        createdAt: String(row.created_at),
      }));
  }

  translation(id: string): BibleTranslation | null {
    return this.translations().find((t) => t.id === id) ?? null;
  }

  addTranslation(
    meta: { name: string; abbreviation: string; language: string; license: string },
    data: ParsedBible,
  ): BibleTranslation {
    if (data.verses.length === 0) throw new UserError('No verses were found in this file.');
    const id = newId();
    this.db.transaction(() => {
      this.db.run(
        'INSERT INTO bible_translations (id, name, abbreviation, language, license, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        id,
        meta.name,
        meta.abbreviation,
        meta.language,
        meta.license,
        nowIso(),
      );
      const insertBook = this.db.prepare('INSERT OR REPLACE INTO bible_books (translation_id, book, name) VALUES (?, ?, ?)');
      for (const book of data.books) insertBook(id, book.number, book.name);
      const insertVerse = this.db.prepare(
        'INSERT OR REPLACE INTO bible_verses (translation_id, book, chapter, verse, text) VALUES (?, ?, ?, ?, ?)',
      );
      for (const v of data.verses) insertVerse(id, v.book, v.chapter, v.verse, v.text);
    });
    return this.translation(id)!;
  }

  deleteTranslation(id: string): void {
    this.db.transaction(() => {
      this.db.run('DELETE FROM bible_verses WHERE translation_id = ?', id);
      this.db.run('DELETE FROM bible_books WHERE translation_id = ?', id);
      this.db.run('DELETE FROM bible_translations WHERE id = ?', id);
      this.db.run('DELETE FROM bible_favorites WHERE translation_id = ?', id);
    });
    this.searchCache.delete(id);
  }

  bookNames(translationId: string): Array<{ number: number; name: string }> {
    return this.db
      .all<{ book: number; name: string }>('SELECT book, name FROM bible_books WHERE translation_id = ? ORDER BY book', translationId)
      .map((r) => ({ number: Number(r.book), name: String(r.name) }));
  }

  bookName(translationId: string, book: number): string {
    const row = this.db.get<{ name: string }>('SELECT name FROM bible_books WHERE translation_id = ? AND book = ?', translationId, book);
    return row?.name ?? canonBook(book)?.en ?? `Book ${book}`;
  }

  books(translationId: string): BibleBook[] {
    const rows = this.db.all<{ book: number; chapters: number }>(
      'SELECT book, MAX(chapter) AS chapters FROM bible_verses WHERE translation_id = ? GROUP BY book ORDER BY book',
      translationId,
    );
    const names = new Map(this.bookNames(translationId).map((b) => [b.number, b.name]));
    return rows.map((r) => ({
      number: Number(r.book),
      name: names.get(Number(r.book)) ?? CANON[Number(r.book) - 1]?.en ?? `Book ${r.book}`,
      chapters: Number(r.chapters),
    }));
  }

  chapter(translationId: string, book: number, chapter: number): BibleVerse[] {
    return this.db
      .all<{ book: number; chapter: number; verse: number; text: string }>(
        'SELECT book, chapter, verse, text FROM bible_verses WHERE translation_id = ? AND book = ? AND chapter = ? ORDER BY verse',
        translationId,
        book,
        chapter,
      )
      .map((r) => ({ book: Number(r.book), chapter: Number(r.chapter), verse: Number(r.verse), text: String(r.text) }));
  }

  /** Resolves a free-text reference into verses. */
  lookup(translationId: string, reference: string): { reference: string; verses: BibleVerse[]; error: string | null } {
    if (!this.translation(translationId)) {
      return { reference, verses: [], error: 'This Bible translation is not installed on this computer.' };
    }
    const parsed = parseReference(reference, this.bookNames(translationId));
    if (!parsed.ok) return { reference, verses: [], error: parsed.error };
    const ref = parsed.ref;
    const chapterEnd = ref.chapterEnd ?? ref.chapter;
    const verses: BibleVerse[] = [];
    for (let c = ref.chapter; c <= chapterEnd; c += 1) {
      for (const v of this.chapter(translationId, ref.book, c)) {
        if (ref.verseStart !== null) {
          if (c === ref.chapter && v.verse < ref.verseStart) continue;
          if (c === chapterEnd && ref.verseEnd !== null && v.verse > ref.verseEnd) continue;
        }
        verses.push(v);
      }
    }
    const pretty = formatReference(ref, this.bookName(translationId, ref.book));
    if (verses.length === 0) return { reference: pretty, verses, error: `${pretty} was not found in this translation.` };
    return { reference: pretty, verses, error: null };
  }

  search(translationId: string, text: string, limit = 100): Array<BibleVerse & { reference: string }> {
    const q = normalizeForSearch(text);
    if (q.length < 3) return [];
    let cache = this.searchCache.get(translationId);
    if (!cache) {
      cache = this.db
        .all<{ book: number; chapter: number; verse: number; text: string }>(
          'SELECT book, chapter, verse, text FROM bible_verses WHERE translation_id = ? ORDER BY book, chapter, verse',
          translationId,
        )
        .map((r) => ({ book: Number(r.book), chapter: Number(r.chapter), verse: Number(r.verse), text: String(r.text), norm: normalizeForSearch(String(r.text)) }));
      this.searchCache.set(translationId, cache);
    }
    const words = q.split(' ');
    const results: Array<BibleVerse & { reference: string }> = [];
    const names = new Map(this.bookNames(translationId).map((b) => [b.number, b.name]));
    for (const v of cache) {
      if (!words.every((w) => v.norm.includes(w))) continue;
      const name = names.get(v.book) ?? canonBook(v.book)?.en ?? String(v.book);
      results.push({ book: v.book, chapter: v.chapter, verse: v.verse, text: v.text, reference: `${name} ${v.chapter}:${v.verse}` });
      if (results.length >= limit) break;
    }
    return results;
  }

  favorites(): BibleFavorite[] {
    return this.db.all('SELECT * FROM bible_favorites ORDER BY created_at DESC').map((r) => ({
      id: String(r.id),
      translationId: String(r.translation_id),
      reference: String(r.reference),
      label: String(r.label ?? ''),
      createdAt: String(r.created_at),
    }));
  }

  saveFavorite(translationId: string, reference: string, label: string): BibleFavorite {
    const fav: BibleFavorite = { id: newId(), translationId, reference, label, createdAt: nowIso() };
    this.db.run(
      'INSERT INTO bible_favorites (id, translation_id, reference, label, created_at) VALUES (?, ?, ?, ?, ?)',
      fav.id,
      fav.translationId,
      fav.reference,
      fav.label,
      fav.createdAt,
    );
    return fav;
  }

  deleteFavorite(id: string): void {
    this.db.run('DELETE FROM bible_favorites WHERE id = ?', id);
  }

  clearCache(): void {
    this.searchCache.clear();
  }
}
