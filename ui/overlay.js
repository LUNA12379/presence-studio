const key = new URLSearchParams(location.hash.slice(1)).get('key');
const preview = new URLSearchParams(location.search).has('preview');
const $ = id => document.getElementById(id);
let state = null, lastGood = 0;
function time(seconds) { const n = Math.max(0, Math.floor(seconds)); return n >= 3600 ? `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2,'0')}`; }
function render() {
  if (!state || Date.now() - lastGood > 7000) { $('card').hidden = true; return; }
  setUILanguage(state.language);
  const s = state.style;
  const d = state.display || ((preview || (state.enabled && !s.hideWhenIdle)) ? { title: t('좋아하는 순간을 여기에'), subtitle: t('Presence Studio · 오버레이 미리보기'), source: 'manual', type: 2, timer: 'none', paused: false, duration: 0, position: 0 } : null);
  $('card').hidden = !d || (!state.enabled && !preview);
  if (!d) return;
  $('card').className = `${s.theme} ${s.showImage ? '' : 'no-image'} ${s.showProgress ? '' : 'no-progress'}`;
  $('card').style.setProperty('--accent', s.accent); $('card').style.width = `${s.width}px`; $('card').style.opacity = s.opacity / 100;
  $('kind').textContent = d.type === 2 ? t('듣는 중') : d.type === 3 ? t('시청 중') : t('플레이 중');
  $('paused').textContent = d.paused ? t('일시정지') : '';
  $('title').textContent = d.title; $('subtitle').textContent = d.subtitle || 'Presence Studio';
  if ($('art').dataset.url !== (d.image || '')) { $('art').dataset.url = d.image || ''; $('art').hidden = !d.image; if (d.image) $('art').src = d.image; else $('art').removeAttribute('src'); }
  let position = d.position + (d.paused ? 0 : Math.max(0, Date.now() - (d.updatedAt || Date.now())) / 1000 * (d.rate || 1));
  if (d.duration > 0) position = Math.min(d.duration, position);
  $('bar').hidden = !d.duration || d.live; $('bar').value = d.duration ? position / d.duration * 100 : 0;
  $('time').textContent = d.live ? 'LIVE' : d.timer === 'none' ? '' : d.duration > 0 ? `${time(position)} / ${time(d.duration)}` : time(position);
}
$('art').addEventListener('error', () => { $('art').hidden = true; });
async function refresh() {
  try { const response = await fetch('/api/overlay', { headers: { 'X-Overlay-Key': key }, signal: AbortSignal.timeout(3000) }); if (!response.ok) throw new Error(); state = await response.json(); lastGood = Date.now(); }
  catch {} render();
}
localeReady.then(()=>{refresh(); setInterval(refresh, 1000); setInterval(render, 250);});
