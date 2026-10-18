/**
 * Media library: imported files are copied into <data>/media so a service
 * keeps working when the original USB stick or download folder is gone.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { MediaItem, MediaKind } from '../shared/types';
import type { ImportReport } from '../shared/api';
import type { MediaRepo } from './db/miscRepos';
import { errorMessage, newId, nowIso } from '../shared/util';

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
/** Containers Chromium (Electron) can play. Codec support is checked at playback time. */
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'mkv'];
const KNOWN_UNSUPPORTED = ['avi', 'wmv', 'flv', 'mpg', 'mpeg', 'vob', '3gp'];

export function mediaKind(file: string): MediaKind | null {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  return null;
}

export class MediaLibrary {
  constructor(
    private repo: MediaRepo,
    private dir: string,
  ) {
    fs.mkdirSync(dir, { recursive: true });
  }

  get directory(): string {
    return this.dir;
  }

  list(): MediaItem[] {
    return this.repo.list().map((m) => ({ ...m, exists: fs.existsSync(m.path) }));
  }

  async import(paths: string[]): Promise<ImportReport> {
    const report: ImportReport = { imported: 0, skipped: 0, errors: [], ids: [] };
    for (const source of paths) {
      const name = path.basename(source);
      const ext = path.extname(source).slice(1).toLowerCase();
      const kind = mediaKind(source);
      if (!kind) {
        report.skipped += 1;
        report.errors.push(
          KNOWN_UNSUPPORTED.includes(ext)
            ? `${name}: .${ext} videos are not supported. Convert to MP4 (H.264) or WebM.`
            : `${name}: unsupported file type.`,
        );
        continue;
      }
      try {
        const stat = await fs.promises.stat(source);
        const id = newId();
        const target = path.join(this.dir, `${id.slice(0, 8)}-${name.replace(/[<>:"/\\|?*]+/g, '_')}`);
        await fs.promises.copyFile(source, target);
        this.repo.insert({ id, name, kind, path: target, originalPath: source, size: stat.size, createdAt: nowIso() });
        report.imported += 1;
        report.ids.push(id);
      } catch (err) {
        report.skipped += 1;
        report.errors.push(`${name}: ${errorMessage(err)}`);
      }
    }
    return report;
  }

  delete(id: string): void {
    const item = this.repo.get(id);
    if (!item) return;
    this.repo.delete(id);
    // Only remove files we own (inside the library folder).
    if (path.resolve(item.path).startsWith(path.resolve(this.dir) + path.sep)) {
      try {
        fs.unlinkSync(item.path);
      } catch {
        // already gone
      }
    }
  }
}
