import { translate } from './locale.mjs';
import { clip, makeActivity, videoUrl, pinnedSessionId } from './presence.mjs';
import { discordImageUrl } from './images.mjs';

export function isExcluded(session, config) {
  const haystack = `${session.title}\n${session.channel}`.toLocaleLowerCase();
  return (config.excludedKeywords || []).some(keyword => haystack.includes(keyword.toLocaleLowerCase()));
}
export function resolveActivity(sessions, config, startedAt, now = Date.now()) {
  if (!config.enabled) return { activity: null, display: null, current: null };
  if (config.sourceMode === 'manual') {
    const m = config.manual;
    const activity = { type: { playing: 0, listening: 2, watching: 3 }[m.type], details: clip(m.title), instance: false };
    if ([...activity.details].length < 2) activity.details += ' ';
    if (m.state) { activity.state = clip(m.state); if ([...activity.state].length < 2) activity.state += ' '; }
    const image = discordImageUrl(m);
    if (image) activity.assets = { large_image: image, large_text: clip(m.title) };
    if (m.buttonUrl) activity.buttons = [{ label: clip(m.buttonLabel || translate('열기', config.language), 32), url: m.buttonUrl }];
    if (m.timer !== 'none') {
      activity.timestamps = { start: Math.floor(startedAt / 1000) };
      if (m.timer === 'countdown') activity.timestamps.end = Math.floor(startedAt / 1000) + m.minutes * 60;
      if (m.timer === 'countdown' && now >= activity.timestamps.end * 1000) delete activity.timestamps;
    }
    return { activity, current: null, display: { source: 'manual', title: m.title, subtitle: m.state, image, type: activity.type,
      paused: false, startedAt, timer: m.timer, duration: m.timer === 'countdown' ? m.minutes * 60 : 0, position: Math.max(0, (now - startedAt) / 1000),
      updatedAt: now, rate: 1, url: m.buttonUrl, live: false } };
  }
  const pinned = pinnedSessionId(config);
  const current = sessions.select(config, now, session => !isExcluded(session, config) && (pinned === null || pinned === session.sessionId));
  const activity = makeActivity(current, config, now);
  return { current, activity, display: current ? { source: current.source, title: current.title, subtitle: current.channel, image: activity.assets?.large_image || '',
    type: activity.type, paused: current.paused, position: current.position, duration: current.duration, updatedAt: current.updatedAt,
    rate: current.rate, live: current.live, timer: 'media', url: videoUrl(current) } : null };
}
