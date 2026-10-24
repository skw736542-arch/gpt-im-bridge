import { z } from 'zod';
import { personaSchema } from './personas.js';
const ids = z.array(z.string().min(1).max(200)).max(500);
export const configSchema = z.object({
  onebot: z.object({
    enabled:z.boolean().default(false), wsUrl:z.string().url().refine(v=>{try{const u=new URL(v);return u.protocol==='ws:'&&u.hostname==='127.0.0.1'&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{return false;}},'仅允许本机 127.0.0.1 的 ws 地址').default('ws://127.0.0.1:3001'),
    account:z.string().regex(/^$|^[1-9][0-9]{4,19}$/).default(''), allowUsers:ids.default([]),allowGroups:ids.default([]),groupsEnabled:z.boolean().default(false),
    mediaRoot:z.string().max(1000).default(''),mergeMs:z.number().int().min(300).max(3000).default(900),
    proactive:z.boolean().default(false),proactiveUsers:ids.default([]),idleMinutes:z.number().int().min(10).max(1440).default(60),dailyLimit:z.number().int().min(1).max(6).default(2),quietStart:z.number().int().min(0).max(23).default(22),quietEnd:z.number().int().min(0).max(23).default(9)
  }).strict().prefault({}),
  personas: personaSchema,
  voiceReplies: z.boolean().default(false),
  chatModel: z.string().max(200).default(''),
  visionModel: z.string().max(200).default(''),
  imageModel: z.string().max(200).default(''),
  imageBackend:z.enum(['disabled','codex-subscription','openrouter']).default('disabled'),
  reasoning: z.enum(['off','minimal','low','medium','high','xhigh']).default('medium'),
  maxTokens: z.number().int().min(128).max(16384).default(2048),
  systemPrompt: z.string().max(8000).default('你是通过微信和 QQ 提供帮助的助手。请用简洁、准确的中文回答。'),
  historyTurns: z.number().int().min(0).max(30).default(10),
  weixin: z.object({enabled:z.boolean().default(false),allowUsers:ids.default([])}).strict().default({enabled:false,allowUsers:[]}),
  qq: z.object({enabled:z.boolean().default(false),allowUsers:ids.default([]),allowGroups:ids.default([]),groupsEnabled:z.boolean().default(false)}).strict().default({enabled:false,allowUsers:[],allowGroups:[],groupsEnabled:false}),
}).strict();
export type Config = z.infer<typeof configSchema>;
export const defaults = () => configSchema.parse({});
export function envConfig() {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64');
  const password = process.env.ADMIN_PASSWORD ?? '';
  if(key.length !== 32 || password.length < 24) throw new Error('Run npm run setup: ENCRYPTION_KEY must be 32 base64 bytes and ADMIN_PASSWORD at least 24 characters.');
  const port = Number(process.env.PORT ?? 8787);
  const origin = process.env.PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`;
  const url = new URL(origin);
  if(url.origin !== origin) throw new Error('PUBLIC_ORIGIN must be an origin without trailing slash.');
  const secure = process.env.COOKIE_SECURE === 'true';
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname) && (!secure || url.protocol !== 'https:')) throw new Error('Remote administration requires HTTPS and COOKIE_SECURE=true. Prefer an SSH tunnel.');
  return {key,password,port,origin,secure,host:process.env.HOST ?? '127.0.0.1',dataDir:process.env.DATA_DIR ?? './data'};
}
