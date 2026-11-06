# Ollama Qwen3 Abliterated v2 — LISTOPAD

Czat czterech agentów korzysta **wyłącznie** z modelu `huihui_ai/qwen3-abliterated:14b-v2` pod `http://127.0.0.1:11434`. Inni dostawcy, lokalne NLP i best-fit nie zastępują tego modelu. Błąd Ollamy jest widoczny jako błąd czatu.

## Instalacja Linux / Debian / Codespaces

```bash
npm run setup:ollama
npm run check:ollama
```

Skrypt instaluje Ollamę, pobiera **dokładnie v2**, aktualizuje tylko kontrolowane wpisy w ignorowanym pliku `.env.local` (pozostałe sekrety zachowuje), i sprawdza prawdziwą odpowiedź. Jeśli serwer aplikacji działał wcześniej, zrestartuj Node.

W Codespaces `postStartCommand` najpierw ustawia model bez fallbacku, następnie automatycznie rozpoczyna instalację w tle. Log: `.runtime/ollama-v2-setup.log`. Wymaga około 10+ GiB RAM i 11 GiB wolnego miejsca; mniejsza maszyna zgłasza błąd, nie przełącza modelu. Port 11434 pozostaje lokalny, bez publicznego dostępu.

Konfiguracja bez pobierania: `bash scripts/setup-ollama.sh --configure-only`.
Model jest tekstowy: zdjęcia i PDF nie aktywują zastępczego silnika. Sam commit nie instaluje modelu na hostingu AI Studio.

Źródło: https://huggingface.co/huihui-ai/Huihui-Qwen3-14B-abliterated-v2
