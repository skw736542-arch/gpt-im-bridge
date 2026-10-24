import { QQBot, contentSanitizer, mentionGate, messageFilter } from '@tencent-connect/qqbot-nodejs';
import { Store } from './store.js';
import { Bridge } from './bridge.js';
import { publicError } from './ai.js';
import { download, imageMime } from './network.js';
import { setTimeout as delay } from 'node:timers/promises';
import { qqVoice } from './voice-engine.js';
export class QQ {
  state='stopped';error:string|null=null;private bot?:QQBot;private controller?:AbortController;private task?:Promise<void>;
  constructor(private store:Store,private bridge:Bridge){}
  status(){return {state:this.state,error:this.error,authorized:!!this.store.secret('qq'),lastSender:this.store.get('lastSender:qq',null),lastReply:this.store.get('lastReply:qq',null)};}
  start(){
    if(this.bot||!this.store.config().qq.enabled)return;const credentials=this.store.secret<{appId:string;appSecret:string}>('qq');if(!credentials)return;
    const controller=new AbortController();this.controller=controller;
    const quiet={debug:()=>{},info:()=>{},warn:()=>{},error:()=>{this.store.log('qq','SDK_ERROR','QQ SDK 请求失败，请检查凭证、网络和平台权限。');}};
    const bot=new QQBot({...credentials,logger:quiet});this.bot=bot;this.state='connecting';
    bot.use(messageFilter({skipSelfEcho:true}));bot.use(mentionGate({requireMentionInGroup:true}));bot.use(contentSanitizer({stripBotMention:true}));
    bot.on('ready',()=>{this.state='connected';this.error=null;});bot.on('resumed',()=>{this.state='connected';this.error=null;});bot.on('disconnected',()=>{this.state='reconnecting';});bot.on('error',e=>{this.error=publicError(e).message;this.store.log('qq','CONNECTION_ERROR',this.error);});
    bot.on('message',async(_ctx,m)=>{
      if(m.kind!=='c2c'&&m.kind!=='group')return;
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]);
      await this.bridge.receive({channel:'qq',account:credentials.appId,sender:m.senderId,room:m.groupOpenid,mentioned:m.kind==='group',id:m.messageId,text:[m.content,...(m.attachments??[]).map(x=>x.asr_refer_text??'')].filter(Boolean).join('\n'),signal,
        images:async()=>{const output=[];for(const x of (m.attachments??[]).filter(x=>x.content_type.startsWith('image/')).slice(0,2)){const bytes=await download(x.url,'qq-cdn',signal);output.push({type:'image' as const,data:bytes.toString('base64'),mimeType:imageMime(bytes)});}return output;},
        audio:(m.attachments??[]).some(x=>x.content_type.startsWith('audio/'))?async()=>{const a=m.attachments!.find(x=>x.content_type.startsWith('audio/'))!;return download(a.url,'qq-cdn',signal);}:undefined,
        replyVoice:async voice=>{signal.throwIfAborted();const buffer=await qqVoice(voice,signal);signal.throwIfAborted();await bot.sendVoice(m.replyTarget,{buffer});},
        reply:async text=>{signal.throwIfAborted();await bot.sendText(m.replyTarget,text);},replyImage:async image=>{signal.throwIfAborted();await bot.sendImage(m.replyTarget,{buffer:Buffer.from(image.data,'base64')});}});
    });
    this.task=(async()=>{let failures=0;while(!controller.signal.aborted){try{await bot.start(controller.signal);if(!controller.signal.aborted)this.state='reconnecting';}catch(e){if(controller.signal.aborted)break;this.error=publicError(e).message;this.store.log('qq','START_FAILED',this.error);if((e as {code?:string}).code==='GATEWAY_FATAL_CLOSE'){this.state='error';break;}this.state='reconnecting';}if(!controller.signal.aborted)await delay(Math.min(60000,2000*2**Math.min(failures++,5)),undefined,{signal:controller.signal}).catch(()=>{});}})();
  }
  async stop(){this.controller?.abort();await this.bot?.stop();await this.task;this.bot=undefined;this.state='stopped';}
  async logout(){await this.stop();this.store.deleteSecret('qq');}
}
