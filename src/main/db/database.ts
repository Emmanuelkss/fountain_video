/**
 * Thin wrapper around Node's built-in SQLite (node:sqlite, bundled with the
 * Node runtime inside Electron 40+). No native module to compile, so the
 * Windows build is reproducible from any machine.
 *
 * Durability: WAL journal + synchronous=FULL, every write is its own
 * transaction, so a power cut during a service cannot corrupt saved data.
 */
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations';

export type SqlValue = string | number | null | bigint | Uint8Array;
export type Row = Record<string, SqlValue>;

export class Database {
  private db: DatabaseSync;
  readonly path: string;

  constructor(path: string) {
    this.path = path;
    this.db = new DatabaseSync(path);
    try {
      this.db.exec('PRAGMA foreign_keys = ON;');
      if (path !== ':memory:') {
        this.db.exec('PRAGMA journal_mode = WAL;');
      }
      this.db.exec('PRAGMA synchronous = FULL;');
      this.db.exec('PRAGMA busy_timeout = 3000;');
    } catch (err) {
      // A damaged file fails here: release the handle so it can be moved aside (Windows locks open files).
      this.db.close();
      throw err;
    }
  }

  all<T = Row>(sql: string, ...params: SqlValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  get<T = Row>(sql: string, ...params: SqlValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: SqlValue[]): { changes: number } {
    const result = this.db.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  /** Prepares a statement once for bulk work (imports). */
  prepare(sql: string): (...params: SqlValue[]) => void {
    const statement = this.db.prepare(sql);
    return (...params: SqlValue[]) => {
      statement.run(...params);
    };
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  /** Runs fn inside a transaction; rolls back on any error. Re-entrant. */
  transaction<T>(fn: () => T): T {
    if (this.inTransaction) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore: the original error is more useful
      }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  private inTransaction = false;

  get schemaVersion(): number {
    const row = this.get<{ user_version: number }>('PRAGMA user_version');
    return Number(row?.user_version ?? 0);
  }

  /** Applies pending migrations in order, each in its own transaction. */
  migrate(): { from: number; to: number } {
    const from = this.schemaVersion;
    for (const migration of MIGRATIONS) {
      if (migration.version <= this.schemaVersion) continue;
      this.transaction(() => {
        migration.up(this);
        this.db.exec(`PRAGMA user_version = ${migration.version}`);
      });
    }
    return { from, to: this.schemaVersion };
  }

  /** Writes a consistent copy of the database (safe while the app is running). */
  backupTo(target: string): void {
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    const escaped = target.replace(/'/g, "''");
    this.db.exec(`VACUUM INTO '${escaped}'`);
  }

  integrityOk(): boolean {
    const row = this.get<{ integrity_check: string }>('PRAGMA integrity_check');
    return row?.integrity_check === 'ok';
  }

  close(): void {
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      // database may already be closed
    }
    this.db.close();
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T>(value: SqlValue | undefined, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
