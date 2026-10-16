import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DiscordRPC } from './lib/rpc.mjs';
import { SessionStore, activityChanged } from './lib/presence.mjs';
import { DEFAULTS, validateConfig, validatePreset } from './lib/settings.mjs';
import { resolveActivity } from './lib/activity.mjs';
import { userDataDirectory, loadUserSettings, saveSettings } from './lib/storage.mjs';
export { DEFAULTS, validateConfig } from './lib/settings.mjs';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const VERSION = '2.1.0';
export function loadSettings(root = ROOT, dataDir = userDataDirectory()) { return loadUserSettings(root, dataDir); }
function secretMatches(value, expected) {
  if (typeof value !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function jsonBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 32768) throw new Error('Request too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function launch(executable, args = []) {
  const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {}); child.unref();
}
function autostartExists(fallback) {
  if (process.platform !== 'win32' || !process.env.APPDATA) return fallback;
  return fs.existsSync(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'YouTube Discord.lnk'));
}
export function createBridge({ root = ROOT, dataDir = userDataDirectory(), config = loadSettings(root, dataDir), port = 49832, rpc = new DiscordRPC(), clock = Date.now } = {}) {
  const sessions = new SessionStore();
  let activeConfig = validateConfig({}, config);
  let lastExtensionAt = 0, lastAck, lastSentAt = 0, lastAttempt = 0, lastConnect = 0;
  let connectionError = '', connecting = false, sending = false, shuttingDown = false;
  let manualStartedAt = clock(), desktopLastAt = 0, nativeInfo = {}, configRevision = 0;
  let timer, configQueue = Promise.resolve();
  const origin = `http://127.0.0.1:${port}`;
  rpc.on('disconnected', () => { lastAck = undefined; });
  rpc.on('ready', () => { lastAck = undefined; connectionError = ''; });
  const resolved = () => resolveActivity(sessions, activeConfig, manualStartedAt, clock());
  async function tick() {
    if (shuttingDown || !activeConfig.applicationId) return;
    const now = clock();
    if (!rpc.ready) {
      if (connecting || now - lastConnect < 5000) return;
      connecting = true; lastConnect = now;
      const revision = configRevision;
      try { await rpc.connect(activeConfig.applicationId); if (revision === configRevision) connectionError = ''; }
      catch (error) { if (revision === configRevision) connectionError = error.message; }
      finally { connecting = false; }
      return;
    }
    const desired = resolved().activity;
    if (sending || now - lastAttempt < 3000 || !activityChanged(lastAck, desired)) return;
    sending = true; lastAttempt = now;
    const revision = configRevision;
    try {
      await rpc.setActivity(desired);
      if (revision === configRevision && rpc.ready) { lastAck = desired; lastSentAt = clock(); connectionError = ''; }
      else lastAck = undefined;
    } catch (error) { lastAck = undefined; if (revision === configRevision) connectionError = error.message; }
    finally { sending = false; }
  }
  function status() {
    const { token, overlayKey, ...publicConfig } = activeConfig;
    publicConfig.autostart = autostartExists(publicConfig.autostart);
    const { current, display } = resolved();
    return { version: VERSION, config: publicConfig, connected: rpc.ready, connecting, error: connectionError,
      extensionConnected: lastExtensionAt > 0 && clock() - lastExtensionAt < 95000,
      desktopConnected: desktopLastAt > 0 && clock() - desktopLastAt < 6000, nativeInfo,
      current, display, published: Boolean(rpc.ready && lastAck), lastSentAt, manualStartedAt,
      sessions: [...sessions.sessions.values()].map(s => ({ tabId: s.tabId, title: s.title, channel: s.channel, source: s.source, paused: s.paused })),
      overlayUrl: `${origin}/overlay#key=${overlayKey}`, extensionPath: path.join(dataDir, 'edge-extension'), appPath: root,
      applicationIdConfigured: Boolean(activeConfig.applicationId), settingsPath: path.join(dataDir, 'config.json') };
  }
  function updateConfig(body) {
    const result = configQueue.then(() => commitConfig(body));
    configQueue = result.catch(() => {});
    return result;
  }
  async function commitConfig(body) {
    const next = validateConfig(body, activeConfig);
    if (Object.hasOwn(body, 'autostart') && next.autostart !== autostartExists(activeConfig.autostart)) {
      const powershell = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      await execFileAsync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'Autostart.ps1'), ...(next.autostart ? ['-Enable'] : [])], { windowsHide: true, timeout: 10000 });
    }
    const reconnect = next.applicationId !== activeConfig.applicationId;
    if (next.sourceMode === 'manual' && (activeConfig.sourceMode !== 'manual' || JSON.stringify(next.manual) !== JSON.stringify(activeConfig.manual))) manualStartedAt = clock();
    saveSettings(dataDir, next); activeConfig = next; configRevision++;
    if (reconnect) { rpc.close(); lastAck = undefined; lastConnect = 0; }
    lastAttempt = 0; await tick();
  }
  function respond(res, code, value, type = 'application/json; charset=utf-8') {
    res.writeHead(code, { 'Content-Type': type });
    res.end(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
    if (req.headers.host !== `127.0.0.1:${port}`) return respond(res, 403, { error: 'Invalid host' });
    const requestOrigin = req.headers.origin;
    const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/.test(requestOrigin ?? '');
    if (requestOrigin && requestOrigin !== origin && !extensionOrigin) return respond(res, 403, { error: 'Invalid origin' });
    let pathname;
    try { pathname = new URL(req.url, origin).pathname; } catch { return respond(res, 400, { error: 'Invalid path' }); }
    if (extensionOrigin) {
      if (pathname !== '/api/session') return respond(res, 403, { error: 'Extension endpoint only' });
      res.setHeader('Access-Control-Allow-Origin', requestOrigin); res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Token');
        res.setHeader('Access-Control-Allow-Private-Network', 'true'); res.writeHead(204); res.end(); return;
      }
    }
    if (pathname === '/api/health' && req.method === 'GET') return respond(res, 200, { app: 'youtube-discord-local', version: VERSION });
    if (pathname === '/api/overlay' && req.method === 'GET') {
      if (!secretMatches(req.headers['x-overlay-key'], activeConfig.overlayKey)) return respond(res, 401, { error: 'Overlay key required' });
      return respond(res, 200, { display: resolved().display, style: activeConfig.overlay, enabled: activeConfig.enabled });
    }
    if (pathname.startsWith('/api/')) {
      if (!secretMatches(req.headers['x-bridge-token'], activeConfig.token)) return respond(res, 401, { error: 'Pairing required' });
      try {
        if (req.method === 'GET' && pathname === '/api/status') return respond(res, 200, status());
        if (req.method === 'POST' && pathname === '/api/session') {
          sessions.update(await jsonBody(req), clock()); lastExtensionAt = clock(); return respond(res, 200, { ok: true });
        }
        if (req.method === 'POST' && pathname === '/api/config') { await updateConfig(await jsonBody(req)); return respond(res, 200, status()); }
        if (req.method === 'POST' && pathname === '/api/timer/restart') { manualStartedAt = clock(); lastAttempt = 0; await tick(); return respond(res, 200, status()); }
        if (req.method === 'POST' && pathname === '/api/native/state') {
          const body = await jsonBody(req); desktopLastAt = clock();
          nativeInfo = { hotkeyRegistered: body.hotkeyRegistered === true, overlayHotkeyRegistered: body.overlayHotkeyRegistered === true };
          return respond(res, 200, status());
        }
        if (req.method === 'POST' && pathname === '/api/presets/save') {
          const body = await jsonBody(req); const found = activeConfig.presets.find(p => p.id === body.id);
          if (!found && activeConfig.presets.length >= 30) throw new Error('프리셋은 최대 30개까지 저장할 수 있습니다.');
          const preset = validatePreset(body, found?.id);
          const next = { ...activeConfig, presets: found ? activeConfig.presets.map(p => p.id === found.id ? preset : p) : [...activeConfig.presets, preset] };
          saveSettings(dataDir, next); activeConfig = next; return respond(res, 200, status());
        }
        if (req.method === 'POST' && pathname === '/api/presets/apply') {
          const body = await jsonBody(req); const preset = activeConfig.presets.find(p => p.id === body.id);
          if (!preset) throw new Error('프리셋을 찾을 수 없습니다.');
          manualStartedAt = clock(); await updateConfig({ manual: preset.manual, sourceMode: 'manual', enabled: true });
          return respond(res, 200, status());
        }
        if (req.method === 'POST' && pathname === '/api/presets/delete') {
          const body = await jsonBody(req); const next = { ...activeConfig, presets: activeConfig.presets.filter(p => p.id !== body.id) };
          saveSettings(dataDir, next); activeConfig = next; return respond(res, 200, status());
        }
        if (req.method === 'POST' && pathname === '/api/desktop-open') {
          const executable = path.join(root, 'desktop', 'Presence Studio.exe');
          if (!fs.existsSync(executable)) throw new Error('데스크톱 앱 파일을 찾을 수 없습니다.');
          launch(executable); return respond(res, 200, { ok: true });
        }
        if (req.method === 'POST' && pathname === '/api/open-extensions') {
          const candidates = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean).map(base => path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
          const executable = candidates.find(file => fs.existsSync(file));
          if (!executable) throw new Error('Edge 주소창에 edge://extensions 를 입력해 주세요.');
          launch(executable, ['edge://extensions/']); return respond(res, 200, { ok: true });
        }
        if (req.method === 'POST' && pathname === '/api/stop') { respond(res, 200, { ok: true }); await shutdown(); return; }
      } catch (error) { return respond(res, 400, { error: error.message }); }
      return respond(res, 404, { error: 'Unknown API' });
    }
    if (req.method !== 'GET') return respond(res, 405, { error: 'GET only' });
    if (pathname === '/') {
      const html = fs.readFileSync(path.join(root, 'ui', 'index.html'), 'utf8').replace('__BRIDGE_TOKEN__', activeConfig.token);
      return respond(res, 200, html, 'text/html; charset=utf-8');
    }
    const assets = { '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/overlay': ['overlay.html', 'text/html'],
      '/overlay.js': ['overlay.js', 'text/javascript'], '/overlay.css': ['overlay.css', 'text/css'], '/icon.svg': ['icon.svg', 'image/svg+xml'] };
    if (assets[pathname]) {
      const [file, type] = assets[pathname]; return respond(res, 200, fs.readFileSync(path.join(root, 'ui', file)), `${type}; charset=utf-8`);
    }
    respond(res, 404, 'Not found', 'text/plain');
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true; clearInterval(timer);
    if (rpc.ready) await Promise.race([rpc.setActivity(null).catch(() => {}), new Promise(resolve => setTimeout(resolve, 1500).unref())]);
    rpc.close(); server.close(); server.closeIdleConnections();
  }
  return { server, sessions, status, tick, shutdown, start() { return new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(port, '127.0.0.1', () => { timer = setInterval(() => { tick().catch(() => {}); }, 1000); resolve(); });
  }); } };
}
