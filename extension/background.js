// Filled only in the private unpacked copy created by the desktop app. Store builds keep this empty.
const LEGACY_BRIDGE_TOKEN = '';
const BASE = 'http://127.0.0.1:49832';
const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const SITES = ['https://www.youtube.com/*', 'https://music.youtube.com/*', 'https://soundcloud.com/*', 'https://www.soundcloud.com/*'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const browser = /Edg\//.test(navigator.userAgent) ? 'edge' : /Chrome\//.test(navigator.userAgent) ? 'chrome' : '';
let identity;
function browserIdentity() {
  // Local extension storage separates browsers/profiles and survives worker restarts.
  // Never sync this ID across browsers or fall back to a shared numeric tab ID.
  if (!identity) identity = (async () => {
    const saved = await chrome.storage.local.get('browserId');
    if (typeof saved.browserId === 'string' && UUID.test(saved.browserId)) return saved.browserId;
    const browserId = crypto.randomUUID();
    await chrome.storage.local.set({ browserId });
    return browserId;
  })().catch(error => { identity = null; throw error; });
  return identity;
}
function sourceFor(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) return '';
    return { 'www.youtube.com': 'youtube', 'music.youtube.com': 'music', 'soundcloud.com': 'soundcloud', 'www.soundcloud.com': 'soundcloud' }[parsed.hostname] || '';
  } catch { return ''; }
}
async function send(endpoint, payload) {
  try {
    const saved = await chrome.storage.local.get('bridgeCredential');
    const credential = saved.bridgeCredential || LEGACY_BRIDGE_TOKEN;
    if (!credential) throw new Error('Pairing required');
    payload = { ...payload, browserId: await browserIdentity(), browser, extensionVersion: EXTENSION_VERSION };
    const response = await fetch(`${BASE}/api/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': credential }, body: JSON.stringify(payload), signal: AbortSignal.timeout(4000) });
    if (response.status === 401 && saved.bridgeCredential) await chrome.storage.local.remove('bridgeCredential');
    if (!response.ok) throw new Error('Bridge unavailable');
    await chrome.action.setBadgeText({ text: '' });
    return true;
  } catch {
    await chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
    await chrome.action.setBadgeText({ text: '!' });
    return false;
  }
}
function relay(session) { return send('session', session); }
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (['studio-status','studio-pair','studio-disconnect','studio-open'].includes(message?.kind)) {
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
    popupAction(message).then(reply, () => reply({ ok:false, error:'appUnavailable' })); return true;
  }
  const source = sourceFor(sender.url);
  if (!['youtube-presence', 'media-presence'].includes(message?.kind) || sender.tab?.id == null || !source || sender.frameId !== 0 || !message.session || (message.session.closed !== true && message.session.source !== source)) return;
  relay({ ...message.session, tabId: sender.tab.id, active: sender.tab.active }).then(() => reply({ ok: true }));
  return true;
});
async function popupAction(message) {
  if (message.kind === 'studio-open') { await chrome.tabs.create({ url:BASE }); return { ok:true }; }
  if (message.kind === 'studio-pair') {
    const code = typeof message.code === 'string' ? message.code.replace(/[\s-]/g,'').toUpperCase() : '';
    if (!/^[A-F0-9]{12}$/.test(code)) return { ok:false, error:'invalidCode' };
    const response = await fetch(`${BASE}/api/pairing/claim`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code,browserId:await browserIdentity(),browser,extensionVersion:EXTENSION_VERSION}), signal:AbortSignal.timeout(5000) });
    if (!response.ok) return { ok:false, error:'invalidCode' };
    const result = await response.json();
    if (!/^[a-f0-9]{64}$/.test(result.token ?? '')) return { ok:false, error:'appUnavailable' };
    await chrome.storage.local.set({ bridgeCredential:result.token }); await refresh(); return { ok:true, connected:true };
  }
  if (message.kind === 'studio-disconnect') {
    await send('pairing/disconnect', {}); await chrome.storage.local.remove('bridgeCredential');
    await chrome.action.setBadgeText({text:'!'}); return { ok:true, connected:false };
  }
  const connected = await send('extension', {});
  return { ok:true, connected, legacy:!!LEGACY_BRIDGE_TOKEN, version:EXTENSION_VERSION };
}
chrome.tabs.onRemoved.addListener(tabId => relay({ tabId, closed: true }));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading' || (change.url && !sourceFor(change.url))) return relay({ tabId, closed: true });
});
async function refresh() {
  // Report the loaded extension even when no supported media tab is open.
  await send('extension', {});
  const tabs = await chrome.tabs.query({ url: SITES });
  await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { kind: 'refresh-presence' }).catch(() => relay({ tabId: tab.id, closed: true }))));
}
async function initialize() {
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.alarms.clear('refresh-youtube');
  await chrome.alarms.create('refresh-media', { periodInMinutes: 0.5 });
  await refresh();
}
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'refresh-media' || alarm.name === 'refresh-youtube') refresh(); });
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
