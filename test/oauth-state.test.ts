import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../src/store.js';
import { AI, publicError } from '../src/ai.js';
import { OAuthManager } from '../src/oauth.js';
test('repeated same-provider clicks preserve the pending OAuth session; callback exchange and saved states differ',async()=>{
  const store=new Store(mkdtempSync(join(tmpdir(),'bridge-oauth-state-')),randomBytes(32));const ai=new AI(store);const manager=new OAuthManager(ai);let calls=0;
  ai.models.login=async(_provider,_type,interaction)=>{calls++;interaction.notify({type:'auth_url',url:'https://example.test/authorize'});await interaction.prompt({type:'manual_code',message:'Callback URL',signal:interaction.signal});interaction.notify({type:'progress',message:'Exchanging authorization code for tokens...'});await delay(30);return {type:'oauth',access:'mock',refresh:'mock',expires:Date.now()+3600000};};
  try{const first=await manager.start('openai');const second=await manager.start('openai');assert.equal(first.id,second.id);assert.equal(calls,1);assert.equal(first.stage,'awaiting_user');manager.answer(first.id,'mock callback');await delay(1);assert.equal(manager.view()?.stage,'exchanging');assert.equal(manager.view()?.state,'pending');await delay(50);assert.equal(manager.view()?.state,'authorized');assert.equal(manager.view()?.stage,'saved');}finally{await manager.cancel();store.close();}
});
test('token-exchange errors retain useful HTTP status without leaking upstream secrets',()=>{const error=publicError(new Error('OpenAI OAuth token request failed (403): sensitive-code-or-token'));assert.equal(error.code,'OAUTH_EXCHANGE_FAILED');assert(error.message.includes('403'));assert(!error.message.includes('sensitive-code-or-token'));});
