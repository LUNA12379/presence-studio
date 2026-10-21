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
import { ImageLibrary, MAX_IMAGE_BYTES, effectiveApplicationId, fetchDiscordAssets } from './lib/images.mjs';
import { UpdateManager } from './lib/updates.mjs';
import { ExtensionRegistry, parseExtensionReport } from './lib/extensions.mjs';
export { DEFAULTS, validateConfig } from './lib/settings.mjs';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const VERSION = '2.8.1';
const EXTENSION_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8')).version;
export function loadSettings(root = ROOT, dataDir = userDataDirectory()) { return loadUserSettings(root, dataDir); }
function secretMatches(value, expected) {
  if (typeof value !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function binaryBody(req, limit) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('파일 또는 요청이 너무 큽니다.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonBody(req) { return JSON.parse((await binaryBody(req,32768)).toString('utf8')); }
function launch(executable, args = []) {
  const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {}); child.unref();
}
function autostartExists(fallback) {
  if (process.platform !== 'win32' || !process.env.APPDATA) return fallback;
  return fs.existsSync(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'YouTube Discord.lnk'));
}
export function createBridge({ root = ROOT, dataDir = userDataDirectory(), config = loadSettings(root, dataDir), port = 49832, rpc = new DiscordRPC(), clock = Date.now, assetFetcher = fetchDiscordAssets, updater } = {}) {
  let repository='';try{repository=JSON.parse(fs.readFileSync(path.join(root,'update-channel.json'),'utf8')).repository||'';}catch{}
  const updates=updater||new UpdateManager({version:VERSION,repository,directory:path.join(dataDir,'updates'),root});
  const sessions = new SessionStore();
  const extensions = new ExtensionRegistry(EXTENSION_VERSION);
  let activeConfig = validateConfig({}, config);
  let rpcApplicationId = rpc.ready ? effectiveApplicationId(activeConfig) : '', connectionRevision = 0;
  let lastAck, lastSentAt = 0, lastAttempt = 0, lastConnect = 0;
  let connectionError = '', connecting = false, sending = false, shuttingDown = false;
  let manualStartedAt = clock(), desktopLastAt = 0, nativeInfo = {}, configRevision = 0;
  let timer, configQueue = Promise.resolve();
  const origin = `http://127.0.0.1:${port}`;
  const images = new ImageLibrary(dataDir), assetCache = new Map(), assetRequests = new Map();
  const imageList = () => images.list().map(item=>({...item,url:images.url(item.id,activeConfig.token,origin)}));
  rpc.on('disconnected', () => { lastAck = undefined; });
  rpc.on('ready', () => { lastAck = undefined; connectionError = ''; });
  const resolved = () => {
    const value=resolveActivity(sessions, activeConfig, manualStartedAt, clock());
    if(value.display?.source==='manual'&&activeConfig.manual.imageId)value.display.image=images.url(activeConfig.manual.imageId,activeConfig.token,origin)||value.display.image;
    return value;
  };
  async function tick() {
    if (shuttingDown) return;
    const selection = resolved(), applicationId = effectiveApplicationId(activeConfig, selection.current?.source);
    if (applicationId !== rpcApplicationId) {
      // Invalidate replies from the previous application before changing the connection.
      connectionRevision++; rpc.close(); rpcApplicationId = applicationId;
      lastAck = undefined; lastConnect = 0; lastAttempt = 0; connectionError = '';
    }
    if (!applicationId) return;
    const now = clock();
    if (!rpc.ready) {
      if (connecting || now - lastConnect < 5000) return;
      connecting = true; lastConnect = now;
      const revision = configRevision, connection = connectionRevision;
      try {
        await rpc.connect(applicationId);
        if (connection !== connectionRevision || shuttingDown) rpc.close();
        else if (revision === configRevision) connectionError = '';
      }
      catch (error) { if (revision === configRevision && connection === connectionRevision) connectionError = error.message; }
      finally { connecting = false; }
      return;
    }
    const desired = selection.activity;
    if (sending || now - lastAttempt < 3000 || !activityChanged(lastAck, desired)) return;
    sending = true; lastAttempt = now;
    const revision = configRevision, connection = connectionRevision;
    try {
      await rpc.setActivity(desired);
      if (revision === configRevision && connection === connectionRevision && rpc.ready) { lastAck = desired; lastSentAt = clock(); connectionError = ''; }
      else lastAck = undefined;
    } catch (error) { lastAck = undefined; if (revision === configRevision && connection === connectionRevision) connectionError = error.message; }
    finally { sending = false; }
  }
  function status() {
    const { token, overlayKey, ...publicConfig } = activeConfig;
    publicConfig.autostart = autostartExists(publicConfig.autostart);
    const { current, display } = resolved();
    const applicationId = effectiveApplicationId(activeConfig, current?.source), connected = rpc.ready && rpcApplicationId === applicationId;
    const extension = extensions.status(clock());
    return { version: VERSION, update:updates.status(), config: publicConfig, connected, connecting, error: connectionError,
      extensionConnected: extension.clients.length > 0, extension,
      desktopConnected: desktopLastAt > 0 && clock() - desktopLastAt < 6000, nativeInfo,
      current, display, published: Boolean(connected && lastAck), lastSentAt, manualStartedAt,
      sessions: [...sessions.sessions.values()].map(s => ({ sessionId: s.sessionId, tabId: s.tabId, browser: s.browser, title: s.title, channel: s.channel, source: s.source, paused: s.paused })),
      overlayUrl: `${origin}/overlay#key=${overlayKey}`, extensionPath: path.join(dataDir, 'edge-extension'), appPath: root,
      applicationIdConfigured: Boolean(applicationId), effectiveApplicationId:applicationId, settingsPath: path.join(dataDir, 'config.json'), images:imageList() };
  }
  function updateConfig(body) {
    const result = configQueue.then(() => commitConfig(body));
    configQueue = result.catch(() => {});
    return result;
  }
  async function commitConfig(body) {
    const next = validateConfig(body, activeConfig);
    if(Object.hasOwn(body,'manual')&&next.manual.imageId&&!images.exists(next.manual.imageId))throw new Error('저장된 이미지를 찾을 수 없어요. 다시 선택해 주세요.');
    if (Object.hasOwn(body, 'autostart') && next.autostart !== autostartExists(activeConfig.autostart)) {
      const powershell = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      await execFileAsync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'Autostart.ps1'), ...(next.autostart ? ['-Enable'] : [])], { windowsHide: true, timeout: 10000 });
    }
    if (next.sourceMode === 'manual' && (activeConfig.sourceMode !== 'manual' || JSON.stringify(next.manual) !== JSON.stringify(activeConfig.manual))) manualStartedAt = clock();
    saveSettings(dataDir, next); activeConfig = next; configRevision++;
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
      if (!['/api/session', '/api/extension'].includes(pathname)) return respond(res, 403, { error: 'Extension endpoint only' });
      res.setHeader('Access-Control-Allow-Origin', requestOrigin); res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Token');
        res.setHeader('Access-Control-Allow-Private-Network', 'true'); res.writeHead(204); res.end(); return;
      }
    }
    if (pathname === '/api/health' && req.method === 'GET') return respond(res, 200, { app: 'youtube-discord-local', version: VERSION });
    if(pathname.startsWith('/media/')&&req.method==='GET') {
      const id=pathname.slice(7),key=new URL(req.url,origin).searchParams.get('key');
      if(!images.exists(id)||!secretMatches(key,images.signature(id,activeConfig.token)))return respond(res,404,{error:'Image not found'});
      if(new URL(req.url,origin).searchParams.get('download')==='1')res.setHeader('Content-Disposition',`attachment; filename="presence-${id.slice(0,12)}.png"`);
      return respond(res,200,fs.readFileSync(images.filename(id)),'image/png');
    }
    if (pathname === '/api/overlay' && req.method === 'GET') {
      if (!secretMatches(req.headers['x-overlay-key'], activeConfig.overlayKey)) return respond(res, 401, { error: 'Overlay key required' });
      return respond(res, 200, { display: resolved().display, style: activeConfig.overlay, enabled: activeConfig.enabled, language: activeConfig.language });
    }
    if (pathname.startsWith('/api/')) {
      if (!secretMatches(req.headers['x-bridge-token'], activeConfig.token)) return respond(res, 401, { error: 'Pairing required' });
      try {
        if (req.method === 'GET' && pathname === '/api/status') return respond(res, 200, status());
        if(req.method==='POST'&&pathname==='/api/updates/check')return respond(res,200,await updates.check());
        if(req.method==='POST'&&pathname==='/api/updates/download'){updates.download().catch(()=>{});return respond(res,200,updates.status());}
        if(req.method==='POST'&&pathname==='/api/updates/install'){const result=await updates.install();respond(res,200,result);await shutdown();return;}
        if(req.method==='POST'&&pathname==='/api/images') {
          if(req.headers['content-type']!=='image/png')throw new Error('PNG 이미지가 필요합니다.');
          const bytes=await binaryBody(req,MAX_IMAGE_BYTES),name=decodeURIComponent(req.headers['x-image-name']||'이미지');
          const image=images.importPng(bytes,name);return respond(res,200,{image:{...image,url:images.url(image.id,activeConfig.token,origin)},images:imageList()});
        }
        if(req.method==='POST'&&pathname==='/api/images/open-folder') {
          fs.mkdirSync(images.directory,{recursive:true});launch('explorer.exe',[images.directory]);return respond(res,200,{ok:true});
        }
        if(req.method==='GET'&&pathname==='/api/discord-assets') {
          const applicationId=activeConfig.customApplicationId||activeConfig.applicationId;
          const refresh=new URL(req.url,origin).searchParams.get('refresh')==='1';
          let cached=assetCache.get(applicationId);
          if(refresh||!cached||clock()-cached.at>10000){
            let pending=assetRequests.get(applicationId);
            if(!pending){
              pending=Promise.resolve().then(()=>assetFetcher(applicationId)).then(assets=>{
                const value={at:clock(),assets};assetCache.set(applicationId,value);return value;
              }).finally(()=>assetRequests.delete(applicationId));
              assetRequests.set(applicationId,pending);
            }
            cached=await pending;
          }
          return respond(res,200,{applicationId,assets:cached.assets});
        }
        if (req.method === 'POST' && pathname === '/api/session') {
          const raw = await jsonBody(req), report = parseExtensionReport(raw);
          sessions.update(raw, clock()); extensions.update(report, clock()); return respond(res, 200, { ok: true });
        }
        if (req.method === 'POST' && pathname === '/api/extension') {
          extensions.update(parseExtensionReport(await jsonBody(req), true), clock());
          return respond(res, 200, { ok: true, requiredVersion: EXTENSION_VERSION });
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
          if(preset.manual.imageId&&!images.exists(preset.manual.imageId))throw new Error('저장된 이미지를 다시 선택해 주세요.');
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
      const html = fs.readFileSync(path.join(root, 'ui', 'index.html'), 'utf8').replace('__BRIDGE_TOKEN__', activeConfig.token).replace('__LANGUAGE__', activeConfig.language);
      return respond(res, 200, html, 'text/html; charset=utf-8');
    }
    const assets = { '/extensions.js':['extensions.js','text/javascript'], '/en.json':['en.json','application/json'], '/i18n.js':['i18n.js','text/javascript'], '/updates.js':['updates.js','text/javascript'], '/app.js': ['app.js', 'text/javascript'], '/media.js':['media.js','text/javascript'], '/crop.js':['crop.js','text/javascript'], '/crop-math.js':['crop-math.js','text/javascript'], '/crop.css':['crop.css','text/css'], '/guide.js':['guide.js','text/javascript'], '/media-guide.css':['media-guide.css','text/css'], '/style.css': ['style.css', 'text/css'], '/overlay': ['overlay.html', 'text/html'],
      '/overlay.js': ['overlay.js', 'text/javascript'], '/overlay.css': ['overlay.css', 'text/css'], '/icon.svg': ['icon.svg', 'image/svg+xml'] };
    if (assets[pathname]) {
      const [file, type] = assets[pathname]; return respond(res, 200, fs.readFileSync(path.join(root, 'ui', file)), `${type}; charset=utf-8`);
    }
    respond(res, 404, 'Not found', 'text/plain');
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true; clearInterval(timer);updates.cancel?.();
    if (rpc.ready) await Promise.race([rpc.setActivity(null).catch(() => {}), new Promise(resolve => setTimeout(resolve, 1500).unref())]);
    rpc.close(); server.close(); server.closeIdleConnections();
  }
  return { server, sessions, status, tick, shutdown, start() { return new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(port, '127.0.0.1', () => { timer = setInterval(() => { tick().catch(() => {}); }, 1000); resolve(); });
  }); } };
}
