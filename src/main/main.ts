/**
 * Electron entry point: creates the operator window, wires IPC to AppCore,
 * serves local media through the fvmedia:// protocol and manages the
 * projector window.
 */
import path from 'node:path';
import { Readable } from 'node:stream';
import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } from 'electron';
import { AppCore, type Platform } from './core';
import { OutputManager } from './output';
import { log } from './logger';
import { serveMediaFile, mediaPathFromUrlPath } from './fileResponse';
import { IPC, type CommandName, type Envelope, type EventName } from '../shared/api';
import { errorMessage, UserError } from '../shared/util';

const MEDIA_SCHEME = 'fvmedia';
const MEDIA_BASE = `${MEDIA_SCHEME}://file/`;
const distDir = path.join(__dirname, '..');
const rendererDir = path.join(distDir, 'renderer');
const preloadDir = path.join(distDir, 'preload');

// The projector window never receives clicks, so videos must be allowed to start with sound.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) {
  // A second copy was started: the first one is focused instead (see 'second-instance').
  app.quit();
} else {
  start();
}

function start(): void {
  let operator: BrowserWindow | null = null;
  let core: AppCore;
  let output: OutputManager;
  let quitting = false;

  process.on('uncaughtException', (err) => log.error('Uncaught exception', err));
  process.on('unhandledRejection', (err) => log.error('Unhandled promise rejection', err));

  app.on('second-instance', () => {
    if (operator) {
      if (operator.isMinimized()) operator.restore();
      operator.focus();
    }
  });

  const sendToOperator = (event: EventName, payload: unknown) => {
    if (operator && !operator.isDestroyed()) operator.webContents.send(IPC.event, event, payload);
  };

  const platform: Platform = {
    appVersion: app.getVersion(),
    mediaBase: MEDIA_BASE,
    listDisplays: () => output.listDisplays(),
    outputStatus: () => output.status(),
    openOutput: () => output.open(),
    closeOutput: () => output.close(),
    identifyDisplays: () => output.identify(),
    openFiles: async ({ title, filters, multiple }) => {
      const result = await dialog.showOpenDialog(operator ?? undefined, {
        title,
        filters,
        properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      });
      return result.canceled ? [] : result.filePaths;
    },
    saveFile: async ({ title, defaultName, filters }) => {
      const result = await dialog.showSaveDialog(operator ?? undefined, {
        title,
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters,
      });
      return result.canceled || !result.filePath ? null : result.filePath;
    },
    openPath: (target) => {
      void shell.openPath(target);
    },
  };

  app.whenReady().then(() => {
    app.setAppUserModelId('org.fountainvideo.app');
    Menu.setApplicationMenu(null);

    try {
      core = new AppCore(app.getPath('userData'), platform);
      core.start();
    } catch (err) {
      log.error('Fatal error while starting', err);
      dialog.showErrorBox('FountainVideo could not start', `${errorMessage(err)}\n\nLogs: ${path.join(app.getPath('userData'), 'logs')}`);
      app.exit(1);
      return;
    }

    output = new OutputManager({
      preferredDisplayId: () => core.repos.settings.get().outputDisplayId,
      forceWindowed: () => core.repos.settings.get().windowedOutput,
      liveState: () => core.liveState,
      onStatus: (status) => sendToOperator('output:status', status),
      onDisplaysChanged: (displays) => sendToOperator('displays:changed', displays),
      notify: (level, message) => core.notify(level, message),
      rendererDir,
      preloadDir,
    });

    // Every core event goes to the operator; live state also goes to the projector.
    core.onAny((event, payload) => {
      sendToOperator(event, payload);
      if (event === 'live:state') output.send(payload as typeof core.liveState);
    });
    // Settings that affect placement (chosen screen, test mode) re-place an open projector.
    core.on('data:changed', ({ kind }) => {
      if ((kind === 'settings' || kind === 'all') && output.status().open) output.open();
    });

    protocol.handle(MEDIA_SCHEME, (request) => {
      const url = new URL(request.url);
      const result = serveMediaFile(mediaPathFromUrlPath(url.pathname), request.headers.get('range'));
      if (!result.stream) return new Response(result.error ?? 'error', { status: result.status, headers: result.headers });
      return new Response(Readable.toWeb(result.stream) as unknown as ReadableStream, { status: result.status, headers: result.headers });
    });

    ipcMain.handle(IPC.invoke, async (event, name: CommandName, input: unknown): Promise<Envelope<unknown>> => {
      if (!operator || event.sender.id !== operator.webContents.id) {
        return { ok: false, error: 'Not allowed', userError: false };
      }
      try {
        const value = await core.invoke(name, input as never);
        return { ok: true, value };
      } catch (err) {
        return { ok: false, error: errorMessage(err), userError: err instanceof UserError };
      }
    });

    ipcMain.handle(IPC.outputReady, (event) => {
      if (!output.isOutputSender(event.sender.id)) return null;
      return { state: core.liveState, mediaBase: MEDIA_BASE };
    });

    ipcMain.on(IPC.outputMediaError, (event, file: string, message: string) => {
      if (output.isOutputSender(event.sender.id)) core.reportMediaError(String(file), String(message));
    });

    createOperatorWindow();
  });

  function createOperatorWindow(): void {
    operator = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 640,
      show: false,
      title: 'FountainVideo',
      backgroundColor: '#14161b',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(preloadDir, 'operator.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    operator.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    operator.webContents.on('will-navigate', (event) => event.preventDefault());
    operator.webContents.on('render-process-gone', (_e, details) => {
      log.error(`Operator renderer stopped (${details.reason}); reloading`);
      if (operator && !operator.isDestroyed()) operator.webContents.reload();
    });
    operator.webContents.on('did-finish-load', () => {
      for (const notice of core.takePendingNotices()) sendToOperator('notify', notice);
    });
    operator.once('ready-to-show', () => {
      operator?.maximize();
      operator?.show();
    });
    operator.on('close', (event) => {
      if (quitting) return;
      if (output.status().open) {
        const choice = dialog.showMessageBoxSync(operator ?? undefined, {
          type: 'question',
          title: 'Quit FountainVideo?',
          message: 'The projector is still on.',
          detail: 'Quitting will turn the projector screen off. Everything is already saved.',
          buttons: ['Keep presenting', 'Quit'],
          defaultId: 0,
          cancelId: 0,
        });
        if (choice === 0) {
          event.preventDefault();
          return;
        }
      }
      quitting = true;
      output.close();
    });
    operator.on('closed', () => {
      operator = null;
      app.quit();
    });
    void operator.loadFile(path.join(rendererDir, 'operator.html'));
  }

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    core?.shutdown();
    log.info('FountainVideo stopped');
  });
}
