import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { parseExtensionReport } from './extensions.mjs';

export const isExtensionOrigin = value => /^chrome-extension:\/\/[a-p]{32}$/.test(value ?? '');
const hash = value => createHash('sha256').update(value).digest('hex');
export class BrowserPairings {
  pending = null;
  constructor(directory, clock = Date.now) {
    this.file = path.join(directory, 'browser-pairings.json'); this.clock = clock; this.peers = [];
    if (fs.existsSync(this.file)) {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!Array.isArray(data)) throw new Error('Invalid browser pairing storage');
      this.peers = data.filter(p => isExtensionOrigin(p.origin) && /^[a-f0-9]{64}$/.test(p.hash) && typeof p.id === 'string' && typeof p.browserId === 'string').slice(0, 32);
    }
  }
  list() { return this.peers.map(({ hash: _, ...peer }) => peer); }
  save(next) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file); this.peers = next;
  }
  issue() {
    const code = randomBytes(6).toString('hex').toUpperCase(), expiresAt = this.clock() + 180000;
    this.pending = { hash: hash(code), expiresAt, attempts: 0 };
    return { code: code.match(/.{4}/g).join('-'), expiresAt };
  }
  claim(raw, origin) {
    if (!isExtensionOrigin(origin)) throw new Error('Extension origin required');
    const report = parseExtensionReport(raw, true);
    const pending = this.pending, code = typeof raw.code === 'string' ? raw.code.replace(/[\s-]/g, '').toUpperCase() : '';
    if (!pending || this.clock() >= pending.expiresAt || ++pending.attempts > 8) { this.pending = null; throw new Error('연결 코드가 만료됐어요. 앱에서 새 코드를 만드세요.'); }
    if (!/^[A-F0-9]{12}$/.test(code) || !timingSafeEqual(Buffer.from(hash(code), 'hex'), Buffer.from(pending.hash, 'hex'))) throw new Error('연결 코드를 확인하세요.');
    const token = randomBytes(32).toString('hex');
    const peer = { id: randomUUID(), browserId: report.id, browser: report.browser, origin, hash: hash(token), createdAt: this.clock() };
    const next = this.peers.filter(p => !(p.browserId === peer.browserId && p.origin === origin));
    if (next.length >= 32) throw new Error('연결 목록이 가득 찼어요. 사용하지 않는 브라우저를 해제하세요.');
    this.save([...next, peer]); this.pending = null;
    return { token, browserId: peer.browserId };
  }
  authorize(token, origin, browserId) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !isExtensionOrigin(origin)) return null;
    const digest = Buffer.from(hash(token), 'hex');
    return this.peers.find(p => p.origin === origin && p.browserId === browserId && timingSafeEqual(Buffer.from(p.hash, 'hex'), digest)) ?? null;
  }
  revoke(id) { const peer = this.peers.find(p => p.id === id); if (peer) this.save(this.peers.filter(p => p.id !== id)); return peer; }
}
