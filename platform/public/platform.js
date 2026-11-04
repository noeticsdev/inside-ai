/* Small, dependency-free page controller. Machine pages keep using the shell SDK. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const catalog = JSON.parse($('#ia-catalog')?.textContent || '[]');
  const STORE = 'ia:progress:v1';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const percent = v => v == null ? '—' : `${Math.round(v * 100)}%`;
  const gain = v => v == null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v * 100)} pp`;
  const href = m => catalog.find(x=>x.slug===m.slug)?.href || m.href || `/m/${encodeURIComponent(m.slug)}/`;
  const done = (m,p) => m.missions.length > 0 && m.missions.every(x => p?.missions?.[x.id]) && (p?.quiz?.best ?? -1) >= 4;
  let user = null;
  function localProgress() {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch {}
    return Object.fromEntries(catalog.filter(m => raw && typeof raw[m.slug] === 'object' && raw[m.slug]).map(m => {
      const p = raw[m.slug];
      return [m.slug, { ...p, missions: p.missions || {}, answers: p.answers || {}, seconds: Math.max(0,Number(p.seconds)||0), runs: Math.max(0,Number(p.runs)||0) }];
    }));
  }
  function mergedProgress(local, remote) {
    const result = { ...local };
    for (const [slug,p] of Object.entries(remote)) {
      const l = local[slug];
      const latest = (l?.last || 0) > (p.last || 0) ? l : p;
      result[slug] = { ...p, ...latest, predict:p.predict || l?.predict || null, missions: {...l?.missions,...p.missions}, answers:{...p.answers,...latest.answers},
        seconds:Math.max(l?.seconds||0,p.seconds||0),runs:Math.max(l?.runs||0,p.runs||0),
        quiz: (l?.quiz || p.quiz) ? {...(latest.quiz || p.quiz || l.quiz),best:Math.max(l?.quiz?.best??-1,p.quiz?.best??-1,l?.quiz?.score??-1,p.quiz?.score??-1)} : null };
    }
    return result;
  }
  function cacheProgress(progress) {
    try { localStorage.setItem(STORE,JSON.stringify(progress)); } catch {}
  }
  async function api(path, body) {
    const r = await fetch(`/api${path}`, { credentials:'include', ...(body === undefined ? {} : { method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body) }), signal:AbortSignal.timeout(7000) });
    let data;
    try { data = await r.json(); } catch { throw new Error('The account service is unavailable. Your browser progress is still here.'); }
    if (!r.ok) throw new Error(data.error || 'The account service is unavailable. Try again.');
    return data;
  }
  function status(selector, text, error = false) {
    const el = $(selector); if (!el) return;
    el.textContent = text; el.dataset.error = String(error);
  }
  async function busy(button, action) {
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try { await action(); } finally { if (button) button.disabled = false; }
  }
  $('[data-theme-toggle]')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('ia:theme',next); } catch {}
  });
  $$('[data-filter]').forEach(button => button.addEventListener('click', () => {
    $$('[data-filter]').forEach(b => b.setAttribute('aria-pressed',String(b === button)));
    $$('[data-machine]').forEach(card => { card.hidden = button.dataset.filter !== 'all' && card.dataset.track !== button.dataset.filter; });
    $('[data-filter-empty]').hidden = $$('[data-machine]').some(c => !c.hidden);
  }));
  function paintCards(progress) {
    $$('[data-card-progress]').forEach(el => {
      const m = catalog.find(m => m.slug === el.dataset.cardProgress);
      el.textContent = `${m.missions.filter(x => progress[m.slug]?.missions?.[x.id]).length}/${m.missions.length} missions`;
    });
  }
  function summarize(progress) {
    const rows = Object.values(progress), quizzes = rows.filter(p => p.quiz);
    const pairs = rows.filter(p => p.predict && Object.keys(p.answers||{}).some(i => +i > 0));
    const predictionAccuracy = pairs.length ? pairs.filter(p => p.predict.correct).length / pairs.length : null;
    const checkpointAccuracy = pairs.length ? pairs.reduce((s,p) => { const a = Object.entries(p.answers).filter(([i]) => +i > 0).map(([,a])=>a); return s + a.filter(a=>a.correct).length/a.length; },0)/pairs.length : null;
    const days = new Set(rows.filter(p => p.last).map(p => new Date(p.last).toISOString().slice(0,10)));
    const day = new Date(); day.setUTCHours(0,0,0,0);
    if (!days.has(day.toISOString().slice(0,10))) day.setUTCDate(day.getUTCDate()-1);
    let streakDays = 0;
    while (days.has(day.toISOString().slice(0,10))) { streakDays++; day.setUTCDate(day.getUTCDate()-1); }
    return { machinesStarted:rows.length,machinesCompleted:catalog.filter(m=>done(m,progress[m.slug])).length,missionsDone:catalog.reduce((s,m)=>s+m.missions.filter(x=>progress[m.slug]?.missions?.[x.id]).length,0),averageCheckpoint:quizzes.length?quizzes.reduce((s,p)=>s+(p.quiz.best??p.quiz.score)/5,0)/quizzes.length:null,predictionAccuracy,checkpointAccuracy,learningGain:predictionAccuracy==null?null:checkpointAccuracy-predictionAccuracy,activeMinutes:rows.reduce((s,p)=>s+p.seconds,0)/60,streakDays,next:catalog.find(m=>!done(m,progress[m.slug])) };
  }
  const metric = (value,label,detail='') => `<div class="metric"><strong>${esc(value)}${detail?` <small>${esc(detail)}</small>`:''}</strong><span class="metric-label">${esc(label)}</span></div>`;
  const comparison = s => `<div class="gain-row"><span>Prediction</span><div class="bar"><span style="--value:${(s.predictionAccuracy||0)*100}%"></span></div><span>${percent(s.predictionAccuracy)}</span></div><div class="gain-row"><span>Checkpoint</span><div class="bar"><span style="--value:${(s.checkpointAccuracy||0)*100}%"></span></div><span>${percent(s.checkpointAccuracy)}</span></div><span class="gain-value">${gain(s.learningGain)} change</span>`;
  function renderDashboard(progress, s = summarize(progress)) {
    $('[data-summary]').innerHTML = metric(`${s.machinesCompleted}/${catalog.length}`,'Machines complete',`${s.missionsDone} missions`) + metric(percent(s.averageCheckpoint),'Average best checkpoint') + metric(Math.round(s.activeMinutes),'Active minutes') + metric(s.streakDays,'Day streak');
    $('[data-progress-list]').innerHTML = catalog.map(m => {
      const p = progress[m.slug], n = m.missions.filter(x=>p?.missions?.[x.id]).length, complete = done(m,p);
      return `<article class="progress-row"><div class="progress-ring" style="--ring:${m.missions.length?n/m.missions.length*100:0}%" aria-label="${n} of ${m.missions.length} missions"><span>${complete?'✓':`${n}/${m.missions.length}`}</span></div><div class="progress-info"><h3><a href="${href(m)}">${esc(m.title)}</a></h3><p>${complete?'Complete':p?'In progress':'Ready to explore'} · ${Math.round((p?.seconds||0)/60)} min active</p></div><div class="row-score">${p?.quiz?`${p.quiz.best??p.quiz.score}/5`:'—'}<span>checkpoint</span></div><a href="${href(m)}" aria-label="Open ${esc(m.title)}">↗</a></article>`;
    }).join('') || '<p class="empty">The workshop is being set up. Check back for the first machine.</p>';
    const next = s.next;
    $('[data-next]').innerHTML = next ? `<p class="eyebrow">Your next discovery</p><h2>${esc(next.title)}</h2><p>${esc(catalog.find(m=>m.slug===next.slug)?.hook||'Keep going. There is more to take apart.')}</p><a class="button" href="${href(next)}">Open the machine ↗</a>` : '<p class="eyebrow">A well-used workbench</p><h2>Every machine, understood.</h2><p>Revisit a favorite. Try a different setting. There is always another question.</p><a class="button" href="/#machines">Explore again ↗</a>';
    $('[data-gain]').innerHTML = s.learningGain == null ? '<p class="empty">Make a prediction and answer checkpoint questions on a machine to see your change here.</p>' : comparison(s);
  }
  async function memberships() {
    const { classes } = await api('/classes');
    $('[data-memberships]').innerHTML = classes.map(c=>`<div class="membership">${esc(c.name)}${c.owned?' · educator':''}</div>`).join('');
  }
  function setupDashboard() {
    renderDashboard(localProgress());
    $('[data-join]').addEventListener('submit', e => { e.preventDefault(); busy(e.submitter,async () => {
      try {
        if (!user) { const data = await api('/auth/guest',{}); user = data.user; }
        const c = await api('/classes/join',{code:new FormData(e.target).get('code')});
        status('[data-join-status]',`Joined ${c.name}. Your educator can now see your learning progress.`);
        await memberships(); e.target.reset();
      } catch(err) { status('[data-join-status]',err.message,true); }
    }); });
    $('[data-signout]').addEventListener('click', e => busy(e.target,async () => {
      try { await api('/auth/logout',{}); location.assign('/'); } catch(err) { status('[data-connection]',err.message,true); }
    }));
  }
  function safeNext() {
    const next = new URLSearchParams(location.search).get('next') || '/me/';
    try { const url = new URL(next,location.origin); return url.origin === location.origin && !url.pathname.startsWith('/login') ? url.pathname+url.search+url.hash : '/me/'; } catch { return '/me/'; }
  }
  function setupLogin() {
    let mode = 'login';
    const form = $('[data-auth-form]');
    function tab(value) {
      mode = value;
      $$('[data-auth-tab]').forEach(b => { b.setAttribute('aria-selected',String(b.dataset.authTab === mode)); b.tabIndex = b.dataset.authTab === mode ? 0 : -1; });
      $$('[data-signup]').forEach(el => { el.hidden = mode !== 'signup'; });
      form.elements.name.required = mode === 'signup';
      form.elements.password.autocomplete = mode === 'signup'?'new-password':'current-password';
      form.setAttribute('aria-labelledby',mode==='signup'?'signup-tab':'signin-tab');
      $('[data-auth-heading]').textContent = mode==='signup'?'Make yourself at home.':'Welcome back.';
      $('[data-auth-subtitle]').textContent = mode==='signup'?'Your experiments deserve a place to stay.':'Your workbench is right where you left it.';
      $('[data-auth-submit]').textContent = mode==='signup'?'Create account →':'Sign in →';
      status('[data-status]','');
    }
    $$('[data-auth-tab]').forEach(b => { b.addEventListener('click',()=>tab(b.dataset.authTab)); b.addEventListener('keydown',e => {
      if (e.key==='ArrowLeft'||e.key==='ArrowRight') { e.preventDefault(); tab(mode==='login'?'signup':'login'); $(`[data-auth-tab="${mode}"]`).focus(); }
    }); });
    const params = new URLSearchParams(location.search);
    if(params.get('mode')==='signup') tab('signup');
    if(params.get('role')==='educator') form.elements.role.value = 'educator';
    async function afterAuth() {
      status('[data-status]','Saving your browser progress…');
      try { await api('/progress/import',{progress:localProgress()}); }
      catch(err) { status('[data-status]',`Signed in. Progress import did not finish: ${err.message} Your local copy is safe.`,true);
        const link=document.createElement('a');link.className='text-link';link.href=safeNext();link.textContent='Continue with browser progress →';$('[data-status]').append(link);return; }
      try { const {progress}=await api('/progress'); cacheProgress(mergedProgress(localProgress(),progress)); } catch {}
      location.assign(safeNext());
    }
    form.addEventListener('submit',e=>{e.preventDefault();busy(e.submitter,async()=>{
      try { status('[data-status]','Opening your workbench…'); await api(`/auth/${mode}`,Object.fromEntries(new FormData(form))); await afterAuth(); }
      catch(err){status('[data-status]',err.message,true);}
    });});
    $('[data-guest]').addEventListener('click',e=>busy(e.target,async()=>{
      try { await api('/auth/guest',{}); await afterAuth(); }
      catch { location.assign(safeNext()); }
    }));
  }
  let currentClass = null;
  async function loadClasses(selectId) {
    const { classes } = await api('/classes');
    const owned = classes.filter(c=>c.owned);
    $('[data-classes]').innerHTML = owned.map(c=>`<button class="class-choice" data-class-id="${esc(c.id)}" aria-pressed="false">${esc(c.name)}<small>${esc(c.code)} · ${c.students} ${c.students===1?'learner':'learners'}</small></button>`).join('') || '<p class="empty">Your first classroom starts here.</p>';
    $$('[data-class-id]').forEach(b=>b.addEventListener('click',()=>showInsights(b.dataset.classId).catch(err=>status('[data-class-status]',err.message,true))));
    if (selectId || owned.length) await showInsights(selectId || currentClass || owned[0].id);
  }
  async function showInsights(id) {
    const data = await api(`/classes/${id}/insights`);
    currentClass = id;
    $$('[data-class-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.classId===id)));
    const {students,machines,questions,mostMissed} = data;
    $('[data-insights]').innerHTML = `<div class="insights-head"><div><p class="eyebrow">Class insights · latest answers</p><h2>${esc(data.class.name)}</h2><p class="micro">${students.length} ${students.length===1?'learner':'learners'} in this classroom</p></div><a class="button secondary" href="/api/classes/${encodeURIComponent(id)}/insights.csv">Export CSV ↓</a></div><div class="class-code"><span>JOIN CODE</span><strong class="code">${esc(data.class.code)}</strong><button class="copy-code" type="button" data-copy-code="${esc(data.class.code)}">Copy code ⧉</button></div><p class="status" data-copy-status role="status"></p><div class="insight-stats">${metric(gain(data.learningGain),'Prediction → checkpoint')}${metric(Math.round(data.activeMinutes),'Active minutes')}${metric(students.length,'Learners')}</div><h3>The whole workbench.</h3><p class="micro">Cells show missions done / total. Green means all missions and a checkpoint of at least 4/5.</p>${students.length?`<div class="table-scroll" tabindex="0" role="region" aria-label="Student mission progress"><table><thead><tr><th scope="col">Learner</th>${machines.map(m=>`<th scope="col">${esc(m.title.replace(/^Inside (a |an )?/,''))}</th>`).join('')}</tr></thead><tbody>${students.map(s=>`<tr><th scope="row">${esc(s.name)}</th>${s.machines.map(m=>`<td class="heat-cell"><span class="heat" data-level="${m.missionsDone===m.missionsTotal&&m.checkpointBest>=4?'done':m.missionsDone?'partial':'empty'}" title="Checkpoint: ${m.checkpointBest??'not taken'} / 5; ${Math.round(m.seconds/60)} active min">${m.missionsDone}/${m.missionsTotal}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="micro heatmap-hint">Swipe the table to see every machine →</p>`:'<p class="empty">Share the code with your learners. Their experiments will appear here.</p>'}<h3>Where to take another look.</h3>${mostMissed.length?`<ol class="missed-list">${mostMissed.map(q=>`<li>${esc(q.question)}<small>${esc(q.title)} · ${Math.round(q.percentCorrect)}% correct · ${q.responses} ${q.responses===1?'response':'responses'}</small></li>`).join('')}</ol>`:'<p class="empty">No missed questions yet. Questions appear after learners answer them.</p>'}<h3>Question by question.</h3><p class="micro">Latest answer per learner. Predictions are labeled separately.</p><label class="question-filter">Machine<select data-question-machine>${machines.filter(m=>questions.some(q=>q.slug===m.slug&&q.responses)).map(m=>`<option value="${esc(m.slug)}">${esc(m.title)}</option>`).join('')}<option value="all">All machines with answers</option></select></label><div data-question-bars></div><h3>From prediction to checkpoint.</h3>${data.learningGain==null?'<p class="empty">Waiting for predictions paired with checkpoint answers.</p>':comparison(data)}<p class="micro">Gain compares predictions with latest check and post answers on the same student–machine pairs. It is descriptive, not a causal measure of learning.</p>`;
    const renderQuestions = () => {
      const selected = $('[data-question-machine]').value;
      $('[data-question-bars]').innerHTML = questions.filter(q=>q.responses && (selected==='all'||q.slug===selected)).map(q=>`<div class="difficulty-item"><div><small>${esc(q.title)} · ${esc(q.stage)} · ${q.responses} responses</small><p>${esc(q.question)}</p></div><span>${Math.round(q.percentCorrect)}%</span><div class="bar"><span style="--value:${q.percentCorrect}%"></span></div></div>`).join('') || '<p class="empty">Your class has not answered any questions yet.</p>';
    };
    $('[data-question-machine]').addEventListener('change',renderQuestions);
    renderQuestions();
    $('[data-copy-code]').addEventListener('click',async e=>{
      try { await navigator.clipboard.writeText(e.target.dataset.copyCode); status('[data-copy-status]','Copied. Share this code with your class.'); }
      catch { status('[data-copy-status]',`Copy this code: ${data.class.code}`); }
    });
  }
  function setupTeach() {
    $('[data-create-class]').addEventListener('submit',e=>{e.preventDefault();busy(e.submitter,async()=>{
      try { const c = await api('/classes',{name:new FormData(e.target).get('name')}); await loadClasses(c.id); e.target.reset(); status('[data-class-status]','Class created. Your join code is ready to share.'); }
      catch(err){status('[data-class-status]',err.message,true);}
    });});
  }
  const page = document.body.dataset.page;
  paintCards(localProgress());
  if(page==='login') setupLogin();
  if(page==='me') setupDashboard();
  if(page==='teach') setupTeach();
  async function connect() {
    try {
      ({ user } = await api('/me'));
      if(user && !user.guest){ $('[data-nav-account]').textContent = 'My account ↗'; $('[data-nav-account]').href = '/me/'; }
      if(page==='home') {
        const s = await api('/stats');
        $('[data-stats]').hidden = false;
        $('[data-stats]').innerHTML = [[s.machines,'working machines'],[s.learners,'learners & guests'],[s.machinesStarted,'machines explored'],[s.runs,'experiments run']].map(([n,label])=>`<div><strong>${esc(n)}</strong><span>${label}</span></div>`).join('');
        if(user){ const {progress}=await api('/progress'); const merged=mergedProgress(localProgress(),progress);cacheProgress(merged);paintCards(merged); }
      }
      if(page==='me') {
        if(!user){status('[data-connection]','Saved in this browser. Sign in to sync your discoveries across devices.');return;}
        const remote = await api('/progress');
        const progress = mergedProgress(localProgress(),remote.progress);
        cacheProgress(progress);
        const s = summarize(progress);
        const serverSummary = await api('/me/summary');
        // The server retains every activity day; browser snapshots only retain last seen.
        s.streakDays = Math.max(s.streakDays,serverSummary.streakDays);
        renderDashboard(progress,s);
        status('[data-connection]',user.guest?'Guest workbench · your browser progress is safe. Create an account to return on another device.':'Connected · browser and account progress shown together.');
        $('[data-greeting]').textContent = user.guest?'Your next discovery is waiting.':`Welcome back, ${user.name}. There is more to take apart.`;
        $('[data-signout]').hidden = false;
        if(!user.guest) $('[data-account-link]').hidden = true;
        await memberships();
      }
      if(page==='teach') {
        if(user && !user.guest && user.role==='educator') {
          $('[data-teach-gate]').hidden = true; $('[data-teach-workbench]').hidden = false;
          status('[data-connection]','Connected · class insights show the latest saved learner activity.');
          await loadClasses();
        } else {
          status('[data-connection]','An educator account opens your class workbench.');
          if(user && !user.guest){
            $('[data-teach-explanation]').textContent = 'You are signed in as a learner. Creating a separate educator account starts with signing out. Your learner progress stays with your learner account.';
            const link=$('[data-teach-gate] a[href*="mode=signup"]');
            link.textContent='Sign out & create an educator account ↗';
            link.addEventListener('click',async e=>{e.preventDefault();try {await api('/auth/logout',{});location.assign(link.href);}catch(err){status('[data-connection]',err.message,true);}});
          }
        }
      }
    } catch(err) {
      if(page==='me'||page==='teach') status('[data-connection]',page==='me'?'Offline workbench · showing progress saved in this browser. Class features need a connection.':'Class features need a connection. Your local machine progress is still saved.');
    }
  }
  connect();
})();
