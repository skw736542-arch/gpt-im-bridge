import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {waitReady,login,checkCore} from './release-smoke.mjs';
const execute=promisify(execFile),id=randomBytes(6).toString('hex'),name='bridge-smoke-'+id,volume=name+'-data',image='gpt-im-bridge-test:'+id,password=randomBytes(24).toString('base64url');
const docker=async(...args)=>(await execute('docker',args,{maxBuffer:8*1024*1024,timeout:600000})).stdout.trim();
const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const origin='http://127.0.0.1:'+port;
let started=false,createdVolume=false;
try{
 await docker('build','-t',image,'.');await docker('volume','create',volume);createdVolume=true;
 await docker('run','--detach','--name',name,'--read-only','--tmpfs','/tmp','--cap-drop=ALL','--security-opt','no-new-privileges:true','-p','127.0.0.1:'+port+':8787','-p','127.0.0.1:1455:1455','-v',volume+':/app/data','-e','HOST=0.0.0.0','-e','PUBLIC_ORIGIN='+origin,'-e','PI_OAUTH_CALLBACK_HOST=0.0.0.0','-e','ADMIN_PASSWORD='+password,'-e','ENCRYPTION_KEY='+randomBytes(32).toString('base64'),image);started=true;
 await waitReady(origin);const headers=await checkCore(origin,password);
 assert.equal(await docker('inspect','--format','{{.Config.User}}',name),'node');
 assert.equal(await docker('inspect','--format','{{.HostConfig.ReadonlyRootfs}}',name),'true');
 assert((await fetch(origin+'/api/oauth/start',{method:'POST',headers,body:JSON.stringify({provider:'openai'})})).ok);
 let ready=false;for(let i=0;i<50;i++){const state=await(await fetch(origin+'/api/state',{headers})).json();if(state.oauth?.events?.some(x=>x.type==='auth_url')){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert(ready,'OAuth authorization URL not produced');
 const callback=await fetch('http://127.0.0.1:1455/auth/callback?code=test&state=wrong&client_id=test');assert.equal(callback.status,400,'Mapped callback must reject incorrect state');
 assert((await fetch(origin+'/api/oauth/cancel',{method:'POST',headers,body:'{}'})).ok);
 await docker('restart',name);await waitReady(origin);assert.equal((await login(origin,password)).state.config.historyTurns,6);
 console.log('Docker: non-root read-only runtime, authentication, persistence and mapped OAuth callback rejection passed. Real account token exchange is separate.');
}catch(error){if(started)console.error('Isolated test container output:',await docker('logs',name).catch(()=>'unavailable'));throw error;
}finally{if(started)await docker('rm','--force',name);if(createdVolume)await docker('volume','rm',volume);await docker('image','rm',image).catch(()=>{});}
