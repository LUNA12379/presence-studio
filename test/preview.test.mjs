import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateConfig } from '../lib/settings.mjs';
import { resolveActivity } from '../lib/activity.mjs';
import { SessionStore } from '../lib/presence.mjs';

function editor(selection, images = []) {
  const context = vm.createContext({ selection, images });
  vm.runInContext(fs.readFileSync(new URL('../ui/media.js', import.meta.url), 'utf8'), context);
  vm.runInContext('imageCatalog = images', context);
  return target => vm.runInContext(`manualImageUrl(selection, '${target}')`, context);
}

test('a preset local image cannot mask a newly selected Discord image in the Discord preview', () => {
  const preset = { imageId: 'ab'.repeat(32), discordAssetAppId: '123456789012345678', discordAssetId: '234567890123456789', imageUrl: '' };
  const draft = { ...preset };
  const localUrl = '/images/local-preview.png';
  const preview = editor(draft, [{ id: preset.imageId, url: localUrl }]);
  assert.equal(preview('local'), localUrl);
  draft.discordAssetId = '234567890123456790';
  const config = validateConfig({ sourceMode: 'manual', manual: draft });
  const published = resolveActivity(new SessionStore(), config, 1000, 1000).activity;
  assert.equal(preview('discord'), published.assets.large_image);
  assert.equal(preview('local'), localUrl);
  assert.equal(preset.discordAssetId, '234567890123456789');
});

test('the default Discord preview never falls back to a private local image', () => {
  const draft = { imageId: 'ab'.repeat(32), discordAssetId: '', discordAssetAppId: '', imageUrl: '' };
  const preview = editor(draft, [{ id: draft.imageId, url: '/images/local-preview.png' }]);
  assert.equal(preview('discord'), '');
  assert.equal(preview('local'), '/images/local-preview.png');
  draft.imageUrl = 'https://example.com/shared-image.png';
  assert.equal(preview('discord'), draft.imageUrl);
  assert.equal(preview('local'), '/images/local-preview.png');
});

test('an overlay without a local image uses the same public image as Discord', () => {
  const draft = { imageId: 'ab'.repeat(32), discordAssetAppId: '123456789012345678', discordAssetId: '234567890123456789', imageUrl: 'https://example.com/fallback.png' };
  const preview = editor(draft);
  assert.equal(preview('local'), preview('discord'));
  draft.discordAssetId = '';
  assert.equal(preview('local'), draft.imageUrl);
  assert.equal(preview('discord'), draft.imageUrl);
});
