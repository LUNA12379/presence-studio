import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { validateConfig, validatePreset } from './settings.mjs';

export function userDataDirectory(env = process.env, platform = process.platform) {
  if (env.PRESENCE_STUDIO_DATA_DIR) return path.resolve(env.PRESENCE_STUDIO_DATA_DIR);
  if (platform === 'win32') return path.join(env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'PresenceStudio');
  return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'PresenceStudio');
}
export function saveSettings(dataDir, settings) {
  fs.mkdirSync(dataDir, { recursive: true });
  const filename = path.join(dataDir, 'config.json');
  const temporary = filename + '.tmp';
  const descriptor = fs.openSync(temporary, 'w', 0o600);
  try {
    fs.writeFileSync(descriptor, JSON.stringify(settings, null, 2) + '\n');
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, filename);
}
export function prepareExtension(root, dataDir, token) {
  const destination = path.join(dataDir, 'edge-extension');
  fs.mkdirSync(destination, { recursive: true });
  for (const file of ['manifest.json', 'background.js', 'content.js']) fs.copyFileSync(path.join(root, 'extension', file), path.join(destination, file));
  const connection = `// Generated locally for this Windows user. Never commit or distribute this file.\nconst BRIDGE_TOKEN = ${JSON.stringify(token)};\n`;
  fs.writeFileSync(path.join(destination, 'connection.js'), connection, { mode: 0o600 });
  return destination;
}
export function loadUserSettings(root, dataDir = userDataDirectory()) {
  const filename = path.join(dataDir, 'config.json');
  const legacyFilename = path.join(root, 'config.json');
  const source = fs.existsSync(filename) ? filename : fs.existsSync(legacyFilename) ? legacyFilename : null;
  const saved = source ? JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '')) : {};
  const config = validateConfig(saved);
  config.presets = Array.isArray(saved.presets) ? saved.presets.slice(0, 30).flatMap(p => { try { return [validatePreset(p, p.id)]; } catch { return []; } }) : [];
  for (const key of ['token', 'overlayKey']) config[key] = /^[a-f0-9]{64}$/.test(saved[key] ?? '') ? saved[key] : randomBytes(32).toString('hex');
  saveSettings(dataDir, config);
  prepareExtension(root, dataDir, config.token);
  return config;
}
