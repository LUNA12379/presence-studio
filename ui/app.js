const token = document.querySelector('meta[name="bridge-token"]').content;
const $ = id => document.getElementById(id);
const dirty = new Set(), hydrated = new Set();
let latest, timerNotice, overlayTimer, stopping = false, sessionsSignature = '', presetsSignature = '', queue = Promise.resolve();
let selectedPresetId = '', presetBusy = false;
let languageBusy = false;
function refreshLanguageUI() {
  const active = document.querySelector('.nav.active');
  if (active) $('pageName').textContent = t(names[active.dataset.panel]);
  renderStarters(); previewManual();
  $('identitySaved').textContent = dirty.has('identityForm') ? t('변경한 ID를 저장해 주세요.') : t('한 번 저장하면 앱을 종료하거나 컴퓨터를 다시 켜도 유지돼요.');
  $('overlaySaved').textContent = t('자동 저장');
  if (!mediaBusy) $('imageStatus').textContent = t('활동 또는 프리셋을 저장하면 선택한 이미지도 함께 기억합니다.');
  if (!$('refreshDiscordImages').disabled) $('discordImageStatus').textContent = t('이미지를 고른 뒤 활동 또는 프리셋을 저장하세요.');
  for (const option of $('discordImage').options) {
    if (!option.value) option.text = t('기본 앱 이미지');
    else if (!discordAssets.some(asset => asset.id === option.value)) option.text = t('저장된 Discord 이미지');
  }
  if ($('guideDialog').open) renderGuide(false);
}
function initLanguage() {
  document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', async () => {
    if (languageBusy || !latest || button.dataset.language === uiLanguage) return;
    languageBusy = true;
    document.querySelectorAll('[data-language]').forEach(item => item.disabled = true);
    try { render(await mutate('config', {language: button.dataset.language})); notify(t('표시 언어를 저장했어요.')); }
    catch (error) { notify(t(error.message)); }
    finally { languageBusy = false; document.querySelectorAll('[data-language]').forEach(item => item.disabled = false); }
  }));
}
const names = { home: '지금 내 활동', custom: '직접 꾸미기', overlay: '오버레이', presets: '프리셋', settings: '연결 & 설정' };
const kind = type => type === 2 ? t('듣는 중') : type === 3 ? t('시청 중') : t('플레이 중');
const time = value => { const n = Math.max(0, Math.floor(value || 0)); return n >= 3600 ? `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2,'0')}`; };
function notify(message) { clearTimeout(timerNotice); $('toast').textContent = message; $('toast').hidden = false; timerNotice = setTimeout(() => { $('toast').hidden = true; }, 4500); }
async function api(endpoint, body) {
  const response = await fetch(`/api/${endpoint}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Bridge-Token': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || t('연결을 확인해 주세요.')); return data;
}
function mutate(endpoint, body) { const request = queue.then(() => api(endpoint, body)); queue = request.catch(() => {}); return request; }
function panel(name) { if (!names[name]) return; document.querySelectorAll('.panel').forEach(item => { item.hidden = item.id !== `panel-${name}`; }); document.querySelectorAll('.nav').forEach(item => item.classList.toggle('active', item.dataset.panel === name)); $('pageName').textContent = t(names[name]); window.scrollTo(0, 0); if (name === 'overlay') fitOverlay(); if(name==='custom'&&latest&&!assetsApplicationId&&!$('refreshDiscordImages').disabled)loadDiscordImages(); }
document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => panel(button.dataset.panel)));
function getManual() { return { title: $('manualTitle').value.trim(), state: $('manualState').value.trim(), type: $('manualType').value, imageUrl: $('manualImage').value.trim(), ...mediaFields(), buttonLabel: $('manualButtonLabel').value.trim(), buttonUrl: $('manualButtonUrl').value.trim(), timer: $('manualTimer').value, minutes: Number($('manualMinutes').value) }; }
function setManual(m) { for (const [id,key] of Object.entries({ manualTitle:'title',manualState:'state',manualType:'type',manualImage:'imageUrl',manualButtonLabel:'buttonLabel',manualButtonUrl:'buttonUrl',manualTimer:'timer',manualMinutes:'minutes' })) $(id).value = m[key]??''; setMedia(m);previewManual(); }
function previewManual() {
  const m = getManual(); $('manualPreviewTitle').textContent = m.title || t('나만의 활동'); $('manualPreviewState').textContent = m.state || t('상태 문구');
  $('manualPreviewType').textContent = { playing:t('플레이 중'),listening:t('듣는 중'),watching:t('시청 중') }[m.type];
  $('manualPreviewTimer').textContent = m.timer === 'none' ? '' : m.timer === 'countdown' ? t('{minutes}분 남음', {minutes:m.minutes || 25}) : t('00:00 경과');
  $('minutesRow').hidden = m.timer !== 'countdown'; $('manualPreviewButton').hidden = !m.buttonUrl; $('manualPreviewButton').textContent = m.buttonLabel || t('열기');
  const imageUrl=manualImageUrl(m),validImage=!!imageUrl&&$('manualPreviewImage').dataset.failed!==imageUrl; $('manualPreviewIcon').hidden = validImage; $('manualPreviewImage').hidden = !validImage;
  if (validImage && $('manualPreviewImage').getAttribute('src') !== imageUrl) $('manualPreviewImage').src = imageUrl;
}
$('manualPreviewImage').addEventListener('error', () => { $('manualPreviewImage').dataset.failed = $('manualPreviewImage').getAttribute('src'); $('manualPreviewImage').hidden = true; $('manualPreviewIcon').hidden = false; });
function overlayValues() { return { enabled:$('overlayEnabled').checked,theme:$('overlayTheme').value,accent:$('overlayAccent').value,width:Number($('overlayWidth').value),opacity:Number($('overlayOpacity').value),showImage:$('overlayImage').checked,showProgress:$('overlayProgress').checked,hideWhenIdle:$('overlayIdle').checked,locked:$('overlayLocked').checked,clickThrough:$('overlayClick').checked }; }
function overlayLabels() { $('widthValue').textContent = `${$('overlayWidth').value} px`; $('opacityValue').textContent = `${$('overlayOpacity').value}%`; $('accentValue').textContent = $('overlayAccent').value.toUpperCase(); document.querySelectorAll('[data-theme]').forEach(button => button.classList.toggle('selected', button.dataset.theme === $('overlayTheme').value)); }
function fitOverlay() { if (!latest) return; const width = latest.config.overlay.width, height = latest.config.overlay.theme === 'compact' ? 96 : 148; const stage = $('overlayPreview').parentElement; const scale = Math.min(1,(stage.clientWidth-24)/width); $('overlayPreview').style.width = `${width}px`; $('overlayPreview').style.height = `${height}px`; $('overlayPreview').style.transform = `scale(${Math.max(.3,scale)})`; $('obsSize').textContent = `${width} × ${height}`; }
function hydrate(data) {
  const c = data.config;
  if (!dirty.has('manualForm')) { setManual(c.manual); hydrated.add('manualForm'); }
  if (!dirty.has('identityForm')) { $('applicationId').value=c.applicationId; $('customApplicationId').value=c.customApplicationId||''; }
  if (!dirty.has('settingsForm')) { $('mode').value=c.mode; $('pauseSeconds').value=c.pauseSeconds; $('excludedKeywords').value=c.excludedKeywords.join('\n'); $('autostart').checked=c.autostart; hydrated.add('settingsForm'); }
  if (!dirty.has('overlayForm')) {
    const s=c.overlay; $('overlayTheme').value=s.theme; $('overlayAccent').value=s.accent; $('overlayWidth').value=s.width; $('overlayOpacity').value=s.opacity;
    for(const [id,key] of Object.entries({overlayEnabled:'enabled',overlayImage:'showImage',overlayProgress:'showProgress',overlayIdle:'hideWhenIdle',overlayLocked:'locked',overlayClick:'clickThrough'})) $(id).checked=s[key]; overlayLabels(); hydrated.add('overlayForm');
  }
}
function renderSessions(data) {
  const signature = JSON.stringify([uiLanguage,data.sessions,data.config.pinnedTabId]); if(signature === sessionsSignature) return; sessionsSignature=signature;
  $('sessions').replaceChildren(); $('emptySessions').hidden=!!data.sessions.length;
  for(const session of data.sessions) {
    const row=document.createElement('div'); row.className='session-row';
    const source={youtube:'YouTube',music:'YouTube Music',soundcloud:'SoundCloud'}[session.source]||'';
    const icon=document.createElement('span'); icon.className='session-icon';icon.textContent=session.source==='youtube'?'▶':'♫';
    const info=document.createElement('div');info.className='session-info';const title=document.createElement('strong');title.textContent=session.title;const subtitle=document.createElement('small');subtitle.textContent=`${source}${session.channel?' · '+session.channel:''} · ${session.paused?t('일시정지'):t('재생 중')}`;info.append(title,subtitle);
    const button=document.createElement('button');const pinned=data.config.pinnedTabId===session.tabId;button.textContent=pinned?t('고정 해제'):t('이 탭 고정');
    button.addEventListener('click',async()=>{try{render(await mutate('config',{pinnedTabId:pinned?null:session.tabId}));notify(pinned?t('탭 고정을 해제했어요.'):t('이 탭의 활동만 표시해요.'));}catch(e){notify(t(e.message));}});row.append(icon,info,button);$('sessions').append(row);
  }
  if(data.config.pinnedTabId!==null&&!data.sessions.some(s=>s.tabId===data.config.pinnedTabId)){
    const row=document.createElement('div');row.className='session-row';const span=document.createElement('span');span.className='session-info small-muted';span.textContent=t('고정한 탭이 닫혔어요. 자동 선택으로 돌아갈 수 있습니다.');const button=document.createElement('button');button.textContent=t('고정 해제');button.onclick=async()=>{try{render(await mutate('config',{pinnedTabId:null}));}catch(e){notify(t(e.message));}};row.append(span,button);$('sessions').append(row);
  }
}
function presetCard(p, starter=false) {
  const card=document.createElement('article');card.className='card preset-card';const icon=document.createElement('div');icon.className='preset-symbol';icon.textContent=starter?p.symbol:'◇';const title=document.createElement('h3');title.textContent=p.name;const subtitle=document.createElement('p');subtitle.textContent=p.manual.title+(p.manual.state?' · '+p.manual.state:'');
  const actions=document.createElement('div');actions.className='button-row';const apply=document.createElement('button');apply.className=starter?'':'primary';apply.textContent=starter?t('이 내용으로 꾸미기'):t('바로 적용');
  apply.onclick=async()=>{if(starter){selectedPresetId='';dirty.add('manualForm');setManual(p.manual);updatePresetControls();panel('custom');return;}try{const result=await mutate('presets/apply',{id:p.id});selectedPresetId=p.id;dirty.delete('manualForm');render(result);notify(t('{name} 활동으로 바꿨어요.', {name:p.name}));}catch(e){notify(t(e.message));}};actions.append(apply);
  if(!starter){const edit=document.createElement('button');edit.textContent=t('불러오기');edit.onclick=()=>{loadPreset(p.id);panel('custom');};const remove=document.createElement('button');remove.textContent=t('삭제');remove.onclick=async()=>{try{render(await mutate('presets/delete',{id:p.id}));notify(t('프리셋을 삭제했어요.'));}catch(e){notify(t(e.message));}};actions.append(edit,remove);}card.append(icon,title,subtitle,actions);return card;
}
function updatePresetControls() {
  const presets=latest?.config.presets||[], selected=presets.find(p=>p.id===selectedPresetId);
  if(!selected)selectedPresetId='';
  $('savedPreset').value=selectedPresetId;
  $('savedPreset').disabled=presetBusy||!presets.length;
  $('presetCount').textContent=`${presets.length} / 30`;
  $('savePreset').disabled=presetBusy||presets.length>=30;
  $('updatePreset').hidden=!selected;
  $('updatePreset').disabled=presetBusy;
  $('presetStatus').textContent=presets.length>=30?t('30개를 모두 사용 중이에요. 기존 항목을 덮어쓰거나 프리셋 메뉴에서 삭제하세요.'):presets.length?t('목록에서 고르면 편집 내용이 불러와져요. Discord에 표시하려면 ‘이 활동으로 표시하기’를 누르세요.'):t('아직 저장한 프리셋이 없어요. 활동을 꾸민 뒤 위 저장 버튼을 눌러 보세요.');
}
function loadPreset(id) {
  const preset=latest?.config.presets.find(p=>p.id===id);
  if(!preset){selectedPresetId='';updatePresetControls();return;}
  selectedPresetId=preset.id;dirty.add('manualForm');setManual(preset.manual);updatePresetControls();
  notify(t('{name} 프리셋을 불러왔어요.', {name:preset.name}));
}
function renderPresets(data) {
  const presets=data.config.presets,signature=JSON.stringify([uiLanguage,presets]);
  if(signature!==presetsSignature){
    presetsSignature=signature;$('presetsList').replaceChildren();
    $('savedPreset').replaceChildren(new Option(presets.length?t('저장한 프리셋을 선택하세요'):t('저장한 프리셋이 없어요'),''));
    if(!presets.length){const empty=document.createElement('div');empty.className='empty-presets';empty.textContent=t('아직 저장한 프리셋이 없어요. 직접 꾸미기에서 첫 활동을 저장해 보세요.');$('presetsList').append(empty);}
    for(const preset of presets){$('presetsList').append(presetCard(preset));$('savedPreset').append(new Option(preset.name,preset.id));}
  }
  updatePresetControls();
}
async function savePreset(replace=false) {
  if(presetBusy||!latest||!$('manualForm').reportValidity())return;
  const selected=latest.config.presets.find(p=>p.id===selectedPresetId);
  if(replace&&!selected)return;
  const manual=getManual();
  if(!manual.title){notify(t('활동 제목을 입력하세요.'));$('manualTitle').focus();return;}
  // A new preset uses the activity title; updating keeps the existing preset's name.
  const previousIds=new Set(latest.config.presets.map(p=>p.id));
  const body={name:replace?selected.name:manual.title,manual,...(replace?{id:selected.id}:{})};
  presetBusy=true;dirty.add('manualForm');updatePresetControls();
  try{
    const result=await mutate('presets/save',body);
    const saved=replace?result.config.presets.find(p=>p.id===selected.id):result.config.presets.find(p=>!previousIds.has(p.id));
    if(saved)selectedPresetId=saved.id;
    render(result);notify(replace?t('선택한 프리셋에 수정 내용을 저장했어요.'):t('저장한 프리셋 목록에 추가했어요.'));
  }catch(e){notify(t(e.message));}
  finally{presetBusy=false;updatePresetControls();}
}
function render(data) {
  const firstLoad=!latest; latest=data; if(setUILanguage(data.config.language)){refreshLanguageUI();} $('offline').hidden=true;syncMedia(data);hydrate(data);
  $('setupNotice').hidden=data.applicationIdConfigured;
  if(firstLoad&&!data.applicationIdConfigured)panel('settings');
  $('enabled').checked=data.config.enabled;$('quickOverlay').checked=data.config.overlay.enabled;$('sourceMode').value=data.config.sourceMode;
  $('sourceAuto').classList.toggle('selected',data.config.sourceMode==='auto');$('sourceManual').classList.toggle('selected',data.config.sourceMode==='manual');
  $('connectionDot').classList.toggle('good',data.connected);$('connectionLabel').textContent=!data.applicationIdConfigured?t('Application ID 입력 필요'):data.connected?t('Discord 연결됨'):t('Discord 연결 대기');
  $('extensionStatus').textContent=data.extensionConnected?t('브라우저 확장 연결됨 · {count}개 탭', {count:data.sessions.length}):t('확장 연결 대기');
  $('publishedTag').textContent=!data.config.enabled?t('공유 꺼짐'):data.published?t('Discord에 전송됨'):t('활동 대기');$('publishedTag').classList.toggle('green',data.published&&data.config.enabled);
  $('nativeBadge').textContent=data.desktopConnected?t('데스크톱 연결됨'):t('브라우저 모드');
  const d=data.display; const hasImage=!!d?.image&&$('nowImage').dataset.failed!==d.image;$('nowImage').hidden=!hasImage;$('nowPlaceholder').hidden=hasImage;
  if(hasImage&&$('nowImage').getAttribute('src')!==d.image)$('nowImage').src=d.image;
  $('nowTitle').textContent=d?.title||(!data.config.enabled?t('지금은 나만의 시간'):t('당신의 다음 순간을 기다려요'));$('nowSubtitle').textContent=d?.subtitle||(!data.config.enabled?t('활동 공유 스위치를 켜면 다시 표시됩니다.'):t('영상·음악을 재생하거나 나만의 활동을 만들어 보세요.'));
  $('nowType').textContent=d?`${kind(d.type)}${d.paused?t(' · 일시정지'):''}`:'READY WHEN YOU ARE';
  const pos=d?Math.max(0,d.position+(d.paused?0:Math.max(0,Date.now()-d.updatedAt)/1000*(d.rate||1))):0;
  $('nowPosition').textContent=!d?'—':d.live?'LIVE':d.timer==='none'?'—':time(d.duration?Math.min(pos,d.duration):pos);$('nowDuration').textContent=d?.duration?time(d.duration):d?.timer==='elapsed'?t('경과'):'—';$('nowProgress').value=d?.duration?Math.min(100,pos/d.duration*100):0;
  $('nowSource').textContent=d?({youtube:t('YouTube · 자동 감지'),music:t('YouTube Music · 자동 감지'),soundcloud:t('SoundCloud · 자동 감지'),manual:t('직접 입력한 활동')}[d.source]):t('재생 중인 활동이 없어요');
  for(const [id,connected]of[['discordState',data.connected],['edgeState',data.extensionConnected],['desktopState',data.desktopConnected]]){$(id).textContent=connected?t('연결됨'):t('대기');$(id).classList.toggle('green',connected);}
  $('connectionError').textContent=t(data.error||'');$('extensionPath').textContent=data.extensionPath;$('obsUrl').value=data.overlayUrl;
  const previewUrl=data.overlayUrl.replace('/overlay#','/overlay?preview=1#');if($('overlayPreview').getAttribute('src')!==previewUrl)$('overlayPreview').src=previewUrl;fitOverlay();
  $('hotkeyStatus').textContent=!data.desktopConnected?t('단축키는 데스크톱 앱 실행 중에 사용할 수 있어요.'):(!data.nativeInfo.hotkeyRegistered||!data.nativeInfo.overlayHotkeyRegistered)?t('다른 앱이 일부 단축키를 사용 중이에요. 트레이 메뉴를 이용해 주세요.'):t('두 단축키가 모두 등록되어 있어요.');
  renderSessions(data);renderPresets(data);renderUpdates(data.update);
  if(firstLoad&&data.config.showGuideOnStartup)showGuide();
  if(firstLoad)checkUpdatesAtStartup(data);
}
$('nowImage').addEventListener('error',()=>{$('nowImage').dataset.failed=$('nowImage').getAttribute('src');$('nowImage').hidden=true;$('nowPlaceholder').hidden=false;});
for(const name of ['manualForm','identityForm','settingsForm','overlayForm']) $(name).addEventListener('input',()=>{dirty.add(name);if(name==='manualForm')previewManual();if(name==='identityForm')$('identitySaved').textContent=t('변경한 ID를 저장해 주세요.');});
async function patch(body, message) { try{render(await mutate('config',body));if(message)notify(message);}catch(e){notify(t(e.message));await refresh();} }
$('enabled').addEventListener('change',()=>patch({enabled:$('enabled').checked},$('enabled').checked?t('활동 공유를 켰어요.'):t('활동 공유를 껐어요.')));
$('sourceAuto').onclick=()=>patch({sourceMode:'auto'},t('자동 감지로 바꿨어요.'));$('sourceManual').onclick=()=>patch({sourceMode:'manual'},t('저장된 직접 입력 활동을 표시해요.'));
$('quickOverlay').onchange=async()=>{await patch({overlay:{enabled:$('quickOverlay').checked}});if(latest?.config.overlay.enabled&&!latest.desktopConnected){try{await mutate('desktop-open',{});notify(t('데스크톱 앱을 열고 있어요.'));}catch(e){notify(t(e.message));}}};
$('manualForm').addEventListener('submit',async event=>{event.preventDefault();try{const result=await mutate('config',{manual:getManual(),sourceMode:'manual',enabled:true});dirty.delete('manualForm');render(result);notify(t('직접 꾸민 활동을 표시하고 있어요.'));}catch(e){notify(t(e.message));}});
$('restartTimer').onclick=async()=>{try{render(await mutate('timer/restart',{}));notify(t('타이머를 다시 시작했어요.'));}catch(e){notify(t(e.message));}};
$('savePreset').onclick=()=>savePreset();
$('updatePreset').onclick=()=>savePreset(true);
$('savedPreset').onchange=()=>loadPreset($('savedPreset').value);
$('identityForm').addEventListener('submit',async event=>{
  event.preventDefault();$('saveApplicationId').disabled=true;$('identitySaved').textContent=t('저장 중…');
  try{const result=await mutate('config',{applicationId:$('applicationId').value.trim(),customApplicationId:$('customApplicationId').value.trim()});dirty.delete('identityForm');render(result);$('identitySaved').textContent=t('이 PC에 저장했어요. 앱을 다시 켜도 자동으로 불러옵니다.');notify(t('Application ID를 저장했어요. Discord 연결을 확인합니다.'));}
  catch(e){$('identitySaved').textContent=t('저장하지 못했어요. ')+t(e.message);notify(t(e.message));}
  finally{$('saveApplicationId').disabled=false;}
});
$('settingsForm').addEventListener('submit',async event=>{event.preventDefault();try{const result=await mutate('config',{mode:$('mode').value,pauseSeconds:Number($('pauseSeconds').value),excludedKeywords:$('excludedKeywords').value.split('\n').map(x=>x.trim()).filter(Boolean),autostart:$('autostart').checked});dirty.delete('settingsForm');render(result);notify(t('공유 설정을 저장했어요.'));}catch(e){notify(t(e.message));}});
let overlayRevision=0;
function saveOverlay(){dirty.add('overlayForm');overlayLabels();$('overlaySaved').textContent=t('저장 중…');clearTimeout(overlayTimer);const revision=++overlayRevision;overlayTimer=setTimeout(async()=>{try{const result=await mutate('config',{overlay:overlayValues()});if(revision===overlayRevision){dirty.delete('overlayForm');$('overlaySaved').textContent=t('저장됨');}render(result);}catch(e){$('overlaySaved').textContent=t('저장 실패');notify(t(e.message));}},280);}
$('overlayForm').addEventListener('input',saveOverlay);$('overlayForm').addEventListener('submit',event=>event.preventDefault());
document.querySelectorAll('[data-theme]').forEach(button=>button.onclick=()=>{$('overlayTheme').value=button.dataset.theme;saveOverlay();});document.querySelectorAll('[data-accent]').forEach(button=>button.onclick=()=>{$('overlayAccent').value=button.dataset.accent;saveOverlay();});
$('resetPosition').onclick=()=>patch({overlay:{x:null,y:null,locked:false,clickThrough:false}},t('오버레이 위치를 오른쪽 아래로 초기화했어요.'));
async function copy(value,message){try{await navigator.clipboard.writeText(value);notify(message);}catch{notify(t('복사하지 못했어요. 주소를 직접 선택해서 복사해 주세요.'));}}
$('copyObs').onclick=()=>copy(latest.overlayUrl,t('OBS 브라우저 소스 주소를 복사했어요.'));$('copyExtension').onclick=()=>copy(latest.extensionPath,t('확장 폴더 경로를 복사했어요.'));
$('openExtensions').onclick=async()=>{try{await mutate('open-extensions',{});}catch(e){notify(t(e.message));}};$('openDesktop').onclick=async()=>{try{await mutate('desktop-open',{});notify(t('데스크톱 앱을 열고 있어요.'));}catch(e){notify(t(e.message));}};
$('quit').onclick=async()=>{if(window.chrome?.webview){window.chrome.webview.postMessage('quit');return;}try{await mutate('stop',{});stopping=true;notify(t('프로그램을 종료했어요.'));}catch(e){notify(t(e.message));}};
function renderStarters(){
$('starterPresets').replaceChildren();
const starters=[{name:t('집중 모드'),symbol:'⌘',title:t('작업에 집중하는 중'),state:t('음악과 함께, 한 가지씩'),timer:'countdown',minutes:25},{name:t('잠깐 쉬는 시간'),symbol:'☕',title:t('잠시 쉬어 가는 중'),state:t('커피 한 잔의 여유'),timer:'elapsed',minutes:10},{name:t('오늘의 게임'),symbol:'✦',title:t('좋아하는 게임을 플레이 중'),state:t('나만의 플레이 타임'),timer:'elapsed',minutes:60}];
for(const s of starters)$('starterPresets').append(presetCard({name:s.name,symbol:s.symbol,manual:{title:s.title,state:s.state,type:'playing',imageUrl:'',buttonLabel:'',buttonUrl:'',timer:s.timer,minutes:s.minutes}},true));
}
async function refresh(){if(stopping)return;try{render(await api('status'));}catch{$('offline').hidden=false;}}
localeReady.then(()=>{initMedia();initGuide();initUpdates();initLanguage();renderStarters();window.addEventListener('resize',fitOverlay);refresh();setInterval(refresh,1500);}).catch(error=>{ $('offline').hidden=false; $('offline').textContent=error.message; });
