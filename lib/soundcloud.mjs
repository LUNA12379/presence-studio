// Only public track links and SoundCloud's image CDN are sent to Discord.
export function soundcloudTrackUrl(value) {
  if (typeof value !== 'string' || value.length > 1800) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname) || url.port || url.username || url.password || url.searchParams.has('secret_token')) return '';
    const parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
    if (parts.length !== 2 || parts.some(part => !/^[\w-]+$/.test(part)) || ['undefined', 'null', 'you', 'discover', 'search', 'tags', 'charts', 'pages', 'settings', 'upload', 'n'].includes(parts[0])) return '';
    return `https://soundcloud.com/${parts.join('/')}`;
  } catch { return ''; }
}

export function soundcloudArtworkUrl(value) {
  if (typeof value !== 'string' || value.length > 1800) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^i\d+\.sndcdn\.com$/.test(url.hostname) || url.port || url.username || url.password || !/^\/[\w.-]+\.(jpg|jpeg|png|webp)$/i.test(url.pathname)) return '';
    return `${url.origin}${url.pathname.replace(/-(?:t\d+x\d+|large|small)(?=\.[^.]+$)/, '-t500x500')}`;
  } catch { return ''; }
}
