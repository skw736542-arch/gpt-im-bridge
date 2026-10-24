import test from 'node:test';
import assert from 'node:assert/strict';
import { QQBot } from '@tencent-connect/qqbot-nodejs';
import { encode, isSilk } from 'silk-wasm';
test('official QQ sendVoice uploads voice type and sends media message with reply id',async()=>{
 const original=globalThis.fetch;let upload:any,message:any;
 const encoded=await encode(Buffer.alloc(24000*2),24000);
 globalThis.fetch=async(input,init)=>{const url=String(input);const body=JSON.parse(String(init?.body??'{}'));
 if(url.includes('getAppAccessToken'))return Response.json({access_token:'test-token',expires_in:7200});
 if(url.endsWith('/files')){upload=body;return Response.json({file_uuid:'test',file_info:'test-info',ttl:60});}
 if(url.endsWith('/messages')){message=body;return Response.json({id:'voice-reply'});}throw Error('Unexpected endpoint');};
 try{const bot=new QQBot({appId:'123456',appSecret:'mock-secret'});await bot.sendVoice({scope:'c2c',targetId:'owner',msgId:'incoming'},{buffer:Buffer.from(encoded.data)});
 assert.equal(upload.file_type,3);assert(isSilk(Buffer.from(upload.file_data,'base64')));assert.equal(message.msg_type,7);assert.equal(message.msg_id,'incoming');assert.equal(message.media.file_info,'test-info');
 }finally{globalThis.fetch=original;}
});
