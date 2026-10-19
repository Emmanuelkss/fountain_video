/**
 * Schema migrations. Rules:
 *  - never edit a migration that has shipped; add a new one with the next version;
 *  - each migration runs in a transaction and bumps PRAGMA user_version;
 *  - a backup is taken automatically before migrating an existing database.
 */
import type { Database } from './database';

export interface Migration {
  version: number;
  description: string;
  up(db: Database): void;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema',
    up(db) {
      db.exec(`
        CREATE TABLE settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE songs (
          id                     TEXT PRIMARY KEY,
          title                  TEXT NOT NULL,
          author                 TEXT NOT NULL DEFAULT '',
          copyright              TEXT NOT NULL DEFAULT '',
          ccli                   TEXT NOT NULL DEFAULT '',
          song_key               TEXT NOT NULL DEFAULT '',
          notes                  TEXT NOT NULL DEFAULT '',
          categories             TEXT NOT NULL DEFAULT '[]',
          sections               TEXT NOT NULL DEFAULT '[]',
          arrangements           TEXT NOT NULL DEFAULT '[]',
          default_arrangement_id TEXT,
          theme_id               TEXT,
          search_title           TEXT NOT NULL DEFAULT '',
          search_text            TEXT NOT NULL DEFAULT '',
          created_at             TEXT NOT NULL,
          updated_at             TEXT NOT NULL
        );
        CREATE INDEX songs_title ON songs(search_title);

        CREATE TABLE services (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          date        TEXT NOT NULL DEFAULT '',
          is_template INTEGER NOT NULL DEFAULT 0,
          notes       TEXT NOT NULL DEFAULT '',
          items       TEXT NOT NULL DEFAULT '[]',
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL
        );

        CREATE TABLE themes (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          data       TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE bible_translations (
          id           TEXT PRIMARY KEY,
          name         TEXT NOT NULL,
          abbreviation TEXT NOT NULL,
          language     TEXT NOT NULL DEFAULT '',
          license      TEXT NOT NULL DEFAULT '',
          created_at   TEXT NOT NULL
        );

        CREATE TABLE bible_books (
          translation_id TEXT NOT NULL REFERENCES bible_translations(id) ON DELETE CASCADE,
          book           INTEGER NOT NULL,
          name           TEXT NOT NULL,
          PRIMARY KEY (translation_id, book)
        );

        CREATE TABLE bible_verses (
          translation_id TEXT NOT NULL REFERENCES bible_translations(id) ON DELETE CASCADE,
          book           INTEGER NOT NULL,
          chapter        INTEGER NOT NULL,
          verse          INTEGER NOT NULL,
          text           TEXT NOT NULL,
          PRIMARY KEY (translation_id, book, chapter, verse)
        ) WITHOUT ROWID;

        CREATE TABLE bible_favorites (
          id             TEXT PRIMARY KEY,
          translation_id TEXT NOT NULL,
          reference      TEXT NOT NULL,
          label          TEXT NOT NULL DEFAULT '',
          created_at     TEXT NOT NULL
        );

        CREATE TABLE media (
          id            TEXT PRIMARY KEY,
          name          TEXT NOT NULL,
          kind          TEXT NOT NULL CHECK (kind IN ('image','video')),
          path          TEXT NOT NULL,
          original_path TEXT NOT NULL DEFAULT '',
          size          INTEGER NOT NULL DEFAULT 0,
          created_at    TEXT NOT NULL
        );
      `);
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;
