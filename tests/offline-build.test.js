import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync,existsSync} from 'node:fs';
test('production offline worker precaches existing images and compiled JS/CSS',async()=>{
 if(!existsSync('dist/sw.js'))return;
 const events={};let urls=[];const context={self:{addEventListener:(event,fn)=>events[event]=fn,skipWaiting(){},clients:{claim:async()=>{}}},caches:{open:async()=>({addAll:async list=>{urls=list}})}};
 vm.runInNewContext(readFileSync('dist/sw.js','utf8'),context);let work;events.install({waitUntil:p=>work=p});await work;
 for(const url of urls)assert.ok(existsSync('dist'+(url==='/'?'/index.html':url)),url+' missing');
 assert.ok(urls.some(u=>u.endsWith('.js')),'compiled JavaScript missing from precache');assert.ok(urls.some(u=>u.endsWith('.css')),'compiled CSS missing from precache');
});
