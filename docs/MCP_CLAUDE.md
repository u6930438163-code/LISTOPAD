# Serwer MCP BastillaOS dla Claude

Endpoint: `POST /api/mcp` (Streamable HTTP, JSON-RPC 2.0, bezstanowy).
Legacy SSE: `GET /api/mcp/sse` (odpowiedzi trafiają do strumienia, POST dostaje 202).
Narzędzia: `astyria_command`, `astyria_mission`, `kernel_status`, `chat_triad`.

## 1. Autoryzacja (obowiązkowa przed publikacją)

Narzędzia `astyria_*` wykonują polecenia systemowe, więc publiczny serwer **musi** mieć token.

1. Wygeneruj token: `openssl rand -hex 32`
2. AI Studio → Settings → Secrets → dodaj `MCP_AUTH_TOKEN` z tym tokenem.
3. Bez tokenu w produkcji (`NODE_ENV=production`, Cloud Run) `/api/mcp` zwraca 503.
   W prywatnym podglądzie AI Studio działa bez tokenu.

## 2. Publikacja

Adres podglądu `ais-dev-…run.app` jest prywatny (wymaga logowania Google) i **nie działa** dla
klientów MCP. Użyj w AI Studio **Deploy → Cloud Run** i weź publiczny adres `…run.app`.

## 3. Podłączenie

**claude.ai / aplikacja Claude** (nie da się dodać nagłówka, więc token jest w ścieżce):
Settings → Connectors → Add custom connector →
`https://<adres>.run.app/api/mcp/<MCP_AUTH_TOKEN>`

**Claude Code:**
```bash
claude mcp add --transport http bastilla https://<adres>.run.app/api/mcp \
  --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
```

**Test:**
```bash
curl -s -X POST https://<adres>.run.app/api/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <MCP_AUTH_TOKEN>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
Poprawna odpowiedź to JSON z listą narzędzi. Jeśli przychodzi HTML, adres jest prywatny.

## 4. „Nie widać zmian w podglądzie AI Studio”

AI Studio trzyma własną kopię projektu i **nie pobiera sam** commitów z GitHuba
(od Claude, Codexa, agentów Triady ani z GitHub Actions).

1. AI Studio → Settings → GitHub → **pobierz zmiany (pull)** z repo `LISTOPAD`, gałąź `main`.
2. Podgląd ma wyłączone śledzenie plików (`DISABLE_HMR=true`), więc po pobraniu **zrestartuj
   podgląd** (przycisk restartu serwera), a nie tylko odśwież kartę.
3. Jeśli pull zgłasza konflikt, najpierw wypchnij (push) zmiany z AI Studio, potem pobierz.
4. Opublikowana wersja na Cloud Run zmienia się dopiero po ponownym **Deploy**.
