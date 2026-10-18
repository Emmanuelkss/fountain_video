/**
 * Operator-side state: a thin cache of what the main process owns (settings,
 * themes, live state, deck, projector status) kept fresh by events.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppInfo, CommandInput, CommandName, CommandOutput, Events, OperatorApi } from '../../shared/api';
import { mediaUrl as buildMediaUrl } from '../../shared/api';
import type { AppSettings, DisplayInfo, OutputStatus, Theme } from '../../shared/types';
import type { Deck, LiveState } from '../../shared/live';
import { initialLiveState } from '../../shared/live';

declare global {
  interface Window {
    fountain: OperatorApi;
  }
}

export const api = (): OperatorApi => window.fountain;

export interface Toast {
  id: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export type ViewName = 'live' | 'songs' | 'bible' | 'media' | 'themes' | 'services' | 'settings';

interface Store {
  info: AppInfo | null;
  settings: AppSettings | null;
  themes: Theme[];
  live: LiveState;
  deck: Deck;
  output: OutputStatus;
  displays: DisplayInfo[];
  toasts: Toast[];
  view: ViewName;
  setView(view: ViewName): void;
  /** Calls the main process; failures are shown as a toast and re-thrown. */
  call<K extends CommandName>(name: K, input: CommandInput<K>): Promise<CommandOutput<K>>;
  /** Like call() but returns null instead of throwing. */
  attempt<K extends CommandName>(name: K, input: CommandInput<K>): Promise<CommandOutput<K> | null>;
  toast(level: Toast['level'], message: string): void;
  dismiss(id: number): void;
  mediaUrl(path: string): string;
  /** Item selected in the service order (may differ from the live item). */
  selectedItemId: string | null;
  setSelectedItemId(id: string | null): void;
  /** Requests focus on the song search (Ctrl+F). */
  searchRequest: number;
  requestSearch(): void;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreProvider missing');
  return store;
}

const emptyStatus: OutputStatus = { open: false, displayId: null, windowed: false, width: 0, height: 0, message: '' };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [live, setLive] = useState<LiveState>(initialLiveState());
  const [deck, setDeck] = useState<Deck>({ serviceId: null, serviceName: '', items: [] });
  const [output, setOutput] = useState<OutputStatus>(emptyStatus);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [view, setView] = useState<ViewName>('live');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchRequest, setSearchRequest] = useState(0);
  const toastId = useRef(0);
  const latestSeq = useRef(-1);

  const toast = useCallback((level: Toast['level'], message: string) => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-4), { id, level, message }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), level === 'error' ? 9000 : 4500);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const call = useCallback(
    async <K extends CommandName>(name: K, input: CommandInput<K>): Promise<CommandOutput<K>> => {
      try {
        return await api().invoke(name, input);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast('error', message);
        if (!(err as { userError?: boolean }).userError) {
          void api().invoke('app.log', { level: 'error', message: `${name}: ${message}` }).catch(() => undefined);
        }
        throw err;
      }
    },
    [toast],
  );

  const attempt = useCallback(
    async <K extends CommandName>(name: K, input: CommandInput<K>): Promise<CommandOutput<K> | null> => {
      try {
        return await call(name, input);
      } catch {
        return null;
      }
    },
    [call],
  );

  const applyLive = useCallback((state: LiveState) => {
    if (state.seq < latestSeq.current) return;
    latestSeq.current = state.seq;
    setLive(state);
  }, []);

  useEffect(() => {
    const a = api();
    void a.invoke('app.info', undefined).then(setInfo);
    void a.invoke('settings.get', undefined).then(setSettings);
    void a.invoke('themes.list', undefined).then(setThemes);
    void a.invoke('output.displays', undefined).then(setDisplays);
    void a.invoke('live.state', undefined).then((s) => {
      applyLive(s.state);
      setDeck(s.deck);
      setOutput(s.output);
    });
    const offs = [
      a.on('live:state', applyLive),
      a.on('live:deck', setDeck),
      a.on('output:status', setOutput),
      a.on('displays:changed', setDisplays),
      a.on('notify', (n: Events['notify']) => toast(n.level, n.message)),
      a.on('data:changed', ({ kind }) => {
        if (kind === 'settings' || kind === 'all') void a.invoke('settings.get', undefined).then(setSettings);
        if (kind === 'themes' || kind === 'all') void a.invoke('themes.list', undefined).then(setThemes);
      }),
    ];
    // Errors in the UI are logged in the main log file for troubleshooting.
    const onError = (e: ErrorEvent) => void a.invoke('app.log', { level: 'error', message: `${e.message} @ ${e.filename}:${e.lineno}` }).catch(() => undefined);
    const onRejection = (e: PromiseRejectionEvent) =>
      void a.invoke('app.log', { level: 'error', message: `Unhandled: ${String(e.reason)}` }).catch(() => undefined);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [applyLive, toast]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings?.operatorTheme ?? 'dark';
  }, [settings?.operatorTheme]);

  const mediaBase = info?.mediaBase ?? '';
  const mediaUrl = useCallback((p: string) => buildMediaUrl(mediaBase, p), [mediaBase]);
  const requestSearch = useCallback(() => setSearchRequest((n) => n + 1), []);

  const value = useMemo<Store>(
    () => ({
      info,
      settings,
      themes,
      live,
      deck,
      output,
      displays,
      toasts,
      view,
      setView,
      call,
      attempt,
      toast,
      dismiss,
      mediaUrl,
      selectedItemId,
      setSelectedItemId,
      searchRequest,
      requestSearch,
    }),
    [info, settings, themes, live, deck, output, displays, toasts, view, call, attempt, toast, dismiss, mediaUrl, selectedItemId, searchRequest, requestSearch],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Fetches data and refetches whenever the main process reports a change of that kind. */
export function useData<T>(kinds: Array<Events['data:changed']['kind']>, fetcher: () => Promise<T>, deps: unknown[] = []): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const reload = useCallback(() => {
    fetchRef
      .current()
      .then(setData)
      .catch(() => undefined);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, deps);
  useEffect(() => {
    const off = api().on('data:changed', ({ kind }) => {
      if (kind === 'all' || kinds.includes(kind)) reload();
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, kinds.join(',')]);
  return [data, reload];
}
