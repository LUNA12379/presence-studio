let extensionSignature = '';
function renderExtensionVersions(extension) {
  if (!extension) return;
  const signature = JSON.stringify([uiLanguage, extension]);
  if (signature === extensionSignature) return;
  extensionSignature = signature;
  $('extensionUpdateBanner').hidden = !extension.needsAttention;
  $('extensionBannerText').textContent = t('앱과 브라우저 확장 버전이 맞지 않아요. 연결된 확장을 확인해 주세요.');
  $('extensionRequired').textContent = t('이 앱에 필요한 확장 버전: {version}', { version: extension.requiredVersion });
  $('extensionVersions').replaceChildren();
  $('extensionVersionWaiting').hidden = extension.clients.length > 0;
  $('extensionReloadHelp').hidden = !extension.clients.some(client => ['unknown', 'update-extension'].includes(client.state));
  $('extensionAppHelp').hidden = !extension.clients.some(client => client.state === 'update-app');
  const counts = {};
  for (const client of extension.clients) counts[client.browser] = (counts[client.browser] || 0) + 1;
  const seen = {};
  for (const client of extension.clients) {
    const row = document.createElement('div'); row.className = 'extension-version-row';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    const browser = { edge: 'Edge', chrome: 'Chrome' }[client.browser] || t('브라우저 확장');
    const number = seen[client.browser] = (seen[client.browser] || 0) + 1;
    name.textContent = browser + (counts[client.browser] > 1 ? ` (${number})` : '');
    const version = document.createElement('span'); version.className = 'hint';
    version.textContent = client.version ? t('연결된 버전 {version}', { version: client.version }) : t('버전 정보를 보내지 않는 이전 확장이에요.');
    info.append(name, version);
    const badge = document.createElement('span');
    badge.className = 'tag ' + (client.state === 'current' ? 'green' : 'version-warning');
    badge.textContent = t({ current: '버전 일치', 'update-extension': '확장 업데이트 필요', 'update-app': '앱 업데이트 필요', unknown: '버전 확인 불가' }[client.state]);
    row.append(info, badge); $('extensionVersions').append(row);
  }
}
function initExtensionVersions() {
  $('showExtensionVersions').onclick = () => { panel('settings'); $('extensionConnection').scrollIntoView({ block: 'start' }); };
  $('copyChromeExtensions').onclick = () => copy('chrome://extensions', t('Chrome 확장 관리 주소를 복사했어요.'));
}
