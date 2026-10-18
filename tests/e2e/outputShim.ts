/** Replaces the projector preload (window.fountainOutput) in the test harness. */
import { mediaUrl, type OutputApi } from '../../src/shared/api';
import type { LiveState } from '../../src/shared/live';
import { createTransport } from './shimTransport';

const transport = createTransport();
let base = '';
const api: OutputApi = {
  async ready() {
    const result = (await transport.invoke('__outputReady', null)) as { state: LiveState; mediaBase: string };
    base = result.mediaBase;
    return result;
  },
  onState: (listener) => transport.on('live:state', (s) => listener(s as LiveState)),
  onIdentify: () => () => undefined,
  reportMediaError: (path, message) => void transport.invoke('__mediaError', { path, message }),
  mediaUrl: (path) => mediaUrl(base, path),
};
(window as unknown as { fountainOutput: OutputApi }).fountainOutput = api;
