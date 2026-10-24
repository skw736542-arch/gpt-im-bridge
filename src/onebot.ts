import { Store } from './store.js';
import { Bridge, isAllowed, type Incoming } from './bridge.js';
import { PublicError, publicError } from './ai.js';
import { OneBotClient, gatewayMedia } from './onebot-client.js';
import { qqVoice } from './voice-engine.js';
import { onebotAttachments } from './attachments.js';
import { proactiveDue, reserveAttempt, releaseSilent, scheduleConsideration, conversationParts, type SocialState } from './social.js';

type Segment={type:string;data:Record<string,any>};
export class OneBot {
  state='stopped';error:string|null=null;account='';nickname='';
  private client?:OneBotClient;private controller?:AbortController;private reconnect?:ReturnType<typeof setTimeout>;private heartbeat?:ReturnType<typeof setInterval>;private checking=false;
  private tasks=new Set<Promise<unknown>>();
  private track(task:Promise<unknown>){this.tasks.add(task);void task.finally(()=>this.tasks.delete(task)).catch(()=>{});}
  private batches=new Map<string,{messages:Incoming[];timer:ReturnType<typeof setTimeout>}>();
  constructor(private store:Store,private bridge:Bridge){}
  status(){return {state:this.state,error:this.error,authorized:!!this.store.secret('onebot'),account:this.account,nickname:this.nickname,lastSender:this.store.get('lastSender:onebot',null),lastReply:this.store.get('lastReply:onebot',null),latency:this.store.get('latency:onebot',null),capabilities:{nativeVoice:'implemented-unverified',incomingVoice:'implemented-unverified',qzone:false,calls:false}};}
  start(){if(this.controller||!this.store.config().onebot.enabled)return;if(!this.store.secret('onebot')){this.state='error';this.error='请先保存网关访问令牌。';return;}this.controller=new AbortController();this.track(this.connect(this.controller));this.heartbeat=setInterval(()=>this.track(this.tick().catch(()=>{this.error='网关状态检查失败，请检查网关连接。';})),30000);}
  private async connect(controller:AbortController){
    if(controller.signal.aborted)return;this.state='connecting';
    const client=new OneBotClient(e=>{if(this.client===client)this.track(this.event(e).catch(err=>{const x=publicError(err);this.store.log('onebot',x.code,x.message);}));},()=>{if(!controller.signal.aborted&&this.client===client){this.state='reconnecting';clearTimeout(this.reconnect);this.reconnect=setTimeout(()=>this.track(this.connect(controller)),5000);}});this.client=client;
    try{await client.connect(this.store.config().onebot.wsUrl,this.store.secret<{token:string}>('onebot')?.token??'');const user=await client.call('get_login_info');if(controller.signal.aborted||this.client!==client)return;this.account=String(user?.user_id??'');this.nickname=String(user?.nickname??'').slice(0,80);if(!this.account||this.account!==this.store.config().onebot.account)throw new PublicError('QQ_ACCOUNT_MISMATCH','网关 QQ 账号与已确认账号不一致，请核对普通 QQ 账号设置。');this.state='connected';this.error=null;}
    catch(e){if(controller.signal.aborted)return;const x=publicError(e);this.error=x.message;this.state='error';this.store.log('onebot',x.code,x.message);client.close();}
  }
  async probe(){const c=new OneBotClient(()=>{},()=>{});try{await c.connect(this.store.config().onebot.wsUrl,this.store.secret<{token:string}>('onebot')?.token??'');const u=await c.call('get_login_info');const status=await c.call('get_status');return {account:String(u?.user_id??''),nickname:String(u?.nickname??'').slice(0,80),online:status?.online===true,good:status?.good===true};}finally{c.close();}}
  async stop(){this.controller?.abort();clearTimeout(this.reconnect);clearInterval(this.heartbeat);for(const b of this.batches.values())clearTimeout(b.timer);this.batches.clear();this.client?.close();this.client=undefined;this.controller=undefined;this.state='stopped';await Promise.allSettled([...this.tasks]);}
  async logout(){await this.stop();this.store.deleteSecret('onebot');}
  private target(m:Incoming){return m.room?{group_id:m.room}:{user_id:m.sender};}
  private ensure(m:Incoming){if(this.state!=='connected'||this.account!==m.account||this.account!==this.store.config().onebot.account||!isAllowed(m,this.store.config())||m.signal?.aborted)throw new PublicError('ONEBOT_SEND_DENIED','入口已停止、账号变更或目标不在白名单内。');}
  private async send(m:Incoming,message:Segment[]){this.ensure(m);await this.client!.call(m.room?'send_group_msg':'send_private_msg',{...this.target(m),message,auto_escape:true});}
  private make(sender:string,id:string,room?:string,mentioned=true):Incoming{
    const signal=AbortSignal.any([this.controller?.signal??AbortSignal.abort(),AbortSignal.timeout(300000)]);
    const m:Incoming={channel:'onebot',account:this.account,sender,room,mentioned,id,text:'',signal,
      reply:async text=>{for(const part of conversationParts(text))await this.send(m,[{type:'text',data:{text:part}}]);},
      replyImage:async image=>{await this.send(m,[{type:'image',data:{file:'base64://'+image.data}}]);},
      replyVoice:async voice=>{this.ensure(m);const data=await qqVoice(voice,signal);await this.send(m,[{type:'record',data:{file:'base64://'+data.toString('base64')}}]);}
    };return m;
  }
  private socialKey(sender:string){return `social:onebot:${this.account}:${sender}`;}
  private social(sender:string):SocialState{return this.store.secret<SocialState>(this.socialKey(sender))??{lastIncoming:0,lastAttempt:0,unanswered:false,paused:false,day:'',attempts:0};}
  async event(e:any){
    if(e.post_type==='notice'&&e.notice_type==='offline_file'&&e.file?.id)e={...e,post_type:'message',message_type:'private',message_id:'file-'+e.file.id+'-'+(e.time??Date.now()),message:[{type:'file',data:{...e.file,file_id:e.file.id}}]};
    if(this.state!=='connected'||e.post_type!=='message'||!['private','group'].includes(e.message_type)||String(e.self_id)!==this.account)return;
    const sender=String(e.user_id??''),room=e.message_type==='group'?String(e.group_id??''):undefined;
    if(sender===this.account||!/^\d{5,20}$/.test(sender)||room&&!/^\d{5,20}$/.test(room)||e.message_id===undefined)return;
    // Array message format avoids CQ-string ambiguity and command injection.
    const segments:Segment[]=Array.isArray(e.message)?e.message:typeof e.message==='string'?[{type:'text',data:{text:e.message}}]:[];
    const m=this.make(sender,String(e.message_id),room,!room||segments.some(x=>x.type==='at'&&String(x.data?.qq)===this.account));
    this.store.set('lastSender:onebot',{sender,room:room??null,time:Date.now()});if(!isAllowed(m,this.store.config()))return;
    const eventKey=JSON.stringify(['onebot-buffer',m.account,room??'',m.id]);if(this.store.hasSeen(eventKey))return;
    this.store.markSeen(eventKey);m.text=segments.filter(x=>x.type==='text').map(x=>String(x.data?.text??'')).join('').trim();
    if(m.text.length>12000){await m.reply('单条文字限 12000 字，请分段。');return;}
    if(!room){let s=scheduleConsideration({...this.social(sender),lastIncoming:Date.now(),unanswered:false},Date.now(),this.store.config().onebot.idleMinutes);
      if(['/proactive off','不要主动联系','关闭主动聊天'].includes(m.text)){s.paused=true;this.store.putSecret(this.socialKey(sender),s);await m.reply('好，主动联系已关闭。你发消息时我仍会回复。');return;}
      if(['/proactive on','开启主动聊天'].includes(m.text)){s.paused=false;this.store.putSecret(this.socialKey(sender),s);await m.reply(this.store.config().onebot.proactive&&this.store.config().onebot.proactiveUsers.includes(sender)?'主动联系已开启；安静时段不会打扰，你没回复时不会连续追问。':'已记录你的意愿，还需要在管理页开启主动联系并将你的 QQ 加入名单。');return;}
      this.store.putSecret(this.socialKey(sender),s);
    }
    const media=segments.some(x=>['image','mface','face','file','video','json','xml'].includes(x.type)),record=segments.find(x=>x.type==='record');
    if(media)m.attachments=()=>onebotAttachments(segments,{sender,room,signal:m.signal,call:(action,params)=>this.client!.call(action,params),load:(source,max)=>gatewayMedia(source,this.store.config().onebot.mediaRoot,m.signal,max)});
    if(record)m.audio=async()=>{let data=record.data;if(!data.url&&!String(data.file??'').startsWith('base64://'))data=await this.client!.call('get_record',{file:data.file,out_format:'wav'});return gatewayMedia(String(data.url??data.file??''),this.store.config().onebot.mediaRoot,m.signal);};
    // Commands and media are handled without delay; only contiguous plain text is coalesced.
    if(record||media||m.text.startsWith('/')){await this.bridge.receive(m);return;}
    const key=JSON.stringify([m.account,room,sender]);let b=this.batches.get(key);
    if(!b){if(this.batches.size>=100)return;b={messages:[],timer:setTimeout(()=>{},0)};this.batches.set(key,b);}
    if(b.messages.length>=12||b.messages.reduce((n,x)=>n+x.text.length,0)+m.text.length>12000)return;
    clearTimeout(b.timer);b.messages.push(m);b.timer=setTimeout(()=>{this.batches.delete(key);const last=b!.messages.at(-1)!;const combined={...last,text:b!.messages.map(x=>x.text).filter(Boolean).join('\n')};this.track(this.bridge.receive(combined).catch(()=>this.store.log('onebot','RECEIVE_FAILED','QQ 消息处理未完成。')));},this.store.config().onebot.mergeMs);
  }
  async tick(now=Date.now()){
    if(this.checking||this.state!=='connected')return;this.checking=true;
    try{
      const status=await this.client!.call('get_status');if(status?.online!==true||status?.good===false){this.error='QQ 网关在线或收信状态异常，请检查网关。';return;}this.error=null;
      const c=this.store.config().onebot;
      for(const sender of c.proactiveUsers){if(!c.allowUsers.includes(sender)||!/^\d{5,20}$/.test(sender))continue;const s=this.social(sender);if(!proactiveDue(c,s,now))continue;
        const reserved=reserveAttempt(s,now,c.idleMinutes);this.store.putSecret(this.socialKey(sender),reserved);const account=this.account;
        const valid=()=>{const current=this.store.config().onebot,latest=this.social(sender);return this.state==='connected'&&account===this.account&&current.proactive&&current.proactiveUsers.includes(sender)&&!latest.paused&&latest.lastIncoming===reserved.lastIncoming&&latest.lastAttempt===reserved.lastAttempt;};
        const m=this.make(sender,'proactive-'+now);const sent=await this.bridge.proactive(m,valid,now).catch(e=>{const x=publicError(e);this.store.log('onebot',x.code,x.message);return undefined;});
        // A deliberate silent decision is not an unanswered message. Failures remain
        // reserved to avoid repeating an ambiguous gateway delivery after restart.
        if(sent===false&&valid())this.store.putSecret(this.socialKey(sender),releaseSilent(this.social(sender)));
      }
    }finally{this.checking=false;}
  }
}
