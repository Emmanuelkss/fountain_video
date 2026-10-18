/** WebSocket transport used by the browser shims (test harness only). */
type Listener = (payload: unknown) => void;

export function createTransport() {
  const socket = new WebSocket(`ws://${location.host}/ws`);
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const listeners = new Map<string, Set<Listener>>();
  const queue: string[] = [];
  let nextId = 1;
  socket.addEventListener('open', () => {
    for (const msg of queue.splice(0)) socket.send(msg);
  });
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.type === 'event') {
      listeners.get(msg.name)?.forEach((l) => l(msg.payload));
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.value === null ? undefined : msg.value);
    else {
      const error = new Error(msg.error) as Error & { userError?: boolean };
      error.userError = msg.userError;
      p.reject(error);
    }
  });
  return {
    invoke(name: string, input: unknown): Promise<unknown> {
      const id = nextId++;
      const payload = JSON.stringify({ id, name, input: input ?? null });
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        if (socket.readyState === WebSocket.OPEN) socket.send(payload);
        else queue.push(payload);
      });
    },
    on(name: string, listener: Listener) {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
      return () => set.delete(listener);
    },
  };
}
