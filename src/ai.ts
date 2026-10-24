import { randomUUID } from 'node:crypto';
import { createModels, type CredentialStore, type Credential, type Message, type ImageContent, type ModelsStoreEntry } from '@earendil-works/pi-ai';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { Store } from './store.js';
import type { Config } from './config.js';
import { codexImages } from './codex-images.js';

export class PublicError extends Error {constructor(public code:string,message:string){super(message);}}
export function publicError(error:unknown):PublicError {
  if(error instanceof PublicError)return error;
  const text=error instanceof Error ? error.message : String(error);
  if(/1455|EADDRINUSE/i.test(text))return new PublicError('OAUTH_PORT_BUSY','授权端口 1455 被占用，请先结束其他登录流程再重试。');
  const exchange=text.match(/OAuth token request failed \((\d{3})\)/i);
  if(exchange)return new PublicError('OAUTH_EXCHANGE_FAILED',`授权码换取令牌失败（HTTP ${exchange[1]}），尚未保存授权。请检查授权服务可用性、账号资格和网络；也可单独尝试 legacy Codex 授权。`);
  if(/grant did not include/i.test(text))return new PublicError('OAUTH_SCOPE_MISSING','账号没有授予此 SDK 所需的订阅调用权限，授权未保存。可单独尝试 legacy Codex 接入。');
  if(/401|invalid_grant|unauthoriz|refresh.*fail/i.test(text))return new PublicError('REAUTHORIZE','授权已失效或刷新失败，请重新授权。');
  if(/403|permission|not.*allowed|not.*available|unsupported/i.test(text))return new PublicError('NOT_ENTITLED','账号无权使用此模型或功能，请更换模型并检查订阅权限。');
  if(/429|quota|rate.limit/i.test(text))return new PublicError('RATE_LIMIT','请求限流或额度不足，请稍后重试并检查供应商额度。');
  if(/abort|timeout|cancel/i.test(text))return new PublicError('CANCELLED','操作已取消或超时，请重试。');
  return new PublicError('UPSTREAM_ERROR','上游请求未成功，请检查网络、授权状态及所选模型。凭证与上游原始响应未写入日志。');
}
export class SqlCredentials implements CredentialStore {
  constructor(private store:Store){}
  async read(id:string,options?:{signal?:AbortSignal}) {options?.signal?.throwIfAborted();return this.store.secret<Credential>(`oauth:${id}`);}
  async list(){return this.store.secretNames().filter(x=>x.startsWith('oauth:')).map(x=>({providerId:x.slice(6),type:this.store.get<'oauth'|'api_key'>(`credentialType:${x.slice(6)}`,'oauth')}));}
  async modify(id:string,fn:(current:Credential|undefined)=>Promise<Credential|undefined>,options?:{signal?:AbortSignal}) {
    return this.store.locked(`credential:${id}`,async()=>{options?.signal?.throwIfAborted();const current=await this.read(id);const value=await fn(current);options?.signal?.throwIfAborted();if(value){this.store.putSecret(`oauth:${id}`,value);this.store.set(`credentialType:${id}`,value.type);}return value ?? current;});
  }
  async delete(id:string,options?:{signal?:AbortSignal}) {await this.store.locked(`credential:${id}`,async()=>{options?.signal?.throwIfAborted();this.store.deleteSecret(`oauth:${id}`);});}
}
export class AI {
  credentials:SqlCredentials;
  models;
  constructor(public store:Store) {
    this.credentials=new SqlCredentials(store);
    this.models=createModels({credentials:this.credentials,
      // No silent fallback to OPENAI_API_KEY or credentials belonging to another app.
      authContext:{env:async()=>undefined,fileExists:async()=>false},
      modelsStore:{read:async id=>store.get<ModelsStoreEntry|undefined>(`catalog:${id}`,undefined),write:async(id,value)=>{store.set(`catalog:${id}`,value);},delete:async id=>{store.set(`catalog:${id}`,null);}}
    });
    this.models.setProvider(openaiProvider());this.models.setProvider(openaiCodexProvider());this.models.setProvider(openrouterProvider());
    if(!store.get('deviceId',''))store.set('deviceId',randomUUID());
  }
  catalog() {
    const chats=this.models.getModels().filter(m=>m.provider==='openai'||m.provider==='openai-codex').map(m=>({key:`${m.provider}:${m.id}`,id:m.id,name:m.name,provider:m.provider,type:'chat',vision:m.input.includes('image'),audioInput:false,audioOutput:false,reasoning:m.reasoning,thinkingLevels:m.thinkingLevelMap,contextWindow:m.contextWindow}));
    const images=this.models.getModelsOfType('image','openrouter').map(m=>({key:`${m.provider}:${m.id}`,id:m.id,name:m.name,provider:m.provider,type:'image',vision:m.input.includes('image'),audioInput:false,audioOutput:false,reasoning:false}));
    return {models:[...chats,...images],source:'Pi AI 1.4.0 SDK catalog; not an account entitlement list',checkedAt:this.store.get('catalogCheckedAt',null),capabilities:{imageGeneration:'可选 Codex CLI 内置订阅生图（独立的本机 ChatGPT 登录）；Pi AI OpenAI provider 无生图实现。OpenRouter 仍为单独授权与计费。',audioInput:'平台转写或本地 Whisper 识别后交给 GPT，不属于订阅原生音频接口。',audioOutput:'QQ 原生语音由独立本地或在线语音引擎合成，不属于 GPT 订阅原生语音。',vision:'按 SDK input 包含 image 筛选；实际订阅权限需真实请求验证。'}};
  }
  split(key:string):[string,string] {const at=key.indexOf(':');return [key.slice(0,at),key.slice(at+1)];}
  validate(c:Config) {
    for(const [key,vision] of [[c.chatModel,false],[c.visionModel,true]] as const){if(!key)continue;const [p,id]=this.split(key);const m=this.models.getModel(p,id);if(!['openai','openai-codex'].includes(p)||!m||vision&&!m.input.includes('image'))throw new PublicError('INVALID_MODEL','请选择目录中符合能力的聊天/图片理解模型。');}
    if(c.imageModel){const [p,id]=this.split(c.imageModel);if(p!=='openrouter'||!this.models.getModelOfType('image',p,id))throw new PublicError('INVALID_MODEL','生图模型必须来自 OpenRouter 图像模型目录。');}
  }
  async requireAuth(provider:string) {
    const c=await this.credentials.read(provider);
    if(!c||provider!=='openrouter'&&c.type!=='oauth')throw new PublicError('LOGIN_REQUIRED',provider==='openai-codex'?'当前模型需要单独的 legacy Codex OAuth：请展开“旧版 Codex 订阅接入”并完成授权。':provider==='openrouter'?'请先配置 OpenRouter 独立授权；它不使用 ChatGPT 订阅额度。':'请先在模型配置中完成 OpenAI Sign in with ChatGPT 订阅 OAuth 授权。');
  }
  async chat(key:string,messages:Message[],signal?:AbortSignal,persona?:string) {
    const [p,id]=this.split(key);const model=this.models.getModel(p,id);if(!model)throw new PublicError('SELECT_MODEL','请先选择默认聊天模型。');
    await this.requireAuth(p);
    const c=this.store.config();
    const reasoning=model.reasoning&&c.reasoning!=='off'?c.reasoning:undefined;
    if(reasoning&&model.thinkingLevelMap?.[reasoning]===null)throw new PublicError('REASONING_UNSUPPORTED','当前模型不支持所选推理强度，请调整参数后重试。');
    const result=await this.models.completeSimple(model,{systemPrompt:[c.systemPrompt,persona].filter(Boolean).join('\n\n'),messages},{reasoning,maxTokens:Math.min(c.maxTokens,model.maxTokens),signal:signal??AbortSignal.timeout(90000)});
    if(result.stopReason==='error'||result.stopReason==='aborted')throw publicError(result.errorMessage);
    const text=result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
    if(!text)throw new PublicError('EMPTY_REPLY','模型未返回可发送的文字，请更换模型或参数。');
    return {text,message:result};
  }
  canGenerateImages(){const c=this.store.config();return c.imageBackend==='codex-subscription'||(c.imageBackend==='openrouter'&&!!c.imageModel);}
  async images(prompt:string,signal?:AbortSignal,references:ImageContent[]=[]):Promise<ImageContent[]> {
    const backend=this.store.config().imageBackend;
    if(backend==='codex-subscription')return codexImages(prompt,signal,references);
    if(backend!=='openrouter')throw new PublicError('IMAGE_UNAVAILABLE','请在管理页启用 Codex ChatGPT 订阅生图，并确认本机 CLI 已通过 ChatGPT 登录。');
    const [p,id]=this.split(this.store.config().imageModel);const m=this.models.getModelOfType('image',p,id);
    if(!m)throw new PublicError('IMAGE_UNAVAILABLE','未配置可用生图服务。ChatGPT 订阅生图在此 SDK 接入路径中不可用；OpenRouter 需单独授权和计费。');
    await this.requireAuth(p);
    const result=await this.models.generateImages(m,{input:[{type:'text',text:prompt}]},{signal:signal??AbortSignal.timeout(120000)});
    if(result.stopReason==='error')throw publicError(result.errorMessage);
    const images=result.output.filter(x=>x.type==='image');if(!images.length)throw new PublicError('NO_IMAGE','上游未返回图片，此次没有生成可发送的图像。');return images.slice(0,1);
  }
  async test(kind:'chat'|'vision'|'image') {
    const c=this.store.config();const start=Date.now();const key=kind==='image'?(c.imageBackend==='codex-subscription'?'codex:built-in-image-generation':c.imageModel):kind==='vision'?c.visionModel:c.chatModel;
    try {
      if(kind==='image')await this.images('Generate a small blue circle on white.');
      else {
        const content:({type:'text';text:string}|ImageContent)[]=[{type:'text',text:kind==='vision'?'What is the dominant color of this image? Answer briefly.':'Reply with OK only.'}];
        if(kind==='vision')content.push({type:'image',mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAABMklEQVR4nO3TMREAIBDEwAchaMK/AHQgY5usgSsyt859E2fD7RTA6wFYAbACYAXACoAVACsAVgCsAFgBsAJgBcAKgBUAKwBWAKwAWAGwAmAFwAqAFQArAFYArABYAbACYAXACoAVACsAVgCsAFgBsAJgBcAKgBUAKwBWAKwAWAGwAmAFwAqAFQArAFYArABYAbACYAXACoAVACsAVgCsAFgBsAJgBcAKgBUAKwBWAKwAWAGwAmAFwAqAFQArAFYArABYAbACYAXACoAVACsAVgCsAFgBsAJgBcAKgBUAKwBWAKwAWAGwAmAFwAqAFQArAFYArABYAbACYAXACoAVACsAVgCsAFgBsAJgBcAKgBUAKwBWAKwAWAGwAmAFwAqAFQArAFYArABYAbACYAXACjDWB7uwAlRUArJoAAAAAElFTkSuQmCC'});
        await this.chat(key,[{role:'user',content,timestamp:Date.now()}]);
      }
      const result={ok:true,kind,model:key,time:Date.now(),latencyMs:Date.now()-start};this.store.set(`test:${kind}`,result);this.store.log('model','TEST_OK',`${kind} 真实请求已返回。`);return result;
    }catch(e){const err=publicError(e);const result={ok:false,kind,model:key,time:Date.now(),latencyMs:Date.now()-start,code:err.code,message:err.message};this.store.set(`test:${kind}`,result);this.store.log('model',err.code,err.message);return result;}
  }
  async status(){return Promise.all(this.models.getProviders().map(async p=>{const c=await this.credentials.read(p.id);return {id:p.id,name:p.name,authorized:!!c,type:c?.type??null,expires:c?.type==='oauth'?c.expires:null,refreshDue:c?.type==='oauth'?c.expires<Date.now():false,subscription:!!p.auth.oauth?.isSubscription};}));}
}
