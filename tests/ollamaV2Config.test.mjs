import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODEL, SETTINGS, configureText, configureFile } from '../scripts/configure-ollama-v2.mjs';

test('V2 startup settings override fallback configuration without dropping API keys', () => {
  const before = 'GEMINI_API_KEY="keep-secret"\nLLM_PROVIDERS="gemini,ollama"\nOLLAMA_MODEL="auto"\nCHAT_LOCAL_FALLBACK="on"\nBEST_FIT_ROUTER="on"\n';
  const after = configureText(before);
  assert.match(after, /GEMINI_API_KEY="keep-secret"/);
  for (const [key, value] of Object.entries(SETTINGS)) {
    assert.ok(after.includes(key + '="' + value + '"'));
    assert.equal(after.split('\n').filter(line => line.startsWith(key + '=')).length, 1);
  }
  assert.equal(SETTINGS.LLM_PROVIDERS, 'ollama');
  assert.equal(SETTINGS.OLLAMA_MODEL, MODEL);
  assert.equal(SETTINGS.GEMINI_AS_FALLBACK, 'off');
  assert.equal(SETTINGS.CHAT_LOCAL_FALLBACK, 'off');
  assert.equal(SETTINGS.BEST_FIT_ROUTER, 'off');
  assert.equal(configureText(after), after);
});

test('V2 startup file configuration is private and idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'listopad-v2-'));
  try {
    const filename = join(dir, '.env.local');
    writeFileSync(filename, 'MCP_AUTH_TOKEN="retain"\nLLM_PROVIDERS="gemini"\n');
    const first = configureFile(filename);
    const after = readFileSync(filename, 'utf8');
    assert.equal(first.changed, true);
    assert.equal(configureFile(filename).changed, false);
    assert.equal(readFileSync(filename, 'utf8'), after);
    assert.match(after, /MCP_AUTH_TOKEN="retain"/);
    assert.equal(statSync(filename).mode & 0o077, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
