import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import type { Client } from '@libsql/client';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { id, token, hash, passwordHash, passwordMatches, RateLimit } from './auth';
import { getProgress, validateEvents, applyEvents, importProgress, summary, type Machine, object } from './progress';

type Options = { db: Client; distDir: string; catalog: Machine[]; allowMissingOrigin?: boolean; getClientIp?: (request: Request) => string };
const publicUser = (u: any) => u ? { id: u.id, name: u.name, email: u.email, role: u.role, guest: Boolean(u.guest) } : null;
const age = 30 * 86400;
const dummy = passwordHash(token());
export function createApp({ db, distDir, catalog, allowMissingOrigin = false, getClientIp = () => 'unknown' }: Options) {
  const app = new Hono<{ Variables: { user: any; session: string | null; body: any } }>();
  const rate = new RateLimit();
  app.use('*', async (c,next) => {
    await next();
    c.header('X-Content-Type-Options','nosniff');
    c.header('Referrer-Policy','strict-origin-when-cross-origin');
    c.header('X-Frame-Options','SAMEORIGIN');
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control','no-store');
  });
  app.use('/api/*', bodyLimit({ maxSize: 512 * 1024, onError: c => c.json({ error: 'Request is too large.' },413) }));
  app.use('/api/*', async (c,next) => {
    if (!['GET','HEAD','OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      if ((!origin && !allowMissingOrigin) || (origin && origin !== new URL(c.req.url).origin)) return c.json({ error: 'Origin must match this site.' },403);
      if (!/^application\/json(?:\s*;|$)/i.test(c.req.header('content-type') || '')) return c.json({ error: 'Send application/json.' },415);
      try { const b = await c.req.json(); if (!object(b)) throw new Error(); c.set('body',b); } catch { return c.json({ error: 'Invalid JSON object.' },400); }
    }
    const raw = getCookie(c,'ia_session');
    const session = raw && /^[a-f0-9]{64}$/.test(raw) ? hash(raw) : null;
    c.set('session',session);
    const u = session ? (await db.execute({ sql: 'SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?', args: [session,Date.now()] })).rows[0] : null;
    c.set('user',u || null);
    await next();
  });
  const auth = (c: any) => c.get('user');
  async function sessionFor(c: any, userId: string) {
    const raw = token();
    await db.execute({ sql: 'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', args: [hash(raw),userId,Date.now()+age*1000] });
    // Rotate the current session on authentication and clear expired records.
    if (c.get('session')) await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash=?', args: [c.get('session')] });
    await db.execute({ sql: 'DELETE FROM sessions WHERE expires_at<=?', args: [Date.now()] });
    setCookie(c,'ia_session',raw,{ httpOnly: true, sameSite: 'Lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: age });
  }
  async function guest(c: any) {
    if (auth(c)) return auth(c);
    const user = { id: id(), name: 'Guest', email: null, role: 'learner', guest: 1 };
    await db.execute({ sql: 'INSERT INTO users(id,name,role,guest,created_at) VALUES(?,?,?,?,?)', args: [user.id,user.name,user.role,1,Date.now()] });
    await sessionFor(c,user.id); c.set('user',user); return user;
  }
  function throttled(c: any, email: string) {
    return !rate.allow(`ip:${getClientIp(c.req.raw)}`,100) || !rate.allow(`email:${email}`,12);
  }
  app.post('/api/auth/signup',async c => {
    const b = c.get('body'); const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    if (throttled(c,email)) return c.json({ error: 'Too many attempts. Try again in 15 minutes.' },429);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 1024 || typeof b.name !== 'string' || !b.name.trim() || b.name.trim().length > 60 || !['learner','educator'].includes(b.role)) return c.json({ error: 'Use a valid email, a password of 8–1024 characters, a name up to 60 characters, and a learner or educator role.' },400);
    if (auth(c) && !auth(c).guest) return c.json({ error: 'Sign out before creating another account.' },409);
    const userId = auth(c)?.id || id();
    const encrypted = await passwordHash(b.password);
    try {
      if (auth(c)?.guest) await db.execute({ sql: 'UPDATE users SET email=?,name=?,role=?,password_hash=?,guest=0 WHERE id=?', args: [email,b.name.trim(),b.role,encrypted,userId] });
      else await db.execute({ sql: 'INSERT INTO users(id,email,name,role,password_hash,guest,created_at) VALUES(?,?,?,?,?,0,?)', args: [userId,email,b.name.trim(),b.role,encrypted,Date.now()] });
    } catch (e: any) { if (String(e.code).includes('CONSTRAINT')) return c.json({ error: 'This email already has an account. Sign in instead.' },409); throw e; }
    await sessionFor(c,userId);
    return c.json({ user: { id: userId, email, name: b.name.trim(), role: b.role, guest: false } },201);
  });
  // Use scrypt even for unknown accounts to avoid a fast account-existence signal.
  app.post('/api/auth/login',async c => {
    const b = c.get('body'); const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    if (throttled(c,email)) return c.json({ error: 'Too many attempts. Try again in 15 minutes.' },429);
    if (typeof b.password !== 'string' || b.password.length > 1024) return c.json({ error: 'Invalid credentials.' },400);
    const u = (await db.execute({ sql: 'SELECT * FROM users WHERE email=?', args: [email] })).rows[0];
    const matches = await passwordMatches(b.password,String(u?.password_hash || await dummy));
    if (!u || !matches) return c.json({ error: 'Email or password is incorrect.' },401);
    await sessionFor(c,String(u.id)); return c.json({ user: publicUser(u) });
  });
  app.post('/api/auth/logout',async c => {
    if (c.get('session')) await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash=?', args: [c.get('session')!] });
    deleteCookie(c,'ia_session',{ path: '/', secure: process.env.NODE_ENV === 'production' }); return c.json({ ok: true });
  });
  app.post('/api/auth/guest',async c => c.json({ user: publicUser(await guest(c)) }));
  app.get('/api/me',c => c.json({ user: publicUser(auth(c)) }));
  app.get('/api/progress',async c => auth(c) ? c.json({ progress: await getProgress(db,auth(c).id) }) : c.json({ error: 'Sign in first.' },401));
  app.post('/api/progress/import',async c => {
    if (!auth(c)) return c.json({ error: 'Sign in first.' },401);
    try { await importProgress(db,auth(c).id,c.get('body').progress,catalog); } catch (e: any) { if (e.message === 'Invalid progress.') return c.json({ error: e.message },400); throw e; }
    return c.json({ progress: await getProgress(db,auth(c).id) });
  });
  app.post('/api/events',async c => {
    let events;
    try { events = validateEvents(c.get('body').events,catalog); } catch (e: any) { return c.json({ error: e.message },400); }
    if (!events.length) return c.json({ accepted: 0 });
    const u = await guest(c);
    await applyEvents(db,u.id,events); return c.json({ accepted: events.length });
  });
  app.get('/api/me/summary',async c => {
    if (!auth(c)) return c.json({ error: 'Sign in first.' },401);
    const days = await db.execute({ sql: "SELECT DISTINCT strftime('%Y-%m-%d',at/1000,'unixepoch') AS day FROM events WHERE user_id=? UNION SELECT DISTINCT strftime('%Y-%m-%d',last_seen/1000,'unixepoch') AS day FROM progress WHERE user_id=?", args: [auth(c).id,auth(c).id] });
    return c.json(summary(await getProgress(db,auth(c).id),catalog,days.rows.map(r => String(r.day))));
  });
  app.post('/api/classes',async c => {
    if (!auth(c)) return c.json({ error: 'Sign in first.' },401);
    if (auth(c).role !== 'educator') return c.json({ error: 'An educator account is required.' },403);
    const name = c.get('body').name;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) return c.json({ error: 'Class name must be 1–100 characters.' },400);
    const classId = id();
    for (let attempt=0;attempt<5;attempt++) {
      const code = token().slice(0,6).toUpperCase();
      try {
        await db.execute({ sql: 'INSERT INTO classes(id,name,code,owner_id,created_at) VALUES(?,?,?,?,?)', args: [classId,name.trim(),code,auth(c).id,Date.now()] });
        return c.json({ id: classId, name: name.trim(), code },201);
      } catch (e: any) { if (!String(e.code).includes('CONSTRAINT') || attempt === 4) throw e; }
    }
  });
  app.post('/api/classes/join',async c => {
    if (!auth(c)) return c.json({ error: 'Sign in first.' },401);
    const code = c.get('body').code;
    if (typeof code !== 'string' || !/^[A-Z0-9]{6}$/.test(code.trim().toUpperCase())) return c.json({ error: 'Enter a six-character class code.' },400);
    if (!rate.allow(`join:${auth(c).id}`,30)) return c.json({ error: 'Too many attempts. Try again in 15 minutes.' },429);
    const group = (await db.execute({ sql: 'SELECT * FROM classes WHERE code=?', args: [code.trim().toUpperCase()] })).rows[0];
    if (!group) return c.json({ error: 'Class code was not found.' },404);
    await db.execute({ sql: 'INSERT OR IGNORE INTO class_members(class_id,user_id) VALUES(?,?)', args: [group.id,auth(c).id] });
    return c.json({ id: group.id, name: group.name });
  });
  app.get('/api/classes',async c => {
    if (!auth(c)) return c.json({ error: 'Sign in first.' },401);
    const result = await db.execute({ sql: 'SELECT c.id,c.name,c.code,c.owner_id,COUNT(cm.user_id) AS students FROM classes c LEFT JOIN class_members cm ON cm.class_id=c.id WHERE c.owner_id=? OR c.id IN (SELECT class_id FROM class_members WHERE user_id=?) GROUP BY c.id ORDER BY c.created_at DESC', args: [auth(c).id,auth(c).id] });
    return c.json({ classes: result.rows.map(r => ({ id: r.id, name: r.name, code: r.code, students: Number(r.students), owned: r.owner_id === auth(c).id })) });
  });
  async function insights(classId: string) {
    const members = await db.execute({ sql: 'SELECT u.id,u.name,u.email FROM users u JOIN class_members cm ON cm.user_id=u.id WHERE cm.class_id=? ORDER BY u.name,u.id', args: [classId] });
    const rows = await db.execute({ sql: 'SELECT p.* FROM progress p JOIN class_members cm ON cm.user_id=p.user_id WHERE cm.class_id=?', args: [classId] });
    const byStudent = new Map(members.rows.map(s => [String(s.id),{} as any]));
    for (const row of rows.rows) byStudent.get(String(row.user_id))![String(row.slug)] = unpackProgressRow(row);
    const students = members.rows.map(s => ({ id: s.id, name: s.name, email: s.email, machines: catalog.map(m => { const p = byStudent.get(String(s.id))[m.slug]; return { slug: m.slug, missionsDone: m.missions.filter(x => p?.missions[x.id]).length, missionsTotal: m.missions.length, checkpointBest: p?.quiz?.best ?? null, seconds: p?.seconds ?? 0 }; }) }));
    const questions = catalog.flatMap(m => m.quiz.map((q,index) => {
      const answers = [...byStudent.values()].map(p => p[m.slug]?.answers[index]).filter(Boolean);
      return { slug: m.slug, title: m.title, index, stage: q.stage, question: q.question, responses: answers.length, correct: answers.filter(a => a.correct).length, percentCorrect: answers.length ? 100*answers.filter(a => a.correct).length/answers.length : null };
    }));
    const combined = Object.fromEntries([...byStudent].flatMap(([student,p]) => Object.entries(p).map(([slug,value]) => [`${student}:${slug}`,value])));
    const totals = summary(combined,[]);
    return { students, machines: catalog.map(m => ({ slug: m.slug, title: m.title })), questions, mostMissed: questions.filter(q => q.responses && q.percentCorrect! < 100).sort((a,b) => a.percentCorrect!-b.percentCorrect!).slice(0,5), predictionAccuracy: totals.predictionAccuracy, checkpointAccuracy: totals.checkpointAccuracy, learningGain: totals.learningGain, activeMinutes: totals.activeMinutes };
  }
  for (const suffix of ['insights','insights.csv']) app.get(`/api/classes/:id/${suffix}`,async c => {
    if (!auth(c)) return c.json({ error: 'Sign in first.' },401);
    const group = (await db.execute({ sql: 'SELECT * FROM classes WHERE id=?', args: [c.req.param('id')] })).rows[0];
    if (!group) return c.json({ error: 'Class not found.' },404);
    if (group.owner_id !== auth(c).id || auth(c).role !== 'educator') return c.json({ error: 'Only the class owner can view insights.' },403);
    const data = await insights(String(group.id));
    if (suffix === 'insights') return c.json({ class: { id: group.id, name: group.name, code: group.code }, ...data });
    const cell = (v: any) => { const s = String(v ?? ''); return `"${(/^[=+\-@\t\r\n]/.test(s) ? "'"+s : s).replaceAll('"','""')}"`; };
    const lines: any[][] = [['Student','Email','Machine','Missions done','Missions total','Checkpoint best / 5','Active seconds']];
    for (const student of data.students) for (const m of student.machines) lines.push([student.name,student.email,catalog.find(c => c.slug === m.slug)?.title,m.missionsDone,m.missionsTotal,m.checkpointBest,m.seconds]);
    lines.push([],['Question','Machine','Stage','Responses','Correct','Percent correct']);
    for (const q of data.questions) lines.push([q.question,q.title,q.stage,q.responses,q.correct,q.percentCorrect]);
    lines.push([],['Prediction accuracy','Checkpoint accuracy','Gain (percentage points)','Active minutes'],[data.predictionAccuracy == null ? '' : data.predictionAccuracy*100,data.checkpointAccuracy == null ? '' : data.checkpointAccuracy*100,data.learningGain == null ? '' : data.learningGain*100,data.activeMinutes]);
    c.header('Content-Type','text/csv; charset=utf-8'); c.header('Content-Disposition',`attachment; filename="inside-ai-${group.code}.csv"`);
    return c.body(lines.map(row => row.map(cell).join(',')).join('\r\n'));
  });
  app.get('/api/stats',async c => {
    const counts = await db.execute('SELECT (SELECT COUNT(*) FROM users) AS learners, (SELECT COUNT(*) FROM progress) AS machines_started, (SELECT COALESCE(SUM(runs),0) FROM progress) AS runs');
    return c.json({ learners: Number(counts.rows[0].learners), machinesStarted: Number(counts.rows[0].machines_started), runs: Number(counts.rows[0].runs), machines: catalog.length });
  });
  app.all('/api/*',c => c.json({ error: 'API route not found.' },404));
  const mime: Record<string,string> = { '.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2' };
  app.on(['GET','HEAD'],'*',async c => {
    const root = resolve(distDir);
    let path;
    try { path = decodeURIComponent(new URL(c.req.url).pathname); } catch { return c.text('Invalid path',400); }
    if (path.split('/').some(s => s.startsWith('.')) || path.includes('\0') || path.includes('\\')) return c.text('Not found',404);
    let file = resolve(root,`.${path}`);
    if (file !== root && !file.startsWith(root+sep)) return c.text('Not found',404);
    try {
      if ((await stat(file)).isDirectory()) {
        if (!path.endsWith('/')) return c.redirect(path+'/'+new URL(c.req.url).search,308);
        file = resolve(file,'index.html');
      }
      const content = await readFile(file);
      c.header('Content-Type',mime[extname(file)] || 'application/octet-stream');
      c.header('Cache-Control',extname(file) === '.html' || extname(file) === '.json' ? 'no-cache' : 'public, max-age=3600');
      return c.body(c.req.method === 'HEAD' ? null : content);
    } catch {
      c.header('Cache-Control','no-cache'); c.header('Content-Type','text/html; charset=utf-8');
      const fallback = await readFile(resolve(root,'404.html')).catch(() => Buffer.from('<h1>Page not found</h1><a href="/">Inside AI</a>'));
      return c.body(c.req.method === 'HEAD' ? null : fallback,404);
    }
  });
  app.onError((error,c) => { console.error('Inside AI request failed:',error); return c.json({ error: 'Something went wrong. Please try again.' },500); });
  return app;
}
import { unpack as unpackProgressRow } from './progress';
