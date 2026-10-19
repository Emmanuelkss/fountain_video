import type { Database, Row } from './database';
import { fromJson, toJson } from './database';
import type { Service, ServiceItem, ServiceSummary } from '../../shared/types';
import { validateService } from '../../shared/validation';
import { newId } from '../../shared/util';

function rowToService(row: Row): Service {
  return {
    id: String(row.id),
    name: String(row.name),
    date: String(row.date ?? ''),
    isTemplate: Number(row.is_template) === 1,
    notes: String(row.notes ?? ''),
    items: fromJson<ServiceItem[]>(row.items, []),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class ServicesRepo {
  constructor(private db: Database) {}

  list(templates: boolean): ServiceSummary[] {
    return this.db
      .all(
        `SELECT id, name, date, is_template, items, updated_at FROM services
         WHERE is_template = ? ORDER BY date DESC, updated_at DESC`,
        templates ? 1 : 0,
      )
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        date: String(row.date ?? ''),
        isTemplate: Number(row.is_template) === 1,
        itemCount: fromJson<unknown[]>(row.items, []).length,
        updatedAt: String(row.updated_at),
      }));
  }

  get(id: string): Service | null {
    const row = this.db.get('SELECT * FROM services WHERE id = ?', id);
    return row ? rowToService(row) : null;
  }

  all(): Service[] {
    return this.db.all('SELECT * FROM services').map(rowToService);
  }

  save(input: Service): Service {
    const existing = input.id ? this.get(input.id) : null;
    const service = validateService({ ...input, createdAt: existing?.createdAt ?? input.createdAt });
    this.db.run(
      `INSERT INTO services (id, name, date, is_template, notes, items, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, date = excluded.date, is_template = excluded.is_template,
         notes = excluded.notes, items = excluded.items, updated_at = excluded.updated_at`,
      service.id,
      service.name,
      service.date,
      service.isTemplate ? 1 : 0,
      service.notes,
      toJson(service.items),
      service.createdAt,
      service.updatedAt,
    );
    return service;
  }

  delete(id: string): void {
    this.db.run('DELETE FROM services WHERE id = ?', id);
  }

  /** Copies a service (or template) with fresh ids. */
  duplicate(id: string, options: { asTemplate?: boolean; name?: string; date?: string }): Service {
    const source = this.get(id);
    if (!source) throw new Error('Service not found');
    const copy: Service = {
      ...source,
      id: newId(),
      name: options.name ?? `${source.name} (copy)`,
      date: options.date ?? source.date,
      isTemplate: options.asTemplate ?? source.isTemplate,
      items: source.items.map((item) => ({ ...item, id: newId() })),
      createdAt: '',
      updatedAt: '',
    };
    return this.save(copy);
  }

  /** Names of services that use a song (to warn before deleting it). */
  usingSong(songId: string): string[] {
    return this.all()
      .filter((s) => s.items.some((i) => i.type === 'song' && i.songId === songId))
      .map((s) => (s.isTemplate ? `${s.name} (template)` : s.name));
  }
}
