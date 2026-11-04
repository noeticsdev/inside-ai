// Run after `bun scripts/build.mjs --only _template`. Writes only disposable dist/.
import { writeFileSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from '../platform/pages/build.mjs';
import { previewCatalog } from './fixtures/catalog.mjs';
const root=resolve(import.meta.dir,'..'),dist=resolve(root,'dist');
writeFileSync(resolve(dist,'catalog.json'),JSON.stringify(previewCatalog,null,2));
await build({root,dist,catalog:previewCatalog});
cpSync(resolve(root,'platform/public'),dist,{recursive:true});
console.log('Built development preview with nine illustrative catalog entries.');
