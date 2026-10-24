import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import { Store } from '../dist/store.js';
import { buildServer } from '../dist/server.js';
import { readProfile, saveProfile } from '../dist/personas.js';
const dir=mkdtempSync(join(tmpdir(),'bridge-ui-'));const store=new Store(dir,randomBytes(32));
const password=randomBytes(24).toString('base64url');const port=Number(process.env.UI_TEST_PORT??8793);const origin=`http://127.0.0.1:${port}`;
saveProfile(store,readProfile(store,JSON.stringify(['weixin','test-bot','private','test-user'])));
const {app}=await buildServer(store,{password,origin,secure:false,staticRoot:resolve('dist/public')});
await app.listen({port,host:'127.0.0.1'});mkdirSync('test-results',{recursive:true});
const executable=process.env.BROWSER_PATH??['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(origin);await page.getByLabel('管理密码',{exact:true}).fill(password);await page.getByRole('button',{name:'进入配置中心'}).click();await page.locator('#shell').waitFor({state:'visible'});
  const first=await page.locator('#chat-model option').nth(1).getAttribute('value');assert(first);await page.locator('#chat-model').selectOption(first);await page.locator('#history-turns').fill('7');await page.getByRole('button',{name:'保存配置',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('#dirty-state').textContent==='配置已保存');
  await page.reload();await page.locator('#shell').waitFor({state:'visible'});assert.equal(await page.locator('#chat-model').inputValue(),first);assert.equal(await page.locator('#history-turns').inputValue(),'7');
  await page.getByRole('button',{name:'测试真实连接',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#chat-test-result').textContent.includes('请求未成功'));assert((await page.locator('#chat-test-result').textContent()).includes('OAuth'));
  if(process.env.UI_TEST_SKIP_OAUTH!=='1'){await page.getByRole('button',{name:'Sign in with ChatGPT',exact:true}).click();await page.getByRole('link',{name:'打开安全授权页面',exact:true}).waitFor();const authUrl=await page.getByRole('link',{name:'打开安全授权页面'}).getAttribute('href');assert(new URL(authUrl).searchParams.get('code_challenge'));await page.locator('#oauth-cancel').click();await page.locator('#oauth-flow').waitFor({state:'hidden'});}
  await page.locator('#model-filter').selectOption('audio');assert((await page.locator('#model-list').textContent()).includes('未提供音频模型'));await page.locator('#model-filter').selectOption('vision');assert((await page.locator('#model-count').textContent())!=='0 个模型');
  await page.locator('#notice').waitFor({state:'hidden',timeout:10000});
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`test-results/models-${width}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);}
  await page.setViewportSize({width:1440,height:1000});await page.locator('nav a[href="#channels"]').click();
  await page.locator('#onebot-users').fill('87654321');await page.locator('#onebot-idle').fill('90');await page.getByRole('button',{name:'保存普通 QQ 设置',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#dirty-state').textContent==='配置已保存');
  await page.reload();await page.locator('#shell').waitFor({state:'visible'});assert.equal(await page.locator('#onebot-users').inputValue(),'87654321');assert.equal(await page.locator('#onebot-idle').inputValue(),'90');
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`test-results/onebot-${width}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`QQ settings overflow at ${width}`);}
  await page.setViewportSize({width:1440,height:1000});
await page.screenshot({path:'test-results/channels-1440.png',fullPage:true});await page.locator('nav a[href="#capabilities"]').click();await page.screenshot({path:'test-results/capabilities-1440.png',fullPage:true});
  await page.locator('nav a[href="#activity"]').click();assert((await page.locator('#event-rows').textContent()).includes('LOGIN_REQUIRED'));await page.screenshot({path:'test-results/activity-1440.png',fullPage:true});
  await page.locator('nav a[href="#personas"]').click();await page.locator('#companion-name').fill('石原');await page.getByRole('button',{name:'保存角色设定',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#dirty-state').textContent==='配置已保存');
  await page.locator('#load-profiles').click();await page.locator('#save-memory').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#save-memory').disabled);
  await page.locator('#profile-role').selectOption('coach');await page.locator('#add-memory').click();await page.locator('.memory-input').fill('I am preparing for an interview.');await page.locator('#save-memory').click();await page.waitForFunction(()=>document.querySelector('#save-memory').disabled===false);await page.locator('#load-profiles').click();assert.equal(await page.locator('.memory-input').inputValue(),'I am preparing for an interview.');
  await page.waitForFunction(()=>!document.querySelector('#load-profiles').disabled);
  await page.locator('#profile-role').selectOption('companion');assert.equal(await page.locator('.memory-input').count(),0);await page.locator('#profile-role').selectOption('coach');
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`test-results/personas-${width}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  page.once('dialog',d=>d.accept());await page.locator('#clear-memory').click();await page.waitForFunction(()=>document.querySelectorAll('.memory-input').length===0);
  const unlabeled=await page.evaluate(()=>[...document.querySelectorAll('input,select,textarea')].filter(e=>!e.labels?.length&&!e.getAttribute('aria-label')).map(e=>e.id));assert.deepEqual(unlabeled,[]);assert.deepEqual(errors,[]);
  writeFileSync('test-results/ui-results.json',JSON.stringify({passed:true,widths:[1440,768,390],checks:['admin login','model selection and persistence after reload','unauthorized live test fails honestly','capability filters','navigation','no horizontal overflow','all form controls labeled','no browser JavaScript errors'],oauthUrlTest:process.env.UI_TEST_SKIP_OAUTH==='1'?'skipped in this run to preserve user login':'passed',realAccountAuthorized:false},null,2));
  console.log('UI checks passed at 1440 / 768 / 390 px; real account authorization is a separate acceptance step.');
}finally{await browser.close();await app.close();store.close();}
