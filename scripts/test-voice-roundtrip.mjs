import {synthesize,qqVoice,transcribe} from '../dist/voice-engine.js';
import {isSilk,getDuration} from 'silk-wasm';
import {mkdir,writeFile} from 'node:fs/promises';
const start=Date.now();
const audio=await synthesize('你好，我是石原。今天过得怎么样？');
const silk=await qqVoice(audio);if(!isSilk(silk)||getDuration(silk)<=0)throw new Error('SILK encoding failed');
const transcript=await transcribe(silk);if(!transcript.trim())throw new Error('Speech recognition failed');
await mkdir('test-results',{recursive:true});await writeFile('test-results/taiwan-voice.mp3',audio.data);
console.log(JSON.stringify({voice:'zh-TW-HsiaoChenNeural',nativeSilk:true,durationMs:getDuration(silk),recognized:true,transcript,elapsedMs:Date.now()-start,realQQDelivery:false}));
