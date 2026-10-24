import { randomUUID } from 'node:crypto';
import type { AuthPrompt, AuthEvent } from '@earendil-works/pi-ai';
import { AI, PublicError, publicError } from './ai.js';
type View={id:string;provider:string;state:string;stage:string;events:AuthEvent[];prompt?:Omit<AuthPrompt,'signal'>;error?:string};
export class OAuthManager {
  private current?:{view:View;abort:AbortController;answer?:(value:string)=>void;task:Promise<void>};
  constructor(private ai:AI){}
  view(){return this.current?.view??null;}
  async start(provider:string){
    if(!['openai','openai-codex','openrouter'].includes(provider))throw new PublicError('BAD_PROVIDER','不支持的授权供应商。');
    if(this.current?.view.state==='pending'&&this.current.view.provider===provider)return this.current.view;
    await this.cancel();
    const abort=new AbortController();const view:View={id:randomUUID(),provider,state:'pending',stage:'initializing',events:[]};
    const item={view,abort,answer:undefined as ((v:string)=>void)|undefined,task:Promise.resolve()};this.current=item;
    const timer=setTimeout(()=>abort.abort(),10*60_000);timer.unref();let exchangeTimer:ReturnType<typeof setTimeout>|undefined;
    item.task=this.ai.models.login(provider,'oauth',{
      signal:abort.signal,
      notify:event=>{view.events.push(event);view.events=view.events.slice(-12);if(event.type==='auth_url'||event.type==='device_code')view.stage='awaiting_user';if(event.type==='progress'&&/exchang|token/i.test(event.message)){view.stage='exchanging';if(!exchangeTimer){exchangeTimer=setTimeout(()=>abort.abort(),60000);exchangeTimer.unref();}}},
      prompt:p=>new Promise<string>((resolve,reject)=>{
        const {signal,...publicPrompt}=p;view.prompt=publicPrompt;
        const combined=AbortSignal.any([abort.signal,...(signal?[signal]:[])]);
        const cleanup=()=>{combined.removeEventListener('abort',cancel);delete view.prompt;item.answer=undefined;};
        const cancel=()=>{cleanup();reject(new Error('Login cancelled'));};
        item.answer=value=>{cleanup();resolve(value);};
        if(combined.aborted)cancel();else combined.addEventListener('abort',cancel,{once:true});
      }),
    },{getDeviceId:()=>this.ai.store.get('deviceId',''),agentName:'GPT IM Bridge'})
      .then(()=>{view.state='authorized';view.stage='saved';view.events=[];this.ai.store.log('oauth','AUTHORIZED',`${provider} 授权已保存，仍需测试实际模型请求。`);})
      .catch(e=>{view.state=abort.signal.aborted?'cancelled':'error';view.stage='failed';view.error=publicError(e).message;this.ai.store.log('oauth','LOGIN_FAILED',view.error);})
      .finally(()=>{clearTimeout(timer);clearTimeout(exchangeTimer);delete view.prompt;item.answer=undefined;});
    return view;
  }
  answer(id:string,value:string){if(this.current?.view.id!==id||!this.current.answer)throw new PublicError('STALE_LOGIN','登录流程已结束或已更换，请刷新状态。');this.current.answer(value);}
  async cancel(){if(this.current?.view.state==='pending'){this.current.abort.abort();await this.current.task;}}
  async logout(provider:string){await this.cancel();await this.ai.models.logout(provider);this.ai.store.clearHistory();this.ai.store.log('oauth','LOGOUT',`${provider} 本地凭证已删除。`);}
}
