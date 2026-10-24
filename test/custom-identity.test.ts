import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {Store} from '../src/store.js';
import {readProfile,personaPrompt} from '../src/personas.js';

test('fresh deployment has a generic template; a chosen identity persists across modes and restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bridge-identity-')),key=randomBytes(32);let store=new Store(dir,key);
 try{assert.equal(store.config().personas.companionName,'小伴');const config=store.config();config.personas.companionName='星澜';config.personas.defaultRole='companion';store.saveConfig(config);store.close();store=new Store(dir,key);const p=readProfile(store,'new-private-conversation');assert.equal(p.role,'companion');for(const role of ['general','coach','companion'] as const){p.role=role;const prompt=personaPrompt(store,p);assert(prompt.includes('星澜'));assert(!prompt.includes('石原'));}assert.deepEqual(p.memories,{general:[],coach:[],companion:[]});}finally{store.close();}
});
