# LISTOPAD — real internet images via SearXNG

This is **search**, not AI image generation. No paid search API key required. The SearXNG service must be running with outbound internet.

## Start (Linux / Codespaces with Docker Compose)
From repository root:

```sh
cd integrations/searxng
printf 'SEARXNG_SECRET=%s\n' "$(openssl rand -hex 32)" > .env
docker compose up -d
curl -fsS 'http://127.0.0.1:8080/search?q=cats&categories=images&format=json'
```

The .env file is ignored by git. Run the LISTOPAD app with this server-side setting:

```sh
SEARXNG_BASE_URL=http://127.0.0.1:8080
```

If LISTOPAD runs in a different container, 127.0.0.1 points to that container; use reachable private DNS name. Google AI Studio preview and remote deployments do not automatically start local Docker Compose; deploy SearXNG separately and configure a reachable URL. Never expose SearXNG publicly without authentication and TLS.

## Test
- Status: GET /api/images/health
- JSON photo results: GET /api/images/search?q=Warszawa
- Chat: /images Warszawa
- Chat: Pokaż mi zdjęcia Warszawy nocą
- Agent result marker: [SEARCH_IMAGES: Warszawa nocą]
- MCP tool: search_images with query
- npm test (includes tests/searxng.test.mjs)

Results are loaded by the user's browser from the original image hosts with source links. Some sites forbid hotlink embedding; a source link remains available. No fallback or fabricated stock photos. AI image generation is a separate OpenAI Images endpoint requiring OPENAI_API_KEY. If JSON requests return 403, enable json under search.formats in SearXNG.
