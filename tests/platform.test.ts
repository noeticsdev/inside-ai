import { test, expect, beforeEach, afterEach, setDefaultTimeout } from 'bun:test';
import { createClient, type Client } from '@libsql/client';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../server/db';
import { createApp } from '../server/app';
import { hash } from '../server/auth';

setDefaultTimeout(60000);
const catalog = [{ slug: 'tokens', title: 'Inside a tokenizer', level: 'starter', order: 1, missions: [{ id:'small' },{ id:'merge' },{ id:'break' }], quiz: ['pre','check','check','check','post','post'].map((stage,i) => ({ stage,question:`Question ${i}: what moved?`,options:['A','B','C','D'],correct:i%4 })) },{ slug: 'vectors', title: 'Inside vectors', level: 'core', order: 2, missions: [{ id:'find' }], quiz: ['pre','check','check','check','post','post'].map(stage => ({ stage,question:'Where?',options:['A','B','C','D'],correct:0 })) }];
let db: Client, app: ReturnType<typeof createApp>, dir: string;
beforeEach(async () => {
  db = createClient({url:'file::memory:'}); await migrate(db);
  dir = await mkdtemp(join(tmpdir(),'ia-platform-')); await mkdir(join(dir,'login'));
  await writeFile(join(dir,'index.html'),'<h1>Home</h1>'); await writeFile(join(dir,'login/index.html'),'<h1>Login</h1>'); await writeFile(join(dir,'404.html'),'<h1>Lost machine</h1>'); await writeFile(join(dir,'figure.svg'),'<svg/>');
  app = createApp({db,distDir:dir,catalog,allowMissingOrigin:true});
});
afterEach(async () => { db.close(); await rm(dir,{recursive:true,force:true}); });
function request(path: string, body?: any, cookie = '', headers: Record<string,string> = {}) { return app.request(`http://localhost${path}`,{ method:body === undefined ? 'GET':'POST',headers:{ ...(body === undefined ? {}:{'content-type':'application/json'}),...(cookie ? {cookie}:{}),...headers },body:body === undefined ? undefined:JSON.stringify(body) }); }
const cookieOf = (r: Response) => r.headers.get('set-cookie')!.split(';')[0];
async function signup(email = 'learner@example.com', role = 'learner', cookie = '', name = 'Ada') { return request('/api/auth/signup',{ email,password:'password123',name,role },cookie); }
const event = (type: string, data: any = {}, slug = 'tokens', at = Date.now()) => ({slug,type,data,at});
const send = (cookie: string, events: any[]) => request('/api/events',{events},cookie);
async function progress(cookie: string) { return (await (await request('/api/progress',undefined,cookie)).json()).progress; }
async function cohort() {
  const educator = cookieOf(await signup('teacher@example.com','educator'));
  const group = await (await request('/api/classes',{name:'AI lab'},educator)).json();
  const learner = cookieOf(await signup());
  await request('/api/classes/join',{code:group.code},learner);
  await send(learner,[event('predict',{answer:1,correct:true}),event('heartbeat',{seconds:30}),event('heartbeat',{seconds:30}),event('run'),event('mission',{id:'small'}),...[1,2,3,4,5].map(index => event('answer',{index,stage:catalog[0].quiz[index].stage,answer:index === 2 ? 0 : index%4,correct:false})),event('quiz_done',{score:5,of:5})]);
  return {educator,learner,group};
}
test('signup sets a secure-shaped cookie and persists a salted password',async () => {
  const r = await signup(); expect(r.status).toBe(201); expect(r.headers.get('set-cookie')).toContain('HttpOnly'); expect(r.headers.get('set-cookie')).toContain('SameSite=Lax'); expect(r.headers.get('set-cookie')).toContain('Max-Age=2592000');
  const u = (await db.execute('SELECT * FROM users')).rows[0]; expect(u.password_hash).not.toContain('password123'); expect(String(u.password_hash).split(':')).toHaveLength(2);
  expect((await (await request('/api/me',undefined,cookieOf(r))).json()).user.email).toBe('learner@example.com');
});
test('session tokens are stored hashed',async () => { const r = await signup(); const raw = cookieOf(r).split('=')[1]; const row = (await db.execute('SELECT * FROM sessions')).rows[0]; expect(row.token_hash).toBe(hash(raw)); expect(row.token_hash).not.toBe(raw); });
test('login rotates sessions and logout revokes access',async () => { const original = cookieOf(await signup()); const r = await request('/api/auth/login',{email:'learner@example.com',password:'password123'},original); expect(r.status).toBe(200); expect((await request('/api/progress',undefined,original)).status).toBe(401); const cookie = cookieOf(r); expect((await request('/api/auth/logout',{},cookie)).status).toBe(200); expect((await request('/api/progress',undefined,cookie)).status).toBe(401); });
test('wrong password and unknown email both return 401',async () => { await signup(); for (const email of ['learner@example.com','missing@example.com']) expect((await request('/api/auth/login',{email,password:'wrongpass'})).status).toBe(401); });
test('auth validation rejects invalid inputs',async () => { for (const change of [{email:'bad'},{password:'short'},{name:'x'.repeat(61)},{role:'admin'},{name:' '}]) expect((await request('/api/auth/signup',{email:'x@example.com',password:'password123',name:'Name',role:'learner',...change})).status).toBe(400); });
test('duplicate email returns conflict',async () => { await signup(); expect((await signup()).status).toBe(409); });
test('login is rate limited',async () => { let last; for(let i=0;i<13;i++) last = await request('/api/auth/login',{email:'missing@example.com',password:'wrongpass'}); expect(last!.status).toBe(429); });
test('signup is rate limited',async () => { let last; for(let i=0;i<13;i++) last = await request('/api/auth/signup',{email:'bad'}); expect(last!.status).toBe(429); });
test('guest signup upgrades the same user and keeps progress',async () => { const guest = await send('',[event('mission',{id:'small'}),event('run')]); const cookie = cookieOf(guest); const before = (await (await request('/api/me',undefined,cookie)).json()).user; expect(before.guest).toBe(true); const upgraded = await signup('upgraded@example.com','learner',cookie); const after = (await upgraded.json()).user; expect(after.id).toBe(before.id); expect(after.guest).toBe(false); const p = await progress(cookieOf(upgraded)); expect(p.tokens.runs).toBe(1); expect(p.tokens.missions.small).toBeTruthy(); });
test('guest route retains an existing account',async () => { const cookie = cookieOf(await signup()); const r = await request('/api/auth/guest',{},cookie); expect((await r.json()).user.guest).toBe(false); expect(r.headers.get('set-cookie')).toBeNull(); });
test('expired session is unauthenticated',async () => { const cookie = cookieOf(await signup()); await db.execute('UPDATE sessions SET expires_at=0'); expect((await (await request('/api/me',undefined,cookie)).json()).user).toBeNull(); });
test('bad event type does not create a guest',async () => { expect((await send('',[event('fake')])).status).toBe(400); expect((await db.execute('SELECT COUNT(*) AS n FROM users')).rows[0].n).toBe(0); });
test('event batch over 200 is rejected',async () => { expect((await send('',Array.from({length:201},() => event('view')))).status).toBe(400); });
test('event data over 2KB is rejected',async () => { expect((await send('',[event('control',{name:'text',value:'x'.repeat(2100)})])).status).toBe(400); });
test('unknown slugs are dropped',async () => { const r = await send('',[event('view',{},'missing')]); expect((await r.json()).accepted).toBe(0); expect(r.headers.get('set-cookie')).toBeNull(); });
test('invalid mission and heartbeat values are rejected',async () => { for (const e of [event('mission',{id:'missing'}),event('heartbeat',{seconds:-1}),event('heartbeat',{seconds:61}),event('answer',{index:8,stage:'post',answer:0})]) expect((await send('',[e])).status).toBe(400); });
test('event batch validation is atomic',async () => { const cookie = cookieOf(await signup()); expect((await send(cookie,[event('run'),event('bad')])).status).toBe(400); expect(await progress(cookie)).toEqual({}); });
test('upsert adds runs and seconds, deduplicates missions, retains first and last',async () => { const cookie = cookieOf(await signup()); const at=Date.now()-10000; await send(cookie,[event('view',{},'tokens',at),event('run'),event('heartbeat',{seconds:30}),event('mission',{id:'small'}),event('mission',{id:'small'})]); await send(cookie,[event('run'),event('heartbeat',{seconds:15})]); const p=(await progress(cookie)).tokens; expect(p.runs).toBe(2); expect(p.seconds).toBe(45); expect(Object.keys(p.missions)).toHaveLength(1); expect(p.first).toBe(at); expect(p.last).toBeGreaterThan(at); });
test('answers and checkpoints are scored using the catalog',async () => { const {learner} = await cohort(); const p = (await progress(learner)).tokens; expect(p.predict.correct).toBe(false); expect(p.quiz).toEqual({score:4,best:4,of:5}); expect(p.answers[2].correct).toBe(false); });
test('checkpoint without answers is not accepted as a score',async () => { const cookie = cookieOf(await signup()); await send(cookie,[event('quiz_done',{score:5,of:5})]); expect((await progress(cookie)).tokens.quiz).toBeNull(); });
test('checkpoint best survives a lower retake',async () => { const {learner} = await cohort(); await send(learner,[...[1,2,3,4,5].map(index => event('answer',{index,stage:catalog[0].quiz[index].stage,answer:(index+1)%4})),event('quiz_done',{score:0,of:5})]); expect((await progress(learner)).tokens.quiz).toEqual({score:0,best:4,of:5}); });
test('offline import merges valid known progress and is idempotent',async () => { const cookie = cookieOf(await signup()); await send(cookie,[event('run'),event('heartbeat',{seconds:30})]); const body = {progress:{ tokens:{missions:{small:1,fake:1},seconds:90,runs:4,predict:{answer:0,correct:false},answers:{1:{answer:1,correct:false}},quiz:{score:4,best:5,of:5},last:Date.now()},unknown:{runs:99} }}; expect((await request('/api/progress/import',body,cookie)).status).toBe(200); await request('/api/progress/import',body,cookie); const p=await progress(cookie); expect(Object.keys(p)).toEqual(['tokens']); expect(p.tokens.runs).toBe(4); expect(p.tokens.seconds).toBe(90); expect(Object.keys(p.tokens.missions)).toEqual(['small']); expect(p.tokens.predict.correct).toBe(true); expect(p.tokens.quiz.best).toBe(5); });
test('import requires authentication and an object',async () => { expect((await request('/api/progress/import',{progress:{}})).status).toBe(401); const cookie=cookieOf(await signup()); expect((await request('/api/progress/import',{progress:[]} ,cookie)).status).toBe(400); });
test('summary reports paired gain, minutes, completion and recommendation',async () => { const {learner}=await cohort(); await send(learner,[event('mission',{id:'merge'}),event('mission',{id:'break'})]); const s=await (await request('/api/me/summary',undefined,learner)).json(); expect(s.machinesStarted).toBe(1); expect(s.machinesCompleted).toBe(1); expect(s.missionsDone).toBe(3); expect(s.averageCheckpoint).toBe(0.8); expect(s.predictionAccuracy).toBe(0); expect(s.checkpointAccuracy).toBe(0.8); expect(s.learningGain).toBe(0.8); expect(s.activeMinutes).toBe(1); expect(s.streakDays).toBe(1); expect(s.next.slug).toBe('vectors'); });
test('summary empty metrics are null instead of invented accuracy',async () => { const cookie=cookieOf(await signup()); const s=await (await request('/api/me/summary',undefined,cookie)).json(); expect(s.learningGain).toBeNull(); expect(s.averageCheckpoint).toBeNull(); expect(s.streakDays).toBe(0); });
test('only educators can create classes',async () => { const cookie=cookieOf(await signup()); expect((await request('/api/classes',{name:'Lab'},cookie)).status).toBe(403); expect((await request('/api/classes',{name:'Lab'})).status).toBe(401); });
test('class create and join are idempotent and list membership',async () => { const {learner,educator,group}=await cohort(); expect(group.code).toMatch(/^[A-Z0-9]{6}$/); await request('/api/classes/join',{code:group.code.toLowerCase()},learner); const list=await (await request('/api/classes',undefined,educator)).json(); expect(list.classes[0].students).toBe(1); expect(list.classes[0].owned).toBe(true); const own=await (await request('/api/classes',undefined,learner)).json(); expect(own.classes[0].owned).toBe(false); });
test('invalid class names and unknown join codes are rejected',async () => { const cookie=cookieOf(await signup('t@example.com','educator')); expect((await request('/api/classes',{name:''},cookie)).status).toBe(400); expect((await request('/api/classes/join',{code:'!!!!'},cookie)).status).toBe(400); expect((await request('/api/classes/join',{code:'ZZZZZZ'},cookie)).status).toBe(404); });
test('learner and another educator cannot read owner insights',async () => { const {learner,group}=await cohort(); const other=cookieOf(await signup('other@example.com','educator')); for (const cookie of [learner,other]) for (const suffix of ['insights','insights.csv']) expect((await request(`/api/classes/${group.id}/${suffix}`,undefined,cookie)).status).toBe(403); });
test('seeded insights include matrix, difficulty, gain and time',async () => { const {educator,group}=await cohort(); const d=await (await request(`/api/classes/${group.id}/insights`,undefined,educator)).json(); expect(d.students).toHaveLength(1); expect(d.students[0].machines[0]).toMatchObject({missionsDone:1,missionsTotal:3,checkpointBest:4,seconds:60}); expect(d.questions[2]).toMatchObject({question:'Question 2: what moved?',responses:1,correct:0,percentCorrect:0}); expect(d.mostMissed[0].percentCorrect).toBe(0); expect(d.learningGain).toBe(0.8); expect(d.activeMinutes).toBe(1); });
test('CSV includes matrix, questions and escaped spreadsheet formulas',async () => { const {educator,learner,group}=await cohort(); await db.execute({sql:'UPDATE users SET name=? WHERE id=(SELECT user_id FROM class_members WHERE class_id=?)',args:['=HYPERLINK("bad")',group.id]}); const r=await request(`/api/classes/${group.id}/insights.csv`,undefined,educator); expect(r.headers.get('content-type')).toContain('text/csv'); expect(r.headers.get('content-disposition')).toContain('attachment'); const csv=await r.text(); expect(csv).toContain("'=" ); expect(csv).toContain('Question 2: what moved?'); expect(csv).toContain('80'); });
test('public stats reflect stored activity',async () => { const {learner}=await cohort(); const s=await (await request('/api/stats')).json(); expect(s.learners).toBe(2); expect(s.runs).toBe(1); expect(s.machinesStarted).toBe(1); });
test('CSRF rejects foreign and missing Origins outside tests',async () => { app=createApp({db,distDir:dir,catalog}); expect((await request('/api/auth/guest',{},'',{origin:'https://evil.example'})).status).toBe(403); expect((await request('/api/auth/guest',{})).status).toBe(403); expect((await request('/api/auth/guest',{},'',{origin:'http://localhost'})).status).toBe(200); });
test('CSRF rejects non-JSON and malformed JSON',async () => { expect((await app.request('http://localhost/api/auth/guest',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status).toBe(415); expect((await app.request('http://localhost/api/auth/guest',{method:'POST',headers:{'content-type':'application/json'},body:'{'})).status).toBe(400); });
test('serves static index and directory index with HTML cache rules',async () => { const r=await request('/'); expect(await r.text()).toContain('Home'); expect(r.headers.get('cache-control')).toBe('no-cache'); expect(await (await request('/login/')).text()).toContain('Login'); expect((await request('/login')).status).toBe(308); });
test('static assets have type and a short cache lifetime',async () => { const r=await request('/figure.svg'); expect(r.headers.get('content-type')).toBe('image/svg+xml'); expect(r.headers.get('cache-control')).toContain('max-age=3600'); });
test('unknown pages use 404 fallback and API stays JSON',async () => { const r=await request('/missing/'); expect(r.status).toBe(404); expect(await r.text()).toContain('Lost machine'); const api=await request('/api/nope'); expect(api.status).toBe(404); expect(api.headers.get('content-type')).toContain('application/json'); });
test('static server refuses hidden files and encoded traversal',async () => { for (const path of ['/.env','/%2e%2e%2fpackage.json','/x%5c..%5c.env']) expect((await request(path)).status).toBe(404); });
test('migrations are idempotent',async () => { await signup(); await migrate(db); expect((await db.execute('SELECT COUNT(*) AS n FROM users')).rows[0].n).toBe(1); });

test('concurrent event batches preserve every run and heartbeat',async () => {
  const cookie=cookieOf(await signup());
  const responses=await Promise.all(Array.from({length:8},()=>send(cookie,[event('run'),event('heartbeat',{seconds:15})])));
  expect(responses.map(r=>r.status)).toEqual(Array(8).fill(200));
  const p=(await progress(cookie)).tokens;
  expect(p.runs).toBe(8); expect(p.seconds).toBe(120);
});
test('a delayed answer cannot replace a newer checkpoint answer',async () => {
  const cookie=cookieOf(await signup());const now=Date.now();
  await send(cookie,[event('answer',{index:1,stage:'check',answer:1},'tokens',now)]);
  await send(cookie,[event('answer',{index:1,stage:'check',answer:2},'tokens',now-10000)]);
  expect((await progress(cookie)).tokens.answers[1].answer).toBe(1);
});
test('a later prediction cannot alter the original guess',async () => {
  const cookie=cookieOf(await signup());
  await send(cookie,[event('predict',{answer:2}),event('predict',{answer:0})]);
  expect((await progress(cookie)).tokens.predict.answer).toBe(2);
});
test('production cookies are Secure and logout revokes only the current token',async () => {
  const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
  try {
    const a=await signup();expect(a.headers.get('set-cookie')).toContain('Secure');
    const first=cookieOf(a);const second=cookieOf(await request('/api/auth/login',{email:'learner@example.com',password:'password123'}));
    await request('/api/auth/logout',{},first);
    expect((await (await request('/api/me',undefined,second)).json()).user.email).toBe('learner@example.com');
  } finally { if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous; }
});
test('garbage cookies do not authenticate and API responses never cache',async () => {
  const r=await request('/api/me',undefined,'ia_session=not-a-token');
  expect((await r.json()).user).toBeNull();expect(r.headers.get('cache-control')).toBe('no-store');
});
test('event timestamps, answer stages and multibyte payload sizes are checked',async () => {
  for(const e of [event('run',{},'tokens',Date.now()+600000),event('run',{},'tokens',-1),event('answer',{index:1,stage:'post',answer:1}),event('predict',{answer:4}),event('control',{name:'text',value:'😀'.repeat(600)})])expect((await send('',[e])).status).toBe(400);
});
test('an older imported snapshot preserves newer answers and last score',async () => {
  const {learner}=await cohort();
  await request('/api/progress/import',{progress:{tokens:{answers:{2:{answer:2}},quiz:{score:5,best:5,of:5},last:Date.now()-60000}}},learner);
  const p=(await progress(learner)).tokens;
  expect(p.answers[2].correct).toBe(false);expect(p.quiz.score).toBe(4);expect(p.quiz.best).toBe(5);
});
test('HEAD requests preserve headers and status without a body',async () => {
  for(const [path,status] of [['/',200],['/missing',404]] as const){const r=await app.request(`http://localhost${path}`,{method:'HEAD'});expect(r.status).toBe(status);expect(await r.text()).toBe('');expect(r.headers.get('content-type')).toContain('text/html');}
});
test('concurrent import, event writes and progress reads share a connection safely',async()=>{
  const cookie=cookieOf(await signup());
  const responses=await Promise.all([
    request('/api/progress/import',{progress:{tokens:{runs:1,seconds:30,last:Date.now()}}},cookie),
    send(cookie,[event('run'),event('heartbeat',{seconds:15})]),
    request('/api/progress',undefined,cookie),request('/api/me/summary',undefined,cookie),
  ]);
  expect(responses.map(r=>r.status)).toEqual([200,200,200,200]);
  const p=(await progress(cookie)).tokens;expect(p.runs).toBeGreaterThanOrEqual(1);expect(p.seconds).toBeGreaterThanOrEqual(30);
});
test('offline prediction is included in per-question insights',async()=>{
  const {learner,educator,group}=await cohort();
  await request('/api/progress/import',{progress:{vectors:{predict:{answer:0},last:Date.now()}}},learner);
  const data=await(await request(`/api/classes/${group.id}/insights`,undefined,educator)).json();
  expect(data.questions.find((q:any)=>q.slug==='vectors'&&q.index===0)).toMatchObject({responses:1,percentCorrect:100});
});
test('question analytics count the latest response once after a retake',async()=>{
  const {learner,educator,group}=await cohort();await send(learner,[event('answer',{index:2,stage:'check',answer:2})]);
  const data=await(await request(`/api/classes/${group.id}/insights`,undefined,educator)).json();
  expect(data.questions[2]).toMatchObject({responses:1,correct:1,percentCorrect:100});
});
test('streak uses consecutive UTC days with yesterday as a grace day',async()=>{
  const cookie=cookieOf(await signup());const day=new Date();day.setUTCHours(0,0,0,0);
  await send(cookie,[1,2,4].map(n=>event('view',{},'tokens',day.getTime()-n*86400000+43200000)));
  const data=await(await request('/api/me/summary',undefined,cookie)).json();expect(data.streakDays).toBe(2);
});

test('static serving refuses a symlink to files outside dist',async()=>{
  const outside=await mkdtemp(join(tmpdir(),'ia-outside-'));
  try {await writeFile(join(outside,'secret.txt'),'private');await symlink(join(outside,'secret.txt'),join(dir,'public.txt'));expect((await request('/public.txt')).status).toBe(404);}
  finally {await rm(outside,{recursive:true,force:true});}
});

test('concurrent guest upgrades cannot overwrite account credentials',async()=>{
  const guest=cookieOf(await request('/api/auth/guest',{}));
  const responses=await Promise.all([signup('first@example.com','learner',guest),signup('second@example.com','educator',guest)]);
  expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
  const winner=responses.find(r=>r.status===201)!;const user=(await winner.json()).user;
  expect((await request('/api/auth/login',{email:user.email,password:'password123'})).status).toBe(200);
  expect((await db.execute('SELECT COUNT(*) AS n FROM users')).rows[0].n).toBe(1);
});
