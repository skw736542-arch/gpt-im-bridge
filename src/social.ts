import type { Config } from './config.js';
export type SocialState={lastIncoming:number;lastAttempt:number;unanswered:boolean;paused:boolean;day:string;attempts:number;nextCheck?:number;checksDay?:string;checks?:number};
export function clockParts(now:number){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return {day:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour),minute:Number(p.minute)};}
export function scheduleConsideration(s:SocialState,now:number,idleMinutes:number,random=Math.random):SocialState {
 return {...s,nextCheck:now+(idleMinutes+Math.floor(Math.max(0,Math.min(0.999999,random()))*31))*60000};
}
export function proactiveDue(c:Config['onebot'],s:SocialState,now:number){const {day,hour}=clockParts(now);const quiet=c.quietStart===c.quietEnd?false:c.quietStart<c.quietEnd?hour>=c.quietStart&&hour<c.quietEnd:hour>=c.quietStart||hour<c.quietEnd;
 return c.enabled&&c.proactive&&!quiet&&!s.paused&&!s.unanswered&&s.lastIncoming>0&&now-s.lastIncoming<7*86400000&&now-Math.max(s.lastIncoming,s.lastAttempt)>=c.idleMinutes*60000&&now>=(s.nextCheck??0)&&(s.day!==day||s.attempts<c.dailyLimit)&&(s.checksDay!==day||(s.checks??0)<12);
}
export function reserveAttempt(s:SocialState,now:number,idleMinutes=10,random=Math.random):SocialState {const day=clockParts(now).day;return scheduleConsideration({...s,day,attempts:s.day===day?s.attempts+1:1,checksDay:day,checks:s.checksDay===day?(s.checks??0)+1:1,lastAttempt:now,unanswered:true},now,idleMinutes,random);}
export function releaseSilent(s:SocialState):SocialState{return {...s,unanswered:false,attempts:Math.max(0,s.attempts-1)};}
export function initiativePrompt(now:number){const {day,hour,minute}=clockParts(now);
 return `此刻是北京时间 ${day} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}。这只是一次自主判断机会，没有规定你必须发消息，没有固定的早安或晚安打卡。结合聊天时间、最近话题、已确认的偏好和你刚说过什么，决定此刻是否有值得主动表达的内容。可以分享一个与对方有关的想法、提出一个真有兴趣的问题、接续没聊完的话题，或在合适的时间自然问候。不要猜测对方正在做什么，不捏造自己的现实活动，不因没有回复而追问，不重复上次内容。没有新想法或此时不适合联系，就只输出 [SILENT]。`;
}
export function conversationParts(text:string):string[]{
 const blocks=text.trim().split(/\n\s*\n/).filter(Boolean);if(blocks.length>3)return [text];return blocks.length?blocks:[text];
}
