import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Store } from '../src/store.js';
import { AI } from '../src/ai.js';
import { Bridge, conversationKey, type Incoming } from '../src/bridge.js';
import { readProfile, saveProfile, personaCommand, personaPrompt, profileId, historyKey, updateTopic } from '../src/personas.js';
import { buildServer } from '../src/server.js';
test('topic continuity, explicit confirmation, expiry and mode isolation',()=>{
 const s=new Store(mkdtempSync(join(tmpdir(),'continuity-')),randomBytes(32));try{const p=readProfile(s,'a');
 assert(updateTopic(s,p,'我喜欢安静的咖啡馆'));assert.equal(p.memories.general.length,0);assert(personaPrompt(s,p).includes('咖啡馆'));
 personaCommand(s,p,'确认记忆');assert.equal(p.memories.general.length,1);assert.equal(p.pending,undefined);
 personaCommand(s,p,'/role coach');assert(!personaPrompt(s,p).includes('咖啡馆'));assert(personaPrompt(s,p).includes(s.config().personas.companionName));
 updateTopic(s,p,'我喜欢雨天');p.pending!.expires=0;personaCommand(s,p,'确认记忆');assert.equal(p.memories.coach.length,0);
 personaCommand(s,p,'/memory off');updateTopic(s,p,'我喜欢猫');assert.deepEqual(p.topics,{});
 }finally{s.close();}
});
test('explicit encrypted memories persist across reopen, isolate roles/users, delete old history and disable injection',()=>{
 const dir=mkdtempSync(join(tmpdir(),'persona-')),key=randomBytes(32);let s=new Store(dir,key);
 try{let p=readProfile(s,'user-a');personaCommand(s,p,'/role coach');personaCommand(s,p,'记住：我正在准备英语面试');
 assert(!JSON.stringify(s.db.prepare('SELECT * FROM secrets').all()).includes('英语面试'));
 s.close();s=new Store(dir,key);p=readProfile(s,'user-a');assert.equal(p.role,'coach');assert(personaPrompt(s,p).includes('英语面试'));
 assert(!personaPrompt(s,readProfile(s,'user-b')).includes('英语面试'));
 personaCommand(s,p,'/role companion');assert(!personaPrompt(s,p).includes('英语面试'));
 personaCommand(s,p,'/role coach');s.saveHistory(historyKey(p.scope,p.role),['old']);personaCommand(s,p,'/memory off');assert(!personaPrompt(s,p).includes('英语面试'));assert.equal(s.history(historyKey(p.scope,p.role)).length,0);
 personaCommand(s,p,'/memory on');personaCommand(s,p,'/forget 1');assert.equal(readProfile(s,'user-a').memories.coach.length,0);
 assert.equal(personaCommand(s,p,'普通聊天不会保存'),undefined);assert.equal(p.memories.coach.length,0);
 }finally{s.close();}
});
test('bridge routes role commands without model calls and injects only current role memories',async()=>{
 const s=new Store(mkdtempSync(join(tmpdir(),'persona-bridge-')),randomBytes(32));try{
 const c=s.config();c.weixin={enabled:true,allowUsers:['a','b']};s.saveConfig(c);const ai=new AI(s);const captured:string[]=[];
 ai.chat=async(_k,_m,_signal,p)=>{captured.push(p!);return {text:'test',message:{role:'assistant',content:[],timestamp:Date.now()} as never};};
 const base:Incoming={channel:'weixin',account:'bot',sender:'a',id:'1',text:'/role coach',reply:async()=>{},replyImage:async()=>{}};
 const send=async(text:string,sender='a')=>new Bridge(ai).receive({...base,text,sender,id:randomBytes(8).toString('hex')});
 await send('/role coach');await send('/remember privateFact');assert.equal(captured.length,0);await send('hi');assert(captured[0]!.includes('privateFact'));
 await send('/role companion');await send('hi');assert(!captured[1]!.includes('privateFact'));await send('hi','b');assert(!captured[2]!.includes('privateFact'));
 assert.equal(readProfile(s,conversationKey(base)).role,'companion');
 }finally{s.close();}
});
test('admin memory API requires auth/CSRF, validates, prevents stale writes and clears edited role history',async()=>{
 const s=new Store(mkdtempSync(join(tmpdir(),'persona-api-')),randomBytes(32));const {app}=await buildServer(s,{origin:'http://127.0.0.1:8787',password:'test-password-long-enough',secure:false,staticRoot:resolve('public')});
 try{const base={host:'127.0.0.1:8787',origin:'http://127.0.0.1:8787'};
 assert.equal((await app.inject({url:'/api/personas/profiles',headers:base})).statusCode,401);
 const login=await app.inject({method:'POST',url:'/api/login',headers:base,payload:{password:'test-password-long-enough'}});const cookie=login.cookies[0]!.name+'='+login.cookies[0]!.value;
 const state=(await app.inject({url:'/api/state',headers:{...base,cookie}})).json();const headers={...base,cookie,'x-csrf-token':state.csrf};
 const p=readProfile(s,'scope');saveProfile(s,p);s.saveHistory(historyKey('scope','coach'),['old']);const url='/api/personas/profiles/'+profileId('scope');const payload={role:'coach',enabled:true,memories:['fact'],updated:p.updated};
 assert.equal((await app.inject({method:'PUT',url,headers:{...base,cookie},payload})).statusCode,403);
 assert.equal((await app.inject({method:'PUT',url,headers,payload:{...payload,memories:['x'.repeat(501)]}})).statusCode,400);
 assert.equal((await app.inject({method:'PUT',url,headers,payload:{...payload,updated:0}})).statusCode,400);
 assert.equal((await app.inject({method:'PUT',url,headers,payload})).statusCode,200);assert.equal(readProfile(s,'scope').memories.coach[0],'fact');assert.equal(s.history(historyKey('scope','coach')).length,0);
 }finally{await app.close();s.close();}
});
