/**
 * Test harness: runs the real AppCore (real SQLite, real live engine) in Node
 * and serves the real operator and projector pages to a browser. IPC is
 * replaced by a WebSocket with the same contract, and the desktop-only bits
 * (screens, file dialogs) are simulated so tests can drive them.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { AppCore, type Platform } from '../../src/main/core';
import { serveMediaFile, mediaPathFromUrlPath } from '../../src/main/fileResponse';
import type { DisplayInfo, OutputStatus } from '../../src/shared/types';
import { UserError, errorMessage } from '../../src/shared/util';

const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'dist');

export interface Harness {
  url: string;
  core: AppCore;
  queueOpenFiles(paths: string[]): void;
  queueSaveFile(target: string): void;
  output(): OutputStatus;
  close(): Promise<void>;
}

const DISPLAYS: DisplayInfo[] = [
  { id: 1, label: 'Display 1 (main) — 1920×1080', primary: true, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  { id: 2, label: 'Display 2 — 1280×720 · Projector', primary: false, scaleFactor: 1, bounds: { x: 1920, y: 0, width: 1280, height: 720 } },
];

export async function startHarness(dataDir: string, port = 0): Promise<Harness> {
  const openQueue: string[][] = [];
  const saveQueue: string[] = [];
  let outputOpen = false;
  let core!: AppCore;
  let base = '';
  const status = (): OutputStatus => ({
    open: outputOpen,
    displayId: outputOpen ? 2 : null,
    windowed: false,
    width: outputOpen ? 1280 : 0,
    height: outputOpen ? 720 : 0,
    message: '',
  });
  const platform: Platform = {
    appVersion: '1.0.0-test',
    get mediaBase() {
      return `${base}/media/`;
    },
    listDisplays: () => DISPLAYS,
    outputStatus: status,
    openOutput: () => {
      outputOpen = true;
      core.emit('output:status', status());
      return status();
    },
    closeOutput: () => {
      outputOpen = false;
      core.emit('output:status', status());
      return status();
    },
    identifyDisplays: () => undefined,
    openFiles: async () => openQueue.shift() ?? [],
    saveFile: async () => saveQueue.shift() ?? null,
    openPath: () => undefined,
  };
  core = new AppCore(dataDir, platform);
  core.start();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/media/')) {
      const result = serveMediaFile(mediaPathFromUrlPath(url.pathname.slice('/media'.length)), req.headers.range);
      res.writeHead(result.status, result.headers);
      if (result.stream) result.stream.pipe(res);
      else res.end(result.error);
      return;
    }
    const file = url.pathname.startsWith('/harness/')
      ? path.join(DIST, 'harness', path.basename(url.pathname))
      : path.join(DIST, 'renderer', path.basename(url.pathname === '/' ? 'operator.html' : url.pathname));
    if (!fs.existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    let body: Buffer | string = fs.readFileSync(file);
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript';
    if (file.endsWith('.html')) {
      const shim = file.endsWith('output.html') ? 'output-shim.js' : 'operator-shim.js';
      body = body.toString('utf8').replace('<!--harness-->', `<script src="/harness/${shim}"></script>`);
    }
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }).end(body);
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket: WebSocket) => {
    const off = core.onAny((event, payload) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'event', name: event, payload }));
    });
    socket.on('close', off);
    socket.on('message', async (data) => {
      const msg = JSON.parse(String(data)) as { id: number; name: string; input: unknown };
      try {
        let value: unknown;
        if (msg.name === '__outputReady') value = { state: core.liveState, mediaBase: platform.mediaBase };
        else if (msg.name === '__mediaError') {
          const { path: file, message } = msg.input as { path: string; message: string };
          core.reportMediaError(file, message);
        } else value = await core.invoke(msg.name as never, msg.input as never);
        socket.send(JSON.stringify({ id: msg.id, ok: true, value: value ?? null }));
      } catch (err) {
        socket.send(JSON.stringify({ id: msg.id, ok: false, error: errorMessage(err), userError: err instanceof UserError }));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}`;
  return {
    url: base,
    core,
    queueOpenFiles: (paths) => openQueue.push(paths),
    queueSaveFile: (target) => saveQueue.push(target),
    output: status,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.close();
        wss.close();
        server.close(() => {
          core.shutdown();
          resolve();
        });
      }),
  };
}
