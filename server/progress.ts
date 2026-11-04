import type { Client } from '@libsql/client';
export type Machine = { slug: string; title: string; level: string; order?: number; href?: string; missions: { id: string }[]; quiz: { stage: string; question: string; options: string[]; correct: number }[] };
export const object = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
export const parse = (v: any, fallback: any = null) => { try { return v == null ? fallback : JSON.parse(String(v)); } catch { return fallback; } };
export function unpack(row: any) {
  return { slug: row.slug, missions: parse(row.missions, {}), predict: parse(row.predict), answers: parse(row.answers, {}), quiz: row.quiz_best == null ? null : { best: Number(row.quiz_best), score: Number(row.quiz_last), of: 5 }, seconds: Number(row.seconds), runs: Number(row.runs), first: Number(row.first_seen), last: Number(row.last_seen) };
}
export async function getProgress(db: Client, userId: string) {
  const result = await db.execute({ sql: 'SELECT * FROM progress WHERE user_id=?', args: [userId] });
  return Object.fromEntries(result.rows.map(row => [String(row.slug), unpack(row)]));
}
const types = new Set(['view', 'heartbeat', 'run', 'step', 'break', 'explode', 'control', 'mission', 'predict', 'answer', 'quiz_done']);
export function validateEvents(input: any, catalog: Machine[]) {
  if (!Array.isArray(input) || input.length > 200) throw new Error('Send at most 200 events.');
  const result: any[] = [];
  for (const e of input) {
    if (!object(e) || !types.has(e.type) || typeof e.slug !== 'string' || !object(e.data) || new TextEncoder().encode(JSON.stringify(e.data)).length > 2048 || !Number.isSafeInteger(e.at) || e.at < 0 || e.at > Date.now() + 300000) throw new Error('Invalid event.');
    const m = catalog.find(m => m.slug === e.slug);
    if (!m) continue;
    const d = { ...e.data };
    if (e.type === 'heartbeat' && (!Number.isFinite(d.seconds) || d.seconds < 0 || d.seconds > 60)) throw new Error('Heartbeat must be between 0 and 60 seconds.');
    if (e.type === 'mission' && !m.missions.some(x => x.id === d.id)) throw new Error('Unknown mission.');
    if (e.type === 'control' && (typeof d.name !== 'string' || d.name.length > 100 || !['string','number','boolean'].includes(typeof d.value))) throw new Error('Invalid control.');
    if (e.type === 'predict' || e.type === 'answer') {
      const index = e.type === 'predict' ? 0 : d.index;
      const q = m.quiz[index];
      if (!Number.isInteger(index) || !q || !Number.isInteger(d.answer) || d.answer < 0 || d.answer >= q.options.length || (e.type === 'answer' && (index === 0 || d.stage !== q.stage))) throw new Error('Invalid answer.');
      d.correct = d.answer === q.correct;
    }
    if (e.type === 'quiz_done' && (!Number.isInteger(d.score) || d.score < 0 || d.score > 5 || d.of !== 5)) throw new Error('Invalid checkpoint.');
    result.push({ ...e, data: d });
  }
  return result;
}
export async function applyEvents(db: Client, userId: string, events: any[]) {
  const tx = await db.transaction('write');
  try {
    for (const e of events) {
      const row = (await tx.execute({ sql: 'SELECT * FROM progress WHERE user_id=? AND slug=?', args: [userId, e.slug] })).rows[0];
      const p = row ? unpack(row) : { missions: {}, predict: null, answers: {}, quiz: null, seconds: 0, runs: 0, first: e.at, last: e.at } as any;
      const d = e.data;
      if (e.type === 'mission') p.missions[d.id] ||= e.at;
      if (e.type === 'predict' && !p.predict) { p.predict = { ...d, at: e.at }; p.answers[0] = { ...d }; }
      if (e.type === 'answer' && e.at >= (p.answers[d.index]?.at ?? 0)) p.answers[d.index] = { ...d, at: e.at };
      if (e.type === 'heartbeat') p.seconds += d.seconds;
      if (e.type === 'run') p.runs++;
      if (e.type === 'quiz_done') {
        const answers = [1,2,3,4,5].map(i => p.answers[i]);
        if (answers.every(Boolean)) {
          const score = answers.filter(a => a.correct).length;
          p.quiz = { score, best: Math.max(p.quiz?.best ?? 0, score) };
          e.data = { score, of: 5 };
        }
      }
      p.first = Math.min(p.first, e.at); p.last = Math.max(p.last, e.at);
      await tx.execute({ sql: 'INSERT INTO events(user_id,slug,type,data,at) VALUES(?,?,?,?,?)', args: [userId,e.slug,e.type,JSON.stringify(e.data),e.at] });
      await saveProgress(tx, userId, e.slug, p);
    }
    await tx.commit();
  } finally { tx.close(); }
}
async function saveProgress(db: any, userId: string, slug: string, p: any) {
  await db.execute({ sql: `INSERT INTO progress(user_id,slug,missions,predict,quiz_best,quiz_last,answers,seconds,runs,first_seen,last_seen) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,slug) DO UPDATE SET missions=excluded.missions,predict=excluded.predict,quiz_best=excluded.quiz_best,quiz_last=excluded.quiz_last,answers=excluded.answers,seconds=excluded.seconds,runs=excluded.runs,first_seen=excluded.first_seen,last_seen=excluded.last_seen`, args: [userId,slug,JSON.stringify(p.missions),p.predict ? JSON.stringify(p.predict) : null,p.quiz?.best ?? null,p.quiz?.score ?? null,JSON.stringify(p.answers),p.seconds,p.runs,p.first,p.last] });
}
export async function importProgress(db: Client, userId: string, incoming: any, catalog: Machine[]) {
  if (!object(incoming) || Object.keys(incoming).length > 500) throw new Error('Invalid progress.');
  const tx = await db.transaction('write');
  try {
    for (const m of catalog) {
      const v = incoming[m.slug]; if (!object(v)) continue;
      const row = (await tx.execute({ sql: 'SELECT * FROM progress WHERE user_id=? AND slug=?', args: [userId,m.slug] })).rows[0];
      const now = Date.now();
      const stamp = Number.isSafeInteger(v.last) && v.last > 0 ? Math.min(v.last, now) : now;
      const p: any = row ? unpack(row) : { missions: {}, predict: null, answers: {}, quiz: null, seconds: 0, runs: 0, first: stamp, last: stamp };
      for (const mission of m.missions) if (object(v.missions) && v.missions[mission.id]) p.missions[mission.id] ||= stamp;
      if (object(v.predict) && Number.isInteger(v.predict.answer) && v.predict.answer >= 0 && v.predict.answer < 4 && !p.predict) p.predict = { answer: v.predict.answer, correct: v.predict.answer === m.quiz[0].correct, at: stamp };
      if (object(v.answers)) for (const [index, a] of Object.entries(v.answers)) {
        const q = m.quiz[Number(index)];
        if (q && q.stage !== 'pre' && object(a) && Number.isInteger(a.answer) && a.answer >= 0 && a.answer < 4 && (!p.answers[index] || stamp >= p.last)) p.answers[index] = { answer: a.answer, correct: a.answer === q.correct, at: stamp };
      }
      if (p.predict) p.answers[0] = { ...p.predict };
      if (object(v.quiz) && Number.isInteger(v.quiz.score) && v.quiz.score >= 0 && v.quiz.score <= 5 && v.quiz.of === 5) {
        const best = Number.isInteger(v.quiz.best) && v.quiz.best >= 0 && v.quiz.best <= 5 ? v.quiz.best : v.quiz.score;
        p.quiz = { score: stamp >= p.last ? v.quiz.score : (p.quiz?.score ?? v.quiz.score), best: Math.max(p.quiz?.best ?? 0,best,v.quiz.score) };
      }
      // Offline snapshots overlap live events. Max counters make repeated imports idempotent.
      if (Number.isFinite(v.seconds) && v.seconds >= 0) p.seconds = Math.max(p.seconds,Math.min(v.seconds,31536000));
      if (Number.isSafeInteger(v.runs) && v.runs >= 0) p.runs = Math.max(p.runs,Math.min(v.runs,10000000));
      p.first = Math.min(p.first,stamp); p.last = Math.max(p.last,stamp);
      await saveProgress(tx,userId,m.slug,p);
    }
    await tx.commit();
  } finally { tx.close(); }
}
export const completed = (m: Machine, p: any) => !!p && m.missions.length > 0 && m.missions.every(x => p.missions[x.id]) && (p.quiz?.best ?? -1) >= 4;
export function summary(progress: any, catalog: Machine[], activityDays: string[] = []) {
  const rows: any[] = Object.values(progress);
  const quizzes = rows.filter(p => p.quiz);
  const pairs = rows.filter(p => p.predict && Object.keys(p.answers).some(i => +i > 0));
  const predictionAccuracy = pairs.length ? pairs.filter(p => p.predict.correct).length / pairs.length : null;
  const checkpointAccuracy = pairs.length ? pairs.reduce((sum,p) => { const a = Object.entries(p.answers).filter(([i]) => +i > 0).map(([,a]) => a as any); return sum + a.filter(a => a.correct).length/a.length; },0)/pairs.length : null;
  const days = new Set(activityDays.length ? activityDays : rows.map(p => new Date(p.last).toISOString().slice(0,10)));
  const day = new Date(); day.setUTCHours(0,0,0,0);
  if (!days.has(day.toISOString().slice(0,10))) day.setUTCDate(day.getUTCDate()-1);
  let streakDays = 0;
  while (days.has(day.toISOString().slice(0,10))) { streakDays++; day.setUTCDate(day.getUTCDate()-1); }
  const next = [...catalog].sort((a,b) => (a.order ?? 99)-(b.order ?? 99)).find(m => !completed(m,progress[m.slug]));
  return { machinesStarted: rows.length, machinesCompleted: catalog.filter(m => completed(m,progress[m.slug])).length, missionsDone: rows.reduce((s,p) => s+Object.keys(p.missions).length,0), averageCheckpoint: quizzes.length ? quizzes.reduce((s,p) => s+p.quiz.best/5,0)/quizzes.length : null, predictionAccuracy, checkpointAccuracy, learningGain: predictionAccuracy == null ? null : checkpointAccuracy! - predictionAccuracy, activeMinutes: rows.reduce((s,p) => s+p.seconds,0)/60, streakDays, next: next ? { slug: next.slug, title: next.title, href: `/m/${next.slug}/` } : null };
}
