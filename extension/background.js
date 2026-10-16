importScripts('connection.js');
const BASE = 'http://127.0.0.1:49832';
function youtube(url) {
  try { return ['www.youtube.com', 'music.youtube.com'].includes(new URL(url).hostname); } catch { return false; }
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
  if (message?.kind !== 'youtube-presence' || sender.tab?.id == null || !youtube(sender.url) || sender.frameId !== 0) return;
  relay({ ...message.session, tabId: sender.tab.id, active: sender.tab.active }).then(() => reply({ ok: true }));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => { relay({ tabId, closed: true }); });
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading' || (change.url && !youtube(change.url))) relay({ tabId, closed: true });
});
async function refresh() {
  const tabs = await chrome.tabs.query({ url: ['https://www.youtube.com/*', 'https://music.youtube.com/*'] });
  await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { kind: 'refresh-presence' }).catch(() => relay({ tabId: tab.id, closed: true }))));
}
async function initialize() {
  await chrome.alarms.create('refresh-youtube', { periodInMinutes: 0.5 });
  await refresh();
}
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'refresh-youtube') refresh(); });
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: BASE }));
