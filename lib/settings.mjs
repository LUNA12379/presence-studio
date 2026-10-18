import { randomUUID } from 'node:crypto';
import { clip } from './presence.mjs';

export const MANUAL_DEFAULTS = { title: '집중하는 중', state: '잠시 나만의 시간', type: 'playing', imageUrl: '', imageId: '', discordAssetId: '', discordAssetAppId: '', buttonLabel: '', buttonUrl: '', timer: 'elapsed', minutes: 25 };
export const OVERLAY_DEFAULTS = { enabled: false, theme: 'midnight', accent: '#a8b5ff', width: 400, opacity: 95, x: null, y: null, locked: false, clickThrough: false, showImage: true, showProgress: true, hideWhenIdle: true };
export const DEFAULTS = {
  applicationId: '', language: 'en', enabled: true, mode: 'auto', pauseSeconds: 60, sourceMode: 'auto',
  manual: MANUAL_DEFAULTS, overlay: OVERLAY_DEFAULTS, excludedKeywords: [], pinnedTabId: null,
  presets: [], autostart: false, customApplicationId: '', soundcloudApplicationId: '', showGuideOnStartup: true, checkUpdatesOnStartup: true
};
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value, length, name) {
  if (typeof value !== 'string') throw new Error(`${name} 형식이 올바르지 않습니다.`);
  return clip(value, length);
}
function oneOf(value, values, name) {
  if (!values.includes(value)) throw new Error(`${name} 값이 올바르지 않습니다.`);
  return value;
}
function integer(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name}: ${min}~${max} 범위를 입력하세요.`);
  return value;
}
function boolean(value) { if (typeof value !== 'boolean') throw new Error('켜기/끄기 값이 올바르지 않습니다.'); return value; }
export function safeUrl(value, name = '링크') {
  const result = text(value, 1800, name);
  if (!result) return '';
  try {
    const url = new URL(result);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) throw new Error();
    return url.href;
  } catch { throw new Error(`${name}는 https:// 로 시작하는 주소여야 합니다.`); }
}
export function validateManual(raw, current = MANUAL_DEFAULTS) {
  if (!object(raw)) throw new Error('직접 입력한 활동을 확인하세요.');
  const result = { ...MANUAL_DEFAULTS, ...current };
  for (const [key, limit] of [['title', 256], ['state', 256], ['buttonLabel', 32]]) if (Object.hasOwn(raw, key)) result[key] = text(raw[key], limit, key);
  if (!result.title) throw new Error('활동 제목을 입력하세요.');
  for (const key of ['imageUrl', 'buttonUrl']) if (Object.hasOwn(raw, key)) result[key] = safeUrl(raw[key], key === 'imageUrl' ? '이미지 주소' : '버튼 링크');
  for (const key of ['imageId', 'discordAssetId', 'discordAssetAppId']) if (Object.hasOwn(raw,key)) {
    if (typeof raw[key] !== 'string' || (raw[key] && !(key === 'imageId' ? /^[a-f0-9]{64}$/ : /^\d{17,22}$/).test(raw[key]))) throw new Error('이미지 선택을 확인하세요.');
    result[key] = raw[key];
  }
  if (Boolean(result.discordAssetId) !== Boolean(result.discordAssetAppId)) throw new Error('Discord 이미지 정보를 확인하세요.');
  if (Object.hasOwn(raw, 'type')) result.type = oneOf(raw.type, ['playing', 'listening', 'watching'], '활동 종류');
  if (Object.hasOwn(raw, 'timer')) result.timer = oneOf(raw.timer, ['none', 'elapsed', 'countdown'], '타이머');
  if (Object.hasOwn(raw, 'minutes')) result.minutes = integer(raw.minutes, 1, 1440, '타이머 분');
  return result;
}
export function validateOverlay(raw, current = OVERLAY_DEFAULTS) {
  if (!object(raw)) throw new Error('오버레이 설정을 확인하세요.');
  const result = { ...OVERLAY_DEFAULTS, ...current };
  for (const key of ['enabled', 'locked', 'clickThrough', 'showImage', 'showProgress', 'hideWhenIdle']) if (Object.hasOwn(raw, key)) result[key] = boolean(raw[key]);
  if (Object.hasOwn(raw, 'theme')) result.theme = oneOf(raw.theme, ['midnight', 'light', 'compact'], '테마');
  if (Object.hasOwn(raw, 'accent')) {
    if (!/^#[a-f0-9]{6}$/i.test(raw.accent)) throw new Error('강조색을 확인하세요.');
    result.accent = raw.accent;
  }
  if (Object.hasOwn(raw, 'width')) result.width = integer(raw.width, 300, 720, '너비');
  if (Object.hasOwn(raw, 'opacity')) result.opacity = integer(raw.opacity, 25, 100, '투명도');
  for (const key of ['x', 'y']) if (Object.hasOwn(raw, key)) result[key] = raw[key] === null ? null : integer(raw[key], -30000, 30000, '위치');
  return result;
}
export function validateConfig(raw, current = DEFAULTS) {
  if (!object(raw)) throw new Error('설정 형식을 확인하세요.');
  const next = { ...DEFAULTS, ...current };
  for (const key of ['applicationId', 'customApplicationId', 'soundcloudApplicationId']) if (Object.hasOwn(raw, key)) {
    const id = String(raw[key]).trim();
    if (id && !/^\d{17,22}$/.test(id)) throw new Error('Application ID는 17~22자리 숫자입니다.');
    next[key] = id;
  }
  for (const key of ['enabled', 'autostart', 'showGuideOnStartup', 'checkUpdatesOnStartup']) if (Object.hasOwn(raw, key)) next[key] = boolean(raw[key]);
  if (Object.hasOwn(raw, 'language')) next.language = oneOf(raw.language, ['en', 'ko'], 'language');
  if (Object.hasOwn(raw, 'mode')) next.mode = oneOf(raw.mode, ['auto', 'watching', 'listening', 'playing'], '활동 종류');
  if (Object.hasOwn(raw, 'pauseSeconds')) next.pauseSeconds = oneOf(raw.pauseSeconds, [0, 30, 60, 300], '숨기는 시간');
  if (Object.hasOwn(raw, 'sourceMode')) next.sourceMode = oneOf(raw.sourceMode, ['auto', 'manual'], '활동 소스');
  if (Object.hasOwn(raw, 'manual')) next.manual = validateManual(raw.manual, next.manual);
  if (Object.hasOwn(raw, 'overlay')) next.overlay = validateOverlay(raw.overlay, next.overlay);
  if (Object.hasOwn(raw, 'pinnedTabId')) next.pinnedTabId = raw.pinnedTabId === null ? null : integer(raw.pinnedTabId, 0, Number.MAX_SAFE_INTEGER, '탭');
  if (Object.hasOwn(raw, 'excludedKeywords')) {
    if (!Array.isArray(raw.excludedKeywords) || raw.excludedKeywords.length > 50) throw new Error('제외할 단어는 최대 50개입니다.');
    next.excludedKeywords = [...new Set(raw.excludedKeywords.map(item => text(item, 120, '제외 단어')).filter(Boolean))];
  }
  // Presets are modified through their own endpoints; incoming config cannot replace secrets or preset storage.
  return next;
}
export function validatePreset(raw, existingId) {
  if (!object(raw)) throw new Error('프리셋을 확인하세요.');
  const name = text(raw.name, 100, '프리셋 이름');
  if (!name) throw new Error('프리셋 이름을 입력하세요.');
  return { id: existingId || randomUUID(), name, manual: validateManual(raw.manual) };
}
