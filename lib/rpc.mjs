import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

export function encodeFrame(op, payload) {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
  const header = Buffer.alloc(8);
  header.writeUInt32LE(op, 0); header.writeUInt32LE(bytes.length, 4);
  return Buffer.concat([header, bytes]);
}
export class FrameReader {
  buffer = Buffer.alloc(0);
  push(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    const frames = [];
    while (this.buffer.length >= 8) {
      const length = this.buffer.readUInt32LE(4);
      if (length > 1024 * 1024) throw new Error('Oversized Discord frame');
      if (this.buffer.length < length + 8) break;
      frames.push({ op: this.buffer.readUInt32LE(0), bytes: this.buffer.subarray(8, 8 + length) });
      this.buffer = this.buffer.subarray(8 + length);
    }
    return frames;
  }
}
export class DiscordRPC extends EventEmitter {
  socket = null;
  ready = false;
  pending = new Map();
  generation = 0;
  async connect(clientId) {
    this.close();
    const generation = this.generation;
    let lastError;
    for (let index = 0; index < 10; index++) {
      if (generation !== this.generation) throw new Error('Connection cancelled');
      try { await this.openPipe(`\\\\?\\pipe\\discord-ipc-${index}`, clientId, generation); return; }
      catch (error) { lastError = error; if (error.applicationError) break; }
    }
    throw lastError ?? new Error('Discord desktop is not running');
  }
  openPipe(path, clientId, generation) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(path);
      this.socket = socket;
      const reader = new FrameReader();
      let settled = false;
      const timer = setTimeout(() => fail(new Error('Discord connection timed out')), 2200);
      const fail = error => {
        if (!settled) { settled = true; clearTimeout(timer); reject(error); }
        socket.destroy();
      };
      socket.on('connect', () => {
        if (generation !== this.generation) return fail(new Error('Connection cancelled'));
        socket.write(encodeFrame(0, { v: 1, client_id: clientId }));
      });
      socket.on('data', data => {
        try {
          for (const { op, bytes } of reader.push(data)) {
            if (op === 3) { socket.write(encodeFrame(4, bytes)); continue; }
            if (op === 4) continue;
            const message = JSON.parse(bytes.toString('utf8'));
            if (op === 2) {
              const error = new Error(message.message || 'Discord closed connection');
              error.applicationError = true; fail(error); continue;
            }
            if (message.evt === 'READY') {
              if (generation !== this.generation) return fail(new Error('Connection cancelled'));
              clearTimeout(timer); settled = true; this.ready = true; this.emit('ready'); resolve();
            }
            const waiter = this.pending.get(message.nonce);
            if (waiter) {
              this.pending.delete(message.nonce); clearTimeout(waiter.timer);
              if (message.evt === 'ERROR') waiter.reject(new Error(message.data?.message || 'Discord rejected activity'));
              else waiter.resolve(message.data);
            } else if (message.evt === 'ERROR' && !settled) {
              const error = new Error(message.data?.message || 'Discord rejected application');
              error.applicationError = true; fail(error);
            }
          }
        } catch (error) { fail(error); }
      });
      socket.on('error', fail);
      socket.on('close', () => {
        if (!settled) fail(new Error('Discord connection closed'));
        if (this.socket === socket) {
          this.socket = null; this.ready = false;
          for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('Discord disconnected')); }
          this.pending.clear(); this.emit('disconnected');
        }
      });
    });
  }
  setActivity(activity) {
    if (!this.ready || !this.socket) return Promise.reject(new Error('Discord is not connected'));
    const nonce = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(nonce); reject(new Error('Discord response timed out')); }, 8000);
      this.pending.set(nonce, { resolve, reject, timer });
      this.socket.write(encodeFrame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce }));
    });
  }
  close() {
    this.generation++;
    this.ready = false;
    for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('Discord connection reset')); }
    this.pending.clear();
    this.socket?.destroy(); this.socket = null;
  }
}
