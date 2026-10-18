declare module 'ws' {
  import type { Server as HttpServer, IncomingMessage } from 'node:http';
  export class WebSocket {
    static readonly OPEN: number;
    readyState: number;
    send(data: string): void;
    close(): void;
    on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[]) => void): this;
    on(event: 'close', listener: () => void): this;
  }
  export class WebSocketServer {
    constructor(options: { server: HttpServer; path?: string });
    on(event: 'connection', listener: (socket: WebSocket, request: IncomingMessage) => void): this;
    close(): void;
    clients: Set<WebSocket>;
  }
}
