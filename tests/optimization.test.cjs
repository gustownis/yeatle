const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {gunzipSync}=require('node:zlib');
const {pathToFileURL}=require('node:url');
const {createCompressedCache}=require('../server/static-cache.cjs');
const {createActiveSongFeed}=require('../server/live-control.cjs');
const {EventEmitter}=require('node:events');
const vm=require('node:vm');
const performanceModule=import(pathToFileURL(path.join(__dirname,'../build/assets/performance.mjs')).href);
const stemCacheModule=import(pathToFileURL(path.join(__dirname,'../build/assets/stem-cache.mjs')).href);

test('compressed variants coalesce, invalidate on edits, and remain within their memory budget',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yeatle-compression-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'asset.js');fs.writeFileSync(file,'one'.repeat(4000));
 const cache=createCompressedCache({maxBytes:1000});const stat=fs.statSync(file);
 const [first,shared]=await Promise.all([cache.get(file,stat),cache.get(file,stat)]);
 assert.equal(first,shared);assert.equal(gunzipSync(first).toString(),'one'.repeat(4000));
 fs.writeFileSync(file,'different'.repeat(3000));const updated=await cache.get(file,fs.statSync(file));
 assert.notEqual(updated,first);assert.equal(gunzipSync(updated).toString(),'different'.repeat(3000));
 assert.ok(cache.retainedBytes<=1000);
 const tiny=createCompressedCache({maxBytes:1});await tiny.get(file,fs.statSync(file));assert.equal(tiny.size,0);
});

test('Brotli is chosen when offered, gzip otherwise, and both variants are cached separately',async t=>{
 const {acceptedEncoding}=require('../server/static-cache.cjs');const {brotliDecompressSync}=require('node:zlib');
 assert.equal(acceptedEncoding('gzip, deflate, br, zstd'),'br');assert.equal(acceptedEncoding('gzip, deflate'),'gzip');
 assert.equal(acceptedEncoding('br;q=0, gzip'),'gzip');assert.equal(acceptedEncoding('*'),'gzip');
 assert.equal(acceptedEncoding('gzip;q=0, *;q=1'),null);assert.equal(acceptedEncoding('identity'),null);assert.equal(acceptedEncoding(undefined),null);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yeatle-brotli-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'asset.js');fs.writeFileSync(file,'song'.repeat(5000));const stat=fs.statSync(file),cache=createCompressedCache();
 const [br,gz]=await Promise.all([cache.get(file,stat,'br'),cache.get(file,stat,'gzip')]);
 assert.equal(brotliDecompressSync(br).toString(),'song'.repeat(5000));assert.equal(gunzipSync(gz).toString(),'song'.repeat(5000));
 assert.equal(cache.size,2);assert.equal(await cache.get(file,stat,'br'),br);
});

test('preloaded modules are exactly the URLs the page\'s own code imports',()=>{
 const build=path.join(__dirname,'../build');
 // A preload whose version differs from the import is downloaded twice.
 const imports=file=>[...fs.readFileSync(path.join(build,'assets',file),'utf8').matchAll(/(?:from\s*|import\s*\(\s*)["'](\.\/[\w.-]+\?v=[\d.]+)["']/g)].map(match=>match[1].slice(2));
 const graph=entry=>{const seen=new Set(),queue=[entry];while(queue.length)for(const url of imports(queue.pop().split('?')[0]))if(!seen.has(url)){seen.add(url);queue.push(url);}return seen;};
 for(const [page,entry] of [['index.html','yeatle.js'],['daily.html','daily.mjs'],['karaoke.html','karaoke.js']]){
  const html=fs.readFileSync(path.join(build,page),'utf8'),wanted=graph(entry);
  const preloaded=[...html.matchAll(/rel="modulepreload" href="\.\/assets\/([^"]+)"/g)].map(match=>match[1]);
  assert.ok(preloaded.length>0,page);
  for(const url of preloaded)assert.ok(wanted.has(url),`${page} preloads ${url}, which ${entry} does not import`);
  for(const url of wanted)assert.equal([...wanted].filter(other=>other.split('?')[0]===url.split('?')[0]).length,1,`${url} is imported under two versions`);
 }
});

test('live updates use one stream, close while hidden, and reconnect with the latest song',async()=>{
 const {watchActiveSong}=await performanceModule;
 const handlers=new Set(),sources=[],received=[];let polls=0;
 const document={hidden:false,addEventListener(_type,fn){handlers.add(fn);},removeEventListener(_type,fn){handlers.delete(fn);}};
 class Source {constructor(url){this.url=url;sources.push(this);}close(){this.closed=true;}}
 const stop=watchActiveSong(value=>received.push(value),{enabled:true,document,EventSource:Source,poll:()=>polls++});
 assert.equal(sources.length,1);sources[0].onmessage({data:'{"id":"first","seq":1}'});
 document.hidden=true;handlers.forEach(fn=>fn());assert.equal(sources[0].closed,true);
 document.hidden=false;handlers.forEach(fn=>fn());assert.equal(sources.length,2);
 sources[1].onmessage({data:'{"id":"latest","seq":2}'});assert.equal(received.at(-1).id,'latest');
 assert.equal(polls,0);stop();assert.equal(sources[1].closed,true);assert.equal(handlers.size,0);
 const disabled=watchActiveSong(()=>{}, {enabled:false,document,EventSource:Source,poll:()=>polls++});disabled();assert.equal(sources.length,2);
});

test('audio disposal unregisters media callbacks and disconnects every retained graph node',async()=>{
 const {disposeAudioGraph}=await performanceModule;let removed=0,disconnected=0;
 const node=()=>({disconnect(){disconnected++;}});const master=node(),source=node(),filter=node();
 const player={events:[[{removeEventListener(){removed++;}},'timeupdate',()=>{}]],master,out:master,nodes:[source,filter],analysers:[],gates:[]};
 disposeAudioGraph(player);assert.equal(removed,1);assert.equal(disconnected,3);assert.equal(player.master,null);assert.deepEqual(player.nodes,[]);
});

test('live streams drop slow or disconnected clients without retaining or writing to them',()=>{
 const feed=createActiveSongFeed();
 class Response extends EventEmitter {
  constructor(){super();this.writes=[];this.blocked=false;}
  writeHead(){}flushHeaders(){}
  write(value){this.writes.push(value);return !this.blocked;}
  end(){this.writableEnded=true;this.emit('close');}
 }
 const slow=new Response(),closed=new Response();feed.subscribe({},slow,{seq:0});feed.subscribe({},closed,{seq:0});
 assert.equal(feed.size,2);slow.blocked=true;closed.destroyed=true;feed.publish({id:'one',seq:1});
 assert.equal(feed.size,0);assert.equal(slow.writableEnded,true);assert.equal(closed.writes.length,1);
 const count=slow.writes.length;feed.publish({id:'two',seq:2});assert.equal(slow.writes.length,count);closed.emit('close');
});

test('persistent stems skip audio APIs that perturb samples without reading any real audio',async()=>{
 const {canCacheStems}=await stemCacheModule;
 function context(perturb){return{sampleRate:44100,createBuffer(_channels,length){const samples=new Float32Array(length);return{copyToChannel(input){samples.set(input)},getChannelData(){if(perturb)for(let i=0;i<samples.length;i++)samples[i]*=0.9998;return samples}}}}}
 assert.equal(canCacheStems(context(false)),true);assert.equal(canCacheStems(context(true)),false);
 assert.equal(canCacheStems({createBuffer(){throw Error('Unavailable')}}),false);
});

test('pages preload song catalogs, defer leaderboard scripts, and set explicit logo dimensions',()=>{
 const build=path.join(__dirname,'../build');
 for(const page of ['index.html','daily.html','karaoke.html']){
  const html=fs.readFileSync(path.join(build,page),'utf8');
  assert.match(html,/<link rel="preload" href="api\/songs" as="fetch" crossorigin>/,`${page} should preload api/songs`);
  const leaderboardTag=html.match(/<script[^>]*src="\.\/assets\/leaderboard\.mjs\?v=[^"]+"[^>]*>/);
  assert.ok(leaderboardTag,`${page} should load leaderboard.mjs`);
  assert.equal(/blocking="render"/.test(leaderboardTag[0]),false,`${page} should not render-block on leaderboard.mjs`);
 }
 for(const page of ['daily.html','karaoke.html','stems-download.html']){
  const html=fs.readFileSync(path.join(build,page),'utf8');
  const logos=[...html.matchAll(/<img\s+class="logo"[^>]*>/g)].map(m=>m[0]);
  assert.ok(logos.length>0,`${page} should include logo images`);
  for(const tag of logos){
   assert.match(tag,/\bwidth="\d+"/,`${page} logo missing width: ${tag}`);
   assert.match(tag,/\bheight="\d+"/,`${page} logo missing height: ${tag}`);
  }
 }
 const karaokeCss=fs.readFileSync(path.join(build,'assets/karaoke.css'),'utf8');
 assert.match(karaokeCss,/\.top \.logo\s*\{[^}]*\bwidth:\s*auto;/);
 assert.match(karaokeCss,/\.loading-box \.logo\s*\{[^}]*\bwidth:\s*auto;/);
});

test('catalog metadata, karaoke migration, and round selection avoid quadratic scaling regressions',async t=>{
 const {performance}=require('node:perf_hooks');
 const {pathToFileURL}=require('node:url');
 const nodeOs=require('node:os');
 const catalogPolicy=require('../server/catalog-policy.cjs');
 const {createLeaderboardStore}=require('../server/leaderboard.cjs');

 const makeSongs=()=>Array.from({length:1500},(_,i)=>({
  id:`song-${i}`,
  title:i%5===0?`Flawless ${i} [v${i%3+1}]`:`Track ${i} (feat. Uzi)`,
  display:`Track ${i}`,
  era:i%2===0?'2093':'Alivë',
  year:2021+(i%4),
  mode:'filter',
  features:i%3===0?['Lil Uzi Vert']:[],
  producers:['BNYX'],
  source:{kind:'url',id:`https://audio.test/${i}`}
 }));
 const warmCatalog=makeSongs();
 for(const song of warmCatalog)catalogPolicy.applyCatalogMetadata(song,warmCatalog);
 const freshCatalog=makeSongs();
 const tCatalog=performance.now();
 const applied=freshCatalog.map(song=>catalogPolicy.applyCatalogMetadata(song,freshCatalog));
 const catalogMs=performance.now()-tCatalog;
 assert.equal(applied.length,1500);
 assert.ok(catalogMs<80,`applyCatalogMetadata over 1500 uncached songs took ${catalogMs.toFixed(1)}ms`);

 const {carryFormerIds}=await import(pathToFileURL(path.join(__dirname,'../build/assets/karaoke.js')).href);
 const map=new Map();
 for(let i=0;i<400;i++)map.set(`yeatle-karaoke-best:old-${i*3}:hard:wpm`,JSON.stringify({score:100+i}));
 let keyLookups=0;
 const keys=[...map.keys()];
 const storage={
  get length(){return map.size;},
  key:i=>{keyLookups++;return keys[i]??null;},
  getItem:k=>map.get(k)??null,
  setItem:(k,v)=>map.set(k,String(v))
 };
 const kSongs=Array.from({length:1500},(_,i)=>({id:`new-${i}`,formerIds:[`old-${i}`]}));
 const tKaraoke=performance.now();
 const moved=carryFormerIds(kSongs,storage);
 const karaokeMs=performance.now()-tKaraoke;
 assert.equal(moved,400);
 assert.ok(keyLookups<=400,`carryFormerIds scanned storage.key ${keyLookups} times for 400 keys (expected <= 400 single pass)`);
 assert.ok(karaokeMs<80,`carryFormerIds over 1500 songs x 400 keys took ${karaokeMs.toFixed(1)}ms`);

 const dir=fs.mkdtempSync(path.join(nodeOs.tmpdir(),'yeatle-opt-rounds-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const ids=Array.from({length:1500},(_,i)=>`s${i}`);
 const known=new Set(ids);
 const store=createLeaderboardStore(path.join(dir,'leaderboard-users.json'),{
  canonicalSongId:id=>(known.has(id)?id:null),
  snippetSong:id=>(known.has(id)?{playable:true,stems:false,canonical:id}:null),
  snippetHints:()=>({era:'2093',eraYear:2024,year:2024,producers:['BNYX']}),
  snippetReveal:id=>({id,title:id,display:id}),
  matchesAnswer:()=>false,
  matchesVersion:()=>false
 });
 const ctx={ipHash:'a'.repeat(32),deviceHash:'b'.repeat(32)};
 store.startSnippetRound('',{candidates:ids,difficulty:'base',pool:'all',excludedEras:['Alivë']},Date.now(),ctx);
 const tRound=performance.now();
 const round=store.startSnippetRound('',{candidates:ids,difficulty:'base',pool:'all',excludedEras:['Alivë']},Date.now(),ctx);
 const roundMs=performance.now()-tRound;
 assert.match(round.roundId,/^[a-f0-9]{32}$/);
 assert.ok(roundMs<80,`startSnippetRound over 1500 candidates took ${roundMs.toFixed(1)}ms`);
});

function createFakeIndexedDB(){
 const stores=new Map([['entries',new Map()],['chunks',new Map()]]);
 const transactions=[];
 const makeRequest=run=>{const req={result:undefined,error:null,onsuccess:null,onerror:null};run(req);return req;};
 const db={
  objectStoreNames:{contains:name=>stores.has(name)},
  createObjectStore(name){if(!stores.has(name))stores.set(name,new Map());return{createIndex(){}};},
  transaction(names,mode='readonly'){
   const storeNames=Array.isArray(names)?names:[names];
   const record={stores:storeNames,mode,gets:[],puts:[],deletes:[]};
   transactions.push(record);
   let pending=0,finished=false;
   const tx={error:null,oncomplete:null,onerror:null,onabort:null,objectStore:null};
   const maybeFinish=()=>{if(!finished&&pending===0){finished=true;queueMicrotask(()=>tx.oncomplete?.());}};
   const track=(storeName,fn)=>{
    const map=stores.get(storeName);
    pending++;
    return makeRequest(req=>queueMicrotask(()=>{
     try{fn(map,req);req.onsuccess?.({target:req});}
     catch(error){tx.error=req.error=error;req.onerror?.({target:req});if(!finished){finished=true;tx.onabort?.();}return;}
     finally{pending--;}
     maybeFinish();
    }));
   };
   tx.objectStore=name=>({
    get:key=>track(name,(map,req)=>{record.gets.push({store:name,key});req.result=map.get(key);}),
    getAll:()=>track(name,(map,req)=>{req.result=[...map.values()];}),
    put:value=>track(name,(map,req)=>{const key=name==='entries'?value.key:value.id;record.puts.push({store:name,key});map.set(key,value);req.result=key;}),
    delete:key=>track(name,(map,req)=>{record.deletes.push({store:name,key});map.delete(key);req.result=undefined;}),
    index:()=>({
     openKeyCursor(range){
      const keys=[...stores.get(name).entries()].filter(([,v])=>v.owner===range.only).map(([k])=>k);
      let pos=0;const req={result:null,onsuccess:null};
      const step=()=>{pending++;queueMicrotask(()=>{req.result=pos<keys.length?{primaryKey:keys[pos++],continue:step}:null;req.onsuccess?.({target:req});pending--;maybeFinish();});};
      step();
      return req;
     }
    })
   });
   queueMicrotask(maybeFinish);
   return tx;
  },
  close(){}
 };
 return{
  stores,
  transactions,
  indexedDB:{
   open(){const req={result:db,error:null,onupgradeneeded:null,onsuccess:null,onerror:null,onblocked:null};queueMicrotask(()=>{req.onupgradeneeded?.();req.onsuccess?.();});return req;}
  }
 };
}

async function withStemCacheDB(run){
 const fake=createFakeIndexedDB();
 const prevIDB=globalThis.indexedDB,prevRange=globalThis.IDBKeyRange;
 globalThis.indexedDB=fake.indexedDB;
 globalThis.IDBKeyRange={only:value=>({only:value})};
 try{
  const mod=await import(`${pathToFileURL(path.join(__dirname,'../build/assets/stem-cache.mjs')).href}?t=${Date.now()}-${Math.random()}`);
  await run(mod,fake);
 }finally{
  if(prevIDB===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=prevIDB;
  if(prevRange===undefined)delete globalThis.IDBKeyRange;else globalThis.IDBKeyRange=prevRange;
 }
}

function makeStemBuffers(total,fill){
 const make=(offset=0)=>{
  const data=new Float32Array(total);
  if(typeof fill==='function')for(let i=0;i<total;i++)data[i]=fill(offset+i);
  else if(fill!==undefined)data.fill(fill);
  return{
   data,
   getChannelData(){return data;},
   copyToChannel(chunk,_channel,start=0){data.set(chunk,start);}
  };
 };
 return{drums:make(0),bass:make(0.1),other:make(0.2)};
}

test('stem-cache batches multi-chunk reads into one readonly transaction and preserves IDB schema',async()=>{
 await withStemCacheDB(async(cache,fake)=>{
  const chunk=512*1024,total=chunk*2+123;
  const src=makeStemBuffers(total,v=>(Math.floor(v)%97)/100);
  const key=cache.stemCacheKey('abc123','rev1',44100);
  assert.equal(await cache.saveStems(key,src,total),true);

  const meta=fake.stores.get('entries').get(key);
  assert.deepEqual({key:meta.key,total:meta.total,bytes:meta.bytes,chunks:meta.chunks,complete:meta.complete},{key,total,bytes:total*12,chunks:3,complete:true});
  assert.equal(typeof meta.lastUsed,'number');
  assert.equal(fake.stores.get('chunks').size,3);

  fake.transactions.length=0;
  const dst=makeStemBuffers(total,0);
  assert.equal(await cache.loadStems(key,dst,total),true);

  const readonlyTxs=fake.transactions.filter(tx=>tx.mode==='readonly');
  assert.equal(readonlyTxs.length,1);
  assert.deepEqual(readonlyTxs[0].gets.map(g=>`${g.store}:${g.key}`),[`entries:${key}`,`chunks:${key}:0`,`chunks:${key}:1`,`chunks:${key}:2`]);
  assert.equal(fake.transactions.filter(tx=>tx.mode==='readwrite').length,1);
  for(const stem of['drums','bass','other']){
   assert.equal(dst[stem].data[0],src[stem].data[0]);
   assert.equal(dst[stem].data[chunk],src[stem].data[chunk]);
   assert.equal(dst[stem].data[total-1],src[stem].data[total-1]);
  }
 });
});

test('stem-cache rejects missing, mismatched-length, non-Float32Array, and non-finite chunks and discards the entry',async()=>{
 await withStemCacheDB(async(cache,fake)=>{
  const chunk=512*1024,total=chunk+64;
  const key=cache.stemCacheKey('hash','rev',44100);
  const src=makeStemBuffers(total,0.25);

  for(const corrupt of[
   ()=>fake.stores.get('chunks').delete(`${key}:1`),
   ()=>{fake.stores.get('chunks').get(`${key}:1`).stems.drums=new Float32Array(10);},
   ()=>{fake.stores.get('chunks').get(`${key}:1`).stems.bass[17]=Number.NaN;},
   ()=>{fake.stores.get('chunks').get(`${key}:1`).stems.other[17]=Number.POSITIVE_INFINITY;},
   ()=>{fake.stores.get('chunks').get(`${key}:1`).stems.other[17]=Number.NEGATIVE_INFINITY;},
   ()=>{fake.stores.get('chunks').get(`${key}:1`).stems.drums=Array.from({length:64},()=>0);},
   ()=>{fake.stores.get('chunks').get(`${key}:1`).stems=null;}
  ]){
   assert.equal(await cache.saveStems(key,src,total),true);
   corrupt();
   const dst=makeStemBuffers(total,0);
   assert.equal(await cache.loadStems(key,dst,total),false);
   assert.equal(fake.stores.get('entries').has(key),false);
   assert.equal(fake.stores.get('chunks').size,0);
  }
 });
});

test('stem-cache aborts cleanly on mid-load and mid-save cancellation without corrupting cache state',async()=>{
 await withStemCacheDB(async(cache,fake)=>{
  const chunk=512*1024,total=chunk*2+50;
  const src=makeStemBuffers(total,0.5);
  const loadKey=cache.stemCacheKey('load-key','rev',44100);
  assert.equal(await cache.saveStems(loadKey,src,total),true);

  fake.transactions.length=0;
  let loadCancelled=false;
  const dst=makeStemBuffers(total,0);
  const origCopy=dst.other.copyToChannel.bind(dst.other);
  dst.other.copyToChannel=(samples,ch,from)=>{origCopy(samples,ch,from);loadCancelled=true;};
  assert.equal(await cache.loadStems(loadKey,dst,total,()=>loadCancelled),false);
  assert.equal(fake.stores.get('entries').get(loadKey)?.complete,true);
  assert.equal(fake.stores.get('chunks').size,3);
  assert.deepEqual(fake.transactions.filter(tx=>tx.mode==='readonly')[0].gets.map(g=>g.key),[loadKey,`${loadKey}:0`]);

  const saveKey=cache.stemCacheKey('save-key','rev',44100);
  let saveCancelled=false;
  const cancelSrc=makeStemBuffers(total,0.5);
  const origGet=cancelSrc.drums.getChannelData.bind(cancelSrc.drums);
  let reads=0;
  cancelSrc.drums.getChannelData=()=>{if(++reads===1)saveCancelled=true;return origGet();};
  assert.equal(await cache.saveStems(saveKey,cancelSrc,total,()=>saveCancelled),false);
  assert.equal(fake.stores.get('entries').has(saveKey),false);
  assert.equal(fake.stores.get('chunks').has(`${saveKey}:0`),false);

  // Cancelling after the last chunk write still aborts before marking complete.
  const endKey=cache.stemCacheKey('end-key','rev',44100);
  let endCancelled=false;
  const endSrc=makeStemBuffers(total,0.5);
  const origEndGet=endSrc.other.getChannelData.bind(endSrc.other);
  let endReads=0;
  endSrc.other.getChannelData=()=>{if(++endReads===3)endCancelled=true;return origEndGet();};
  assert.equal(await cache.saveStems(endKey,endSrc,total,()=>endCancelled),false);
  assert.equal(fake.stores.get('entries').has(endKey),false);
  assert.equal(fake.stores.get('chunks').has(`${endKey}:0`),false);
 });
});

test('home page does not block first paint on yeatle.js or eager AudioContext startup',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../build/index.html'),'utf8');
 const yeatleTag=html.match(/<script\b[^>]*assets\/yeatle\.js[^>]*>/i)?.[0]||'';
 assert.ok(yeatleTag,'expected yeatle.js script tag in build/index.html');
 assert.equal(/blocking\s*=\s*["']?render/i.test(yeatleTag),false);

 const bundle=fs.readFileSync(path.join(__dirname,'../build/assets/yeatle.js'),'utf8');
 assert.ok(bundle.includes('yeatlePaintedRef'), 'expected painted gate ref in yeatle.js');
 assert.ok(bundle.includes('YeatleEnsurePlayer'), 'expected interaction flush helper in yeatle.js');
});

test('xm.start reuses stereo AudioBuffer at target rate and only copies when channels or rate differ',async()=>{
 const bundle=fs.readFileSync(path.join(__dirname,'../build/assets/yeatle.js'),'utf8');
 const first=bundle.indexOf('class xm{'),last=bundle.indexOf('function Em(',first);
 const slice=bundle.slice(first,last)+';xm';

 for(const spec of [
  {name:'stereo 44100 reuses mix directly',numberOfChannels:2,sampleRate:44100,expectAllocated:3,expectSameMix:true},
  {name:'mono 44100 copies to stereo mix',numberOfChannels:1,sampleRate:44100,expectAllocated:4,expectSameMix:false},
  {name:'stereo 48000 copies to target rate mix',numberOfChannels:2,sampleRate:48000,expectAllocated:4,expectSameMix:false}
 ]){
  const channels=[new Float32Array([0.1,-0.2,0.3,-0.4]),new Float32Array([0.5,-0.6,0.7,-0.8])];
  const decoded={length:4,numberOfChannels:spec.numberOfChannels,sampleRate:spec.sampleRate,getChannelData:ch=>channels[ch]};
  const allocated=[],messages=[];
  const Class=vm.runInNewContext(slice,{
   bt:44100,
   fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}),
   YeatleCacheInputs:async()=>{},
   OfflineAudioContext:class{async decodeAudioData(){return decoded;}},
   YeatleTrim(){},
   yt:new Map(),
   gd:()=>({postMessage:(msg)=>messages.push(msg)}),
   zt:null,
   YeatleScheduleWorkerIdle(){}
  });
  const job=Object.assign(Object.create(Class.prototype),{
   song:{id:'song-1'},workerId:1,buffers:null,total:0,listeners:new Set(),abortController:new AbortController(),
   ctx:{createBuffer(ch,len){const buf={numberOfChannels:ch,length:len,copyToChannel(){}};allocated.push(buf);return buf;}}
  });
  await job.start();
  assert.equal(allocated.length,spec.expectAllocated,spec.name);
  assert.equal(job.buffers.mix===decoded,spec.expectSameMix,spec.name);
  assert.equal(messages.length,1);
  assert.notEqual(messages[0].left.buffer,channels[0].buffer);
  assert.deepEqual([...messages[0].left],[...channels[0]]);
  assert.deepEqual([...messages[0].right],[...channels[spec.numberOfChannels>1?1:0]]);
 }
});

test('AudioContext suspends when idle, reuses across rounds, and closes on non-persisted pagehide',async()=>{
 const bundle=fs.readFileSync(path.join(__dirname,'../build/assets/yeatle.js'),'utf8');
 const first=bundle.indexOf('let Ss=null'),last=bundle.indexOf('function Pl(',first);
 const slice=bundle.slice(first,last)+';({yd,YeatleRetireContext,So})';

 let created=0,suspends=0,closes=0;
 const pageListeners={};
 class FakeAudioContext{
  constructor(){created++;this.state='running';}
  suspend(){suspends++;this.state='suspended';return Promise.resolve();}
  close(){closes++;this.state='closed';return Promise.resolve();}
 }
 const {yd,YeatleRetireContext,So}=vm.runInNewContext(slice,{
  window:{AudioContext:FakeAudioContext},
  navigator:{},
  addEventListener:(type,fn)=>{pageListeners[type]=fn;}
 });

 const ctx1=yd();
 assert.equal(created,1);
 const player={};
 So.add(player);
 YeatleRetireContext();
 assert.equal(suspends,0);
 So.delete(player);
 YeatleRetireContext();
 assert.equal(suspends,1);
 assert.equal(closes,0);
 assert.equal(yd(),ctx1);
 assert.equal(created,1);

 ctx1.state='running';
 pageListeners.pagehide({persisted:true});
 assert.equal(suspends,2);
 assert.equal(closes,0);

 pageListeners.pagehide({persisted:false});
 assert.equal(closes,1);
 assert.equal(ctx1.state,'closed');
 const ctx2=yd();
 assert.notEqual(ctx2,ctx1);
 assert.equal(created,2);
});

test('yeatle.js indexes song suggestions consistently with song-suggestions.mjs and keeps worker/cache ?v= current',async t=>{
 const bundle=fs.readFileSync(path.join(__dirname,'../build/assets/yeatle.js'),'utf8');
 assert.equal(bundle.includes('?v=1.10.0'),false,'expected no stale ?v=1.10.0 URLs in yeatle.js');
 assert.ok(bundle.includes('separator.worker.js?v=1.13.11'));
 assert.ok(bundle.includes('./stem-cache.mjs?v=1.13.11'));

 const {songsForPool}=await import(pathToFileURL(path.join(__dirname,'../build/assets/song-pools.mjs')).href);
 const {attachSongSuggestions}=await import(pathToFileURL(path.join(__dirname,'../build/assets/song-suggestions.mjs')).href);

 const helpersStart=bundle.indexOf('const YeatleNormReadyRe=');
 const helpersEnd=bundle.indexOf('function ws(',helpersStart);
 const nuStart=bundle.indexOf('Nu=w.useMemo(');
 const nuEnd=bundle.indexOf(',kn=w.useMemo(',nuStart);
 const knEnd=bundle.indexOf(',Hi=w.useCallback',nuEnd);
 const helpers=bundle.slice(helpersStart,helpersEnd);
 const nuExpr=bundle.slice(nuStart+3,nuEnd);
 const knExpr=bundle.slice(nuEnd+4,knEnd);

 const fixtureSongs=[
  {id:'s1',title:"Gët Busy (Here's a bell, bell, Remix)",display:"Gët Busy",era:'Up 2 Më',eraYear:2021,tab:'Released',aliases:['Get Busy Remix','Bell Track','Bell Track (OG)','x'],keys:['getbusy'],answerKeys:['getbusy','belltrack'],mode:'filter',source:{kind:'url',id:'1'}},
  {id:'s2',title:'Up n Down (Mix)',display:'Up n Down',era:'2093',eraYear:2024,tab:'Unreleased',aliases:['Up and Down','Up & Down','High Low'],keys:['upndown'],answerKeys:['upanddown','highlow'],mode:'filter',source:{kind:'url',id:'2'}},
  {id:'s3',title:'Flawless (feat. Lil Uzi Vert)',display:'Flawless',era:'Lyfë',eraYear:2022,tab:'Released',aliases:['Flawless (Intro)'],keys:['flawless','flawless2'],answerKeys:['flawless'],mode:'filter',source:{kind:'url',id:'3'}},
  {id:'s4',title:'   ',display:'',era:'Alive',eraYear:2021,tab:'Released',aliases:[],keys:[],answerKeys:[],mode:'filter',source:{kind:'url',id:'4'}}
 ];

 const ctx=vm.createContext({
  YeatlePoolSongs:songsForPool,
  e:fixtureSongs,
  O:'all',
  gn:'',
  w:{useMemo:fn=>fn()},
  Set,String,Array,Object
 });
 vm.runInContext(`${helpers};const buildNu=()=>(${nuExpr});const queryKn=(Nu,gn)=>(${knExpr});`,ctx);
 const indexed=vm.runInContext('buildNu()',ctx);

 assert.deepEqual(Array.from(indexed,s=>s.label),['Flawless','Gët Busy','Up n Down']);
 assert.deepEqual(Array.from(indexed,s=>s.aka),['','Here\'s a bell, bell, Get Busy Remix, Bell Track','High Low']);

 const box={hidden:true,id:'s',children:[],replaceChildren(...items){this.children=items;},setAttribute(){},scrollTop:0,clientHeight:300};
 const input={value:'bell',disabled:false,addEventListener(){},setAttribute(){},removeAttribute(){},focus(){}};
 globalThis.document={activeElement:input,createElement:()=>({children:[],textContent:'',offsetTop:0,offsetHeight:20,append(...kids){this.children.push(...kids);},setAttribute(){},addEventListener(){},classList:{toggle(){}}})};
 t.after(()=>{delete globalThis.document;});
 const sug=attachSongSuggestions(input,box);
 sug.setSongs(fixtureSongs);
 for(const q of ['bell','flaw','up','2093']){
  input.value=q;
  input.focus();
  sug.setSongs(fixtureSongs);
  const dailyLabels=box.children.map(c=>c.children[0].children[0].textContent);
  const homeLabels=Array.from(vm.runInContext(`queryKn(buildNu(), ${JSON.stringify(q)})`,ctx),x=>x.label);
  assert.deepEqual(homeLabels,dailyLabels,`matches diverge on "${q}"`);
 }
});
