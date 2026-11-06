#!/usr/bin/env node
// Make Ollama Qwen3 Abliterated 14B V2 the ONLY agent chat model.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const MODEL = 'huihui_ai/qwen3-abliterated:14b-v2';
export const SETTINGS = Object.freeze({
  LLM_PROVIDERS: 'ollama',
  OLLAMA_MODEL: MODEL,
  GEMINI_AS_FALLBACK: 'off',
  CHAT_LOCAL_FALLBACK: 'off',
  BEST_FIT_ROUTER: 'off',
});
export function configureText(original) {
  const owned = new Set(Object.keys(SETTINGS));
  const kept = original.split(/\r?\n/).filter((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    return !(match && owned.has(match[1])) && !/^# (BEGIN|END) LISTOPAD V2$/.test(line);
  }).join('\n').trimEnd();
  return (kept ? kept + '\n\n' : '') + [
    '# BEGIN LISTOPAD V2',
    ...Object.entries(SETTINGS).map(([k, v]) => k + '="' + v + '"'),
    '# END LISTOPAD V2',
  ].join('\n') + '\n';
}
export function configureFile(filename) {
  if (fs.existsSync(filename) && !fs.statSync(filename).isFile()) throw new Error('Invalid .env.local');
  const prior = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '';
  const updated = configureText(prior);
  fs.writeFileSync(filename, updated, { mode: 0o600 });
  fs.chmodSync(filename, 0o600);
  return { changed: updated !== prior, model: MODEL };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.env.BASTILLA_ENV_LOCAL_PATH || path.resolve('.env.local');
  configureFile(target);
  console.log('[OLLAMA V2] Only ' + MODEL + '; provider=ollama; no fallback.');
}
