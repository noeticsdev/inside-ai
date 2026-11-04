// Dependency-free Chrome/CDP visual and interaction checks. Run with Bun after preview-platform.mjs.
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createClient } from '@libsql/client';
import { migrate } from '../server/db';
import { createApp } from '../server/app';
const root=resolve(import.meta.dir,'..'),dist=join(root,'dist');
const catalog=await Bun.file(join(dist,'catalog.json')).json();
const db=createClient({url:'file::memory:'}); await migrate(db);
const app=createApp({db,distDir:dist,catalog,allowMissingOrigin:true});
const server=Bun.serve({port:0,fetch:app.fetch});
const base=String(server.url).replace(/\/$/,'');
const pass=process.argv.find(a=>a.startsWith('--pass='))?.split('=')[1]||'1';
const shots=join(root,'shots/platform',`pass-${pass}`);mkdirSync(shots,{recursive:true});
const profile=mkdtempSync(join(tmpdir(),'ia-pages-'));
const chrome=Bun.spawn(['/usr/bin/google-chrome','--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--hide-scrollbars','--force-color-profile=srgb','about:blank'],{stdout:'ignore',stderr:'ignore'});
async function waitFor(fn) { const end=Date.now()+15000; while(Date.now()<end){try{const v=await fn();if(v)return v;}catch{}await Bun.sleep(80);}throw new Error('Browser timeout'); }
let ws;
const problems=[];
try {
 const port=await waitFor(async()=>Number((await Bun.file(join(profile,'DevToolsActivePort')).text()).split('\n')[0]));
 const version=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
 ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let next=0;const pending=new Map();const errors=[];
 ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p?.reject(Error(d.error.message)):p?.resolve(d.result);}else if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text);else if(d.method==='Runtime.consoleAPICalled' && d.params.type==='error')errors.push(d.params.args.map(a=>a.value||a.description).join(' '));};
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const s=(m,p)=>send(m,p,sessionId);
 await s('Page.enable');await s('Runtime.enable');await s('Network.enable');
 const evaluate=async expression=>{const r=await s('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 async function goto(path,width=1440,theme='light'){
  await s('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await s('Page.navigate',{url:`${base}${path}${path.includes('?')?'&':'?'}theme=${theme}`});
  await waitFor(()=>evaluate('document.readyState === "complete"'));
  await Bun.sleep(180);
 }
 async function shot(name,full=true){
  const overflow=await evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth');
  if(overflow>1)problems.push(`${name}: ${overflow}px horizontal overflow`);
  const height=await evaluate('document.documentElement.scrollHeight');
  const width=await evaluate('innerWidth');
  const {data}=await s('Page.captureScreenshot',{format:'png',captureBeyondViewport:full,...(full?{clip:{x:0,y:0,width,height,scale:1}}:{})});
  writeFileSync(join(shots,`${name}.png`),Buffer.from(data,'base64'));
 }
 const check=(v,message)=>{if(!v)throw Error(message);};
 // Use real API requests from the browser, including CSRF checks and cookies.
 await goto('/');
 await evaluate(`localStorage.setItem('ia:progress:v1',JSON.stringify({[${JSON.stringify(catalog[0].slug)}]:{missions:{observe:Date.now(),tune:Date.now()},seconds:150,runs:3,last:Date.now(),answers:{},quiz:null}}))`);
 for(const theme of ['light','dark'])for(const width of [1440,390]){
  const size=width===390?'phone':'desktop';
  for(const [path,name] of [['/','home'],['/login/','login'],['/me/','me-local'],['/teach/','teach-intro'],['/404.html','404']]){
   await goto(path,width,theme);await shot(`${name}-${size}-${theme}`);
   if(name==='home')check(await evaluate('[...document.querySelectorAll(".hero-machine img")].every(i=>i.complete&&i.naturalWidth>0)'),'machine thumbnail failed to load');
  }
 }
 await goto('/');
 await evaluate('document.querySelector(\'[data-filter="systems"]\').click()');
 const systems=catalog.filter(m=>m.track==='systems').length;
 check(await evaluate(`[...document.querySelectorAll("[data-machine]")].filter(e=>!e.hidden).length === ${systems}`),`track filter did not show ${systems} systems machines`);
 await evaluate('document.querySelector(\'[data-theme-toggle]\').click()');
 check(await evaluate('localStorage.getItem("ia:theme")==="dark"'),'theme did not persist');
 await goto('/login/?mode=signup&next=%2Fme%2F');
 check(await evaluate('!document.querySelector("[data-signup]").hidden'),'signup tab did not open');
 await evaluate(`(()=>{const f=document.querySelector('[data-auth-form]');f.elements.name.value='Ada';f.elements.email.value='ada@example.com';f.elements.password.value='password123';f.requestSubmit();})()`);
 await waitFor(()=>evaluate('location.pathname === "/me/"'));
 await waitFor(()=>evaluate('document.querySelector("[data-greeting]")?.textContent.includes("Ada")'));
 check(await evaluate(`fetch('/api/progress').then(r=>r.json()).then(d=>d.progress[${JSON.stringify(catalog[0].slug)}].runs===3)`),'signup did not import browser progress');
 const browserApi=async(path,body)=>evaluate(`fetch(${JSON.stringify('/api'+path)},{method:${JSON.stringify(body===undefined?'GET':'POST')},headers:{'content-type':'application/json'},${body===undefined?'':`body:JSON.stringify(${JSON.stringify(body)}),`}credentials:'include'}).then(async r=>({status:r.status,data:await r.json()}))`);
 await browserApi('/auth/logout',{});
 await browserApi('/auth/signup',{email:'teacher@example.com',password:'password123',name:'Dr. Rao',role:'educator'});
 await goto('/teach/');
 await waitFor(()=>evaluate('!document.querySelector("[data-teach-workbench]").hidden'));
 await shot('teach-empty-desktop-light');
 await evaluate(`(()=>{const f=document.querySelector('[data-create-class]');f.elements.name.value='AI systems · Autumn lab';f.requestSubmit();})()`);
 await waitFor(()=>evaluate('Boolean(document.querySelector("[data-copy-code]"))'));
 const group=(await browserApi('/classes')).data.classes[0];
 await browserApi('/auth/logout',{});
 // Seed two learner accounts through the same API the machines use.
 for(let n=0;n<3;n++){
  await browserApi('/auth/signup',{email:`learner${n}@example.com`,password:'password123',name:['Ada Lovelace','Alan Turing','Grace Hopper'][n],role:'learner'});
  if(n===0){
   await goto('/me/');
   await evaluate(`(()=>{const f=document.querySelector('[data-join]');f.elements.code.value=${JSON.stringify(group.code)};f.requestSubmit();})()`);
   await waitFor(()=>evaluate('document.querySelector("[data-join-status]").textContent.startsWith("Joined")'));
  }else await browserApi('/classes/join',{code:group.code});
  const events=[];
  for(const [i,m] of catalog.entries())if(i<n+3){
   const at=Date.now();const add=(type,data={})=>events.push({slug:m.slug,type,data,at});
   add('view');add('run');add('heartbeat',{seconds:45});
   m.missions.slice(0,i%3===0?m.missions.length:2).forEach(m=>add('mission',{id:m.id}));
   add('predict',{answer:(n+1)%4});
   for(let q=1;q<6;q++)add('answer',{index:q,stage:m.quiz[q].stage,answer:(q+n+(q===2?1:0))%4});
   add('quiz_done',{score:4,of:5});
  }
  await browserApi('/events',{events});
  await browserApi('/auth/logout',{});
 }
 await browserApi('/auth/login',{email:'teacher@example.com',password:'password123'});
 for(const theme of ['light','dark'])for(const width of [1440,390]){
  await goto('/teach/',width,theme);
  await waitFor(()=>evaluate('Boolean(document.querySelector("[data-copy-code]"))'));
  await shot(`teach-insights-${width===390?'phone':'desktop'}-${theme}`);
  check(await evaluate('document.querySelectorAll(".difficulty-item").length===6'),'default question filter should show one machine');
  await evaluate('document.querySelector("[data-question-machine]").value="all";document.querySelector("[data-question-machine]").dispatchEvent(new Event("change"))');
  check(await evaluate('document.querySelectorAll(".difficulty-item").length>6'),'all-questions filter did not expand');
 }
 const csv=await evaluate(`fetch('/api/classes/${group.id}/insights.csv').then(r=>r.text())`);check(csv.includes('Ada Lovelace'),'CSV missing class learner');
 await browserApi('/auth/logout',{});
 await browserApi('/auth/login',{email:'learner0@example.com',password:'password123'});
 for(const theme of ['light','dark'])for(const width of [1440,390]){
  await goto('/me/',width,theme);await waitFor(()=>evaluate('document.querySelector("[data-greeting]")?.textContent.includes("Ada Lovelace")'));
  await shot(`me-synced-${width===390?'phone':'desktop'}-${theme}`);
 }
 // Offline/static host behavior: no API, but local mission rings and guest navigation survive.
 await s('Network.setBlockedURLs',{urls:[`${base}/api/*`]});
 await goto('/me/',390);await waitFor(()=>evaluate('document.querySelector("[data-connection]")?.textContent.includes("Offline")'));
 check(await evaluate(`(()=>{const m=JSON.parse(document.querySelector('#ia-catalog').textContent)[0],p=JSON.parse(localStorage.getItem('ia:progress:v1'))[m.slug],n=m.missions.filter(x=>p.missions[x.id]).length;return document.querySelector('.progress-ring').getAttribute('aria-label')===n+' of '+m.missions.length+' missions';})()`),'offline mission ring lost local progress');
 await shot('me-offline-phone-light');
 await goto('/login/?next=https%3A%2F%2Fevil.example',390);
 await evaluate('document.querySelector("[data-guest]").click()');
 await waitFor(()=>evaluate('location.pathname==="/me/"'));
 check(await evaluate(`location.origin===${JSON.stringify(base)}`),'guest redirect left the site');
 await s('Network.setBlockedURLs',{urls:[]});
 problems.push(...errors);
 if(problems.length)throw Error(problems.join('\n'));
 console.log(`✓ Browser flows, filters, theme, signup/import, class insights, CSV, offline fallback, no overflow or JS errors.\n✓ ${shots} (30 screenshots)`);
} finally {ws?.close();chrome.kill();await server.stop(true);db.close();await Bun.sleep(150);rmSync(profile,{recursive:true,force:true});}
