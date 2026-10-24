import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encode } from 'silk-wasm';
import { PublicError } from './ai.js';
export type Voice={data:Buffer;duration:number;wav?:Buffer};
export async function synthesize(text:string,signal?:AbortSignal):Promise<Voice>{
 if(process.platform!=='win32')throw new PublicError('VOICE_PLATFORM','本版本语音合成仅支持 Windows 本地语音库。');
 if(!text.trim()||text.length>180)throw new PublicError('VOICE_LENGTH','单次语音限 180 字，请缩短内容。');
 const voice=/[\u3400-\u9fff]/u.test(text)?'Microsoft Huihui Desktop':'Microsoft Zira Desktop';
 const wav=await new Promise<Buffer>((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../scripts/speak.ps1',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe'],signal:AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(25000)])});
  let output='';child.stdout.on('data',b=>{output+=b.toString();if(output.length>8_000_000)child.kill();});child.stderr.resume();child.stdin.on('error',()=>{});
  child.on('error',()=>reject(new PublicError('VOICE_LOCAL_FAILED','本地语音合成失败或超时，文字回复仍然可用。')));
  child.on('close',code=>{if(code!==0)return reject(new PublicError('VOICE_LOCAL_FAILED','本地语音合成失败，请检查 Windows 语音库。'));resolve(Buffer.from(output.trim(),'base64'));});
  child.stdin.end(JSON.stringify({voice,text}));
 });
 const result=await encode(wav,24000);if(result.duration>60000)throw new PublicError('VOICE_TOO_LONG','语音超过 60 秒，请缩短内容。');
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(wav.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(24000,24);header.writeUInt32LE(48000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(wav.length,40);
 return {data:Buffer.from(result.data),duration:result.duration,wav:Buffer.concat([header,wav])};
}
