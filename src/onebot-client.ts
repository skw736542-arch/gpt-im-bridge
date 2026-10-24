import { randomUUID } from 'node:crypto';
import { realpath, readFile, stat } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
import { PublicError } from './ai.js';
import { download } from './network.js';

// Independently implemented OneBot v11 client. Credentials never appear in status or logs.
export class OneBotClient {
  private socket?:WebSocket;
  private pending=new Map<string,{resolve:(data:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  constructor(private event:(value:any)=>void,private disconnected:()=>void){}
  get connected(){return this.socket?.readyState===WebSocket.OPEN;}
  async connect(url:string,token:string){
    const u=new URL(url);if(u.protocol!=='ws:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.search||u.hash)throw new PublicError('GATEWAY_URL','仅允许本机 127.0.0.1 OneBot WebSocket。');
    if(token)u.searchParams.set('access_token',token);
    const ws=new WebSocket(u);this.socket=ws;
    ws.addEventListener('message',e=>{
      if(typeof e.data!=='string'||e.data.length>15_000_000){ws.close();return;}
      try{const data=JSON.parse(e.data);const p=this.pending.get(String(data.echo));
        if(p){clearTimeout(p.timer);this.pending.delete(String(data.echo));if(data.status==='ok'&&data.retcode===0)p.resolve(data.data);else p.reject(new PublicError('ONEBOT_REJECTED','QQ 网关拒绝请求，请查看网关登录状态与媒体支持。'));}
        else if(data.post_type)this.event(data);
      }catch{/* Ignore malformed packets; do not log private message content. */}
    });
    ws.addEventListener('close',()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new PublicError('ONEBOT_CLOSED','QQ 网关连接已断开。'));}this.pending.clear();this.disconnected();});
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{ws.close();reject(new PublicError('ONEBOT_TIMEOUT','网关连接超时，请启动网关并检查端口。'));},8000);ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(new PublicError('ONEBOT_CONNECT','无法连接 QQ 网关，请检查端口和访问令牌。'));},{once:true});});
  }
  async call(action:string,params:Record<string,unknown>={}):Promise<any>{
    if(!this.connected)throw new PublicError('ONEBOT_OFFLINE','QQ 网关未连接。');
    if(this.pending.size>=32)throw new PublicError('ONEBOT_BUSY','QQ 网关正在处理较多请求。');
    return new Promise((resolve,reject)=>{const echo=randomUUID();const timer=setTimeout(()=>{this.pending.delete(echo);reject(new PublicError('ONEBOT_TIMEOUT','QQ 网关响应超时；为避免重复发送，不自动重发。'));},20000);this.pending.set(echo,{resolve,reject,timer});this.socket!.send(JSON.stringify({action,params,echo}));});
  }
  close(){this.socket?.close();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new PublicError('ONEBOT_CLOSED','QQ 网关连接已断开。'));}this.pending.clear();}
}
export async function localMedia(file:string,root:string,max=10*1024*1024):Promise<Buffer>{
  if(!root||!isAbsolute(file)||!isAbsolute(root))throw new PublicError('MEDIA_ROOT','语音网关返回了本地文件，请在普通 QQ 设置中指定网关媒体缓存目录。');
  const [base,target]=await Promise.all([realpath(root),realpath(file)]);const r=relative(base,target);
  if(!r||r.startsWith('..')||isAbsolute(r))throw new PublicError('MEDIA_PATH','媒体路径不在允许的缓存目录内。');
  const info=await stat(target);if(!info.isFile()||info.size>max)throw new PublicError('MEDIA_SIZE',`媒体文件不是普通文件或超过 ${max/1024/1024} MB。`);
  const b=await readFile(target);if(b.length>max)throw new PublicError('MEDIA_SIZE','媒体超过大小限制。');return b;
}
export async function gatewayMedia(value:string,root:string,signal?:AbortSignal,max=10*1024*1024){
  if(value.startsWith('http://')){const u=new URL(value);u.protocol='https:';value=u.toString();}
  if(value.startsWith('https://'))return download(value,'qq-cdn',signal,max);
  if(value.startsWith('base64://')){if(value.length>Math.ceil(max/3)*4+16)throw new PublicError('MEDIA_SIZE','媒体超过大小限制。');const b=Buffer.from(value.slice(9),'base64');if(b.length>max)throw new PublicError('MEDIA_SIZE','媒体超过大小限制。');return b;}
  return localMedia(value,root,max);
}
