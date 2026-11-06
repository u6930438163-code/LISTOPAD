import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
test('Ollama v2 only: idempotent configuration without fallback',()=>{
  const root=mkdtempSync(join(tmpdir(),'bastilla-ollama-'));
  try{
    mkdirSync(join(root,'scripts'));
    copyFileSync(resolve('scripts/setup-ollama.sh'),join(root,'scripts/setup-ollama.sh'));
    writeFileSync(join(root,'.env.local'),'GEMINI_API_KEY="PRESERVE"\nLLM_PROVIDERS="gemini,xai"\nOLLAMA_MODEL="auto"\n');
    for(let i=0;i<2;i++){
      const r=spawnSync('bash',[join(root,'scripts/setup-ollama.sh'),'--configure-only'],{cwd:root,encoding:'utf8'});
      assert.equal(r.status,0,r.stderr);
    }
    const output=readFileSync(join(root,'.env.local'),'utf8');
    for(const [key,value] of Object.entries({LLM_PROVIDERS:'ollama',OLLAMA_MODEL:'huihui_ai/qwen3-abliterated:14b-v2',CHAT_LOCAL_FALLBACK:'off',GEMINI_AS_FALLBACK:'off',BEST_FIT_ROUTER:'off'})){
      assert.ok(output.includes(key+'="'+value+'"'));
      assert.equal(output.split('\n').filter(x=>x.startsWith(key+'=')).length,1);
    }
    assert.match(output,/GEMINI_API_KEY="PRESERVE"/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
