import type { Database } from './database';
import { fromJson, toJson } from './database';
import type { AppSettings, MediaItem, MediaKind, Theme } from '../../shared/types';
import { BUILTIN_THEMES, normalizeTheme } from '../../shared/themes';
import { normalizeSettings } from '../../shared/settings';
import { validateTheme } from '../../shared/validation';
import { UserError } from '../../shared/util';

export class SettingsRepo {
  constructor(private db: Database) {}

  getRaw<T>(key: string, fallback: T): T {
    const row = this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
    return row ? fromJson<T>(row.value, fallback) : fallback;
  }

  setRaw(key: string, value: unknown): void {
    this.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      toJson(value),
    );
  }

  get(): AppSettings {
    return normalizeSettings(this.getRaw<Partial<AppSettings>>('app', {}));
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const next = normalizeSettings({ ...this.get(), ...patch });
    this.setRaw('app', next);
    return next;
  }
}

export class ThemesRepo {
  constructor(private db: Database) {}

  list(): Theme[] {
    const custom = this.db
      .all<{ id: string; name: string; data: string }>('SELECT id, name, data FROM themes ORDER BY name')
      .map((row) => normalizeTheme({ ...fromJson<Partial<Theme>>(row.data, {}), id: row.id, name: row.name, builtin: false }));
    return [...BUILTIN_THEMES, ...custom];
  }

  get(id: string | null | undefined): Theme | null {
    if (!id) return null;
    const builtin = BUILTIN_THEMES.find((t) => t.id === id);
    if (builtin) return builtin;
    const row = this.db.get<{ id: string; name: string; data: string }>('SELECT id, name, data FROM themes WHERE id = ?', id);
    return row ? normalizeTheme({ ...fromJson<Partial<Theme>>(row.data, {}), id: row.id, name: row.name, builtin: false }) : null;
  }

  save(input: Theme): Theme {
    if (BUILTIN_THEMES.some((t) => t.id === input.id)) {
      throw new UserError('Built-in themes cannot be changed. Duplicate it to make your own version.');
    }
    const theme = validateTheme(input);
    this.db.run(
      `INSERT INTO themes (id, name, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`,
      theme.id,
      theme.name,
      toJson(theme),
      theme.updatedAt,
    );
    return theme;
  }

  delete(id: string): void {
    if (BUILTIN_THEMES.some((t) => t.id === id)) throw new UserError('Built-in themes cannot be deleted.');
    this.db.run('DELETE FROM themes WHERE id = ?', id);
  }
}

export class MediaRepo {
  constructor(private db: Database) {}

  list(): MediaItem[] {
    return this.db.all('SELECT * FROM media ORDER BY created_at DESC').map((row) => ({
      id: String(row.id),
      name: String(row.name),
      kind: String(row.kind) as MediaKind,
      path: String(row.path),
      originalPath: String(row.original_path ?? ''),
      size: Number(row.size ?? 0),
      createdAt: String(row.created_at),
    }));
  }

  get(id: string): MediaItem | null {
    return this.list().find((m) => m.id === id) ?? null;
  }

  insert(item: MediaItem): void {
    this.db.run(
      'INSERT INTO media (id, name, kind, path, original_path, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      item.id,
      item.name,
      item.kind,
      item.path,
      item.originalPath,
      item.size,
      item.createdAt,
    );
  }

  delete(id: string): void {
    this.db.run('DELETE FROM media WHERE id = ?', id);
  }
}
