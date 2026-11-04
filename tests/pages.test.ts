import { test, expect } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from '../platform/pages/build.mjs';
const machine={slug:'tokenizer',title:'Inside a tokenizer',hook:'Watch text become tokens.',level:'starter',minutes:8,order:1,track:'language',bigIdea:'A model reads tokens.',missions:[{id:'small',title:'Go small',goal:'Reduce the token count.'}],quiz:[]};
async function generated(catalog: any[], action: (dist: string)=>Promise<void>) {
  const dist=await mkdtemp(join(tmpdir(),'ia-pages-test-'));
  try { await build({root:resolve(import.meta.dir,'..'),dist,catalog});await action(dist); }
  finally { await rm(dist,{recursive:true,force:true}); }
}
test('page build produces every public route and reuses the shell theme boot',async()=>{
  await generated([machine],async dist=>{
    for(const name of ['index.html','login/index.html','me/index.html','teach/index.html','404.html']){
      const html=await readFile(join(dist,name),'utf8');
      expect(html).toContain('name="viewport"');expect(html).toContain('ia:theme');expect(html).toContain('/platform.js');expect(html).toContain('Simulations with real math; independent project.');
    }
  });
});
test('production cards point at real machine thumbnails and carry track filters',async()=>{
  await generated([machine],async dist=>{
    const html=await readFile(join(dist,'index.html'),'utf8');
    expect(html).toContain('src="/m/tokenizer/figure.svg"');expect(html).toContain('href="/m/tokenizer/"');expect(html).toContain('data-track="language"');expect(html).toContain('data-filter="systems"');expect(html).not.toContain('DEVELOPMENT PREVIEW');
  });
});
test('empty catalog yields honest empty states without undefined machine URLs',async()=>{
  await generated([],async dist=>{
    const html=await readFile(join(dist,'index.html'),'utf8');
    expect(html).toContain('The benches are being set up.');expect(html).not.toContain('/m/undefined');expect(html).not.toContain('class="machine-card"');
  });
});
test('catalog text cannot close its JSON script or inject HTML',async()=>{
  const hostile={...machine,title:'<img src=x onerror=alert(1)>',quiz:[{question:'</script><script>alert(1)</script>'}]};
  await generated([hostile],async dist=>{
    const html=await readFile(join(dist,'index.html'),'utf8');
    expect(html).not.toContain('<img src=x onerror');expect(html).toContain('&lt;img src=x onerror');
    const json=html.match(/<script id="ia-catalog" type="application\/json">([\s\S]*?)<\/script>/)![1];
    expect(JSON.parse(json)[0].quiz[0].question).toBe(hostile.quiz[0].question);expect(json).not.toContain('</script>');
  });
});

test('the sign-in form never falls back to placing passwords in a GET URL',async()=>{
  await generated([machine],async dist=>{
    const html=await readFile(join(dist,'login/index.html'),'utf8');expect(html).toContain('method="post" action="/api/auth/login"');
  });
});
