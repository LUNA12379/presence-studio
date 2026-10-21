(async () => {
  const result = window.studioExtensionVerification = { done: false };
  const originalLanguage = latest.config.language;
  const edge = '11111111-1111-4111-8111-111111111111', chrome = '22222222-2222-4222-8222-222222222222';
  const required = latest.extension.requiredVersion;
  const assert = (value, message) => { if (!value) throw Error(message); };
  const wait = async predicate => { for (let i = 0; i < 80; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 100)); } throw Error('Extension UI timed out'); };
  const report = (browserId, browser, extensionVersion) => api('extension', { browserId, browser, extensionVersion });
  try {
    assert(latest.extension.clients.length === 0 && $('extensionUpdateBanner').hidden, 'No connection must not claim an outdated extension');
    panel('settings');
    assert(!$('extensionVersionWaiting').hidden, 'Missing waiting-for-connection message');
    await report(edge, 'edge', '1.2.0'); await report(chrome, 'chrome', required); await refresh();
    for (const language of ['en', 'ko']) {
      render(await api('config', { language })); panel('home');
      assert(!$('extensionUpdateBanner').hidden, 'Mismatch banner missing');
      $('showExtensionVersions').click();
      assert(!$('panel-settings').hidden, 'Banner did not open settings');
      assert($('extensionRequired').textContent.includes(required), 'Required version missing');
      const rows = [...$('extensionVersions').children];
      assert(rows.length === 2 && rows[0].textContent.includes('Edge') && rows[1].textContent.includes('Chrome'), 'Versions were merged across browsers');
      assert(rows[0].textContent.includes('1.2.0') && rows[0].querySelector('.version-warning'), 'Old Edge version not marked');
      assert(rows[1].textContent.includes(required) && rows[1].querySelector('.green'), 'Matching Chrome version not green');
      assert($('showExtensionVersions').textContent === (language === 'en' ? 'Check extension versions' : '확장 버전 확인'), 'Banner action not translated');
      $('extensionConnection').scrollIntoView({ block: 'start' });
      window.studioExtensionCapture = 'extensions-' + language;
      await wait(() => !window.studioExtensionCapture);
    }
    result.browserVersionsAndLanguages = true;
    await report(edge, 'edge', required); await refresh();
    assert($('extensionUpdateBanner').hidden && $('extensionReloadHelp').hidden, 'Correct version did not clear the warning');
    assert($('edgeState').classList.contains('green'), 'Matching extension connection remained amber');
    result.reloadClearsWarning = true;
    await report(chrome, 'chrome', '1.4.0'); await refresh();
    assert(!$('extensionAppHelp').hidden && $('extensionReloadHelp').hidden, 'Newer extension must request an app update');
    result.newerExtension = true;
    await api('session', { browserId: edge, browser: 'edge', tabId: 987281, closed: true }); await refresh();
    assert($('extensionVersions').textContent.includes('버전 확인 불가') && !$('extensionReloadHelp').hidden, 'Missing legacy-version guidance');
    assert(latest.sessions.length === 0, 'Heartbeat fabricated a media session');
    result.legacyVersion = true;
  } catch (error) { result.error = error.stack || error.message; }
  finally {
    await report(edge, 'edge', required); await report(chrome, 'chrome', required);
    render(await api('config', { language: originalLanguage })); result.done = true;
  }
})();
