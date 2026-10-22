import {readFile,writeFile,readdir} from 'node:fs/promises';
const assets=(await readdir('dist/assets')).filter(f=>/\.(js|css)$/.test(f)).map(f=>'/assets/'+f);
const worker=await readFile('dist/sw.js','utf8');
await writeFile('dist/sw.js',worker.replace("c.addAll(['/','/assets/logo.png'", `c.addAll(['/',${assets.map(JSON.stringify).join(',')},'/assets/logo.png'`));
