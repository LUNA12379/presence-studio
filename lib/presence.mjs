import { translate } from './locale.mjs';
import { soundcloudTrackUrl, soundcloudArtworkUrl } from './soundcloud.mjs';
export const STALE_MS = 95000;
const SOURCES = new Set(['youtube', 'music', 'soundcloud']);
export function clip(value, bytes = 128) {
  let result = '';
  for (const character of String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim()) {
    if (Buffer.byteLength(result + character) > bytes) break;
    result += character;
  }
  return result;
}
function numeric(value, fallback, min, max) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function validateSession(raw) {
  if (!raw || !Number.isSafeInteger(raw.tabId) || raw.tabId < 0) throw new Error('Invalid tab');
  if (raw.closed === true) return { tabId: raw.tabId, closed: true };
  if (!SOURCES.has(raw.source)) throw new Error('Invalid media source');
  let media;
  if (raw.source === 'soundcloud') {
    const trackUrl = soundcloudTrackUrl(raw.trackUrl);
    if (!trackUrl) throw new Error('Invalid SoundCloud track');
    media = { trackUrl, artworkUrl: soundcloudArtworkUrl(raw.artworkUrl) };
  } else {
    if (!/^[\w-]{11}$/.test(raw.videoId ?? '')) throw new Error('Invalid YouTube video');
    media = { videoId: raw.videoId };
  }
  if (typeof raw.title !== 'string' || !raw.title.trim()) throw new Error('Missing title');
  return {
    tabId: raw.tabId, source: raw.source, ...media,
    title: clip(raw.title, 600), channel: clip(raw.channel, 300),
    position: numeric(raw.position, 0, 0, 604800), duration: numeric(raw.duration, 0, 0, 604800),
    rate: numeric(raw.rate, 1, 0.1, 16), paused: raw.paused === true,
    ad: raw.ad === true, ended: raw.ended === true, live: raw.live === true,
    active: raw.active === true
  };
}
export class SessionStore {
  sessions = new Map();
  sequence = 0;
  update(raw, now = Date.now()) {
    const entry = validateSession(raw);
    if (entry.closed) { this.sessions.delete(entry.tabId); return; }
    const previous = this.sessions.get(entry.tabId);
    const changedVideo = !previous || previous.source !== entry.source || previous.videoId !== entry.videoId || previous.trackUrl !== entry.trackUrl;
    const started = !entry.paused && (changedVideo || previous.paused || previous.ad || previous.ended);
    const priority = started ? ++this.sequence : (previous?.priority ?? 0);
    const pausedAt = entry.paused ? (changedVideo || !previous?.paused ? now : previous.pausedAt) : null;
    this.sessions.set(entry.tabId, { ...entry, updatedAt: now, priority, pausedAt });
  }
  select(config, now = Date.now(), filter = () => true) {
    for (const [id, session] of this.sessions) if (now - session.updatedAt > STALE_MS) this.sessions.delete(id);
    if (!config.enabled) return null;
    return [...this.sessions.values()].filter(s => filter(s) && !s.ad && !s.ended && (!s.paused || now - s.pausedAt < config.pauseSeconds * 1000))
      .sort((a, b) => Number(a.paused) - Number(b.paused) || b.priority - a.priority || Number(b.active) - Number(a.active) || a.tabId - b.tabId)[0] ?? null;
  }
}
export function videoUrl(s) {
  if (s.source === 'soundcloud') return s.trackUrl;
  return `https://${s.source === 'music' ? 'music' : 'www'}.youtube.com/watch?v=${s.videoId}`;
}
export function sourceName(source) {
  return { youtube: 'YouTube', music: 'YouTube Music', soundcloud: 'SoundCloud' }[source] || '';
}
export function makeActivity(s, config, now = Date.now()) {
  if (!s) return null;
  const type = config.mode === 'listening' ? 2 : config.mode === 'playing' ? 0 : config.mode === 'watching' ? 3 : s.source === 'youtube' ? 3 : 2;
  const url = videoUrl(s);
  const image = s.source === 'soundcloud' ? s.artworkUrl : `https://i.ytimg.com/vi/${s.videoId}/hqdefault.jpg`;
  const activity = {
    type, details: clip(s.title), state: clip(`${s.paused ? translate('⏸ 일시정지 · ', config.language) : ''}${s.channel || sourceName(s.source)}`),
    details_url: url,
    ...(image ? { assets: { large_image: image, large_text: sourceName(s.source), large_url: url } } : {}),
    buttons: [{ label: translate(s.source === 'soundcloud' ? 'SoundCloud에서 듣기' : 'YouTube에서 보기', config.language), url }], instance: false
  };
  if ([...activity.details].length < 2) activity.details += ' ';
  if ([...activity.state].length < 2) activity.state += ' ';
  if (!s.paused && !s.live && s.duration > 0) {
    const position = Math.min(s.duration, s.position + Math.max(0, now - s.updatedAt) / 1000 * s.rate);
    activity.timestamps = { start: Math.floor(now / 1000 - position / s.rate), end: Math.ceil(now / 1000 + (s.duration - position) / s.rate) };
  }
  return activity;
}
export function activityChanged(a, b) {
  if (!a || !b) return a !== b;
  const { timestamps: ta, ...aa } = a;
  const { timestamps: tb, ...bb } = b;
  return JSON.stringify(aa) !== JSON.stringify(bb) || Boolean(ta) !== Boolean(tb) || (ta && (Math.abs(ta.start - tb.start) > 3 || Math.abs(ta.end - tb.end) > 3));
}
