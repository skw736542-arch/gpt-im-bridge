import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AI, PublicError, publicError } from './ai.js';
import { OAuthManager } from './oauth.js';
import { Bridge } from './bridge.js';
import { Weixin } from './weixin.js';
import { QQ } from './qq.js';
import { OneBot } from './onebot.js';
import { Store } from './store.js';
import {codexImageStatus} from './codex-images.js';
import { configSchema } from './config.js';
import { profileList, saveProfile, historyKey, roleSchema, memorySchema, type Profile } from './personas.js';
export type ServerOptions={origin:string;password:string;secure:boolean;staticRoot?:string};
export async function buildServer(store:Store,options:ServerOptions) {
  const app=Fastify({logger:false,bodyLimit:32*1024,requestTimeout:150000});
  const ai=new AI(store);const oauth=new OAuthManager(ai);const bridge=new Bridge(ai);const weixin=new Weixin(store,bridge);const qq=new QQ(store,bridge);const onebot=new OneBot(store,bridge);
  const sessions=new Map<string,{csrf:string;expires:number}>();
  const origin=new URL(options.origin);
  await app.register(cookie);
  await app.register(helmet,{contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'",'data:'],connectSrc:["'self'"],frameAncestors:["'none'"],formAction:["'self'"],upgradeInsecureRequests:null}}});
  await app.register(rateLimit,{max:180,timeWindow:60000});
  app.addHook('onRequest',async(req,reply)=>{
    if(req.headers.host!==origin.host)return reply.code(403).send({code:'HOST_DENIED',message:'管理地址不匹配，请使用 PUBLIC_ORIGIN 中的地址。'});
    if(req.url.startsWith('/api/'))reply.header('Cache-Control','no-store');
    if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&req.headers.origin!==options.origin)return reply.code(403).send({code:'ORIGIN_DENIED',message:'请求来源不匹配。'});
    if(req.url.startsWith('/api/')&&req.url!=='/api/login'){
      const session=sessions.get(req.cookies.bridge_session??'');
      if(!session||session.expires<Date.now())return reply.code(401).send({code:'LOGIN_REQUIRED',message:'请登录管理后台。'});
      if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==session.csrf)return reply.code(403).send({code:'CSRF_DENIED',message:'页面已过期，请刷新后重试。'});
    }
  });
  app.setErrorHandler((err,_req,reply)=>{
    if((err as {statusCode?:number}).statusCode===429)return reply.code(429).send({code:'RATE_LIMIT',message:'请求过于频繁，请稍后再试。'});
    if(err instanceof z.ZodError)return reply.code(400).send({code:'INVALID_INPUT',message:'配置格式不正确，请检查字段长度、数值范围与必填项。'});
    const e=publicError(err);store.log('admin',e.code,e.message);return reply.code(err instanceof PublicError?400:500).send({code:e.code,message:e.message});
  });
  app.get('/health',async()=>({ok:true}));
  app.post('/api/login',{config:{rateLimit:{max:8,timeWindow:60000}}},async(req,reply)=>{
    const {password}=z.object({password:z.string().max(256)}).parse(req.body);
    const hash=(v:string)=>createHash('sha256').update(v).digest();
    if(!timingSafeEqual(hash(password),hash(options.password)))return reply.code(401).send({code:'BAD_PASSWORD',message:'管理密码不正确。'});
    for(const [id,s] of sessions)if(s.expires<Date.now())sessions.delete(id);
    if(sessions.size>=20)sessions.delete(sessions.keys().next().value!);
    const id=randomBytes(32).toString('base64url');sessions.set(id,{csrf:randomBytes(24).toString('base64url'),expires:Date.now()+8*3600000});
    reply.setCookie('bridge_session',id,{httpOnly:true,sameSite:'strict',secure:options.secure,path:'/',maxAge:8*3600});return {ok:true};
  });
  app.post('/api/logout',async(req,reply)=>{sessions.delete(req.cookies.bridge_session??'');reply.clearCookie('bridge_session',{path:'/'});return {ok:true};});
  app.get('/api/state',async req=>({csrf:sessions.get(req.cookies.bridge_session!)!.csrf,config:store.config(),providers:await ai.status(),oauth:oauth.view(),weixin:weixin.status(),qq:qq.status(),onebot:onebot.status(),tests:{chat:store.get('test:chat',null),vision:store.get('test:vision',null),image:store.get('test:image',null)},events:store.events()}));
  app.get('/api/models',async()=>ai.catalog());
  app.get('/api/images/status',async()=>codexImageStatus());
  app.get('/api/personas/profiles',async()=>profileList(store));
  app.put('/api/personas/profiles/:id',async req=>{
    const {id}=z.object({id:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.params);
    const input=z.object({role:roleSchema,enabled:z.boolean(),memories:memorySchema,updated:z.number()}).strict().parse(req.body);
    const first=store.secret<Profile>('persona:'+id);if(!first)throw new PublicError('PROFILE_MISSING','尚无此会话，请先在消息入口发送文字。');
    return store.locked(`conversation:${first.scope}`,async()=>{
      const p=store.secret<Profile>('persona:'+id)!;
      if(p.updated!==input.updated)throw new PublicError('PROFILE_CHANGED','记忆已被新消息更新，请重新加载后编辑。');
      const changed=p.enabled!==input.enabled;
      p.topics={};p.recentTopics={};p.pending=undefined;p.role=input.role;p.enabled=input.enabled;p.memories[input.role]=input.memories;
      for(const r of ['general','coach','companion'] as const)if(changed||r===input.role)store.saveHistory(historyKey(p.scope,r),[]);
      saveProfile(store,p);return {ok:true};
    });
  });
  app.post('/api/models/refresh',async()=>{const result=await ai.models.refresh({signal:AbortSignal.timeout(20000)});if(result.errors.size||result.aborted)throw new PublicError('CATALOG_REFRESH_FAILED','部分远程目录更新失败，保留上次目录。静态 OpenAI 目录需升级 SDK 更新。');store.set('catalogCheckedAt',Date.now());return ai.catalog();});
  app.put('/api/config',async req=>{
    const config=configSchema.parse(req.body);ai.validate(config);store.saveConfig(config);
    await weixin.stop();await qq.stop();await onebot.stop();weixin.start();qq.start();onebot.start();store.log('config','SAVED','模型与通道配置已保存。');return {ok:true};
  });
  app.post('/api/oauth/start',async req=>{const {provider}=z.object({provider:z.enum(['openai','openai-codex','openrouter'])}).parse(req.body);return oauth.start(provider);});
  app.post('/api/oauth/answer',async req=>{const {id,value}=z.object({id:z.string().uuid(),value:z.string().min(1).max(8000)}).parse(req.body);oauth.answer(id,value);return {ok:true};});
  app.post('/api/oauth/cancel',async()=>{await oauth.cancel();return {ok:true};});
  app.post('/api/oauth/logout',async req=>{const {provider}=z.object({provider:z.enum(['openai','openai-codex','openrouter'])}).parse(req.body);await oauth.logout(provider);return {ok:true};});
  app.post('/api/openrouter/key',async req=>{const {key}=z.object({key:z.string().min(12).max(512)}).parse(req.body);await ai.credentials.modify('openrouter',async()=>({type:'api_key',key}));return {ok:true};});
  let testing=false;
  app.post('/api/test',async req=>{const {kind}=z.object({kind:z.enum(['chat','vision','image'])}).parse(req.body);if(testing)throw new PublicError('TEST_RUNNING','已有连接测试正在运行。');testing=true;try{return await ai.test(kind);}finally{testing=false;}});
  app.post('/api/weixin/qr',async()=>weixin.startQR());
  app.post('/api/weixin/poll',async req=>{const {id,verifyCode}=z.object({id:z.string().uuid(),verifyCode:z.string().regex(/^\d{4,12}$/).optional()}).parse(req.body);return weixin.pollQR(id,verifyCode);});
  app.post('/api/weixin/logout',async()=>{await weixin.logout();return {ok:true};});
  app.post('/api/qq/credentials',async req=>{const c=z.object({appId:z.string().regex(/^\d{3,30}$/),appSecret:z.string().min(8).max(256)}).strict().parse(req.body);await qq.stop();store.putSecret('qq',c);qq.start();return {ok:true};});
  app.post('/api/onebot/credentials',async req=>{const {token}=z.object({token:z.string().min(1).max(512)}).strict().parse(req.body);await onebot.stop();store.putSecret('onebot',{token});onebot.start();return {ok:true};});
  app.post('/api/onebot/test',async()=>onebot.probe());
  app.post('/api/onebot/logout',async()=>{await onebot.logout();const config=store.config();config.onebot.enabled=false;store.saveConfig(config);return {ok:true};});
  app.post('/api/qq/logout' ,async()=>{await qq.logout();return {ok:true};});
  app.post('/api/channels/restart',async()=>{await weixin.stop();await qq.stop();await onebot.stop();weixin.start();qq.start();onebot.start();return {ok:true};});
  app.post('/api/history/clear',async()=>{store.clearHistory();return {ok:true};});
  await app.register(staticFiles,{root:options.staticRoot??fileURLToPath(new URL('./public',import.meta.url)),index:'index.html'});
  app.addHook('onClose',async()=>{await oauth.cancel();await weixin.stop();await qq.stop();await onebot.stop();});
  await ai.models.refresh({allowNetwork:false,signal:AbortSignal.timeout(3000)});
  return {app,ai,oauth,weixin,qq,onebot,startChannels:()=>{weixin.start();qq.start();onebot.start();}};
}
