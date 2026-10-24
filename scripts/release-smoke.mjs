import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
export async function waitReady(origin){for(let i=0;i<150;i++){try{if((await fetch(origin+'/health',{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await delay(200);}throw new Error('Service startup timed out');}
export async function login(origin,password){const response=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password})});assert.equal(response.status,200);const Cookie=response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');const state=await(await fetch(origin+'/api/state',{headers:{Cookie}})).json();return {state,headers:{Cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':state.csrf}};}
export async function checkCore(origin,password){assert.equal((await fetch(origin+'/api/state')).status,401);const {state,headers}=await login(origin,password);assert(state.providers.every(x=>!x.authorized));assert((await(await fetch(origin+'/api/models',{headers})).json()).models.length>0);assert((await fetch(origin+'/fonts/geist-latin.woff2')).ok);assert((await fetch(origin+'/companion-avatar.svg')).ok);assert.equal((await fetch(origin+'/api/config',{method:'PUT',headers:{...headers,'X-CSRF-Token':''},body:JSON.stringify(state.config)})).status,403);assert((await fetch(origin+'/api/config',{method:'PUT',headers,body:JSON.stringify({...state.config,historyTurns:6})})).ok);return headers;}
async function main(){const password=randomBytes(24).toString('base64url'),origin=`http://127.0.0.1:${process.env.RELEASE_TEST_PORT??8794}`,dir=mkdtempSync(join(tmpdir(),'bridge-clean-'));const env={...process.env,ADMIN_PASSWORD:password,ENCRYPTION_KEY:randomBytes(32).toString('base64'),PUBLIC_ORIGIN:origin,HOST:'127.0.0.1',PORT:new URL(origin).port,DATA_DIR:dir,COOKIE_SECURE:'false'};let child;
const start=async()=>{child=spawn(process.execPath,['dist/main.js'],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.resume();await waitReady(origin);};const stop=async()=>{if(!child||child.exitCode!==null)return;const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exited;};
try{await start();await checkCore(origin,password);await stop();await start();assert.equal((await login(origin,password)).state.config.historyTurns,6);console.log('Fresh runtime: login, CSRF, catalog, assets and restart persistence passed; no real account or message used.');}finally{await stop();}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
