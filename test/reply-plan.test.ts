import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {replyPlan} from '../src/reply-plan.js';
import {Bridge,conversationKey,type Incoming} from '../src/bridge.js';
import {AI} from '../src/ai.js';
import {Store} from '../src/store.js';
import {readProfile,personaCommand,personaPrompt,updateTopic} from '../src/personas.js';

test('plans preserve distinct messages, suppress exact repeated reading, and keep unavailable/long voice as full text',()=>{
 const raw=JSON.stringify({messages:[{type:'text',text:'想起你刚才说的事。'},{type:'voice',text:'想起你刚才说的事。'},{type:'voice',text:'慢慢说，我听着呢。'}]});
 assert.deepEqual(replyPlan(raw,true).parts.map(x=>x.type),['text','voice']);
 assert.deepEqual(replyPlan(raw,false).parts.map(x=>x.type),['text','text']);
 const text='长'.repeat(200);assert.equal(replyPlan(JSON.stringify({messages:[{type:'voice',text}]}),true).parts[0]?.text,text);
 assert.deepEqual(replyPlan('普通模型文字',true).parts,[{type:'text',text:'普通模型文字'}]);
 assert.equal(replyPlan(JSON.stringify({messages:[{type:'shell',text:'action'}]}),true).parts[0]?.type,'text');
});

test('conversation chooses text or voice without double delivery; natural voice request uses model and preserves history',async()=>{
 const store=new Store(mkdtempSync(join(tmpdir(),'reply-plan-')),randomBytes(32));
 try{
  const c=store.config();Object.assign(c.onebot,{enabled:true,allowUsers:['user']});c.voiceReplies=true;store.saveConfig(c);
  const ai=new AI(store),texts:string[]=[],voices:string[]=[],prompts:any[]=[];
  let response={messages:[{type:'text',text:'你刚刚提到面试。'},{type:'text',text:'我们可以接着聊那个。'}]};
  ai.chat=async(_k,m,_s,p)=>{prompts.push({m,p});return {text:JSON.stringify(response),message:{role:'assistant',content:[],timestamp:Date.now()} as never};};
  const bridge=new Bridge(ai,async text=>({data:Buffer.from(text),duration:1000,format:'wav'}));
  const m:Incoming={channel:'onebot',account:'bot',sender:'user',id:'1',text:'面试有点紧张',reply:async s=>{texts.push(s);},replyImage:async()=>{},replyVoice:async v=>{voices.push(v.data.toString());}};
  await bridge.receive(m);assert.equal(texts.length,2);assert.equal(voices.length,0);
  response={messages:[{type:'voice',text:'我们慢慢把刚才的面试想一遍。'}]};
  await bridge.receive({...m,id:'2',text:'发段语音给我'});assert.equal(texts.length,2);assert.deepEqual(voices,['我们慢慢把刚才的面试想一遍。']);assert.equal(prompts.length,2);
  assert(prompts[1].p.includes('希望收到一段语音'));const history=store.history<any>(conversationKey(m));assert(history.at(-1).content[0].text.includes('面试'));assert(!history.at(-1).content[0].text.includes('messages'));
 }finally{store.close();}
});

test('voice synthesis failure falls back once to its text; revocation while synthesizing prevents delivery',async()=>{
 const store=new Store(mkdtempSync(join(tmpdir(),'reply-failure-')),randomBytes(32));
 try{
  const c=store.config();Object.assign(c.onebot,{enabled:true,allowUsers:['user']});c.voiceReplies=true;store.saveConfig(c);
  const ai=new AI(store);ai.chat=async()=>({text:JSON.stringify({messages:[{type:'voice',text:'接着刚才说。'}]}),message:{role:'assistant',content:[],timestamp:Date.now()} as never});
  const sent:string[]=[];const m:Incoming={channel:'onebot',account:'bot',sender:'user',id:'1',text:'hi',reply:async s=>{sent.push(s);},replyImage:async()=>{},replyVoice:async()=>{sent.push('voice');}};
  await new Bridge(ai,async()=>{throw Error('offline');}).receive(m);assert.deepEqual(sent,['接着刚才说。']);
  await new Bridge(ai,async()=>{const c=store.config();c.onebot.allowUsers=[];store.saveConfig(c);return {data:Buffer.alloc(1),duration:100};}).receive({...m,id:'2'});assert.equal(sent.length,1);
 }finally{store.close();}
});

test('recent topics retain multiple turns and role isolation; clearing and forgetting do not resurrect topics',()=>{
 const store=new Store(mkdtempSync(join(tmpdir(),'topic-rolling-')),randomBytes(32));
 try{const p=readProfile(store,'user');updateTopic(store,p,'准备面试');updateTopic(store,p,'今天下雨');assert(personaPrompt(store,p).includes('面试'));assert(personaPrompt(store,p).includes('下雨'));
 personaCommand(store,p,'/role coach');assert(!personaPrompt(store,p).includes('准备面试'));personaCommand(store,p,'/role general');personaCommand(store,p,'/topic clear');updateTopic(store,p,'计划冰岛露营');assert(!personaPrompt(store,p).includes('准备面试'));
 personaCommand(store,p,'/forget all');updateTopic(store,p,'之后的话题');assert(!personaPrompt(store,p).includes('计划冰岛露营'));
 }finally{store.close();}
});
