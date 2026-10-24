import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import QRCode from 'qrcode';
import type { ImageContent } from '@earendil-works/pi-ai';
import { Store } from './store.js';
import { Bridge } from './bridge.js';
import { PublicError, publicError } from './ai.js';
import { boundedBody, download, imageMime, trustedUrl } from './network.js';
type Media={full_url?:string;encrypt_query_param?:string;aes_key?:string};
type Item={type?:number;text_item?:{text?:string};voice_item?:{text?:string;media?:Media;playtime?:number;encode_type?:number};image_item?:{aeskey?:string;media?:Media}};
type WxMessage={message_id?:number|string;from_user_id?:string;group_id?:string;message_type?:number;context_token?:string;item_list?:Item[]};
type WxCredential={token:string;base:string;bot:string;user:string};
type QRResponse={status:string;bot_token?:string;ilink_bot_id?:string;ilink_user_id?:string;baseurl?:string;redirect_host?:string};
const BASE='https://ilinkai.weixin.qq.com';const CDN='https://novac2c.cdn.weixin.qq.com/c2c';
export function decryptImage(body:Buffer,key?:string,mediaKey?:string){
  if(!key&&!mediaKey)return body;
  let b=key?Buffer.from(key,'hex'):Buffer.from(mediaKey!,'base64');
  if(b.length===32&&/^[a-f0-9]{32}$/i.test(b.toString()))b=Buffer.from(b.toString(),'hex');
  if(b.length!==16)throw new PublicError('BAD_MEDIA_KEY','图片解密参数无效。');
  const cipher=createDecipheriv('aes-128-ecb',b,null);return Buffer.concat([cipher.update(body),cipher.final()]);
}
export class Weixin {
  state='stopped';error:string|null=null;
  private controller?:AbortController;private task?:Promise<void>;
  private qr?:{id:string;value:string;image:string;base:string;expires:number;status:string};
  constructor(private store:Store,private bridge:Bridge){}
  async api<T>(path:string,body?:unknown,credential?:WxCredential,signal?:AbortSignal,base=credential?.base??BASE):Promise<T> {
    const url=trustedUrl(`${base}${path}`,'weixin-api');
    const response=await fetch(url,{method:body===undefined?'GET':'POST',redirect:'error',headers:{'Content-Type':'application/json',AuthorizationType:'ilink_bot_token','X-WECHAT-UIN':Buffer.from(String(randomBytes(4).readUInt32BE())).toString('base64'),'iLink-App-Id':'bot','iLink-App-ClientVersion':String(2*65536+4*256+8),...(credential?{Authorization:`Bearer ${credential.token}`}:{})},body:body===undefined?undefined:JSON.stringify({...body as object,base_info:{channel_version:'2.4.8',bot_agent:'GPTIMBridge/0.1.0'}}),signal:signal??AbortSignal.timeout(40000)});
    const data=JSON.parse((await boundedBody(response,2*1024*1024)).toString()) as T & {ret?:number;errcode?:number};
    if(data.ret===-14||data.errcode===-14)throw new PublicError('WEIXIN_SESSION_EXPIRED','微信登录已失效，请重新扫码。');
    if(data.ret||data.errcode)throw new PublicError('WEIXIN_API_ERROR','微信接口返回错误，请检查登录状态后重试。');
    return data;
  }
  async startQR(){const data=await this.api<{qrcode:string;qrcode_img_content:string}>('/ilink/bot/get_bot_qrcode?bot_type=3',{local_token_list:[]});if(!data.qrcode||!data.qrcode_img_content)throw new PublicError('BAD_QR','微信未返回有效二维码。');this.qr={id:randomUUID(),value:data.qrcode,image:await QRCode.toDataURL(data.qrcode_img_content),base:BASE,expires:Date.now()+240000,status:'wait'};return this.qrView();}
  qrView(){return this.qr?{id:this.qr.id,image:this.qr.image,expires:this.qr.expires,status:this.qr.status}:null;}
  async pollQR(id:string,verifyCode?:string){
    const qr=this.qr;if(!qr||id!==qr.id)throw new PublicError('STALE_QR','二维码已更换，请重新扫码。');
    if(Date.now()>qr.expires){qr.status='expired';return this.qrView();}
    if(qr.status==='confirmed')return this.qrView();
    const data=await this.api<QRResponse>(`/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qr.value)}${verifyCode?`&verify_code=${encodeURIComponent(verifyCode)}`:''}`,undefined,undefined,AbortSignal.timeout(40000),qr.base);
    if(this.qr!==qr)return this.qrView();qr.status=data.status;
    if(data.status==='scaned_but_redirect'&&data.redirect_host){qr.base=new URL(trustedUrl(data.redirect_host.startsWith('https:')?data.redirect_host:`https://${data.redirect_host}`,'weixin-api')).origin;}
    if(data.status==='confirmed'){
      if(!data.bot_token||!data.ilink_bot_id||!data.ilink_user_id)throw new PublicError('BAD_LOGIN','微信授权响应不完整。');
      const base=new URL(trustedUrl(data.baseurl??BASE,'weixin-api')).origin;
      await this.stop();this.store.putSecret('weixin',{token:data.bot_token,base,bot:data.ilink_bot_id,user:data.ilink_user_id});this.store.putSecret('weixinCursor','');
      this.store.log('weixin','AUTHORIZED','微信扫码凭证已保存；启用通道并设置白名单后开始处理。');this.start();
    }
    return this.qrView();
  }
  status(){const c=this.store.secret<WxCredential>('weixin');return {state:this.state,error:this.error,authorized:!!c,owner:c?.user??null,lastSender:this.store.get('lastSender:weixin',null),lastReply:this.store.get('lastReply:weixin',null),groupSupport:false};}
  start(){if(this.task||!this.store.config().weixin.enabled||!this.store.secret('weixin'))return;this.controller=new AbortController();const signal=this.controller.signal;this.task=this.loop(signal).finally(()=>{this.task=undefined;if(this.state!=='reauthorize')this.state='stopped';});}
  async stop(){this.controller?.abort();await this.task;this.state='stopped';}
  async logout(){await this.stop();this.qr=undefined;this.store.deleteSecret('weixin');this.store.deleteSecret('weixinCursor');}
  private async loop(signal:AbortSignal){
    let failures=0;
    while(!signal.aborted){try{
      const credential=this.store.secret<WxCredential>('weixin');if(!credential)break;
      this.state='polling';
      const result=await this.api<{msgs?:WxMessage[];get_updates_buf?:string}>('/ilink/bot/getupdates',{get_updates_buf:this.store.secret<string>('weixinCursor')??''},credential,AbortSignal.any([signal,AbortSignal.timeout(45000)]));
      failures=0;this.error=null;this.state='connected';
      for(const m of result.msgs??[]){if(signal.aborted)break;await this.handle(m,credential,signal);}
      if(result.get_updates_buf&&!signal.aborted)this.store.putSecret('weixinCursor',result.get_updates_buf);
      await delay(250,undefined,{signal});
    }catch(e){if(signal.aborted)break;const error=publicError(e);this.error=error.message;this.store.log('weixin',error.code,error.message);if(error.code==='WEIXIN_SESSION_EXPIRED'){this.state='reauthorize';break;}this.state='reconnecting';await delay(Math.min(30000,1000*2**Math.min(failures++,5)),undefined,{signal}).catch(()=>{});}}
  }
  private async handle(m:WxMessage,c:WxCredential,signal:AbortSignal){
    if(m.message_type!==1||!m.from_user_id||m.message_id===undefined)return;
    const items=m.item_list??[];const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(120000)]);
    const send=async(item:unknown)=>{if(!m.context_token)throw new PublicError('NO_CONTEXT_TOKEN','微信消息缺少回复令牌，无法发送。');await this.api('/ilink/bot/sendmessage',{msg:{from_user_id:'',to_user_id:m.from_user_id,client_id:randomUUID(),message_type:2,message_state:2,context_token:m.context_token,item_list:[item]}},c,requestSignal);};
    await this.bridge.receive({channel:'weixin',account:c.bot,sender:m.from_user_id,room:m.group_id,id:String(m.message_id),text:items.map(x=>x.text_item?.text??x.voice_item?.text??'').filter(Boolean).join('\n'),signal:requestSignal,
      audio:items.some(x=>x.type===3&&x.voice_item?.media)?async()=>{const voice=items.find(x=>x.type===3&&x.voice_item?.media)!.voice_item!;if((voice.playtime??0)>60000)throw new PublicError('AUDIO_DURATION','单条语音最多 60 秒。');const media=voice.media!;const url=media.full_url??`${CDN}/download?encrypted_query_param=${encodeURIComponent(media.encrypt_query_param??'')}`;return decryptImage(await download(url,'weixin-cdn',requestSignal),undefined,media.aes_key);}:undefined,
      images:async()=>{const output:ImageContent[]=[];for(const item of items.filter(x=>x.type===2).slice(0,2)){const image=item.image_item;const media=image?.media;if(!media)continue;const url=media.full_url??`${CDN}/download?encrypted_query_param=${encodeURIComponent(media.encrypt_query_param??'')}`;const body=decryptImage(await download(url,'weixin-cdn',requestSignal),image?.aeskey,media.aes_key);output.push({type:'image',mimeType:imageMime(body),data:body.toString('base64')});}return output;},
      reply:text=>send({type:1,text_item:{text}}),
      replyVoice:async()=>{throw new PublicError('NATIVE_VOICE_UNAVAILABLE','当前微信 iLink 原生语音条未验证可送达，已停止用音频附件替代。文字回复可用。');},
      replyImage:async image=>{const raw=Buffer.from(image.data,'base64');if(raw.length>10*1024*1024)throw new PublicError('TOO_LARGE','生成的图片超过 10 MB。');const key=randomBytes(16);const cipher=createCipheriv('aes-128-ecb',key,null);const body=Buffer.concat([cipher.update(raw),cipher.final()]);const filekey=randomBytes(16).toString('hex');const upload=await this.api<{upload_full_url?:string;upload_param?:string}>('/ilink/bot/getuploadurl',{filekey,media_type:1,to_user_id:m.from_user_id,rawsize:raw.length,rawfilemd5:createHash('md5').update(raw).digest('hex'),filesize:body.length,no_need_thumb:true,aeskey:key.toString('hex')},c,requestSignal);if(!upload.upload_full_url&&!upload.upload_param)throw new PublicError('UPLOAD_FAILED','微信未返回上传参数。');const url=upload.upload_full_url??`${CDN}/upload?encrypted_query_param=${encodeURIComponent(upload.upload_param!)}&filekey=${filekey}`;const r=await fetch(trustedUrl(url,'weixin-cdn'),{method:'POST',body,headers:{'Content-Type':'application/octet-stream'},signal:requestSignal,redirect:'error'});const param=r.headers.get('x-encrypted-param');await r.body?.cancel();if(r.status!==200||!param)throw new PublicError('UPLOAD_FAILED','微信图片上传失败。');await send({type:2,image_item:{media:{encrypt_query_param:param,aes_key:Buffer.from(key.toString('hex')).toString('base64'),encrypt_type:1},mid_size:body.length}});}
    });
  }
}
