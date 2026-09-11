import { build } from 'esbuild';
for (const name of ['loader','track','process-fb-event','analyze-events']) {
  await build({ entryPoints:[`supabase/functions/${name}/index.ts`], outfile:`.edge-build.local/${name}.js`, bundle:true, format:'esm', platform:'neutral', target:'es2022', external:['https://*'], minify:false });
}
console.log('Four edge bundles ready');
