export const DEFAULTS = { rate: 0.2, hidden: 4, activation: 'tanh', steps: 50, seed: 1 };
const rates = [0.01,0.02,0.05,0.1,0.2,0.5,1,2,3,5];
export const RATES = rates;
export function configOf(input = {}) {
  input = input && typeof input === 'object' ? input : {};
  const pick = (v, xs, fallback) => xs.includes(v) ? v : fallback;
  return { rate: pick(Number(input.rate), rates, DEFAULTS.rate), hidden: pick(Number(input.hidden), [2,3,4,5,6], DEFAULTS.hidden), activation: pick(input.activation, ['tanh','relu','none'], DEFAULTS.activation), steps: pick(Number(input.steps), [10,50,200], DEFAULTS.steps), seed: pick(Number(input.seed), [1,2,3,4,5,6,7,8,9,10], DEFAULTS.seed) };
}
function random(seed) { return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const points = [[0,0,0],[0,1,1],[1,0,1],[1,1,0]];
export function simulate(input = {}) {
  const config = configOf(input), rand = random(config.seed), h = config.hidden;
  // Each hidden unit has two input weights and a bias; the output is linear.
  let w = Array.from({length:h}, () => Array.from({length:3}, () => (rand()*2-1)));
  let v = Array.from({length:h+1}, () => (rand()*2-1));
  const events = [], curve = [];
  let initialLoss = 0, diverged = false, maxGradient = 0, changeNorm = 0;
  function evaluate(gradient) {
    let loss = 0, accuracy = 0;
    const gw = w.map(() => [0,0,0]), gv = v.map(() => 0), predictions = [];
    for (const [x,y,target] of points) {
      const z = w.map(a => a[0]*x+a[1]*y+a[2]);
      const a = z.map(n => config.activation === 'tanh' ? Math.tanh(n) : config.activation === 'relu' ? Math.max(0,n) : n);
      const out = a.reduce((sum,n,i) => sum+n*v[i],v[h]);
      predictions.push(out); loss += (out-target)**2/4; accuracy += Number((out >= 0.5) === Boolean(target));
      const d = (out-target)/2;
      for (let i=0;i<h;i++) {
        gv[i] += d*a[i];
        const derivative = config.activation === 'tanh' ? 1-a[i]*a[i] : config.activation === 'relu' ? Number(z[i]>0) : 1;
        const delta = d*v[i]*derivative;
        gw[i][0] += delta*x; gw[i][1] += delta*y; gw[i][2] += delta;
      }
      gv[h] += d;
    }
    return {loss, accuracy, gw, gv, predictions};
  }
  let current = evaluate(); initialLoss = current.loss; curve.push(current.loss);
  for (let step=1;step<=config.steps;step++) {
    const {gw,gv} = current;
    const gradients = [...gw.flat(),...gv];
    maxGradient = Math.max(...gradients.map(Math.abs));
    changeNorm = config.rate * Math.hypot(...gradients);
    const nextW = w.map((row,i) => row.map((value,j) => value-config.rate*gw[i][j]));
    const nextV = v.map((value,i) => value-config.rate*gv[i]);
    if (![...nextW.flat(),...nextV].every(Number.isFinite) || Math.max(...nextW.flat().map(Math.abs),...nextV.map(Math.abs)) > 1e100) { diverged = true; break; }
    const oldW=w, oldV=v; w=nextW; v=nextV; const next=evaluate();
    if (!Number.isFinite(next.loss) || next.loss > 1e100) { w=oldW; v=oldV; diverged=true; break; }
    current=next;
    curve.push(current.loss);
    events.push({ index: events.length, type:'update', station:'backprop', step, loss:current.loss, accuracy:current.accuracy, maxGradient, changeNorm, weights: w.map(row=>row.slice()), outputWeights:v.slice(), predictions:current.predictions.slice(), trace:`Step ${step}: loss ${current.loss.toFixed(4)}, ${current.accuracy}/4 correct.` });
  }
  return { config, events, totals: { step:events.length, loss:current.loss, accuracy:current.accuracy, initialLoss, maxGradient, changeNorm, diverged, curve } };
}
export function encode(input) { const c=configOf(input), p=new URLSearchParams(); for(const key of Object.keys(DEFAULTS)) if(c[key]!==DEFAULTS[key]) p.set(key,String(c[key])); return p.toString(); }
export function decode(search) { const p=new URLSearchParams(search); return configOf(Object.fromEntries(p)); }
export const MISSIONS = [
 {id:'solve',title:'Solve XOR',goal:'Get loss below 0.05 and all four points correct.',hint:'Try tanh, four hidden units, seed 1 and rate 0.5.',try:{rate:0.5,hidden:4,activation:'tanh',steps:200,seed:1},check:r=>!r.totals.diverged && r.totals.loss<0.05 && r.totals.accuracy===4},
 {id:'linear',title:'Prove linear fails',goal:'Train without an activation for 200 steps and find its loss stays at least 0.24.',hint:'Use no activation and a rate of 0.1.',try:{rate:0.1,hidden:4,activation:'none',steps:200,seed:1},check:r=>r.config.activation==='none' && r.totals.step===200 && r.totals.loss>=0.24 && !r.totals.diverged},
 {id:'break',title:'Blow it up',goal:'Make the final loss exceed the starting loss or diverge.',hint:'Try a rate of 5.',try:{rate:5,hidden:4,activation:'tanh',steps:50,seed:1},check:r=>r.totals.diverged || r.totals.loss>r.totals.initialLoss},
 {id:'speed',title:'Speedrun',goal:'Solve XOR in at most 60 steps.',hint:'Try tanh, seed 1, four units and rate 0.5 for 50 steps.',try:{rate:0.5,hidden:4,activation:'tanh',steps:50,seed:1},check:r=>!r.totals.diverged && r.totals.step<=60 && r.totals.loss<0.05 && r.totals.accuracy===4}
];
