import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { generateGemini } from '../src/kernel/llmChain.ts';
import { parseGeminiModelChain } from '../src/kernel/geminiVm.ts';

// Uses the same GenerateContent path as the chat, not the separate Interactions API.
export async function checkGeminiModels({ apiKey, primaryModel, fallbackModels, fetchImpl, logger = console, timeoutMs = 20_000 }) {
  const key = (apiKey || '').trim();
  if (!key || /^(YOUR|MY)_/i.test(key)) {
    logger.error('Gemini is not configured. Set GEMINI_API_KEY as a server secret.');
    return false;
  }
  const chain = parseGeminiModelChain(primaryModel || '', fallbackModels || '');
  if (!chain.valid || chain.models.length === 0) {
    logger.error('GEMINI_MODEL or GEMINI_FALLBACK_MODELS has an invalid format.');
    return false;
  }

  let allSucceeded = true;
  for (const model of chain.models) {
    try {
      logger.log(`Checking Gemini model ${model}...`);
      await generateGemini({ geminiApiKey: key, geminiModel: model, fetchImpl }, {
        system: 'Give a short answer.',
        history: [],
        message: 'Reply with the single word OK.',
        maxOutputTokens: 256,
        temperature: 0,
      }, AbortSignal.timeout(timeoutMs));
      logger.log(`Gemini model ${model} is reachable using the chat API.`);
    } catch (error) {
      allSucceeded = false;
      const status = error && typeof error === 'object' && typeof error.status === 'number'
        ? error.status : undefined;
      let reason;
      if (status === 401 || status === 403) reason = 'check the API key and its Gemini API access';
      else if (status === 404) reason = 'check that the configured model is available';
      else if (status === 429) reason = 'check the model quota, billing, and rate limits';
      else if (status !== undefined) reason = `provider returned HTTP ${status}`;
      else if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) reason = 'health check timed out';
      else reason = 'health check could not reach the provider';
      // Do not print provider error bodies: they may include sensitive data.
      logger.error(`Gemini model ${model} failed: ${reason}.`);
    }
  }
  return allSucceeded;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dotenv = (await import('dotenv')).default;
  dotenv.config({ quiet: true });
  // Match server.ts: nonempty .env.local values override .env/environment.
  if (fs.existsSync('.env.local')) {
    for (const [name, value] of Object.entries(dotenv.parse(fs.readFileSync('.env.local')))) {
      if (value.trim()) process.env[name] = value;
    }
  }
  const ok = await checkGeminiModels({
    apiKey: process.env.GEMINI_API_KEY,
    primaryModel: (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim(),
    fallbackModels: process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.8-flash,gemini-flash-latest,gemini-3.7-flash',
  });
  if (!ok) process.exitCode = 1;
}
