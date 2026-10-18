// Reads the persistent miniplayer, not the page currently being browsed.
const PresenceStudioSoundCloud = (() => {
  function trackUrl(value) {
    try {
      const url = new URL(value, 'https://soundcloud.com');
      if (url.protocol !== 'https:' || !['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname) || url.port || url.username || url.password || url.searchParams.has('secret_token')) return '';
      const parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
      if (parts.length !== 2 || parts.some(part => !/^[\w-]+$/.test(part)) || ['undefined', 'null', 'you', 'discover', 'search', 'tags', 'charts', 'pages', 'settings', 'upload', 'n'].includes(parts[0])) return '';
      return `https://soundcloud.com/${parts.join('/')}`;
    } catch { return ''; }
  }
  function seconds(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const parts = value.trim().split(':');
    if (parts.length > 3 || parts.some(part => !/^\d+(?:\.\d+)?$/.test(part))) return null;
    const result = parts.reduce((total, part) => total * 60 + Number(part), 0);
    return Number.isFinite(result) ? Math.min(604800, result) : null;
  }
  function read(doc, previous = null) {
    const player = doc.querySelector('.playControls__elements');
    const button = player?.querySelector('.playControls__play');
    const titleLink = player?.querySelector('.playbackSoundBadge__titleLink');
    const timeline = player?.querySelector('.playbackTimeline__progressWrapper');
    if (!button || !titleLink || !timeline) return null;
    const title = (titleLink.getAttribute('title') || titleLink.querySelector('[aria-hidden="true"]')?.textContent || '').trim();
    const channel = player.querySelector('.playbackSoundBadge__lightLink')?.textContent?.trim() || '';
    if (!title) return null;
    let url = trackUrl(titleLink.getAttribute('href'));
    // SoundCloud's new track view sometimes renders /undefined/<slug> in the
    // miniplayer. Only use matching page metadata; never substitute another track.
    if (!url) {
      const pageTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
      const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || doc.querySelector('meta[property="og:url"]')?.getAttribute('content');
      const candidate = trackUrl(canonical);
      const href = titleLink.getAttribute('href') || '';
      if (candidate && pageTitle === title && href.replace(/\/$/, '').split('/').pop() === candidate.split('/').pop()) url = candidate;
      else if (previous?.title === title && previous.channel === channel && previous.href === href) url = previous.trackUrl;
    }
    if (!url) return null;
    const duration = seconds(timeline.getAttribute('aria-valuemax')) ?? seconds(player.querySelector('.playbackTimeline__duration [aria-hidden="true"]')?.textContent);
    const position = seconds(timeline.getAttribute('aria-valuenow')) ?? seconds(player.querySelector('.playbackTimeline__timePassed [aria-hidden="true"]')?.textContent);
    if (!duration || position === null) return null;
    const artwork = player.querySelector('.playbackSoundBadge__avatar .image__full');
    const image = artwork?.style?.backgroundImage?.match(/url\(["']?(.*?)["']?\)/)?.[1] || player.querySelector('.playbackSoundBadge__avatar img')?.getAttribute('src') || '';
    const paused = !button.classList.contains('playing');
    return { source: 'soundcloud', trackUrl: url, title, channel, artworkUrl: image,
      position: Math.min(position, duration), duration, paused, ended: paused && position >= duration,
      live: false, rate: 1, href: titleLink.getAttribute('href') || '' };
  }
  return { read, trackUrl, seconds };
})();
