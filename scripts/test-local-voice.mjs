import {synthesize} from '../dist/speech.js';
import {isSilk,decode} from 'silk-wasm';
import assert from 'node:assert/strict';
const start=Date.now();const voice=await synthesize('你好，我是石原。');assert(isSilk(voice.data));const pcm=await decode(voice.data,24000);assert(pcm.data.length>0);assert(voice.duration>0&&voice.duration<60000);console.log(JSON.stringify({silkValid:true,decodePassed:true,durationMs:voice.duration,elapsedMs:Date.now()-start,bytes:voice.data.length}));
