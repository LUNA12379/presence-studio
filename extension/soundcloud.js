(() => {
  let previous = null, played = '', dead = false, timer, observed;
  const observer = new MutationObserver(schedule);
  function send(session) {
    if (dead) return;
    try { chrome.runtime.sendMessage({ kind: 'media-presence', session }).catch(() => {}); }
    catch { dead = true; observer.disconnect(); clearInterval(interval); }
  }
  function snapshot() {
    if (dead) return;
    const player = document.querySelector('.playControls__elements');
    if (player !== observed) {
      observer.disconnect(); observed = player;
      if (player) observer.observe(player, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'title', 'href', 'aria-valuenow', 'aria-valuemax'] });
    }
    const current = PresenceStudioSoundCloud.read(document, previous);
    if (current) previous = current;
    if (!current) { played = ''; return send({ closed: true }); }
    if (!current.paused) played = current.trackUrl;
    // A newly opened SoundCloud page restores the last paused track from storage.
    // Do not present that old track as an activity until playback actually starts.
    if (played !== current.trackUrl) return send({ closed: true });
    const { href, ...session } = current;
    send(session);
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(snapshot, 200); }
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', () => send({ closed: true }));
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.kind === 'refresh-presence') { snapshot(); reply({ ok: true }); }
  });
  const interval = setInterval(snapshot, 5000);
  snapshot();
})();
