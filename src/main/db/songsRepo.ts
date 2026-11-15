import type { Database, Row } from './database';
import { fromJson, toJson } from './database';
import type { Song, SongSummary } from '../../shared/types';
import { validateSong } from '../../shared/validation';
import { firstLine } from '../../shared/lyrics';
import { normalizeForSearch } from '../../shared/util';

function rowToSong(row: Row): Song {
  return {
    id: String(row.id),
    title: String(row.title),
    author: String(row.author ?? ''),
    copyright: String(row.copyright ?? ''),
    ccli: String(row.ccli ?? ''),
    key: String(row.song_key ?? ''),
    notes: String(row.notes ?? ''),
    categories: fromJson<string[]>(row.categories, []),
    songbook: String(row.songbook ?? ''),
    songbookNumber: String(row.songbook_number ?? ''),
    sections: fromJson(row.sections, []),
    arrangements: fromJson(row.arrangements, []),
    defaultArrangementId: (row.default_arrangement_id as string | null) ?? null,
    themeId: (row.theme_id as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class SongsRepo {
  constructor(private db: Database) {}

  list(query = '', category = '', songbook = ''): SongSummary[] {
    const q = normalizeForSearch(query);
    const rows = this.db.all(
      `SELECT id, title, author, categories, songbook, songbook_number, sections, search_title, search_text, updated_at
       FROM songs ORDER BY search_title`,
    );
    const words = q.split(' ').filter(Boolean);
    const scored: Array<{ score: number; summary: SongSummary }> = [];
    for (const row of rows) {
      const categories = fromJson<string[]>(row.categories, []);
      if (category && !categories.some((c) => c.toLowerCase() === category.toLowerCase())) continue;
      const book = String(row.songbook ?? '');
      const number = String(row.songbook_number ?? '');
      if (songbook && book.toLowerCase() !== songbook.toLowerCase()) continue;
      let score = 0;
      if (words.length > 0) {
        const title = String(row.search_title);
        const body = String(row.search_text);
        const ref = normalizeForSearch(`${book} ${number}`);
        // Typing a song number ("123", "JEM 123") finds it first.
        const numberHit = number !== '' && (q === normalizeForSearch(number) || q === ref);
        if (!numberHit && !words.every((w) => title.includes(w) || body.includes(w) || ref.includes(w))) continue;
        if (numberHit) score += 200;
        else if (title.startsWith(q)) score += 100;
        else if (title.includes(q)) score += 60;
        else if (words.every((w) => title.includes(w))) score += 40;
        else if (body.includes(q)) score += 20;
      }
      scored.push({
        score,
        summary: {
          id: String(row.id),
          title: String(row.title),
          author: String(row.author ?? ''),
          categories,
          songbook: book,
          songbookNumber: number,
          firstLine: firstLine(fromJson(row.sections, [])),
          updatedAt: String(row.updated_at),
        },
      });
    }
    // Inside a songbook, songs are listed by number like in a printed hymnal.
    const byNumber = (a: SongSummary, b: SongSummary) =>
      a.songbookNumber.localeCompare(b.songbookNumber, undefined, { numeric: true }) || a.title.localeCompare(b.title);
    scored.sort((a, b) => b.score - a.score || (songbook ? byNumber(a.summary, b.summary) : a.summary.title.localeCompare(b.summary.title)));
    return scored.map((s) => s.summary);
  }

  get(id: string): Song | null {
    const row = this.db.get('SELECT * FROM songs WHERE id = ?', id);
    return row ? rowToSong(row) : null;
  }

  all(): Song[] {
    return this.db.all('SELECT * FROM songs ORDER BY search_title').map(rowToSong);
  }

  save(input: Song): Song {
    const existing = input.id ? this.get(input.id) : null;
    const song = validateSong({ ...input, createdAt: existing?.createdAt ?? input.createdAt });
    const searchText = normalizeForSearch(
      [song.author, song.copyright, song.ccli, song.songbook, song.songbookNumber, ...song.categories, ...song.sections.map((s) => s.text)].join(' '),
    );
    this.db.run(
      `INSERT INTO songs (id, title, author, copyright, ccli, song_key, notes, categories, songbook, songbook_number, sections, arrangements,
                          default_arrangement_id, theme_id, search_title, search_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title, author = excluded.author, copyright = excluded.copyright, ccli = excluded.ccli,
         song_key = excluded.song_key, notes = excluded.notes, categories = excluded.categories,
         songbook = excluded.songbook, songbook_number = excluded.songbook_number,
         sections = excluded.sections, arrangements = excluded.arrangements,
         default_arrangement_id = excluded.default_arrangement_id, theme_id = excluded.theme_id,
         search_title = excluded.search_title, search_text = excluded.search_text, updated_at = excluded.updated_at`,
      song.id,
      song.title,
      song.author,
      song.copyright,
      song.ccli,
      song.key,
      song.notes,
      toJson(song.categories),
      song.songbook,
      song.songbookNumber,
      toJson(song.sections),
      toJson(song.arrangements),
      song.defaultArrangementId,
      song.themeId,
      normalizeForSearch(song.title),
      searchText,
      song.createdAt,
      song.updatedAt,
    );
    return song;
  }

  delete(id: string): void {
    this.db.run('DELETE FROM songs WHERE id = ?', id);
  }

  categories(): string[] {
    const set = new Map<string, string>();
    for (const row of this.db.all<{ categories: string }>('SELECT categories FROM songs')) {
      for (const c of fromJson<string[]>(row.categories, [])) set.set(c.toLowerCase(), c);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  }

  songbooks(): Array<{ name: string; count: number }> {
    return this.db
      .all<{ songbook: string; n: number }>(
        "SELECT songbook, COUNT(*) AS n FROM songs WHERE songbook <> '' GROUP BY songbook COLLATE NOCASE ORDER BY songbook COLLATE NOCASE",
      )
      .map((r) => ({ name: String(r.songbook), count: Number(r.n) }));
  }

  renameSongbook(from: string, to: string): number {
    return this.db.run('UPDATE songs SET songbook = ? WHERE songbook = ? COLLATE NOCASE', to, from).changes;
  }

  idsInSongbook(name: string): string[] {
    return this.db.all<{ id: string }>('SELECT id FROM songs WHERE songbook = ? COLLATE NOCASE', name).map((r) => String(r.id));
  }

  /** Song with the same title (and, when given, the same songbook entry). Used to update instead of duplicating on re-import. */
  findExisting(title: string, songbook: string, number: string): Song | null {
    const row = songbook
      ? this.db.get(
          'SELECT * FROM songs WHERE search_title = ? AND songbook = ? COLLATE NOCASE AND songbook_number = ? LIMIT 1',
          normalizeForSearch(title),
          songbook,
          number,
        )
      : undefined;
    return row ? rowToSong(row) : null;
  }

  count(): number {
    return Number(this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM songs')?.n ?? 0);
  }

  findByTitle(title: string): Song | null {
    const row = this.db.get('SELECT * FROM songs WHERE search_title = ? LIMIT 1', normalizeForSearch(title));
    return row ? rowToSong(row) : null;
  }
}
