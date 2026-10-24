import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {encode,isSilk} from 'silk-wasm';
import {Store} from '../src/store.js';
import {AI} from '../src/ai.js';
import {Bridge} from '../src/bridge.js';
import {OneBot} from '../src/onebot.js';
import {localMedia,OneBotClient} from '../src/onebot-client.js';
import {proactiveDue,reserveAttempt,clockParts,type SocialState} from '../src/social.js';
import {defaults,configSchema} from '../src/config.js';
const require=createRequire(import.meta.url);
async function until(fn:()=>boolean){for(let i=0;i<200;i++){if(fn())return;await delay(20);}throw new Error('Condition timeout');}
async function fixture(){const {WebSocketServer}=require('ws');const wss=new WebSocketServer({port:0,host:'127.0.0.1'});await new Promise<void>(r=>wss.on('listening',r));const sent:any[]=[];let socket:any;
 wss.on('connection',(ws:any,req:any)=>{assert.equal(new URL(req.url,'http://localhost').searchParams.get('access_token'),'secret-test');socket=ws;ws.on('message',(b:Buffer)=>{const r=JSON.parse(b.toString());let data:any={};if(r.action==='get_login_info')data={user_id:12345678,nickname:'石原'};else if(r.action==='get_status')data={online:true,good:true};else if(r.action.startsWith('send_')){sent.push(r);data={message_id:sent.length};}ws.send(JSON.stringify({status:'ok',retcode:0,data,echo:r.echo}));});});
 const store=new Store(mkdtempSync(join(tmpdir(),'onebot-test-')),randomBytes(32));const c=defaults();c.onebot={...c.onebot,enabled:true,wsUrl:`ws://127.0.0.1:${wss.address().port}`,account:'12345678',allowUsers:['87654321'],mergeMs:300};store.saveConfig(c);store.putSecret('onebot',{token:'secret-test'});const ai=new AI(store);const prompts:any[]=[];ai.chat=async(_k,m,_s,p)=>{prompts.push({m,p});return {text:'你好，我是石原。',message:{role:'assistant',content:[{type:'text',text:'你好，我是石原。'}],timestamp:Date.now()} as never};};const ob=new OneBot(store,new Bridge(ai));
 const emit=(id:number,text:string,extra:any={})=>socket.send(JSON.stringify({post_type:'message',message_type:'private',self_id:12345678,user_id:87654321,message_id:id,message:[{type:'text',data:{text}}],...extra}));
 return {store,ob,ai,prompts,sent,emit,async start(){ob.start();await until(()=>ob.state==='connected');},async close(){await ob.stop();for(const c of wss.clients)c.terminate();await new Promise<void>(r=>wss.close(r));store.close();}};
}
test('OneBot real WebSocket: account binding, whitelist, burst merge, dedupe and persona context',async()=>{const f=await fixture();try{await f.start();f.emit(1,'第一句');f.emit(2,'第二句');f.emit(2,'第二句');f.emit(3,'陌生人',{user_id:99999999});await until(()=>f.sent.length===1);assert.equal(f.prompts.length,1);assert.equal(f.prompts[0].m[0].content[0].text,'第一句\n第二句');assert(f.prompts[0].p.includes('石原'));assert.equal(f.sent[0].action,'send_private_msg');assert.equal(f.sent[0].params.user_id,'87654321');assert.equal(f.sent[0].params.message[0].type,'text');assert(!JSON.stringify(f.ob.status()).includes('secret-test'));}finally{await f.close();}});
test('OneBot native speech uses record SILK, never a file attachment; rejects revoked users',async()=>{const f=await fixture();try{await f.start();const m=(f.ob as any).make('87654321','voice');const silk=await encode(Buffer.alloc(24000*2),24000);await m.replyVoice({data:Buffer.from(silk.data),duration:1000});const segment=f.sent[0].params.message[0];assert.equal(segment.type,'record');assert(isSilk(Buffer.from(segment.data.file.slice(9),'base64')));const c=f.store.config();c.onebot.allowUsers=[];f.store.saveConfig(c);await assert.rejects(()=>m.reply('no'),/白名单/);assert.equal(f.sent.length,1);}finally{await f.close();}});
test('OneBot proactive continuation persists budget, suppresses unanswered repeats and supports opt-out',async()=>{const f=await fixture();try{const c=f.store.config();Object.assign(c.onebot,{proactive:true,proactiveUsers:['87654321'],idleMinutes:10,quietStart:0,quietEnd:0});f.store.saveConfig(c);await f.start();f.emit(1,'今天准备面试');await until(()=>f.sent.length===1);await f.ob.tick(Date.now()+41*60000);assert.equal(f.sent.length,2);assert(f.prompts[1].p.includes('主动联系'));await f.ob.tick(Date.now()+52*60000);assert.equal(f.sent.length,2);f.emit(2,'关闭主动聊天');await until(()=>f.sent.length===3);await f.ob.tick(Date.now()+40*60000);assert.equal(f.sent.length,3);const social=f.store.secret<SocialState>('social:onebot:12345678:87654321')!;assert(social.paused);assert.equal(social.attempts,1);}finally{await f.close();}});
test('quiet hours, day rollover, limits, expiry, no catch-up when unanswered',()=>{const c=defaults().onebot;Object.assign(c,{enabled:true,proactive:true,idleMinutes:10});const noon=Date.parse('2026-10-23T12:00:00+08:00');const s:SocialState={lastIncoming:noon-3600000,lastAttempt:0,unanswered:false,paused:false,day:'',attempts:0};assert(proactiveDue(c,s,noon));assert(!proactiveDue(c,s,Date.parse('2026-10-23T23:00:00+08:00')));const used=reserveAttempt(s,noon);assert(!proactiveDue(c,used,noon+86400000));assert(!proactiveDue(c,{...s,day:clockParts(noon).day,attempts:2},noon));assert(!proactiveDue(c,{...s,lastIncoming:noon-8*86400000},noon));});

test('OneBot silent initiative is not sent or counted as unanswered and is not immediately reevaluated',async()=>{
 const f=await fixture();try{
  const c=f.store.config();Object.assign(c.onebot,{proactive:true,proactiveUsers:['87654321'],idleMinutes:10,quietStart:0,quietEnd:0});f.store.saveConfig(c);await f.start();f.emit(1,'最近在学吉他');await until(()=>f.sent.length===1);
  let checks=0;f.ai.chat=async()=>{checks++;return {text:'[SILENT]',message:{role:'assistant',content:[],timestamp:Date.now()} as never};};
  const now=Date.now()+41*60000;await f.ob.tick(now);assert.equal(f.sent.length,1);let state=f.store.secret<SocialState>('social:onebot:12345678:87654321')!;assert.equal(state.unanswered,false);assert.equal(state.attempts,0);assert.equal(state.checks,1);
  await f.ob.tick(now+60000);assert.equal(checks,1);await f.ob.tick(now+41*60000);assert.equal(checks,2);assert.equal(f.sent.length,1);
 }finally{await f.close();}
});
test('gateway URLs limited to explicit loopback; cached media cannot escape allowed directory',async()=>{for(const wsUrl of ['ws://evil.test:3001','ws://127.0.0.1:3001/?access_token=x','ws://user@127.0.0.1:3001'])assert(!configSchema.safeParse({onebot:{wsUrl}}).success);const root=mkdtempSync(join(tmpdir(),'media-test-'));mkdirSync(join(root,'cache'));writeFileSync(join(root,'private.txt'),'private');writeFileSync(join(root,'cache','voice.wav'),'voice');assert.equal((await localMedia(join(root,'cache','voice.wav'),join(root,'cache'))).toString(),'voice');await assert.rejects(()=>localMedia(join(root,'private.txt'),join(root,'cache')),/缓存目录/);await assert.rejects(()=>new OneBotClient(()=>{},()=>{}).connect('ws://example.com','secret'),/本机/);});
test('OneBot account mismatch cannot send or invoke model',async()=>{const f=await fixture();try{const c=f.store.config();c.onebot.account='11111111';f.store.saveConfig(c);f.ob.start();await until(()=>!!f.ob.error);assert(f.ob.error?.includes('账号'));assert.equal(f.prompts.length,0);assert.equal(f.sent.length,0);}finally{await f.close();}});
