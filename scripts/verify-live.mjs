// Talks to the running instance so refresh-token writes keep their single-process lock.
const origin=process.env.PUBLIC_ORIGIN??'http://127.0.0.1:8787';
const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:process.env.ADMIN_PASSWORD})});
if(!login.ok)throw new Error('Cannot sign in to local admin service. Load .env and start the bridge first.');
const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
let state=await (await fetch(origin+'/api/state',{headers:{Cookie:cookie}})).json();
const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':state.csrf};
try{
  const provider=state.config.chatModel.split(':')[0];
  if(process.argv.includes('--test-model')&&state.config.chatModel&&state.providers.some(p=>p.id===provider&&p.authorized)){
    await fetch(origin+'/api/test',{method:'POST',headers,body:JSON.stringify({kind:'chat'})});
    state=await (await fetch(origin+'/api/state',{headers:{Cookie:cookie}})).json();
  }
  console.log(JSON.stringify({oauthSaved:state.providers.filter(p=>p.authorized).map(p=>({provider:p.id,type:p.type})),oauthFlow:state.oauth?{provider:state.oauth.provider,state:state.oauth.state,error:state.oauth.error,events:state.oauth.events.map(e=>e.type),hasPrompt:!!state.oauth.prompt}:null,chatTest:state.tests.chat,weixin:{authorized:state.weixin.authorized,state:state.weixin.state,lastReply:state.weixin.lastReply},qq:{authorized:state.qq.authorized,lastReply:state.qq.lastReply},onebot:state.onebot?{state:state.onebot.state,configured:state.onebot.authorized,lastReply:state.onebot.lastReply}:null,note:'No credentials or callback URLs are included. Null means not verified.'},null,2));
}finally{await fetch(origin+'/api/logout',{method:'POST',headers,body:'{}'});}
