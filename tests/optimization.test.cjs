const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {gunzipSync}=require('node:zlib');
const {pathToFileURL}=require('node:url');
const {createCompressedCache}=require('../static-cache.cjs');
const {createActiveSongFeed}=require('../live-control.cjs');
const {EventEmitter}=require('node:events');
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
 const {acceptedEncoding}=require('../static-cache.cjs');const {brotliDecompressSync}=require('node:zlib');
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
 const catalogPolicy=require('../catalog-policy.cjs');
 const {createLeaderboardStore}=require('../leaderboard.cjs');

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
