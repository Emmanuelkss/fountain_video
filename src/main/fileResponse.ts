/**
 * Serves local media files with HTTP Range support (needed for video seeking
 * and for large files). Used by the Electron `fvmedia://` protocol and by the
 * test harness HTTP server.
 */
import fs from 'node:fs';
import path from 'node:path';
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from './mediaLibrary';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mkv: 'video/x-matroska',
};

export interface FileResult {
  status: number;
  headers: Record<string, string>;
  /** Null for errors (body is the status text). */
  stream: fs.ReadStream | null;
  error?: string;
}

export function mediaPathFromUrlPath(urlPath: string): string {
  return decodeURIComponent(urlPath.replace(/^\/+/, ''));
}

export function serveMediaFile(file: string, rangeHeader: string | null | undefined): FileResult {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext) && !VIDEO_EXTENSIONS.includes(ext)) {
    return { status: 403, headers: {}, stream: null, error: 'Only image and video files can be served.' };
  }
  let size: number;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error('not a file');
    size = stat.size;
  } catch {
    return { status: 404, headers: {}, stream: null, error: 'File not found.' };
  }
  const type = MIME[ext] ?? 'application/octet-stream';
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const match = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (match && (match[1] || match[2])) {
    let start: number;
    let end: number;
    if (match[1]) {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    } else {
      // suffix range "bytes=-500"
      start = Math.max(0, size - Number(match[2]));
      end = size - 1;
    }
    if (start >= size || start > end) {
      return { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` }, stream: null, error: 'Range not satisfiable' };
    }
    return {
      status: 206,
      headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
      stream: fs.createReadStream(file, { start, end }),
    };
  }
  return { status: 200, headers: { ...base, 'Content-Length': String(size) }, stream: fs.createReadStream(file) };
}
