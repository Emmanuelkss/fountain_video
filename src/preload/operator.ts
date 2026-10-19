/** Preload for the operator window: exposes a typed, minimal API (window.fountain). */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type CommandName, type Envelope, type EventName, type OperatorApi } from '../shared/api';

const listeners = new Map<EventName, Set<(payload: unknown) => void>>();

ipcRenderer.on(IPC.event, (_event, name: EventName, payload: unknown) => {
  listeners.get(name)?.forEach((listener) => listener(payload));
});

const api: OperatorApi = {
  async invoke(name: CommandName, input: unknown) {
    const result = (await ipcRenderer.invoke(IPC.invoke, name, input)) as Envelope<never>;
    if (result.ok) return result.value;
    const error = new Error(result.error);
    (error as Error & { userError?: boolean }).userError = result.userError;
    throw error;
  },
  on(event, listener) {
    const set = listeners.get(event) ?? new Set();
    set.add(listener as (payload: unknown) => void);
    listeners.set(event, set);
    return () => set.delete(listener as (payload: unknown) => void);
  },
};

contextBridge.exposeInMainWorld('fountain', api);
