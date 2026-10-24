import { PublicError } from './ai.js';
export function trustedUrl(value:string,kind:'weixin-api'|'weixin-cdn'|'qq-cdn') {
  const u=new URL(value);const h=u.hostname;
  const allowed=kind==='weixin-api'?(h==='ilinkai.weixin.qq.com'||h.endsWith('.ilinkai.weixin.qq.com')):kind==='weixin-cdn'?(h==='novac2c.cdn.weixin.qq.com'):['multimedia.nt.qq.com','gchat.qpic.cn','c2cpicdw.qpic.cn','qzonestyle.gtimg.cn'].includes(h)||h.endsWith('.qq.com')||h.endsWith('.qpic.cn');
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!allowed)throw new PublicError('UNTRUSTED_URL','上游返回了未允许的地址，已拒绝访问。');
  return u.toString();
}
export async function boundedBody(response:Response,max=10*1024*1024):Promise<Buffer> {
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  if(Number(response.headers.get('content-length'))>max)throw new PublicError('TOO_LARGE',`附件超过 ${Math.floor(max/1024/1024)} MB 限制。`);
  const reader=response.body?.getReader();if(!reader)return Buffer.alloc(0);
  const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new PublicError('TOO_LARGE','响应超过大小限制。');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks);
}
export async function download(url:string,kind:'weixin-cdn'|'qq-cdn',signal?:AbortSignal,max=10*1024*1024){return boundedBody(await fetch(trustedUrl(url,kind),{redirect:'error',signal:signal??AbortSignal.timeout(30000)}),max);}
export function imageMime(b:Buffer):string {
  if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
  if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return 'image/webp';
  if(b.subarray(0,3).toString()==='GIF')return 'image/gif';
  throw new PublicError('IMAGE_FORMAT','仅接收 PNG、JPEG、WebP、GIF 图片。');
}
