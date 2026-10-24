import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../src/config.js';
import {proactiveDue,reserveAttempt,releaseSilent,scheduleConsideration,initiativePrompt,clockParts,type SocialState} from '../src/social.js';

const noon=Date.parse('2026-10-24T12:00:00+08:00');
function fixture(){const c=defaults().onebot;Object.assign(c,{enabled:true,proactive:true,idleMinutes:10,quietStart:22,quietEnd:9,dailyLimit:3});const s:SocialState={lastIncoming:noon-3600000,lastAttempt:0,unanswered:false,paused:false,day:'',attempts:0};return {c,s};}

test('opportunity times vary, survive reload, and do not force a greeting',()=>{
 const {c,s}=fixture();const early=scheduleConsideration(s,noon,10,()=>0),late=scheduleConsideration(s,noon,10,()=>0.999);
 assert.equal(early.nextCheck,noon+10*60000);assert.equal(late.nextCheck,noon+40*60000);
 assert(!proactiveDue(c,JSON.parse(JSON.stringify(late)),noon+20*60000));assert(proactiveDue(c,late,noon+41*60000));
 const prompt=initiativePrompt(noon);assert(prompt.includes('没有固定的早安'));assert(prompt.includes('[SILENT]'));assert(prompt.includes('想法'));assert(prompt.includes('12:00'));
});

test('silent decisions retain the next check, release send budget, and have a separate daily evaluation cap',()=>{
 const {c,s}=fixture();const reserved=reserveAttempt(s,noon,10,()=>0.5);const silent=releaseSilent(reserved);
 assert.equal(silent.unanswered,false);assert.equal(silent.attempts,0);assert.equal(silent.checks,1);assert.equal(silent.nextCheck,reserved.nextCheck);
 assert(!proactiveDue(c,silent,noon+15*60000));assert(proactiveDue(c,silent,noon+41*60000));
 assert(!proactiveDue(c,{...silent,checks:12},noon+41*60000));
 assert(proactiveDue(c,{...silent,checks:12},noon+86400000));
});

test('unanswered contact, opt-out, quiet hours, stale conversations and send limits all suppress initiative',()=>{
 const {c,s}=fixture();assert(!proactiveDue(c,reserveAttempt(s,noon),noon+3600000));assert(!proactiveDue(c,{...s,paused:true},noon));
 assert(!proactiveDue(c,s,Date.parse('2026-10-24T23:00:00+08:00')));assert(!proactiveDue(c,{...s,lastIncoming:noon-8*86400000},noon));
 assert(!proactiveDue(c,{...s,day:clockParts(noon).day,attempts:3},noon));
});
