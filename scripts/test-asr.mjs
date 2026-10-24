import {readFile} from 'node:fs/promises';
import {transcribe} from '../dist/voice-engine.js';
const start=Date.now();const audio=await readFile(new URL('../../shiyuan-taiwan-preview.mp3',import.meta.url));
const text=await transcribe(audio);console.log(JSON.stringify({recognized:!!text,elapsedMs:Date.now()-start,text}));
