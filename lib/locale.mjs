import fs from 'node:fs';
const english = JSON.parse(fs.readFileSync(new URL('../ui/en.json', import.meta.url), 'utf8'));
export function translate(source, language) { return language === 'en' ? english[source] ?? source : source; }
