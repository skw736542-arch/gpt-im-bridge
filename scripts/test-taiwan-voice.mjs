import {synthesize} from '../dist/voice-engine.js';
import {writeFile} from 'node:fs/promises';
const start=Date.now();const audio=await synthesize('嗨，我是石原。今天过得怎么样？慢慢说，我在听。');
await writeFile(new URL('../../shiyuan-taiwan-preview.mp3',import.meta.url),audio.data);
console.log(JSON.stringify({voice:'zh-TW-HsiaoChenNeural',bytes:audio.data.length,elapsedMs:Date.now()-start,sample:'outputs/shiyuan-taiwan-preview.mp3'}));
