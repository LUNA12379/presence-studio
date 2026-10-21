(async () => {
  const result = window.studioBrowserVerification = { done: false };
  const before = { sourceMode: latest.config.sourceMode, pinnedSessionId: latest.config.pinnedSessionId, language: latest.config.language };
  const edge = '11111111-1111-4111-8111-111111111111', chrome = '22222222-2222-4222-8222-222222222222';
  const sample = { tabId: 987280, source: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'Same tab number, separate browsers', channel: 'Presence Studio test', position: 15, duration: 200 };
  const assert = (value, message) => { if (!value) throw Error(message); };
  const wait = async predicate => { for (let i = 0; i < 70; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 100)); } throw Error('Browser workflow timed out'); };
  try {
    await api('config', { sourceMode: 'auto', pinnedSessionId: null });
    await api('session', { ...sample, browserId: edge, browser: 'edge' });
    await api('session', { ...sample, browserId: chrome, browser: 'chrome' });
    for (const language of ['en', 'ko']) {
      render(await api('config', { language })); panel('home');
      const rows = [...$('sessions').querySelectorAll('.session-row')];
      assert(rows.length === 2, 'Both browser rows must be visible');
      assert(rows[0].textContent.includes('Edge') && rows[1].textContent.includes('Chrome'), 'Browser labels missing');
      rows[0].querySelector('button').click();
      await wait(() => latest.config.pinnedSessionId === `${edge}:${sample.tabId}`);
      assert(latest.current.sessionId === `${edge}:${sample.tabId}`, 'Pinned the wrong browser');
      assert($('sessions').querySelector('button').textContent === (language === 'en' ? 'Unpin' : '고정 해제'), 'Pinned label missing');
      window.studioBrowserCapture = 'browsers-' + language;
      await wait(() => !window.studioBrowserCapture);
      $('sessions').querySelector('button').click();
      await wait(() => latest.config.pinnedSessionId === null);
    }
    result.languages = true;
    render(await api('config', { pinnedSessionId: `${edge}:${sample.tabId}` }));
    await api('session', { tabId: sample.tabId, browserId: edge, closed: true }); await refresh();
    assert(latest.sessions.length === 1 && latest.current === null, 'Closed pinned tab fell back to another browser');
    assert($('sessions').textContent.includes('고정한 탭이 닫혔어요'), 'Missing closed-pin explanation');
    result.closeIsolation = true;
    render(await api('config', { pinnedTabId: sample.tabId }));
    assert(latest.current === null && $('sessions').textContent.includes('확장 업데이트 후'), 'Old pin must require a new choice');
    result.legacyPin = true;
  } catch (error) { result.error = error.stack || error.message; }
  finally {
    for (const browserId of [edge, chrome]) await api('session', { tabId: sample.tabId, browserId, closed: true });
    render(await api('config', before)); result.done = true;
  }
})();
