/**
 * SearXNG image retrieval for LISTOPAD.
 * Fetches metadata from the explicitly configured SearXNG instance.
 * External images are browser-loaded, never server-proxied.
 */
export class SearxngError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = 'SearxngError';
    this.status = status;
  }
}

export function extractImageSearchQuery(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  const command = text.match(/^\/(?:images|zdjecia|zdjęcia|fotografie|photos)\s+(.+)$/is);
  if (command) return command[1].trim().slice(0, 200) || null;
  const natural = text.match(/^(?:pokaż|pokaz|znajdź|znajdz|wyszukaj|wyświetl|wyswietl)\s+(?:mi\s+|nam\s+)?(?:kilka\s+|galerię\s+|galerie\s+)?(?:zdjęcia|zdjecia|fotografie|fotki|obrazy|obrazki)\s+(?:z\s+|ze\s+|na\s+temat\s+|przedstawiające\s+|przedstawiajace\s+|o\s+)?(.+)$/is);
  return natural?.[1]?.trim().slice(0, 200) || null;
}

export function extractAgentImageRequest(input) {
  if (typeof input !== 'string') return null;
  const match = input.match(/\[SEARCH_IMAGES:\s*([^\]\n]{1,200})\]/i);
  return match ? { marker: match[0], query: match[1].trim() } : null;
}

function normalizeHttpsUrl(input) {
  if (typeof input !== 'string' || input.length > 3000) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
        hostname === '0.0.0.0' || hostname === '[::1]' || hostname.includes(':') ||
        /^(?:10|127|169\.254|192\.168)\./.test(hostname) ||
        /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeSearxngResults(payload, limit = 6) {
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  const images = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const imageUrl = normalizeHttpsUrl(row.img_src) || normalizeHttpsUrl(row.thumbnail_src);
    const sourceUrl = normalizeHttpsUrl(row.url);
    if (!imageUrl || !sourceUrl || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    images.push({
      title: String(row.title || 'Zdjęcie z internetu').replace(/[\r\n]/g, ' ').slice(0, 180),
      imageUrl,
      sourceUrl,
    });
    if (images.length >= Math.min(8, Math.max(1, limit))) break;
  }
  return images;
}

export async function searchSearxngImages(query, { baseUrl = process.env.SEARXNG_BASE_URL, limit = 6, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const text = typeof query === 'string' ? query.trim() : '';
  if (!text || text.length > 200) throw new SearxngError('Zapytanie o zdjęcia musi mieć od 1 do 200 znaków.', 400);
  if (!baseUrl || !String(baseUrl).trim()) throw new SearxngError('SearXNG nie jest skonfigurowany. Ustaw SEARXNG_BASE_URL na adres własnej instancji.');
  let endpoint;
  try {
    endpoint = new URL('search', String(baseUrl).trim().replace(/\/+$/, '') + '/');
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Invalid endpoint');
  } catch {
    throw new SearxngError('Nieprawidłowy adres SEARXNG_BASE_URL.');
  }
  endpoint.searchParams.set('q', text);
  endpoint.searchParams.set('categories', 'images');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('safesearch', '1');
  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new SearxngError('SearXNG nie odpowiada. Sprawdź kontener, SEARXNG_BASE_URL i połączenie sieciowe.', 502);
  }
  if (!response.ok) {
    if (response.status === 403) throw new SearxngError('SearXNG odrzucił JSON (HTTP 403). Dodaj json do search.formats w settings.yml.', 502);
    throw new SearxngError('SearXNG zwrócił HTTP ' + response.status + '.', 502);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new SearxngError('SearXNG nie zwrócił poprawnego JSON.', 502);
  }
  if (!Array.isArray(payload?.results)) throw new SearxngError('SearXNG zwrócił nieoczekiwany format odpowiedzi.', 502);
  return { query: text, provider: 'searxng', images: normalizeSearxngResults(payload, limit) };
}

function markdownText(value) {
  return String(value).replace(/[\[\]\\\r\n]/g, ' ').replace(/[<>]/g, '').slice(0, 140);
}
function markdownUrl(value) {
  return value.replace(/\(/g, '%28').replace(/\)/g, '%29');
}
export function renderSearxngGallery(data) {
  if (!data.images.length) return 'SearXNG nie znalazł dostępnych zdjęć dla: ' + data.query + '. Spróbuj innego zapytania.';
  return 'Znalazłem zdjęcia w internecie przez SearXNG (to prawdziwe wyniki wyszukiwania, nie grafiki wygenerowane przez AI):\n\n' +
    data.images.map((item) =>
      '![' + markdownText(item.title) + '](' + markdownUrl(item.imageUrl) + ')\n' +
      '[Źródło zdjęcia](' + markdownUrl(item.sourceUrl) + ')'
    ).join('\n\n');
}
