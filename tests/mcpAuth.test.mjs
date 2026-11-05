import test from 'node:test';
import assert from 'node:assert/strict';
import { mcpAuthConfig, checkMcpAuth } from '../src/lib/mcpAuth.mjs';

test('bez tokenu: otwarte w dev, zablokowane w produkcji', () => {
  assert.equal(checkMcpAuth({}, mcpAuthConfig({})).ok, true);
  const prod = checkMcpAuth({}, mcpAuthConfig({ NODE_ENV: 'production' }));
  assert.equal(prod.ok, false);
  assert.equal(prod.status, 503);
});

test('Bearer token jest akceptowany, zły odrzucany', () => {
  const cfg = mcpAuthConfig({ MCP_AUTH_TOKEN: 's3cret-token', NODE_ENV: 'production' });
  assert.deepEqual(checkMcpAuth({ authorization: 'Bearer s3cret-token' }, cfg), { ok: true, via: 'bearer' });
  assert.equal(checkMcpAuth({ authorization: 'bearer s3cret-token' }, cfg).ok, true);
  const bad = checkMcpAuth({ authorization: 'Bearer nope' }, cfg);
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 401);
  assert.equal(checkMcpAuth({}, cfg).ok, false);
});

test('tajna ścieżka: domyślnie równa tokenowi, może być osobna', () => {
  const same = mcpAuthConfig({ MCP_AUTH_TOKEN: 'abc' });
  assert.deepEqual(checkMcpAuth({ secret: 'abc' }, same), { ok: true, via: 'path' });

  const separate = mcpAuthConfig({ MCP_AUTH_TOKEN: 'abc', MCP_PATH_SECRET: 'xyz' });
  assert.equal(checkMcpAuth({ secret: 'xyz' }, separate).ok, true);
  assert.equal(checkMcpAuth({ secret: 'abc' }, separate).ok, false);
  assert.equal(checkMcpAuth({ authorization: 'Bearer abc' }, separate).ok, true);
});

test('pusty sekret w ścieżce nigdy nie przechodzi', () => {
  const cfg = mcpAuthConfig({ MCP_AUTH_TOKEN: 'abc' });
  assert.equal(checkMcpAuth({ secret: '' }, cfg).ok, false);
  assert.equal(checkMcpAuth({ authorization: 'Bearer ' }, cfg).ok, false);
});
