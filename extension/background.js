importScripts('connection.js');
const BASE = 'http://127.0.0.1:49832';
const SITES = ['https://www.youtube.com/*', 'https://music.youtube.com/*', 'https://soundcloud.com/*', 'https://www.soundcloud.com/*'];
function sourceFor(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) return '';
    return { 'www.youtube.com': 'youtube', 'music.youtube.com': 'music', 'soundcloud.com': 'soundcloud', 'www.soundcloud.com': 'soundcloud' }[parsed.hostname] || '';
  } catch { return ''; }
}
async function relay(session) {
  try {
    const response = await fetch(`${BASE}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': BRIDGE_TOKEN }, body: JSON.stringify(session), signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error('Bridge unavailable');
    await chrome.action.setBadgeText({ text: '' });
  } catch {
    await chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
    await chrome.action.setBadgeText({ text: '!' });
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const source = sourceFor(sender.url);
  if (!['youtube-presence', 'media-presence'].includes(message?.kind) || sender.tab?.id == null || !source || sender.frameId !== 0 || !message.session || (message.session.closed !== true && message.session.source !== source)) return;
  relay({ ...message.session, tabId: sender.tab.id, active: sender.tab.active }).then(() => reply({ ok: true }));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => { relay({ tabId, closed: true }); });
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading' || (change.url && !sourceFor(change.url))) relay({ tabId, closed: true });
});
async function refresh() {
  const tabs = await chrome.tabs.query({ url: SITES });
  await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { kind: 'refresh-presence' }).catch(() => relay({ tabId: tab.id, closed: true }))));
}
async function initialize() {
  await chrome.alarms.clear('refresh-youtube');
  await chrome.alarms.create('refresh-media', { periodInMinutes: 0.5 });
  await refresh();
}
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'refresh-media' || alarm.name === 'refresh-youtube') refresh(); });
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: BASE }));
