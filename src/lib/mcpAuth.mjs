// Autoryzacja serwera MCP BastillaOS.
//
// MCP_AUTH_TOKEN  – wymagany token. Akceptowany jako nagłówek
//                   "Authorization: Bearer <token>" (Claude Code, API, Cursor)
//                   albo jako tajny segment ścieżki /api/mcp/<sekret>
//                   (claude.ai Custom Connector nie pozwala dodać nagłówka).
// MCP_PATH_SECRET – opcjonalnie osobny sekret dla ścieżki; domyślnie = MCP_AUTH_TOKEN.
//
// Bez skonfigurowanego tokenu serwer MCP działa tylko poza produkcją
// (prywatny podgląd AI Studio / lokalnie). W produkcji (Cloud Run) zwraca 503,
// bo narzędzia astyria_* wykonują polecenia systemowe.
import { timingSafeEqual, createHash } from 'crypto';

export function mcpAuthConfig(env = process.env) {
  const token = String(env.MCP_AUTH_TOKEN || '').trim();
  const pathSecret = String(env.MCP_PATH_SECRET || '').trim() || token;
  return {
    token,
    pathSecret,
    production: env.NODE_ENV === 'production',
    configured: Boolean(token || pathSecret),
  };
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  // Haszowanie wyrównuje długości, więc porównanie jest stałoczasowe.
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * @param {{ authorization?: string, secret?: string }} input
 * @param {ReturnType<typeof mcpAuthConfig>} config
 * @returns {{ ok: true, via: string } | { ok: false, status: number, error: string }}
 */
export function checkMcpAuth(input, config) {
  if (!config.configured) {
    if (config.production) {
      return {
        ok: false,
        status: 503,
        error: 'Serwer MCP jest wyłączony: ustaw sekret MCP_AUTH_TOKEN przed publicznym wdrożeniem.',
      };
    }
    return { ok: true, via: 'open-dev' };
  }

  const header = String(input.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match && safeEqual(match[1].trim(), config.token)) {
    return { ok: true, via: 'bearer' };
  }
  if (input.secret && safeEqual(input.secret, config.pathSecret)) {
    return { ok: true, via: 'path' };
  }
  return {
    ok: false,
    status: 401,
    error: 'Brak autoryzacji MCP: podaj nagłówek Authorization: Bearer <MCP_AUTH_TOKEN> lub użyj adresu /api/mcp/<sekret>.',
  };
}
