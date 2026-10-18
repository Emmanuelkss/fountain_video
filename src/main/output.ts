/**
 * Audience (projector) window management.
 *
 * - Places a frameless full-screen window on the chosen display, or a normal
 *   window in test mode when only one screen exists.
 * - Follows hot-plugging: if the projector is unplugged during a service the
 *   output falls back to a window instead of disappearing.
 * - Keeps the display awake while projecting.
 * - Reloads the projector page automatically if its renderer crashes.
 */
import path from 'node:path';
import { BrowserWindow, powerSaveBlocker, screen, type Display } from 'electron';
import type { DisplayInfo, OutputStatus } from '../shared/types';
import { IPC } from '../shared/api';
import type { LiveState } from '../shared/live';
import { chooseOutputDisplay, describeDisplay } from './displays';
import { log } from './logger';

export interface OutputHost {
  preferredDisplayId(): number | null;
  forceWindowed(): boolean;
  liveState(): LiveState;
  onStatus(status: OutputStatus): void;
  onDisplaysChanged(displays: DisplayInfo[]): void;
  notify(level: 'info' | 'warn' | 'error', message: string): void;
  rendererDir: string;
  preloadDir: string;
}

export function toDisplayInfo(display: Display, primaryId: number, index: number): DisplayInfo {
  const info: DisplayInfo = {
    id: display.id,
    label: display.label || '',
    bounds: { ...display.bounds },
    primary: display.id === primaryId,
    scaleFactor: display.scaleFactor,
  };
  info.label = `${describeDisplay(info, index)}${display.label ? ` · ${display.label}` : ''}`;
  return info;
}

export class OutputManager {
  private window: BrowserWindow | null = null;
  private placement: { displayId: number | null; windowed: boolean; message: string } = { displayId: null, windowed: true, message: '' };
  private blockerId: number | null = null;
  private crashCount = 0;

  constructor(private host: OutputHost) {
    const changed = () => this.handleDisplaysChanged();
    screen.on('display-added', changed);
    screen.on('display-removed', changed);
    screen.on('display-metrics-changed', changed);
  }

  listDisplays(): DisplayInfo[] {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen
      .getAllDisplays()
      .sort((a, b) => (a.id === primaryId ? -1 : b.id === primaryId ? 1 : a.bounds.x - b.bounds.x))
      .map((d, i) => toDisplayInfo(d, primaryId, i));
  }

  status(): OutputStatus {
    const open = Boolean(this.window && !this.window.isDestroyed());
    const bounds = open ? this.window!.getContentBounds() : { width: 0, height: 0 };
    return {
      open,
      displayId: open ? this.placement.displayId : null,
      windowed: open ? this.placement.windowed : false,
      width: bounds.width,
      height: bounds.height,
      message: this.placement.message,
    };
  }

  open(): OutputStatus {
    if (this.window && !this.window.isDestroyed()) {
      this.place();
      this.window.showInactive();
      return this.status();
    }
    const win = new BrowserWindow({
      show: false,
      frame: false,
      title: 'FountainVideo — Audience',
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      skipTaskbar: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(this.host.preloadDir, 'output.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Keep animations and video running even when the window is not focused.
        backgroundThrottling: false,
        spellcheck: false,
      },
    });
    this.window = win;
    win.setMenuBarVisibility(false);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.on('render-process-gone', (_event, details) => {
      log.error(`Projector renderer stopped (${details.reason}); reloading`);
      this.crashCount += 1;
      if (this.crashCount <= 5 && !win.isDestroyed()) win.webContents.reload();
      else this.host.notify('error', 'The projector window keeps crashing. Close it and open it again.');
    });
    win.on('closed', () => {
      this.window = null;
      this.stopBlocker();
      this.host.onStatus(this.status());
    });
    win.once('ready-to-show', () => {
      this.place();
      win.showInactive();
      this.host.onStatus(this.status());
    });
    void win.loadFile(path.join(this.host.rendererDir, 'output.html'));
    this.startBlocker();
    log.info('Projector window opened');
    return this.status();
  }

  close(): OutputStatus {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
      this.window = null;
      log.info('Projector window closed');
    }
    this.stopBlocker();
    const status = this.status();
    this.host.onStatus(status);
    return status;
  }

  send(state: LiveState): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send(IPC.outputState, state);
  }

  isOutputSender(id: number): boolean {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.webContents.id === id);
  }

  /** Shows a big number on every screen for 3 seconds so volunteers know which is which. */
  identify(): void {
    this.listDisplays().forEach((display, index) => {
      const w = new BrowserWindow({
        x: display.bounds.x + Math.round(display.bounds.width / 2) - 260,
        y: display.bounds.y + Math.round(display.bounds.height / 2) - 160,
        width: 520,
        height: 320,
        frame: false,
        resizable: false,
        movable: false,
        focusable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        backgroundColor: '#111827',
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      const html = `<html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#111827;color:#fff;font-family:Segoe UI,Arial,sans-serif">
        <div style="font-size:150px;font-weight:700;line-height:1">${index + 1}</div>
        <div style="font-size:24px;opacity:.8">${display.label.replace(/</g, '&lt;')}</div></body></html>`;
      void w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      w.once('ready-to-show', () => w.showInactive());
      setTimeout(() => {
        if (!w.isDestroyed()) w.destroy();
      }, 3000);
    });
  }

  private place(): void {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    const displays = this.listDisplays();
    const choice = chooseOutputDisplay(displays, this.host.preferredDisplayId(), this.host.forceWindowed());
    this.placement = { displayId: choice.display?.id ?? null, windowed: choice.windowed, message: choice.message };
    if (choice.display) {
      const { bounds } = choice.display;
      win.setFullScreen(false);
      win.setBounds(bounds);
      win.setFullScreen(true);
      // Keep pop-ups and notifications from appearing on the projector.
      win.setAlwaysOnTop(!choice.display.primary, 'screen-saver');
      win.setTitle('FountainVideo — Audience');
    } else {
      const primary = screen.getPrimaryDisplay().workArea;
      win.setFullScreen(false);
      win.setAlwaysOnTop(false);
      const width = Math.min(960, Math.round(primary.width * 0.5));
      const height = Math.round((width * 9) / 16);
      win.setBounds({ x: primary.x + primary.width - width - 24, y: primary.y + primary.height - height - 24, width, height });
      win.setTitle('FountainVideo — Audience (test window)');
    }
    log.info(`Projector placed: ${choice.display ? choice.display.label : 'test window'} ${choice.message}`);
  }

  private handleDisplaysChanged(): void {
    const displays = this.listDisplays();
    this.host.onDisplaysChanged(displays);
    if (!this.window || this.window.isDestroyed()) return;
    const previous = this.placement.displayId;
    this.place();
    if (previous !== null && this.placement.displayId !== previous) {
      this.host.notify(
        'warn',
        this.placement.windowed
          ? 'The projector was disconnected. The audience view moved to a window on this screen.'
          : 'Screens changed. The audience view moved to another screen.',
      );
    }
    this.host.onStatus(this.status());
  }

  private startBlocker(): void {
    if (this.blockerId === null) this.blockerId = powerSaveBlocker.start('prevent-display-sleep');
  }

  private stopBlocker(): void {
    if (this.blockerId !== null) {
      powerSaveBlocker.stop(this.blockerId);
      this.blockerId = null;
    }
  }
}
