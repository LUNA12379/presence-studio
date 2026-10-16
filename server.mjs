import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBridge } from './server-v2.mjs';
export * from './server-v2.mjs';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bridge = createBridge();
  bridge.start().then(() => console.log('Presence Studio listening on 127.0.0.1:49832')).catch(error => { console.error(error.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { bridge.shutdown(); });
}