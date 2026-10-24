import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decode, encode, isSilk } from 'silk-wasm';
import { PublicError } from './ai.js';
export type Voice={data:Buffer;duration:number;wav?:Buffer;format?:'mp3'|'wav'};
const python=process.env.SPEECH_PYTHON??fileURLToPath(new URL(process.platform==='win32'?'../.venv/Scripts/python.exe':'../.venv/bin/python',import.meta.url));
export function voiceEngine(request:unknown,signal?:AbortSignal):Promise<{data?:string;text?:string;duration?:number;format?:'mp3'|'wav';error?:string}>{
 return new Promise((resolve,reject)=>{
 const child=spawn(python,[fileURLToPath(new URL('../scripts/voice-engine.py',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe'],signal:AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(90000)])});
 let output='';child.stdout.on('data',b=>{output+=b.toString();if(output.length>8_000_000)child.kill();});child.stderr.resume();child.stdin.on('error',()=>{});
 const fail=()=>reject(new PublicError('VOICE_ENGINE_FAILED','语音服务未完成，请检查网络或本地语音环境；文字聊天仍可使用。'));
 child.on('error',fail);child.on('close',code=>{if(code!==0)return fail();try{const data=JSON.parse(output);if(data.error)return fail();resolve(data);}catch{fail();}});child.stdin.end(JSON.stringify(request));
 });
}
export async function synthesize(text:string,signal?:AbortSignal):Promise<Voice>{
 if(!text.trim()||text.length>180)throw new PublicError('VOICE_LENGTH','单次语音限 180 字，请缩短内容。');
 const result=await voiceEngine({action:'tts',text},signal);const data=Buffer.from(result.data??'','base64');if(!data.length)throw new PublicError('EMPTY_AUDIO','语音服务没有返回音频。');return {data,duration:result.duration??0,format:result.format??'mp3'};
}
export async function qqVoice(voice:Voice,signal?:AbortSignal):Promise<Buffer>{
 if(isSilk(voice.data))return voice.data;
 const pcm=await voiceEngine({action:'pcm',data:voice.data.toString('base64')},signal);
 const result=await encode(Buffer.from(pcm.data??'','base64'),24000);
 if(!result.duration||result.duration>60000)throw new PublicError('VOICE_DURATION','QQ 语音需在 60 秒以内。');
 return Buffer.from(result.data);
}
export function pcmWav(pcm:Buffer,rate:number){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(pcm.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm]);}
let transcribing=false;
export async function transcribe(raw:Buffer,signal?:AbortSignal){
 if(raw.length>10*1024*1024)throw new PublicError('AUDIO_SIZE','语音超过 10 MB。');
 if(transcribing)throw new PublicError('ASR_BUSY','正在识别另一条语音，请稍后重新发送。');transcribing=true;
 try{if(isSilk(raw)){const pcm=await decode(raw,24000);if(pcm.duration>60000)throw new PublicError('AUDIO_DURATION','单条语音最多 60 秒。');raw=pcmWav(Buffer.from(pcm.data),24000);}
 const result=await voiceEngine({action:'asr',data:raw.toString('base64')},signal);if(!result.text?.trim())throw new PublicError('ASR_EMPTY','这段语音没有识别出清楚的内容，请靠近麦克风再说一次。');return result.text;
 }finally{transcribing=false;}
}
