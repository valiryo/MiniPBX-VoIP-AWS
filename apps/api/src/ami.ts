import { EventEmitter } from 'node:events';
import { createConnection, Socket } from 'node:net';
import { randomUUID } from 'node:crypto';

export type Frame = Record<string, string>;
export class AmiError extends Error {
  constructor(public readonly kind: 'offline' | 'timeout' | 'rejected' | 'protocol') { super(`AMI ${kind}`); }
}

// TCP pode dividir um frame ou agrupar varios; o delimitador AMI e CRLF CRLF.
export class AmiParser {
  private buffer = '';
  push(chunk: string): Frame[] {
    this.buffer += chunk;
    if (this.buffer.length > 1024 * 1024) throw new AmiError('protocol');
    const frames: Frame[] = [];
    let end: number;
    while ((end = this.buffer.indexOf('\r\n\r\n')) !== -1) {
      const frame: Frame = Object.create(null);
      for (const line of this.buffer.slice(0, end).split('\r\n')) {
        const colon = line.indexOf(':');
        if (colon > 0) frame[line.slice(0, colon)] = line.slice(colon + 1).trim();
      }
      this.buffer = this.buffer.slice(end + 4);
      if (Object.keys(frame).length) frames.push(frame);
    }
    return frames;
  }
}

type Pending = {
  resolve: (value: { response: Frame; events: Frame[] }) => void;
  reject: (error: AmiError) => void;
  timer: NodeJS.Timeout;
  complete?: string;
  response?: Frame;
  events: Frame[];
};

export interface AmiOptions {
  host: string; port: number; username: string; secret: string;
  actionTimeoutMs?: number; reconnectMs?: number; heartbeatMs?: number;
}

export class AmiClient extends EventEmitter {
  ready = false;
  lastPongAt: string | null = null;
  private socket?: Socket;
  private stopped = true;
  private reconnect?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  private connectingTimer?: NodeJS.Timeout;
  private pending = new Map<string, Pending>();
  private failures = 0;
  constructor(private readonly options: AmiOptions) { super(); }

  start(): void { if (this.stopped) { this.stopped = false; this.connect(); } }
  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnect);
    this.disconnect();
  }
  disconnect(): void { this.socket?.destroy(); }

  private connect(): void {
    if (this.stopped) return;
    const parser = new AmiParser();
    const socket = this.socket = createConnection({ host: this.options.host, port: this.options.port });
    socket.setEncoding('utf8');
    socket.setKeepAlive(true, 10000);
    this.connectingTimer = setTimeout(() => socket.destroy(), this.options.actionTimeoutMs ?? 5000);
    socket.on('error', () => {}); // Nenhum frame, segredo ou erro remoto vai para logs.
    socket.on('data', chunk => {
      try { for (const frame of parser.push(String(chunk))) this.receive(frame); }
      catch { socket.destroy(); }
    });
    socket.once('connect', async () => {
      clearTimeout(this.connectingTimer);
      try {
        await this.action('Login', { Username: this.options.username, Secret: this.options.secret, Events: 'on' });
        await this.action('Ping');
        if (this.stopped || socket.destroyed) return;
        this.lastPongAt = new Date().toISOString();
        this.ready = true;
        this.failures = 0;
        this.emit('ready');
        this.heartbeat = setInterval(() => {
          void this.action('Ping').then(() => { this.lastPongAt = new Date().toISOString(); })
            .catch(() => socket.destroy());
        }, this.options.heartbeatMs ?? 10000);
      } catch { socket.destroy(); }
    });
    socket.once('close', () => {
      clearTimeout(this.connectingTimer);
      clearInterval(this.heartbeat);
      this.ready = false;
      this.lastPongAt = null;
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new AmiError('offline')); }
      this.pending.clear();
      this.emit('disconnected');
      if (!this.stopped) {
        const delay = Math.min(10000, (this.options.reconnectMs ?? 500) * 2 ** Math.min(this.failures++, 5));
        this.reconnect = setTimeout(() => this.connect(), delay);
      }
    });
  }

  action(Action: string, fields: Frame = {}, complete?: string, id: string = randomUUID()): Promise<{ response: Frame; events: Frame[] }> {
    if (!['Login', 'Ping', 'PJSIPShowEndpoints', 'CoreShowChannels', 'Originate'].includes(Action)) {
      return Promise.reject(new AmiError('rejected'));
    }
    if (!this.socket || this.socket.destroyed || (!this.ready && !['Login', 'Ping'].includes(Action))) {
      return Promise.reject(new AmiError('offline'));
    }
    const headers = { ...fields, Action, ActionID: id };
    if (Object.entries(headers).some(([k, v]) => /[\r\n]/.test(k + v))) return Promise.reject(new AmiError('protocol'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new AmiError('timeout')); }, this.options.actionTimeoutMs ?? 5000);
      this.pending.set(id, { resolve, reject, timer, complete, events: [] });
      this.socket!.write(Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    });
  }

  private receive(frame: Frame): void {
    const p = this.pending.get(frame.ActionID);
    if (p) {
      if (frame.Event) {
        p.events.push(frame);
        if (p.events.length > 512) { this.disconnect(); return; }
      }
      const reply = frame.Response && !frame.Event;
      if (reply) p.response = frame;
      if ((reply && frame.Response === 'Error') || (!p.complete && reply) || frame.Event === p.complete) {
        clearTimeout(p.timer);
        this.pending.delete(frame.ActionID);
        if (reply && frame.Response === 'Error') p.reject(new AmiError('rejected'));
        else p.resolve({ response: p.response ?? frame, events: p.events });
      }
    }
    if (frame.Event) this.emit('event', frame);
  }
}
