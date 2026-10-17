let updateRequest=false,updateAutoChecked=false;
function renderUpdates(update) {
  if(!update)return;
  const phase=update.phase;
  $('updateCurrent').textContent=t('현재 버전 {version}', {version:update.currentVersion});
  const messages={unconfigured:t('업데이트 배포처를 아직 연결하지 않았어요. 배포 준비가 끝나면 새 설치 버전에서 연결됩니다.'),idle:t('버튼을 눌러 새 버전이 있는지 확인하세요.'),checking:t('새 버전을 확인하는 중…'),current:t('최신 버전을 사용하고 있어요.'),available:t('{version} 버전을 사용할 수 있어요.', {version:update.latestVersion}),downloading:t('{version} 다운로드 중 · {progress}%', {version:update.latestVersion,progress:update.progress}),ready:t('{version} 다운로드와 파일 검증을 마쳤어요. 설치하면 앱이 다시 시작됩니다.', {version:update.latestVersion}),installing:t('업데이트를 설치하고 있어요. 잠시 후 앱이 다시 시작됩니다.'),error:t(update.error || '')};
  $('updateStatus').textContent=messages[phase]||'';
  const busy=updateRequest||['checking','downloading','installing'].includes(phase);
  $('checkUpdate').disabled=busy;
  $('downloadUpdate').hidden=phase!=='available';$('downloadUpdate').disabled=busy||!update.canInstall;
  $('installUpdate').hidden=phase!=='ready';$('installUpdate').disabled=busy||!update.canInstall;
  $('updateProgress').hidden=phase!=='downloading';$('updateProgress').value=update.progress;
  $('updateNotes').hidden=!update.notes;$('updateNotes').textContent=update.notes;
  $('updateBanner').hidden=!['available','ready'].includes(phase);
  $('updateBannerText').textContent=t('새 버전 {version} · 연결 & 설정에서 업데이트할 수 있어요.', {version:update.latestVersion});
  if(!dirty.has('updatePreferences'))$('autoCheckUpdates').checked=latest.config.checkUpdatesOnStartup;
}
async function requestUpdate(action) {
  if(updateRequest)return;updateRequest=true;renderUpdates(latest.update);
  try{const update=await api(`updates/${action}`,{});latest.update=update;if(action==='install')stopping=true;}
  catch(error){latest.update={...latest.update,phase:'error',error:error.message};}
  finally{updateRequest=false;renderUpdates(latest.update);}
}
function initUpdates(){
  $('checkUpdate').onclick=()=>requestUpdate('check');$('downloadUpdate').onclick=()=>requestUpdate('download');$('installUpdate').onclick=()=>requestUpdate('install');
  $('autoCheckUpdates').onchange=async()=>{
    dirty.add('updatePreferences');$('autoCheckUpdates').disabled=true;
    try{const result=await mutate('config',{checkUpdatesOnStartup:$('autoCheckUpdates').checked});dirty.delete('updatePreferences');render(result);notify(t('업데이트 확인 설정을 저장했어요.'));}
    catch(error){dirty.delete('updatePreferences');renderUpdates(latest.update);notify(t(error.message));}
    finally{$('autoCheckUpdates').disabled=false;}
  };
}
function checkUpdatesAtStartup(data){
  if(updateAutoChecked)return;updateAutoChecked=true;
  if(data.config.checkUpdatesOnStartup&&data.update?.phase==='idle')requestUpdate('check');
}
