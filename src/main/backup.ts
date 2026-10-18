/**
 * Backups are complete SQLite copies (*.fvbackup) written with VACUUM INTO,
 * which is safe while the app is running. Automatic backups are taken:
 *  - once per day at startup,
 *  - before a schema migration,
 *  - before the first launch of a new app version (i.e. after an update),
 *  - before every restore (safety copy).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { BackupInfo } from '../shared/api';
import { UserError } from '../shared/util';

export const BACKUP_EXT = '.fvbackup';

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[:]/g, '-').replace(/\..+$/, '');
}

export class BackupManager {
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  get directory(): string {
    return this.dir;
  }

  automaticPath(reason: string): string {
    return path.join(this.dir, `auto-${reason}-${stamp()}${BACKUP_EXT}`);
  }

  manualPath(): string {
    return path.join(this.dir, `FountainVideo-${stamp()}${BACKUP_EXT}`);
  }

  list(): BackupInfo[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((name) => name.endsWith(BACKUP_EXT))
      .map((name) => {
        const file = path.join(this.dir, name);
        const stat = fs.statSync(file);
        return { path: file, name, size: stat.size, createdAt: stat.mtime.toISOString(), automatic: name.startsWith('auto-') };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  hasAutomaticBackupToday(): boolean {
    const today = new Date().toISOString().slice(0, 10);
    return this.list().some((b) => b.automatic && b.name.includes(`-daily-${today}`));
  }

  /** Keeps the newest `keep` automatic backups; manual backups are never deleted. */
  prune(keep: number): void {
    const autos = this.list().filter((b) => b.automatic);
    for (const old of autos.slice(keep)) {
      try {
        fs.unlinkSync(old.path);
      } catch {
        // ignore
      }
    }
  }

  info(file: string): BackupInfo {
    const stat = fs.statSync(file);
    const name = path.basename(file);
    return { path: file, name, size: stat.size, createdAt: stat.mtime.toISOString(), automatic: name.startsWith('auto-') };
  }
}

/** Checks that a file is a FountainVideo database before restoring it. */
export function validateBackupFile(file: string): void {
  if (!fs.existsSync(file)) throw new UserError('The backup file does not exist.');
  const header = Buffer.alloc(16);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, header, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (header.toString('latin1') !== 'SQLite format 3\u0000') throw new UserError('This file is not a FountainVideo backup.');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name),
    );
    for (const required of ['songs', 'services', 'settings']) {
      if (!tables.has(required)) throw new UserError('This file is not a FountainVideo backup (missing tables).');
    }
    const check = db.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
    if (check?.quick_check !== 'ok') throw new UserError('The backup file is damaged and cannot be restored.');
  } finally {
    db.close();
  }
}
