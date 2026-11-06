import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractImageSearchQuery, extractAgentImageRequest, normalizeSearxngResults,
  searchSearxngImages, renderSearxngGallery, SearxngError,
} from '../src/lib/searxng.mjs';

test('natural language and slash commands recognize image search', () => {
  assert.equal(extractImageSearchQuery('Pokaż mi zdjęcia Warszawy nocą'), 'Warszawy nocą');
  assert.equal(extractImageSearchQuery('/images koty'), 'koty');
  assert.equal(extractImageSearchQuery('Jak zrobić zdjęcie?'), null);
  assert.equal(extractAgentImageRequest('Oto [SEARCH_IMAGES: zorza polarna]').query, 'zorza polarna');
});
test('results sanitize schemes, local addresses, and duplicates', () => {
  const item = { img_src: 'https://images.example.org/1.jpg', url: 'https://example.org/page', title: 'Photo' };
  const images = normalizeSearxngResults({ results: [
    item, item,
    { img_src: 'javascript:alert(1)', url: 'https://example.org/page' },
    { img_src: 'http://127.0.0.1/admin.png', url: 'https://example.org/page' },
    { img_src: 'https://images.example.org/2.jpg', url: 'file:///etc/passwd' },
  ] });
  assert.deepEqual(images, [{ title: 'Photo', imageUrl: item.img_src, sourceUrl: item.url }]);
});
test('search requests images JSON from configured instance and renders clickable sources', async () => {
  let requested;
  const result = await searchSearxngImages('warszawa', {
    baseUrl: 'http://127.0.0.1:8080',
    fetchImpl: async (url) => {
      requested = url;
      return { ok: true, json: async () => ({ results: [{ img_src: 'https://pics.example.com/x.jpg', url: 'https://news.example.com/x', title: 'Warszawa' }] }) };
    },
  });
  assert.equal(requested.searchParams.get('categories'), 'images');
  assert.equal(requested.searchParams.get('format'), 'json');
  assert.match(renderSearxngGallery(result), /!\[Warszawa\]\(https:\/\/pics.example.com\/x.jpg\)/);
  assert.match(renderSearxngGallery(result), /Źródło zdjęcia/);
});
test('missing service and disabled JSON return honest errors', async () => {
  await assert.rejects(searchSearxngImages('koty', { baseUrl: '' }), /nie jest skonfigurowany/);
  await assert.rejects(searchSearxngImages('koty', {
    baseUrl: 'http://127.0.0.1:8080',
    fetchImpl: async () => ({ ok: false, status: 403 }),
  }), (error) => error instanceof SearxngError && /JSON/.test(error.message));
});
