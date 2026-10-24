import { mkdirSync, openSync, readFileSync, writeFileSync, closeSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { envConfig } from './config.js';
import { Store } from './store.js';
import { buildServer } from './server.js';
const env=envConfig();const dir=resolve(env.dataDir);mkdirSync(dir,{recursive:true,mode:0o700});
const lock=join(dir,'process.lock');
// One process owns the SQLite credential store: rotated refresh tokens must not race.
try {const fd=openSync(lock,'wx',0o600);writeFileSync(fd,String(process.pid));closeSync(fd);}catch(e){
  if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
  const pid=Number(readFileSync(lock,'utf8'));let alive=pid!==process.pid;if(alive&&Number.isSafeInteger(pid)&&pid>0){try{process.kill(pid,0);}catch(err){if((err as NodeJS.ErrnoException).code==='ESRCH')alive=false;}}
  if(alive||!Number.isSafeInteger(pid)||pid<=0)throw new Error('Data directory is already locked. Stop the other instance; remove process.lock only after verifying no bridge instance is running.');
  unlinkSync(lock);const fd=openSync(lock,'wx',0o600);writeFileSync(fd,String(process.pid));closeSync(fd);
}
const store=new Store(dir,env.key);
try {
  const server=await buildServer(store,{...env,staticRoot:resolve('dist/public')});
  await server.app.listen({port:env.port,host:env.host});server.startChannels();
  console.log(`GPT IM Bridge management: ${env.origin}. Read ADMIN_PASSWORD in your local .env.`);
  let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await server.app.close();store.close();unlinkSync(lock);process.exit(0);};
  process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
}catch(e){store.close();unlinkSync(lock);throw e;}
