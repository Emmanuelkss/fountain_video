/**
 * File logger: one file per day in <data>/logs, kept for 14 days.
 * Used for troubleshooting after a service ("what happened at 10:42?").
 */
import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error';

export class Logger {
  private dir: string | null = null;
  private echo: boolean;

  constructor(echo = true) {
    this.echo = echo;
  }

  init(dir: string, keepDays = 14): void {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    const cutoff = Date.now() - keepDays * 24 * 3600 * 1000;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      try {
        if (name.endsWith('.log') && fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
      } catch {
        // ignore files we cannot inspect
      }
    }
  }

  get directory(): string | null {
    return this.dir;
  }

  private write(level: LogLevel, message: string, detail?: unknown): void {
    const now = new Date();
    let line = `${now.toISOString()} [${level.toUpperCase()}] ${message}`;
    if (detail !== undefined) {
      line += ' ' + (detail instanceof Error ? `${detail.message}\n${detail.stack ?? ''}` : safeStringify(detail));
    }
    if (this.echo) (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
    if (!this.dir) return;
    const file = path.join(this.dir, `fountainvideo-${now.toISOString().slice(0, 10)}.log`);
    try {
      fs.appendFileSync(file, line + '\n', 'utf8');
    } catch {
      // Logging must never crash the app.
    }
  }

  info(message: string, detail?: unknown): void {
    this.write('info', message, detail);
  }

  warn(message: string, detail?: unknown): void {
    this.write('warn', message, detail);
  }

  error(message: string, detail?: unknown): void {
    this.write('error', message, detail);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const log = new Logger(process.env.FV_QUIET !== '1');
