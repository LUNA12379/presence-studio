import { isSessionId, STALE_MS } from './presence.mjs';

function versionParts(value) {
  if (typeof value !== 'string' || value.length > 23 || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(value)) throw new Error('Invalid extension version');
  const parts = value.split('.').map(Number);
  if (parts.some(n => n > 65535) || parts.every(n => n === 0)) throw new Error('Invalid extension version');
  return [...parts, 0, 0, 0].slice(0, 4);
}
export function parseExtensionReport(raw, requireVersion = false) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid extension report');
  if (raw.browserId !== undefined && (typeof raw.browserId !== 'string' || raw.browserId === 'legacy' || !isSessionId(`${raw.browserId}:0`))) throw new Error('Invalid browser identity');
  const version = raw.extensionVersion;
  if (version !== undefined) versionParts(version);
  if (requireVersion && (raw.browserId === undefined || version === undefined)) throw new Error('Extension identity and version required');
  return { id: raw.browserId ?? 'legacy', browser: ['edge', 'chrome'].includes(raw.browser) ? raw.browser : '', version: version ?? null };
}
export class ExtensionRegistry {
  clients = new Map();
  constructor(requiredVersion) { this.requiredVersion = requiredVersion; this.requiredParts = versionParts(requiredVersion); }
  prune(now) { for (const [id, client] of this.clients) if (now - client.lastSeen > STALE_MS) this.clients.delete(id); }
  update(report, now = Date.now()) {
    this.prune(now);
    this.clients.set(report.id, { ...report, lastSeen: now });
    if (this.clients.size > 64) this.clients.delete(this.clients.keys().next().value);
  }
  status(now = Date.now()) {
    this.prune(now);
    const clients = [...this.clients.values()].map(({ lastSeen, ...client }) => {
      let state = 'unknown';
      if (client.version) {
        const parts = versionParts(client.version);
        const index = parts.findIndex((part, i) => part !== this.requiredParts[i]);
        state = index < 0 ? 'current' : parts[index] < this.requiredParts[index] ? 'update-extension' : 'update-app';
      }
      return { ...client, state };
    });
    return { requiredVersion: this.requiredVersion, clients, needsAttention: clients.some(client => client.state !== 'current') };
  }
}
