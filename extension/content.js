(() => {
  let attachedVideo = null;
  let timer;
  let navigatingUntil = 0;
  let dead = false;
  function send(session) {
    if (dead) return;
    try { chrome.runtime.sendMessage({ kind: 'youtube-presence', session }).catch(() => {}); }
    catch { dead = true; }
  }
  function readText(selector) { return document.querySelector(selector)?.textContent?.trim() || ''; }
  function snapshot() {
    if (dead) return;
    const music = location.hostname === 'music.youtube.com';
    const url = new URL(location.href);
    const id = url.searchParams.get('v') || (/^\/shorts\/([\w-]{11})(?:\/|$)/.exec(url.pathname)?.[1]);
    const shorts = url.pathname.startsWith('/shorts/');
    const scope = shorts ? document.querySelector('ytd-reel-video-renderer[is-active]') : document;
    const video = scope?.querySelector('#movie_player video, video.html5-main-video, video');
    if (video !== attachedVideo) {
      for (const event of ['play', 'pause', 'seeked', 'ratechange', 'ended', 'loadedmetadata', 'emptied']) {
        attachedVideo?.removeEventListener(event, schedule);
        video?.addEventListener(event, schedule);
      }
      attachedVideo = video;
    }
    if (Date.now() < navigatingUntil || !/^[\w-]{11}$/.test(id || '') || !video || video.readyState === 0) return send({ closed: true });
    const player = video.closest('.html5-video-player');
    if (player?.classList.contains('ad-showing') || player?.classList.contains('ad-interrupting')) return send({ closed: true });
    let title;
    let channel;
    if (music) {
      title = readText('ytmusic-player-bar .title');
      channel = readText('ytmusic-player-bar .byline a') || readText('ytmusic-player-bar .byline');
    } else if (shorts) {
      title = scope.querySelector('h2, .ytShortsVideoTitleViewModelShortsVideoTitle')?.textContent?.trim();
      channel = scope.querySelector('#channel-name, .ytReelChannelBarViewModelChannelName')?.textContent?.trim();
    } else {
      const watch = document.querySelector('ytd-watch-flexy');
      if (watch?.getAttribute('video-id') && watch.getAttribute('video-id') !== id) return send({ closed: true });
      title = readText('ytd-watch-metadata h1 yt-formatted-string') || readText('ytd-watch-metadata h1') || readText('h1.title yt-formatted-string');
      channel = readText('ytd-watch-metadata #owner #channel-name a') || readText('#upload-info #channel-name a');
    }
    title ||= document.title.replace(/\s*[-–]\s*YouTube(?: Music)?\s*$/, '').trim();
    if (!title || title === 'YouTube' || title === 'YouTube Music') return send({ closed: true });
    const liveBadge = player?.querySelector('.ytp-live-badge');
    const live = !Number.isFinite(video.duration) || Boolean(liveBadge && liveBadge.getClientRects().length);
    send({ source: music ? 'music' : 'youtube', videoId: id, title, channel: channel || '',
      position: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : 0,
      paused: video.paused, ended: video.ended, rate: video.playbackRate, live });
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(snapshot, 200); }
  document.addEventListener('yt-navigate-start', () => { navigatingUntil = Date.now() + 1500; send({ closed: true }); });
  for (const event of ['yt-navigate-finish', 'ytmusic-navigate-finish', 'yt-page-data-updated']) {
    document.addEventListener(event, () => { navigatingUntil = Date.now() + 700; setTimeout(snapshot, 850); });
  }
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', () => send({ closed: true }));
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.kind === 'refresh-presence') { snapshot(); reply({ ok: true }); }
  });
  setInterval(snapshot, 5000);
  snapshot();
})();
