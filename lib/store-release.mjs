export const STORE_CHANNEL = 'https://raw.githubusercontent.com/LUNA12379/presence-studio-releases/main/extension-channel.json';
export function validateStoreRelease(raw) {
  if (raw?.schema !== 1 || raw.published !== true) return { state: 'pending', published: false };
  if (!/^[a-p]{32}$/.test(raw.extensionId ?? '') || !/^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(raw.version ?? '')) throw new Error('Invalid store release');
  const parts = raw.version.split('.').map(Number);
  if (parts.some(n => n > 65535) || parts.every(n => n === 0)) throw new Error('Invalid store version');
  return { state: 'published', published: true, extensionId: raw.extensionId, version: raw.version, url: `https://chromewebstore.google.com/detail/${raw.extensionId}` };
}
export class StoreRelease {
  value = { state: 'pending', published: false }; checkedAt = null; pending = null;
  constructor(fetcher = fetch, clock = Date.now) { this.fetcher = fetcher; this.clock = clock; }
  status() { return { ...this.value }; }
  async check() {
    if (this.pending) return this.pending;
    if (this.checkedAt !== null && this.clock() - this.checkedAt < 300000) return this.status();
    this.pending = (async () => {
      try {
        const response = await this.fetcher(STORE_CHANNEL, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(5000), redirect: 'error' });
        if (!response.ok) throw new Error('Store channel unavailable');
        const reader = response.body.getReader(); let size = 0; const chunks = [];
        try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 4096) throw new Error('Store channel too large'); chunks.push(value); } }
        finally { await reader.cancel().catch(() => {}); }
        this.value = validateStoreRelease(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch { this.value = { state: 'unavailable', published: false }; }
      this.checkedAt = this.clock(); return this.status();
    })().finally(() => { this.pending = null; });
    return this.pending;
  }
}
