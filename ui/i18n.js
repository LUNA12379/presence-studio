// Only application-owned strings are translated. User titles, filenames, IDs,
// release notes and preset content never pass through the static text collector.
let uiLanguage = 'en', englishMessages = {}, staticStrings = [];
function t(source, values = {}) {
  source = String(source ?? '');
  let text = uiLanguage === 'en' ? (englishMessages[source] ?? source) : source;
  if (uiLanguage === 'en' && text === source) {
    // Settings validators include field names and numeric limits in their errors.
    text = text.replace(/^(.*) 형식이 올바르지 않습니다\.$/, (_, field) => `Invalid format for ${t(field)}.`)
      .replace(/^(.*) 값이 올바르지 않습니다\.$/, (_, field) => `Invalid value for ${t(field)}.`)
      .replace(/^(.*): (\d+)~(\d+) 범위를 입력하세요\.$/, (_, field, min, max) => `${t(field)} must be between ${min} and ${max}.`)
      .replace(/^(.*)는 https:\/\/ 로 시작하는 주소여야 합니다\.$/, (_, field) => `${t(field)} must be an https:// URL.`);
  }
  return text.replace(/\{([A-Za-z]+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
function captureUIStrings() {
  staticStrings = [];
  document.querySelectorAll('[data-i18n-html]').forEach(node => staticStrings.push({node, html: true, source: node.innerHTML}));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (/[가-힣]/.test(node.data) && !node.parentElement.closest('[data-i18n-html],script,style')) {
      staticStrings.push({node, source: node.data.trim(), before: node.data.match(/^\s*/)[0], after: node.data.match(/\s*$/)[0]});
    }
  }
  document.querySelectorAll('[placeholder],[aria-label],[title],[alt]').forEach(node => {
    for (const attr of ['placeholder','aria-label','title','alt']) {
      const source = node.getAttribute(attr);
      if (source && /[가-힣]/.test(source)) staticStrings.push({node, attr, source});
    }
  });
}
function setUILanguage(language, force = false) {
  language = language === 'ko' ? 'ko' : 'en';
  if (language === uiLanguage && !force) return false;
  uiLanguage = language; document.documentElement.lang = language;
  for (const item of staticStrings) {
    if (!item.node.isConnected) continue;
    if (item.attr) item.node.setAttribute(item.attr, t(item.source));
    else if (item.html) item.node.innerHTML = t(item.source);
    else item.node.data = item.before + t(item.source) + item.after;
  }
  document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === language)));
  window.dispatchEvent(new Event('studio-language'));
  return true;
}
const localeReady = (async () => {
  const response = await fetch('/en.json');
  if (!response.ok) throw new Error('Could not load language resources. Please restart Presence Studio.');
  englishMessages = await response.json();
  captureUIStrings();
  setUILanguage(document.querySelector('meta[name="studio-language"]')?.content || 'en', true);
})();
