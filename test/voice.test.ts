import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.js';
import {Weixin,decryptImage} from '../src/weixin.js';
import type {Bridge,Incoming} from '../src/bridge.js';
test('WeChat refuses unverified native output instead of silently sending an attachment',async()=>{
 const s=new Store(mkdtempSync(join(tmpdir(),'voice-protocol-')),randomBytes(32));const original=globalThis.fetch;let upload:any,sent:any;const raw=Buffer.from('mock silk payload');
 const wx=new Weixin(s,{receive:async(m:Incoming)=>{await m.replyVoice!({data:raw,wav:raw,duration:2420});}} as Bridge);
 globalThis.fetch=async(input,init)=>{
 const url=new URL(String(input));
 if(url.pathname.endsWith('getuploadurl')){upload=JSON.parse(String(init?.body));return Response.json({upload_param:'mock'});}
 if(url.pathname.endsWith('/upload')){assert.deepEqual(decryptImage(Buffer.from(init!.body as Uint8Array),upload.aeskey),raw);return new Response('',{headers:{'x-encrypted-param':'uploaded'}});}
 if(url.pathname.endsWith('sendmessage')){sent=JSON.parse(String(init?.body));return Response.json({ret:0});}
 throw Error('Unexpected endpoint');};
 try{await assert.rejects(()=>(wx as any).handle({message_type:1,message_id:1,from_user_id:'owner',context_token:'context',item_list:[]},{token:'mock',base:'https://ilinkai.weixin.qq.com',bot:'bot',user:'owner'},new AbortController().signal),{code:'NATIVE_VOICE_UNAVAILABLE'});
 assert.equal(upload,undefined);assert.equal(sent,undefined);
 }finally{globalThis.fetch=original;s.close();}
});
