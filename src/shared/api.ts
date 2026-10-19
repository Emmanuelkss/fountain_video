/**
 * The complete contract between the operator UI and the main process.
 * Every command is request/response; events flow main -> windows.
 * Both the Electron IPC bridge and the test harness implement exactly this.
 */
import type {
  AppSettings,
  BibleBook,
  BibleFavorite,
  BibleTranslation,
  BibleVerse,
  DisplayInfo,
  MediaItem,
  OutputStatus,
  Service,
  ServiceSummary,
  Song,
  SongSummary,
  SongbookSummary,
  Theme,
} from './types';
import type { Deck, LiveCommand, LiveState } from './live';

export interface ImportReport {
  imported: number;
  skipped: number;
  errors: string[];
  ids: string[];
  /** Songs that already existed (same songbook, number and title) and were updated. */
  updated?: number;
}

export interface BackupInfo {
  path: string;
  name: string;
  size: number;
  createdAt: string;
  automatic: boolean;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  dbPath: string;
  logDir: string;
  mediaDir: string;
  backupDir: string;
  firstRun: boolean;
  platform: string;
  /** Prefix that turns a local file path into a URL the windows can load. */
  mediaBase: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface Commands {
  'app.info': { in: void; out: AppInfo };
  'app.log': { in: { level: 'info' | 'warn' | 'error'; message: string }; out: void };
  'app.openPath': { in: { path: string }; out: void };

  'settings.get': { in: void; out: AppSettings };
  'settings.update': { in: Partial<AppSettings>; out: AppSettings };

  'songs.list': { in: { query?: string; category?: string; songbook?: string }; out: SongSummary[] };
  'songs.get': { in: { id: string }; out: Song | null };
  'songs.save': { in: Song; out: Song };
  'songs.delete': { in: { id: string }; out: { usedIn: string[] } };
  'songs.duplicate': { in: { id: string }; out: Song };
  'songs.categories': { in: void; out: string[] };
  'songs.songbooks': { in: void; out: SongbookSummary[] };
  'songs.renameSongbook': { in: { from: string; to: string }; out: { count: number } };
  'songs.deleteSongbook': { in: { name: string }; out: { count: number } };
  'songs.usage': { in: { id: string }; out: string[] };
  'songs.importFiles': { in: { paths: string[] }; out: ImportReport };
  'songs.importText': { in: { text: string; title?: string }; out: ImportReport };
  'songs.export': { in: { ids: string[] | null; path: string; format: 'json' | 'openlyrics' | 'text' | 'videopsalm'; songbookName?: string }; out: { count: number; path: string } };

  'services.list': { in: { templates?: boolean }; out: ServiceSummary[] };
  'services.get': { in: { id: string }; out: Service | null };
  'services.save': { in: Service; out: Service };
  'services.delete': { in: { id: string }; out: void };
  'services.duplicate': { in: { id: string; asTemplate?: boolean; name?: string; date?: string }; out: Service };

  'themes.list': { in: void; out: Theme[] };
  'themes.save': { in: Theme; out: Theme };
  'themes.delete': { in: { id: string }; out: void };

  'bible.translations': { in: void; out: BibleTranslation[] };
  'bible.books': { in: { translationId: string }; out: BibleBook[] };
  'bible.chapter': { in: { translationId: string; book: number; chapter: number }; out: BibleVerse[] };
  'bible.lookup': { in: { translationId: string; reference: string }; out: { reference: string; verses: BibleVerse[]; error: string | null } };
  'bible.search': { in: { translationId: string; text: string; limit?: number }; out: Array<BibleVerse & { reference: string }> };
  'bible.import': { in: { path: string; name?: string; abbreviation?: string; language?: string; license?: string }; out: BibleTranslation };
  'bible.deleteTranslation': { in: { id: string }; out: void };
  'bible.favorites': { in: void; out: BibleFavorite[] };
  'bible.saveFavorite': { in: { translationId: string; reference: string; label?: string }; out: BibleFavorite };
  'bible.deleteFavorite': { in: { id: string }; out: void };

  'media.list': { in: void; out: MediaItem[] };
  'media.import': { in: { paths: string[] }; out: ImportReport };
  'media.delete': { in: { id: string }; out: void };

  'live.load': { in: { serviceId: string | null }; out: Deck };
  'live.command': { in: LiveCommand; out: LiveState };
  'live.state': { in: void; out: { state: LiveState; deck: Deck; output: OutputStatus } };

  'output.displays': { in: void; out: DisplayInfo[] };
  'output.open': { in: void; out: OutputStatus };
  'output.close': { in: void; out: OutputStatus };
  'output.toggle': { in: void; out: OutputStatus };
  'output.identify': { in: void; out: void };

  'backup.create': { in: { path?: string }; out: BackupInfo };
  'backup.list': { in: void; out: BackupInfo[] };
  'backup.restore': { in: { path: string }; out: { restoredFrom: string; safetyCopy: string } };

  'dialog.openFiles': { in: { title: string; filters: FileFilter[]; multiple?: boolean }; out: string[] };
  'dialog.saveFile': { in: { title: string; defaultName: string; filters: FileFilter[] }; out: string | null };
}

export type CommandName = keyof Commands;
export type CommandInput<K extends CommandName> = Commands[K]['in'];
export type CommandOutput<K extends CommandName> = Commands[K]['out'];

export interface Events {
  'live:state': LiveState;
  'live:deck': Deck;
  'output:status': OutputStatus;
  'displays:changed': DisplayInfo[];
  'data:changed': { kind: 'songs' | 'services' | 'themes' | 'bible' | 'media' | 'settings' | 'all' };
  'media:error': { path: string; message: string };
  'notify': { level: 'info' | 'warn' | 'error'; message: string };
}

export type EventName = keyof Events;

/** Shape of the result envelope used on the IPC channel. */
export type Envelope<T> = { ok: true; value: T } | { ok: false; error: string; userError: boolean };

/** API exposed to the operator window (window.fountain). */
export interface OperatorApi {
  invoke<K extends CommandName>(name: K, input: CommandInput<K>): Promise<CommandOutput<K>>;
  on<E extends EventName>(event: E, listener: (payload: Events[E]) => void): () => void;
}

/** API exposed to the projector window (window.fountainOutput). */
export interface OutputApi {
  ready(): Promise<{ state: LiveState; mediaBase: string }>;
  onState(listener: (state: LiveState) => void): () => void;
  onIdentify(listener: (label: string) => void): () => void;
  reportMediaError(path: string, message: string): void;
  mediaUrl(path: string): string;
}

/** Builds the URL of a local media file from the base given by the main process. */
export function mediaUrl(base: string, path: string): string {
  return base + encodeURIComponent(path);
}

export const IPC = {
  invoke: 'fv:invoke',
  event: 'fv:event',
  outputReady: 'fv:output-ready',
  outputState: 'fv:output-state',
  outputIdentify: 'fv:output-identify',
  outputMediaError: 'fv:output-media-error',
} as const;
