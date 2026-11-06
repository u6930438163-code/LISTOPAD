#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
MODEL="huihui_ai/qwen3-abliterated:14b-v2"
BASE="http://127.0.0.1:11434"
MODE="${1:-}"
if [[ "$MODE" != "" && "$MODE" != "--configure-only" ]]; then echo "Usage: setup-ollama.sh [--configure-only]" >&2; exit 2; fi
command -v python3 >/dev/null || { echo "Missing python3" >&2; exit 1; }
umask 077
python3 - <<'PY'
import os, pathlib, re, tempfile
p=pathlib.Path('.env.local')
values=dict(LLM_PROVIDERS='ollama',OLLAMA_MODEL='huihui_ai/qwen3-abliterated:14b-v2',
 OLLAMA_BASE_URL='http://127.0.0.1:11434',OLLAMA_KEEP_ALIVE='24h',
 OLLAMA_NUM_CTX='4096',OLLAMA_NUM_PREDICT='3072',LLM_TIMEOUT_SEC='360',
 CHAT_LOCAL_FALLBACK='off',GEMINI_AS_FALLBACK='off',BEST_FIT_ROUTER='off')
old=p.read_text(encoding='utf-8') if p.exists() else ''
new=[]; seen=set()
for line in old.splitlines():
    m=re.match(r'^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=',line)
    if m and m.group(1) in values:
        key=m.group(1)
        if key not in seen:
            new.append(f'{key}="{values[key]}"')
            seen.add(key)
    else: new.append(line)
for key,value in values.items():
    if key not in seen: new.append(f'{key}="{value}"')
fd,temp=tempfile.mkstemp(dir='.',prefix='.env.local.')
try:
    with os.fdopen(fd,'w',encoding='utf-8') as f: f.write('\n'.join(new)+'\n')
    os.chmod(temp,0o600)
    os.replace(temp,p)
except BaseException:
    os.unlink(temp)
    raise
print('Configured .env.local: Qwen3 14B v2 only, fallback disabled.')
PY
if [[ "$MODE" == "--configure-only" ]]; then exit 0; fi
[[ "$(uname)" == Linux ]] || { echo "Linux only" >&2; exit 1; }
mkdir -p .runtime
ram="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
if [[ -r /sys/fs/cgroup/memory.max ]]; then
  limit="$(cat /sys/fs/cgroup/memory.max)"
  if [[ "$limit" =~ ^[0-9]+$ ]] && (( limit / 1024 < ram )); then ram=$((limit / 1024)); fi
fi
if (( ram < 10 * 1024 * 1024 )); then echo "ERROR: Qwen3 14B v2 needs roughly 10+ GiB RAM; no fallback. Use a larger Codespace." >&2; exit 1; fi
if ! command -v curl >/dev/null || ! command -v zstd >/dev/null; then
  command -v apt-get >/dev/null || { echo "Install curl and zstd first." >&2; exit 1; }
  if (( EUID == 0 )); then
    apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl zstd
  elif command -v sudo >/dev/null && sudo -n true >/dev/null 2>&1; then
    sudo -n apt-get update && sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl zstd
  else echo "sudo required for curl/zstd" >&2; exit 1; fi
fi
if ! command -v ollama >/dev/null; then
  f="$(mktemp)"
  trap 'rm -f -- "$f"' EXIT
  curl --fail --silent --show-error --location --retry 2 https://ollama.com/install.sh -o "$f"
  sh "$f"
fi
if ! curl -fsS --max-time 3 "$BASE/api/version" >/dev/null 2>&1; then
  nohup env OLLAMA_HOST=127.0.0.1:11434 ollama serve >.runtime/ollama-serve.log 2>&1 </dev/null &
fi
ready=0
for i in $(seq 1 60); do
  if curl -fsS --max-time 2 "$BASE/api/version" >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
if (( ready == 0 )); then echo "ERROR: Ollama offline; inspect .runtime/ollama-serve.log" >&2; exit 1; fi
if ! curl -fsS "$BASE/api/tags" | python3 -c 'import json,sys; x=json.load(sys.stdin); sys.exit(0 if any(m.get("name")=="huihui_ai/qwen3-abliterated:14b-v2" for m in x.get("models",[])) else 1)'; then
  available="$(df -Pk "$HOME" | awk 'END {print $4}')"
  if (( available < 11 * 1024 * 1024 )); then echo "ERROR: 11 GiB free disk needed; no fallback" >&2; exit 1; fi
  OLLAMA_HOST=127.0.0.1:11434 ollama pull "$MODEL"
fi
python3 - <<'PY'
import json,urllib.request,sys
model='huihui_ai/qwen3-abliterated:14b-v2'
body=json.dumps({'model':model,'stream':False,'think':False,
'options':{'num_ctx':4096,'num_predict':32},
'messages':[{'role':'user','content':'Odpowiedz jednym słowem: OK'}]}).encode()
try:
    req=urllib.request.Request('http://127.0.0.1:11434/api/chat',body,headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=240) as r: response=json.load(r)
    if response.get('model')!=model or not (response.get('message') or {}).get('content','').strip(): raise RuntimeError('No valid v2 response')
except Exception as exc: sys.exit('ERROR: '+str(exc)+' (no fallback)')
print('Qwen3 Abliterated v2 ready. No fallback.')
PY
