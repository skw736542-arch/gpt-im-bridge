import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { Store } from '../src/store.js';
import { AI } from '../src/ai.js';
import { OAuthManager } from '../src/oauth.js';
import { Bridge } from '../src/bridge.js';
import { Weixin } from '../src/weixin.js';
import { QQ } from '../src/qq.js';
function fixture(){const store=new Store(mkdtempSync(join(tmpdir(),'bridge-protocol-')),randomBytes(32));return {store,ai:new AI(store)};}
async function until(fn:()=>boolean,ms=5000){const start=Date.now();while(!fn()){if(Date.now()-start>ms)throw new Error('Test condition timed out');await delay(20);}}
test('Pi OAuth: real PKCE URL and loopback callback; mocked token exchange; wrong state rejected',async()=>{
  const {store,ai}=fixture();const oauth=new OAuthManager(ai);const original=globalThis.fetch;let exchanged=false;
  globalThis.fetch=async(input,init)=>{if(String(input)==='https://auth.openai.com/api/accounts/oauth/token'){const body=new URLSearchParams(String(init?.body));assert.equal(body.get('grant_type'),'authorization_code');assert.equal(body.get('client_id'),'issued-test-client');assert(body.get('code_verifier'));exchanged=true;return Response.json({access_token:'mock-access',refresh_token:'mock-refresh',id_token:'mock-id',expires_in:3600,scope:'openid chatgpt.tokens.use.direct'});}return original(input,init);};
  try{await oauth.start('openai');await until(()=>!!oauth.view()?.events.some(x=>x.type==='auth_url')||oauth.view()?.state==='error');const view=oauth.view()!;assert.equal(view.state,'pending',view.error);const event=view.events.find(x=>x.type==='auth_url')!;assert.equal(event.type,'auth_url');if(event.type!=='auth_url')throw new Error('No auth URL');const u=new URL(event.url);assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert(u.searchParams.get('scope')?.includes('chatgpt.tokens.use.direct'));assert(u.searchParams.get('ext_agent_host_id')?.startsWith('urn:uuid:'));const callback=new URL(u.searchParams.get('redirect_uri')!);callback.search=new URLSearchParams({state:'bad-state',code:'mock-code',client_id:'issued-test-client'}).toString();assert.equal((await original(callback)).status,400);callback.searchParams.set('state',u.searchParams.get('state')!);assert.equal((await original(callback)).status,200);await until(()=>oauth.view()?.state==='authorized');assert(exchanged);assert.equal((await ai.credentials.read('openai'))?.type,'oauth');await oauth.logout('openai');assert.equal(await ai.credentials.read('openai'),undefined);await oauth.start('openai');await until(()=>!!oauth.view()?.prompt);await oauth.cancel();assert.equal(oauth.view()?.state,'cancelled');}finally{await oauth.cancel();globalThis.fetch=original;store.close();}
});
test('iLink mocked protocol: QR login, long poll, whitelist, reply token, duplicate suppression, persistent cursor',async()=>{
  const {store,ai}=fixture();const original=globalThis.fetch;const sent:Record<string,unknown>[]=[];let fetched=false,calls=0;
  const wx=new Weixin(store,new Bridge(ai));ai.chat=async()=>({text:'mock GPT response',message:{role:'assistant',content:[{type:'text',text:'mock GPT response'}],timestamp:Date.now()} as never});
  globalThis.fetch=async(input,init)=>{const u=new URL(String(input));const body=init?.body?JSON.parse(String(init.body)):{};
    if(u.pathname.endsWith('/get_bot_qrcode'))return Response.json({qrcode:'test-qr',qrcode_img_content:'https://weixin.qq.com/mock-qr'});
    if(u.pathname.endsWith('/get_qrcode_status'))return Response.json({status:'confirmed',bot_token:'secret-wx-token',ilink_bot_id:'bot',ilink_user_id:'owner',baseurl:'https://ilinkai.weixin.qq.com'});
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer secret-wx-token');
    if(u.pathname.endsWith('/getupdates')){calls++;const msg={message_id:1,message_type:1,from_user_id:'owner',context_token:'reply-context',item_list:[{type:1,text_item:{text:'hello'}}]};const msgs=fetched?[]:[msg,msg,{...msg,message_id:2,from_user_id:'stranger'}];fetched=true;return Response.json({ret:0,msgs,get_updates_buf:'persisted-cursor'});}
    if(u.pathname.endsWith('/sendmessage')){sent.push(body.msg);return Response.json({ret:0});}throw new Error('Unexpected endpoint');
  };
  try{const qr=await wx.startQR();assert(qr?.image.startsWith('data:image/png'));await wx.pollQR(qr!.id);assert.equal(wx.status().authorized,true);const c=store.config();c.weixin={enabled:true,allowUsers:['owner']};store.saveConfig(c);wx.start();await until(()=>calls>0&&sent.length===1&&store.secret('weixinCursor')==='persisted-cursor');await wx.stop();assert.equal(sent.length,1);assert.equal(sent[0]!.context_token,'reply-context');assert.equal(sent[0]!.to_user_id,'owner');assert(store.get('lastReply:weixin',null));assert.equal(store.secret('weixinCursor'),'persisted-cursor');await wx.logout();assert.equal(wx.status().authorized,false);}finally{await wx.stop();globalThis.fetch=original;store.close();}
});
test('QQ official SDK integration: real local WebSocket handshake and message event; mocked REST; bridge replies',async()=>{
  const require=createRequire(import.meta.url);const {WebSocketServer}=require('ws');const wss=new WebSocketServer({port:0,host:'127.0.0.1'});await new Promise<void>(r=>wss.on('listening',r));const port=wss.address().port;
  const {store,ai}=fixture();const qq=new QQ(store,new Bridge(ai));const original=globalThis.fetch;const sent:unknown[]=[];let messages=0;
  ai.chat=async()=>({text:'mock QQ reply',message:{role:'assistant',content:[{type:'text',text:'mock QQ reply'}],timestamp:Date.now()} as never});
  globalThis.fetch=async(input,init)=>{const u=String(input);if(u.includes('getAppAccessToken'))return Response.json({access_token:'mock-qq-token',expires_in:7200});if(u.includes('/gateway'))return Response.json({url:`ws://127.0.0.1:${port}`});if(u.includes('/messages')){sent.push(JSON.parse(String(init?.body)));return Response.json({id:'reply-id',timestamp:new Date().toISOString()});}throw new Error(`Unexpected mock endpoint: ${new URL(u).pathname}`);};
  wss.on('connection',(ws: {send:(s:string)=>void;on:(n:string,f:(d:Buffer)=>void)=>void})=>{ws.send(JSON.stringify({op:10,d:{heartbeat_interval:60000}}));ws.on('message',raw=>{const payload=JSON.parse(raw.toString());if(payload.op===1)ws.send(JSON.stringify({op:11}));if(payload.op===2){ws.send(JSON.stringify({op:0,t:'READY',s:1,d:{session_id:'mock-session',user:{id:'bot'},version:1}}));const event={op:0,t:'C2C_MESSAGE_CREATE',s:2,d:{id:'qq-msg-1',author:{user_openid:'owner'},content:'hello',timestamp:new Date().toISOString()}};ws.send(JSON.stringify(event));messages++;}});});
  try{const c=store.config();c.qq={enabled:true,allowUsers:['owner'],allowGroups:[],groupsEnabled:false};store.saveConfig(c);store.putSecret('qq',{appId:'123456',appSecret:'mock-secret'});qq.start();await until(()=>sent.length===1,10000);assert.equal(messages,1);assert.equal((sent[0] as {content:string}).content,'mock QQ reply');assert(store.get('lastReply:qq',null));}finally{await qq.stop();for(const client of wss.clients)client.terminate();await new Promise<void>(r=>wss.close(r));globalThis.fetch=original;store.close();}
});
