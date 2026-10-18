/** Replaces the Electron preload (window.fountain) in the test harness. */
import type { OperatorApi } from '../../src/shared/api';
import { createTransport } from './shimTransport';

const transport = createTransport();
const api = {
  invoke: (name: string, input: unknown) => transport.invoke(name, input),
  on: (event: string, listener: (payload: unknown) => void) => transport.on(event, listener),
} as unknown as OperatorApi;
(window as unknown as { fountain: OperatorApi }).fountain = api;
