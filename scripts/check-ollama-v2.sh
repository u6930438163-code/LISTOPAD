#!/usr/bin/env bash
set -Eeuo pipefail
python3 - <<'PY'
import sys,json,urllib.request
model='huihui_ai/qwen3-abliterated:14b-v2'
base='http://127.0.0.1:11434'
try:
    with urllib.request.urlopen(base+'/api/tags',timeout=5) as r: tags=json.load(r)
    if not any(m.get('name')==model for m in tags.get('models',[])): raise RuntimeError('Model v2 not installed')
    body=json.dumps({'model':model,'stream':False,'think':False,'messages':[{'role':'user','content':'Potwierdz działanie'}],'options':{'num_predict':48}}).encode()
    req=urllib.request.Request(base+'/api/chat',body,headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=240) as r: reply=json.load(r)
    if reply.get('model')!=model or not (reply.get('message') or {}).get('content','').strip(): raise RuntimeError('Model did not answer')
except Exception as exc: sys.exit('ERROR: '+str(exc)+'; no fallback')
print('OK: '+model+' responding without fallback.')
PY
