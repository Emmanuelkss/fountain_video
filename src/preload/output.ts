/** Preload for the projector window: receive-only, plus media error reporting. */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, mediaUrl, type OutputApi } from '../shared/api';
import type { LiveState } from '../shared/live';

let base = '';

const api: OutputApi = {
  async ready() {
    const result = (await ipcRenderer.invoke(IPC.outputReady)) as { state: LiveState; mediaBase: string };
    base = result.mediaBase;
    return result;
  },
  onState(listener) {
    const handler = (_event: unknown, state: LiveState) => listener(state);
    ipcRenderer.on(IPC.outputState, handler);
    return () => ipcRenderer.removeListener(IPC.outputState, handler);
  },
  onIdentify(listener) {
    const handler = (_event: unknown, label: string) => listener(label);
    ipcRenderer.on(IPC.outputIdentify, handler);
    return () => ipcRenderer.removeListener(IPC.outputIdentify, handler);
  },
  reportMediaError(path, message) {
    ipcRenderer.send(IPC.outputMediaError, path, message);
  },
  mediaUrl(path) {
    return mediaUrl(base, path);
  },
};

contextBridge.exposeInMainWorld('fountainOutput', api);
