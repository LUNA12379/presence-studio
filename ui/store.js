let pairingCode = null, pairingSignature = '', storeChecked = false, storeNoticeDismissed = false;
function storeURL(store) {
  return store?.published === true && /^[a-p]{32}$/.test(store.extensionId || '')
    ? `https://chromewebstore.google.com/detail/${store.extensionId}` : '';
}
function renderPairingCode() {
  const remaining = pairingCode ? Math.max(0, Math.ceil((pairingCode.expiresAt - Date.now()) / 1000)) : 0;
  $('pairingCodeBox').hidden = !pairingCode;
  $('pairingCode').value = remaining ? pairingCode.code : '';
  $('copyPairingCode').disabled = !remaining;
  $('pairingExpiry').textContent = remaining ? t('유효 시간 {seconds}초 · 한 번만 사용할 수 있어요.', {seconds:remaining}) : t('코드가 만료됐어요. 새 코드를 만드세요.');
}
function maybeShowStoreNotice() {
  const store = latest?.store, url = storeURL(store);
  if (!url || store.paired) { if ($('storeDialog').open) $('storeDialog').close(); return; }
  if (storeNoticeDismissed || document.querySelector('dialog[open]')) return;
  $('storeDialogLink').href = url;
  storeNoticeDismissed = true;
  $('storeDialog').showModal();
}
function renderBrowserPairing(data) {
  const url = storeURL(data.store);
  $('storeInstallLink').hidden = !url;
  if (url) $('storeInstallLink').href = url; else $('storeInstallLink').removeAttribute('href');
  $('storeAvailability').textContent = url ? t('Chrome과 Edge에서 설치할 수 있어요. 설치 후 아래 코드로 연결하세요.') : data.store?.state === 'unavailable' ? t('스토어 출시 정보를 확인하지 못했어요. 기존 확장은 계속 사용할 수 있어요.') : t('스토어 배포를 준비 중이에요. 지금은 아래 로컬 확장 설치 방법을 사용하세요.');
  const peers = data.browserPairings || [], clients = data.extension?.clients || [];
  if (pairingCode && peers.some(peer => peer.createdAt >= pairingCode.expiresAt - 180000)) {
    pairingCode = null; $('pairingMessage').textContent = t('브라우저를 연결했어요. 미디어 탭을 새로고침하세요.');
  }
  renderPairingCode();
  const signature = JSON.stringify([uiLanguage, peers, clients.map(c => [c.id, c.connection])]);
  if (signature !== pairingSignature) {
    pairingSignature = signature; $('pairedBrowsers').replaceChildren();
    $('pairingEmpty').hidden = peers.length > 0;
    peers.forEach((peer, index) => {
      const row = document.createElement('div'); row.className = 'extension-version-row';
      const info = document.createElement('div'), name = document.createElement('strong'), detail = document.createElement('span');
      name.textContent = `${{edge:'Edge',chrome:'Chrome'}[peer.browser] || t('브라우저 확장')} · ${index + 1}`;
      detail.className = 'hint'; detail.textContent = clients.some(c => c.id === peer.browserId && c.connection === 'paired') ? t('연결됨') : t('연결 저장됨 · 브라우저 대기');
      info.append(name, detail);
      const button = document.createElement('button'); button.type = 'button'; button.textContent = t('연결 해제');
      button.onclick = async () => {
        button.disabled = true;
        try { render(await mutate('pairing/revoke', {id:peer.id})); notify(t('브라우저 연결을 해제했어요. 다시 사용하려면 새 코드로 연결하세요.')); }
        catch (error) { notify(t(error.message)); button.disabled = false; }
      };
      row.append(info, button); $('pairedBrowsers').append(row);
    });
  }
  maybeShowStoreNotice();
  if (!storeChecked) { storeChecked = true; api('store/check', {}).then(() => refresh()).catch(() => {}); }
}
function initBrowserPairing() {
  $('createPairingCode').onclick = async () => {
    $('createPairingCode').disabled = true; $('pairingMessage').textContent = '';
    try { pairingCode = await api('pairing/code', {}); renderPairingCode(); $('pairingCode').focus(); $('pairingCode').select(); }
    catch (error) { $('pairingMessage').textContent = t(error.message); }
    finally { $('createPairingCode').disabled = false; }
  };
  $('copyPairingCode').onclick = () => { if (pairingCode && pairingCode.expiresAt > Date.now()) copy(pairingCode.code, t('연결 코드를 복사했어요. 확장 아이콘을 눌러 붙여 넣으세요.')); };
  $('storeLater').onclick = () => $('storeDialog').close();
  $('storePairingSettings').onclick = () => { $('storeDialog').close(); panel('settings'); $('browserPairing').scrollIntoView({block:'start'}); };
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', () => setTimeout(maybeShowStoreNotice, 0));
  setInterval(renderPairingCode, 1000);
}
