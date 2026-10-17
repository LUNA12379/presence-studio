let updateRequest=false,updateAutoChecked=false;
function renderUpdates(update) {
  if(!update)return;
  const phase=update.phase;
  $('updateCurrent').textContent=`현재 버전 ${update.currentVersion}`;
  const messages={unconfigured:'업데이트 배포처를 아직 연결하지 않았어요. 배포 준비가 끝나면 새 설치 버전에서 연결됩니다.',idle:'버튼을 눌러 새 버전이 있는지 확인하세요.',checking:'새 버전을 확인하는 중…',current:'최신 버전을 사용하고 있어요.',available:`${update.latestVersion} 버전을 사용할 수 있어요.`,downloading:`${update.latestVersion} 다운로드 중 · ${update.progress}%`,ready:`${update.latestVersion} 다운로드와 파일 검증을 마쳤어요. 설치하면 앱이 다시 시작됩니다.`,installing:'업데이트를 설치하고 있어요. 잠시 후 앱이 다시 시작됩니다.',error:update.error};
  $('updateStatus').textContent=messages[phase]||'';
  const busy=updateRequest||['checking','downloading','installing'].includes(phase);
  $('checkUpdate').disabled=busy;
  $('downloadUpdate').hidden=phase!=='available';$('downloadUpdate').disabled=busy||!update.canInstall;
  $('installUpdate').hidden=phase!=='ready';$('installUpdate').disabled=busy||!update.canInstall;
  $('updateProgress').hidden=phase!=='downloading';$('updateProgress').value=update.progress;
  $('updateNotes').hidden=!update.notes;$('updateNotes').textContent=update.notes;
  $('updateBanner').hidden=!['available','ready'].includes(phase);
  $('updateBannerText').textContent=`새 버전 ${update.latestVersion} · 연결 & 설정에서 업데이트할 수 있어요.`;
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
    try{const result=await mutate('config',{checkUpdatesOnStartup:$('autoCheckUpdates').checked});dirty.delete('updatePreferences');render(result);notify('업데이트 확인 설정을 저장했어요.');}
    catch(error){dirty.delete('updatePreferences');renderUpdates(latest.update);notify(error.message);}
    finally{$('autoCheckUpdates').disabled=false;}
  };
}
function checkUpdatesAtStartup(data){
  if(updateAutoChecked)return;updateAutoChecked=true;
  if(data.config.checkUpdatesOnStartup&&data.update?.phase==='idle')requestUpdate('check');
}
