import assert from 'node:assert/strict';
import test from 'node:test';
import { checkGeminiModels } from '../scripts/check-gemini.mjs';

function capture() {
  const lines = [];
  return { lines, logger: { log: (line) => lines.push(line), error: (line) => lines.push(line) } };
}

test('diagnostyka sprawdza ten sam endpoint i format co czat', async () => {
  const { lines, logger } = capture();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }), { status: 200 });
  };
  const ok = await checkGeminiModels({
    apiKey: 'fixture-secret', primaryModel: 'gemini-a', fallbackModels: 'gemini-b', fetchImpl, logger,
  });
  assert.equal(ok, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /models\/gemini-a:generateContent$/);
  assert.match(calls[1].url, /models\/gemini-b:generateContent$/);
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'fixture-secret');
  assert.equal(JSON.parse(calls[0].options.body).contents[0].parts[0].text, 'Reply with the single word OK.');
  assert.ok(!lines.join(' ').includes('fixture-secret'));
});

test('diagnostyka odrzuca placeholder i nie wysyła żądania', async () => {
  const { lines, logger } = capture();
  let called = false;
  const ok = await checkGeminiModels({
    apiKey: 'MY_GEMINI_API_KEY', primaryModel: 'gemini-a', logger,
    fetchImpl: async () => { called = true; },
  });
  assert.equal(ok, false);
  assert.equal(called, false);
  assert.match(lines.join(' '), /not configured/);
});

test('diagnostyka nie wypisuje treści błędu dostawcy ani klucza', async () => {
  const { lines, logger } = capture();
  const ok = await checkGeminiModels({
    apiKey: 'fixture-secret', primaryModel: 'gemini-a', logger,
    fetchImpl: async () => new Response('fixture-secret provider detail', { status: 403 }),
  });
  assert.equal(ok, false);
  assert.match(lines.join(' '), /API key/);
  assert.ok(!lines.join(' ').includes('fixture-secret'));
  assert.ok(!lines.join(' ').includes('provider detail'));
});
