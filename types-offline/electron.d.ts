// Offline stand-in for the parts of Electron's typings FountainVideo uses.
// Only used by tsconfig.offline.json in sandboxes without npm access; real
// builds use the official `electron` package types.
declare module 'electron' {
  interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
  }
  interface Display {
    id: number;
    label: string;
    bounds: Rectangle;
    workArea: Rectangle;
    scaleFactor: number;
    size: { width: number; height: number };
  }
  interface IpcMainInvokeEvent {
    sender: WebContents;
  }
  interface IpcMainEvent {
    sender: WebContents;
    returnValue: unknown;
  }
  interface IpcRendererEvent {
    sender: unknown;
  }
  interface WebContents {
    id: number;
    send(channel: string, ...args: unknown[]): void;
    on(event: 'render-process-gone', listener: (event: unknown, details: { reason: string; exitCode: number }) => void): this;
    on(event: 'did-finish-load', listener: () => void): this;
    on(event: 'console-message', listener: (...args: unknown[]) => void): this;
    setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' | 'allow' }): void;
    on(event: 'will-navigate', listener: (event: { preventDefault(): void }, url: string) => void): this;
    reload(): void;
    isDestroyed(): boolean;
    openDevTools(options?: { mode: string }): void;
    getURL(): string;
  }
  interface WebPreferences {
    preload?: string;
    contextIsolation?: boolean;
    nodeIntegration?: boolean;
    sandbox?: boolean;
    backgroundThrottling?: boolean;
    spellcheck?: boolean;
    devTools?: boolean;
  }
  interface BrowserWindowConstructorOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    show?: boolean;
    frame?: boolean;
    title?: string;
    backgroundColor?: string;
    fullscreen?: boolean;
    fullscreenable?: boolean;
    skipTaskbar?: boolean;
    alwaysOnTop?: boolean;
    resizable?: boolean;
    movable?: boolean;
    focusable?: boolean;
    autoHideMenuBar?: boolean;
    icon?: string;
    transparent?: boolean;
    hasShadow?: boolean;
    webPreferences?: WebPreferences;
  }
  class BrowserWindow {
    constructor(options?: BrowserWindowConstructorOptions);
    static getAllWindows(): BrowserWindow[];
    webContents: WebContents;
    id: number;
    loadFile(file: string, options?: { query?: Record<string, string>; hash?: string }): Promise<void>;
    loadURL(url: string): Promise<void>;
    show(): void;
    showInactive(): void;
    hide(): void;
    close(): void;
    destroy(): void;
    focus(): void;
    isDestroyed(): boolean;
    isVisible(): boolean;
    isMinimized(): boolean;
    restore(): void;
    maximize(): void;
    setBounds(bounds: Partial<Rectangle>): void;
    getBounds(): Rectangle;
    getContentBounds(): Rectangle;
    setFullScreen(flag: boolean): void;
    isFullScreen(): boolean;
    setAlwaysOnTop(flag: boolean, level?: string): void;
    setMenuBarVisibility(visible: boolean): void;
    setTitle(title: string): void;
    on(event: 'closed' | 'ready-to-show' | 'resize' | 'focus' | 'blur', listener: () => void): this;
    on(event: 'close', listener: (event: { preventDefault(): void }) => void): this;
    once(event: 'ready-to-show' | 'closed', listener: () => void): this;
  }
  const app: {
    getVersion(): string;
    getName(): string;
    getPath(name: 'userData' | 'documents' | 'home' | 'temp' | 'exe'): string;
    setPath(name: string, value: string): void;
    whenReady(): Promise<void>;
    quit(): void;
    exit(code?: number): void;
    isPackaged: boolean;
    setAppUserModelId(id: string): void;
    requestSingleInstanceLock(): boolean;
    on(event: 'second-instance' | 'window-all-closed' | 'activate' | 'before-quit' | 'will-quit', listener: (...args: unknown[]) => void): void;
    commandLine: { appendSwitch(name: string, value?: string): void };
  };
  const screen: {
    getAllDisplays(): Display[];
    getPrimaryDisplay(): Display;
    on(event: 'display-added' | 'display-removed' | 'display-metrics-changed', listener: (...args: unknown[]) => void): void;
  };
  const ipcMain: {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void;
    on(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void): void;
  };
  const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<any>;
    send(channel: string, ...args: unknown[]): void;
    on(channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void): void;
    removeListener(channel: string, listener: (...args: any[]) => void): void;
  };
  const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void;
  };
  interface FileFilter {
    name: string;
    extensions: string[];
  }
  const dialog: {
    showOpenDialog(
      window: BrowserWindow | undefined,
      options: { title?: string; filters?: FileFilter[]; properties?: Array<'openFile' | 'multiSelections' | 'openDirectory'> },
    ): Promise<{ canceled: boolean; filePaths: string[] }>;
    showSaveDialog(
      window: BrowserWindow | undefined,
      options: { title?: string; defaultPath?: string; filters?: FileFilter[] },
    ): Promise<{ canceled: boolean; filePath?: string }>;
    showMessageBox(
      window: BrowserWindow | undefined,
      options: { type?: string; title?: string; message: string; detail?: string; buttons?: string[]; defaultId?: number; cancelId?: number },
    ): Promise<{ response: number }>;
    showMessageBoxSync(
      window: BrowserWindow | undefined,
      options: { type?: string; title?: string; message: string; detail?: string; buttons?: string[]; defaultId?: number; cancelId?: number },
    ): number;
    showErrorBox(title: string, content: string): void;
  };
  const protocol: {
    registerSchemesAsPrivileged(
      schemes: Array<{
        scheme: string;
        privileges: { standard?: boolean; secure?: boolean; supportFetchAPI?: boolean; stream?: boolean; corsEnabled?: boolean; bypassCSP?: boolean };
      }>,
    ): void;
    handle(scheme: string, handler: (request: Request) => Response | Promise<Response>): void;
  };
  const shell: {
    openPath(path: string): Promise<string>;
    showItemInFolder(path: string): void;
  };
  const powerSaveBlocker: {
    start(type: 'prevent-app-suspension' | 'prevent-display-sleep'): number;
    stop(id: number): void;
    isStarted(id: number): boolean;
  };
  const Menu: {
    setApplicationMenu(menu: unknown): void;
  };
}
