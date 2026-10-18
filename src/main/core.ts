/**
 * AppCore: all application logic of the main process, independent of Electron.
 * The Electron shell (main.ts) and the automated test harness both drive it
 * through `invoke()` and listen to its events, so what is tested is exactly
 * what ships.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type {
  AppInfo,
  CommandInput,
  CommandName,
  CommandOutput,
  EventName,
  Events,
  FileFilter,
  ImportReport,
} from '../shared/api';
import type { DisplayInfo, OutputStatus, Service, ServiceItem, Song, Theme } from '../shared/types';
import { Database } from './db/database';
import { LATEST_SCHEMA_VERSION } from './db/migrations';
import { SongsRepo } from './db/songsRepo';
import { ServicesRepo } from './db/servicesRepo';
import { BibleRepo } from './db/bibleRepo';
import { MediaRepo, SettingsRepo, ThemesRepo } from './db/miscRepos';
import { BackupManager, validateBackupFile } from './backup';
import { MediaLibrary } from './mediaLibrary';
import { log } from './logger';
import { seedFirstRun } from './seed';
import { parseSongFile, exportSongJson, exportOpenLyrics, exportPlainText, safeFileName, parsePlainText } from './importers/songFormats';
import { parseBibleFile } from './importers/bibleFormats';
import { buildItemSlides, type SlideContext } from '../shared/slides';
import {
  applyLiveCommand,
  initialLiveState,
  rebaseLiveState,
  type Deck,
  type DeckItem,
  type LiveCommand,
  type LiveState,
} from '../shared/live';
import { fallbackTheme } from '../shared/themes';
import { errorMessage, newId, nowIso, UserError } from '../shared/util';

/** Everything that needs the real desktop (windows, screens, file dialogs). */
export interface Platform {
  appVersion: string;
  mediaBase: string;
  listDisplays(): DisplayInfo[];
  outputStatus(): OutputStatus;
  openOutput(): OutputStatus;
  closeOutput(): OutputStatus;
  identifyDisplays(): void;
  openFiles(options: { title: string; filters: FileFilter[]; multiple?: boolean }): Promise<string[]>;
  saveFile(options: { title: string; defaultName: string; filters: FileFilter[] }): Promise<string | null>;
  openPath(target: string): void;
}

export interface AppCoreRepos {
  songs: SongsRepo;
  services: ServicesRepo;
  bible: BibleRepo;
  themes: ThemesRepo;
  settings: SettingsRepo;
  media: MediaRepo;
}

type Handlers = { [K in CommandName]: (input: CommandInput<K>) => CommandOutput<K> | Promise<CommandOutput<K>> };

export class AppCore {
  readonly dataDir: string;
  readonly dbPath: string;
  private db!: Database;
  repos!: AppCoreRepos;
  private backups: BackupManager;
  private media!: MediaLibrary;
  private emitter = new EventEmitter();
  private firstRun = false;
  private deck: Deck = { serviceId: null, serviceName: '', items: [] };
  private live: LiveState = initialLiveState();

  constructor(
    dataDir: string,
    private platform: Platform,
  ) {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, 'fountainvideo.db');
    fs.mkdirSync(dataDir, { recursive: true });
    log.init(path.join(dataDir, 'logs'));
    this.backups = new BackupManager(path.join(dataDir, 'backups'));
    this.emitter.setMaxListeners(50);
  }

  // ------------------------------------------------------------- lifecycle

  start(): void {
    log.info(`FountainVideo ${this.platform.appVersion} starting, data in ${this.dataDir}`);
    const existed = fs.existsSync(this.dbPath);
    this.openDatabase(existed);
    this.firstRun = seedFirstRun(this.repos);
    if (this.firstRun) log.info('First launch: starter songs, Bible samples and a service template were added');

    const lastVersion = this.repos.settings.getRaw<string | null>('lastAppVersion', null);
    if (existed && lastVersion && lastVersion !== this.platform.appVersion) {
      this.safeBackup(`before-v${this.platform.appVersion}`);
    }
    this.repos.settings.setRaw('lastAppVersion', this.platform.appVersion);
    if (!this.backups.hasAutomaticBackupToday()) this.safeBackup(`daily-${new Date().toISOString().slice(0, 10)}`);
    this.backups.prune(this.repos.settings.get().autoBackupKeep);

    const settings = this.repos.settings.get();
    const lastService = settings.lastServiceId ? this.repos.services.get(settings.lastServiceId) : null;
    this.loadDeck(lastService ? lastService.id : null);
  }

  private openDatabase(existed: boolean): void {
    let db: Database | null = null;
    try {
      db = new Database(this.dbPath);
      if (existed && !db.integrityOk()) throw new Error('integrity check failed');
    } catch (err) {
      log.error('Database could not be opened', err);
      db?.close();
      db = this.recoverDatabase();
    }
    if (existed && db.schemaVersion < LATEST_SCHEMA_VERSION && db.schemaVersion > 0) {
      try {
        db.backupTo(this.backups.automaticPath(`before-migration-v${LATEST_SCHEMA_VERSION}`));
      } catch (err) {
        log.warn('Pre-migration backup failed', err);
      }
    }
    const migration = db.migrate();
    if (migration.from !== migration.to) log.info(`Database migrated from v${migration.from} to v${migration.to}`);
    this.db = db;
    this.repos = {
      songs: new SongsRepo(db),
      services: new ServicesRepo(db),
      bible: new BibleRepo(db),
      themes: new ThemesRepo(db),
      settings: new SettingsRepo(db),
      media: new MediaRepo(db),
    };
    this.media = new MediaLibrary(this.repos.media, path.join(this.dataDir, 'media'));
  }

  /** A damaged database is moved aside and the newest backup restored (or a fresh one created). */
  private recoverDatabase(): Database {
    const aside = `${this.dbPath}.damaged-${Date.now()}`;
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(this.dbPath + suffix)) fs.renameSync(this.dbPath + suffix, aside + suffix);
    }
    for (const backup of this.backups.list()) {
      try {
        validateBackupFile(backup.path);
        fs.copyFileSync(backup.path, this.dbPath);
        log.warn(`Recovered database from backup ${backup.name}; damaged file kept as ${aside}`);
        this.queueNotice('warn', `Your data file was damaged. FountainVideo restored the backup from ${backup.createdAt.slice(0, 16).replace('T', ' ')}.`);
        return new Database(this.dbPath);
      } catch (err) {
        log.warn(`Backup ${backup.name} unusable`, err);
      }
    }
    this.queueNotice('error', 'Your data file was damaged and no backup was found. A new empty library was created.');
    return new Database(this.dbPath);
  }

  private pendingNotices: Array<Events['notify']> = [];
  private queueNotice(level: Events['notify']['level'], message: string): void {
    this.pendingNotices.push({ level, message });
  }

  /** Notices raised before the UI was ready (shown once the operator window loads). */
  takePendingNotices(): Array<Events['notify']> {
    const notices = this.pendingNotices;
    this.pendingNotices = [];
    return notices;
  }

  private safeBackup(reason: string): void {
    try {
      this.db.backupTo(this.backups.automaticPath(reason));
      log.info(`Automatic backup created (${reason})`);
    } catch (err) {
      log.error(`Automatic backup failed (${reason})`, err);
    }
  }

  shutdown(): void {
    try {
      this.db.close();
      log.info('Database closed cleanly');
    } catch (err) {
      log.error('Error while closing the database', err);
    }
  }

  // ------------------------------------------------------------- events

  on<E extends EventName>(event: E, listener: (payload: Events[E]) => void): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  onAny(listener: (event: EventName, payload: unknown) => void): () => void {
    this.emitter.on('*', listener);
    return () => this.emitter.off('*', listener);
  }

  emit<E extends EventName>(event: E, payload: Events[E]): void {
    this.emitter.emit(event, payload);
    this.emitter.emit('*', event, payload);
  }

  // ------------------------------------------------------------- commands

  async invoke<K extends CommandName>(name: K, input: CommandInput<K>): Promise<CommandOutput<K>> {
    const handler = this.handlers[name] as ((input: CommandInput<K>) => CommandOutput<K> | Promise<CommandOutput<K>>) | undefined;
    if (!handler) throw new Error(`Unknown command ${name}`);
    try {
      return await handler(input);
    } catch (err) {
      if (!(err instanceof UserError)) log.error(`Command ${name} failed`, err);
      throw err;
    }
  }

  get liveState(): LiveState {
    return this.live;
  }

  get liveDeck(): Deck {
    return this.deck;
  }

  private changed(kind: Events['data:changed']['kind']): void {
    this.emit('data:changed', { kind });
    this.rebuildDeck();
  }

  private handlers: Handlers = {
    'app.info': (): AppInfo => ({
      version: this.platform.appVersion,
      dataDir: this.dataDir,
      dbPath: this.dbPath,
      logDir: path.join(this.dataDir, 'logs'),
      mediaDir: this.media.directory,
      backupDir: this.backups.directory,
      firstRun: this.firstRun,
      platform: process.platform,
      mediaBase: this.platform.mediaBase,
    }),
    'app.log': ({ level, message }) => {
      log[level](`[ui] ${message}`);
    },
    'app.openPath': ({ path: target }) => this.platform.openPath(target),

    'settings.get': () => this.repos.settings.get(),
    'settings.update': (patch) => {
      const next = this.repos.settings.update(patch);
      this.changed('settings');
      return next;
    },

    // songs
    'songs.list': ({ query, category }) => this.repos.songs.list(query ?? '', category ?? ''),
    'songs.get': ({ id }) => this.repos.songs.get(id),
    'songs.save': (song) => {
      const saved = this.repos.songs.save(song);
      this.changed('songs');
      return saved;
    },
    'songs.delete': ({ id }) => {
      const usedIn = this.repos.services.usingSong(id);
      this.repos.songs.delete(id);
      log.info(`Song ${id} deleted`);
      this.changed('songs');
      return { usedIn };
    },
    'songs.duplicate': ({ id }) => {
      const source = this.repos.songs.get(id);
      if (!source) throw new UserError('Song not found');
      const copy: Song = {
        ...structuredClone(source),
        id: newId(),
        title: `${source.title} (copy)`,
        sections: source.sections.map((s) => ({ ...s, id: newId() })),
        arrangements: source.arrangements.map((a) => ({ ...a })),
        createdAt: '',
      };
      const saved = this.repos.songs.save(copy);
      this.changed('songs');
      return saved;
    },
    'songs.categories': () => this.repos.songs.categories(),
    'songs.usage': ({ id }) => this.repos.services.usingSong(id),
    'songs.importFiles': async ({ paths }) => {
      const report: ImportReport = { imported: 0, skipped: 0, errors: [], ids: [] };
      for (const file of paths) {
        try {
          const content = await fs.promises.readFile(file, 'utf8');
          for (const draft of parseSongFile(file, content)) this.importSong(draft, report);
        } catch (err) {
          report.skipped += 1;
          report.errors.push(`${path.basename(file)}: ${errorMessage(err)}`);
        }
      }
      log.info(`Song import: ${report.imported} imported, ${report.skipped} skipped`);
      this.changed('songs');
      return report;
    },
    'songs.importText': ({ text, title }) => {
      const report: ImportReport = { imported: 0, skipped: 0, errors: [], ids: [] };
      this.importSong(parsePlainText(text, title ?? 'Untitled song'), report);
      this.changed('songs');
      return report;
    },
    'songs.export': async ({ ids, path: target, format }) => {
      const songs = ids ? ids.map((id) => this.repos.songs.get(id)).filter((s): s is Song => Boolean(s)) : this.repos.songs.all();
      if (songs.length === 0) throw new UserError('There are no songs to export.');
      if (format === 'json') {
        await fs.promises.writeFile(target, exportSongJson(songs), 'utf8');
      } else {
        await fs.promises.mkdir(target, { recursive: true });
        const used = new Set<string>();
        for (const song of songs) {
          let name = safeFileName(song.title);
          while (used.has(name.toLowerCase())) name += '_';
          used.add(name.toLowerCase());
          const content = format === 'openlyrics' ? exportOpenLyrics(song) : exportPlainText(song);
          await fs.promises.writeFile(path.join(target, `${name}.${format === 'openlyrics' ? 'xml' : 'txt'}`), content, 'utf8');
        }
      }
      log.info(`Exported ${songs.length} songs as ${format} to ${target}`);
      return { count: songs.length, path: target };
    },

    // services
    'services.list': ({ templates }) => this.repos.services.list(Boolean(templates)),
    'services.get': ({ id }) => this.repos.services.get(id),
    'services.save': (service) => {
      const saved = this.repos.services.save(service);
      this.changed('services');
      return saved;
    },
    'services.delete': ({ id }) => {
      this.repos.services.delete(id);
      if (this.deck.serviceId === id) this.loadDeck(null);
      if (this.repos.settings.get().lastServiceId === id) this.repos.settings.update({ lastServiceId: null });
      log.info(`Service ${id} deleted`);
      this.changed('services');
    },
    'services.duplicate': ({ id, asTemplate, name, date }) => {
      const copy = this.repos.services.duplicate(id, { asTemplate, name, date });
      this.changed('services');
      return copy;
    },

    // themes
    'themes.list': () => this.repos.themes.list(),
    'themes.save': (theme) => {
      const saved = this.repos.themes.save(theme);
      this.changed('themes');
      return saved;
    },
    'themes.delete': ({ id }) => {
      this.repos.themes.delete(id);
      this.changed('themes');
    },

    // bible
    'bible.translations': () => this.repos.bible.translations(),
    'bible.books': ({ translationId }) => this.repos.bible.books(translationId),
    'bible.chapter': ({ translationId, book, chapter }) => this.repos.bible.chapter(translationId, book, chapter),
    'bible.lookup': ({ translationId, reference }) => this.repos.bible.lookup(translationId, reference),
    'bible.search': ({ translationId, text, limit }) => this.repos.bible.search(translationId, text, limit ?? 100),
    'bible.import': async ({ path: file, name, abbreviation, language, license }) => {
      const content = await fs.promises.readFile(file, 'utf8');
      let parsed;
      try {
        parsed = parseBibleFile(file, content);
      } catch (err) {
        throw new UserError(`${path.basename(file)}: ${errorMessage(err)}`);
      }
      const fallbackName = path.basename(file).replace(/\.[^.]+$/, '');
      const translation = this.repos.bible.addTranslation(
        {
          name: (name || parsed.title || fallbackName).trim(),
          abbreviation: (abbreviation || parsed.abbreviation || fallbackName.slice(0, 6)).trim().toUpperCase(),
          language: (language || parsed.language || '').trim(),
          license: (license || '').trim(),
        },
        parsed,
      );
      log.info(`Bible imported: ${translation.name} (${translation.verseCount} verses)`);
      if (!this.repos.settings.get().defaultTranslationId) this.repos.settings.update({ defaultTranslationId: translation.id });
      this.changed('bible');
      return translation;
    },
    'bible.deleteTranslation': ({ id }) => {
      this.repos.bible.deleteTranslation(id);
      if (this.repos.settings.get().defaultTranslationId === id) {
        this.repos.settings.update({ defaultTranslationId: this.repos.bible.translations()[0]?.id ?? null });
      }
      this.changed('bible');
    },
    'bible.favorites': () => this.repos.bible.favorites(),
    'bible.saveFavorite': ({ translationId, reference, label }) => {
      const result = this.repos.bible.lookup(translationId, reference);
      if (result.error) throw new UserError(result.error);
      const fav = this.repos.bible.saveFavorite(translationId, result.reference, label ?? '');
      this.emit('data:changed', { kind: 'bible' });
      return fav;
    },
    'bible.deleteFavorite': ({ id }) => {
      this.repos.bible.deleteFavorite(id);
      this.emit('data:changed', { kind: 'bible' });
    },

    // media
    'media.list': () => this.media.list(),
    'media.import': async ({ paths }) => {
      const report = await this.media.import(paths);
      log.info(`Media import: ${report.imported} imported, ${report.skipped} skipped`, report.errors);
      this.changed('media');
      return report;
    },
    'media.delete': ({ id }) => {
      this.media.delete(id);
      this.changed('media');
    },

    // live
    'live.load': ({ serviceId }) => {
      this.loadDeck(serviceId);
      if (serviceId) this.repos.settings.update({ lastServiceId: serviceId });
      return this.deck;
    },
    'live.command': (command) => this.command(command),
    'live.state': () => ({ state: this.live, deck: this.deck, output: this.platform.outputStatus() }),

    // output
    'output.displays': () => this.platform.listDisplays(),
    'output.open': () => this.platform.openOutput(),
    'output.close': () => this.platform.closeOutput(),
    'output.toggle': () => (this.platform.outputStatus().open ? this.platform.closeOutput() : this.platform.openOutput()),
    'output.identify': () => this.platform.identifyDisplays(),

    // backup
    'backup.create': ({ path: target }) => {
      const file = target || this.backups.manualPath();
      this.db.backupTo(file);
      log.info(`Manual backup written to ${file}`);
      return this.backups.info(file);
    },
    'backup.list': () => this.backups.list(),
    'backup.restore': ({ path: file }) => this.restore(file),

    // dialogs
    'dialog.openFiles': (options) => this.platform.openFiles(options),
    'dialog.saveFile': (options) => this.platform.saveFile(options),
  };

  private importSong(draft: Song, report: ImportReport): void {
    try {
      const duplicate = this.repos.songs.findByTitle(draft.title);
      const song = { ...draft, id: newId() };
      if (duplicate) song.title = `${draft.title} (imported)`;
      const saved = this.repos.songs.save(song);
      report.imported += 1;
      report.ids.push(saved.id);
    } catch (err) {
      report.skipped += 1;
      report.errors.push(`${draft.title || 'Untitled'}: ${errorMessage(err)}`);
    }
  }

  private restore(file: string): { restoredFrom: string; safetyCopy: string } {
    validateBackupFile(file);
    if (path.resolve(file) === path.resolve(this.dbPath)) throw new UserError('Choose a backup file, not the live database.');
    const safetyCopy = this.backups.automaticPath('before-restore');
    this.db.backupTo(safetyCopy);
    this.db.close();
    try {
      for (const suffix of ['-wal', '-shm']) if (fs.existsSync(this.dbPath + suffix)) fs.unlinkSync(this.dbPath + suffix);
      fs.copyFileSync(file, this.dbPath);
      this.openDatabase(true);
    } catch (err) {
      log.error('Restore failed, rolling back to safety copy', err);
      fs.copyFileSync(safetyCopy, this.dbPath);
      this.openDatabase(true);
      throw new UserError(`Restore failed: ${errorMessage(err)}. Your previous data was kept.`);
    }
    this.repos.bible.clearCache();
    log.info(`Database restored from ${file} (safety copy ${safetyCopy})`);
    const settings = this.repos.settings.get();
    this.loadDeck(settings.lastServiceId && this.repos.services.get(settings.lastServiceId) ? settings.lastServiceId : null);
    this.emit('data:changed', { kind: 'all' });
    return { restoredFrom: file, safetyCopy };
  }

  // ------------------------------------------------------------- live engine

  private slideContext(): SlideContext {
    const settings = this.repos.settings.get();
    const themeCache = new Map<string, Theme | null>();
    const getTheme = (id: string | null | undefined): Theme | null => {
      if (!id) return null;
      if (!themeCache.has(id)) themeCache.set(id, this.repos.themes.get(id));
      return themeCache.get(id) ?? null;
    };
    return {
      getSong: (id) => this.repos.songs.get(id),
      getPassage: (item) => {
        const translationId = item.translationId || settings.defaultTranslationId || '';
        const translation = this.repos.bible.translation(translationId);
        if (!translation) return { error: 'The Bible translation for this passage is not installed.' };
        const result = this.repos.bible.lookup(translationId, item.reference);
        if (result.error) return { error: result.error };
        return {
          verses: result.verses,
          translation: translation.abbreviation,
          bookName: (book: number) => this.repos.bible.bookName(translationId, book),
        };
      },
      theme: (id, kind) =>
        getTheme(id) ??
        getTheme(kind === 'bible' ? settings.bibleThemeId : settings.defaultThemeId) ??
        getTheme(settings.defaultThemeId) ??
        fallbackTheme(),
      mediaExists: (p) => {
        try {
          return fs.existsSync(p);
        } catch {
          return false;
        }
      },
      maxLinesPerSlide: settings.maxLinesPerSlide,
    };
  }

  buildDeck(service: Service | null): Deck {
    if (!service) return { serviceId: null, serviceName: '', items: [] };
    const ctx = this.slideContext();
    const items: DeckItem[] = service.items.map((item: ServiceItem) => {
      try {
        const { slides, error } = buildItemSlides(item, ctx);
        return { itemId: item.id, type: item.type, title: item.title, slides, error };
      } catch (err) {
        log.error(`Could not build slides for item ${item.title}`, err);
        return { itemId: item.id, type: item.type, title: item.title, slides: [], error: errorMessage(err) };
      }
    });
    return { serviceId: service.id, serviceName: service.name, items };
  }

  private loadDeck(serviceId: string | null): void {
    const service = serviceId ? this.repos.services.get(serviceId) : null;
    this.deck = this.buildDeck(service);
    this.live = rebaseLiveState(this.live, this.deck);
    this.emit('live:deck', this.deck);
    this.emit('live:state', this.live);
  }

  private rebuildDeck(): void {
    if (!this.deck.serviceId) return;
    this.loadDeck(this.deck.serviceId);
  }

  command(command: LiveCommand): LiveState {
    const next = applyLiveCommand(this.live, this.deck, command, {
      advanceAcrossItems: this.repos.settings.get().advanceAcrossItems,
    });
    if (next !== this.live) {
      this.live = next;
      this.emit('live:state', next);
    }
    return this.live;
  }

  /** Called by the projector window when a video cannot be played. */
  reportMediaError(file: string, message: string): void {
    log.warn(`Media playback error for ${file}: ${message}`);
    this.emit('media:error', { path: file, message });
    this.emit('notify', { level: 'error', message: `${path.basename(file)} cannot be played: ${message}` });
  }

  notify(level: Events['notify']['level'], message: string): void {
    this.emit('notify', { level, message });
  }

  get timestamp(): string {
    return nowIso();
  }
}
